// GIVO — Vercel Serverless Function
// Gera um calendário editorial semanal de posts para a Givo, seguindo o Prompt
// Mestre e respeitando a proporção 70% dor / 20% prova / 10% institucional.
// Usa a OpenAI quando configurada; caso contrário devolve uma semana curada
// alinhada ao nicho da Givo, para que a funcionalidade nunca fique indisponível.
//
// Variáveis de ambiente:
//   OPENAI_API_KEY  → chave da API da OpenAI (opcional — há fallback curado)

const { PROMPT_MESTRE } = require('./_promptMestre');

const OPENAI_MODEL = 'gpt-4o';
const DOW = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const FORMATS = ['Carrossel', 'Post único', 'Reels', 'Sequência de Stories'];

function addDaysISO(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---- Fallback curado (nicho Givo) -----------------------------------------
const POOL = [
  { pilar: 'Dor operacional', type: 'Carrossel', topic: 'Quando ninguém sabe quantos kits sobraram no estoque — e o custo invisível disso', hook: 'Seu estoque de kits custa mais do que você imagina.' },
  { pilar: 'Dor operacional', type: 'Reels', topic: 'O onboarding do colaborador remoto que chegou atrasado (de novo)', hook: 'O primeiro dia nunca acontece duas vezes.' },
  { pilar: 'Dor operacional', type: 'Post único', topic: 'Aprovação de compra travada num e-mail perdido há 4 dias', hook: 'O gargalo não é o RH. É o processo.' },
  { pilar: 'Dor operacional', type: 'Carrossel', topic: 'Como padronizar o primeiro dia entre filiais sem depender de improviso', hook: 'Por que o primeiro dia é diferente em cada unidade?' },
  { pilar: 'Dor operacional', type: 'Sequência de Stories', topic: 'Os 5 controles manuais que ainda seguram a operação de kits no RH', hook: 'Planilha, e-mail e WhatsApp: a operação na base do improviso.' },
  { pilar: 'Dor operacional', type: 'Reels', topic: 'Quanto tempo o RH perde rodando atrás de fornecedor de brinde', hook: 'Quantas horas por semana você gasta atrás de fornecedor?' },
  { pilar: 'Dor operacional', type: 'Post único', topic: 'Sem indicador de custo por colaborador, você decide no escuro', hook: 'Qual é o custo real de cada kit que você envia?' },
  { pilar: 'Prova social / autoridade', type: 'Carrossel', topic: 'Antes e depois: da planilha caótica ao controle de kits em um só lugar', hook: 'O que muda quando a operação sai da planilha.' },
  { pilar: 'Prova social / autoridade', type: 'Post único', topic: 'Benchmark: o que empresas em crescimento fazem diferente no onboarding', hook: 'Empresas que escalam tratam o onboarding como processo, não evento.' },
  { pilar: 'Prova social / autoridade', type: 'Reels', topic: 'Bastidores: como um kit de boas-vindas sai do pedido à entrega', hook: 'Do pedido à porta do colaborador, sem e-mail perdido.' },
  { pilar: 'Institucional / conversão', type: 'Carrossel', topic: 'Como a Givo centraliza pedidos, aprovações, estoque e entregas', hook: 'Veja como simplificar a operação de kits corporativos.' },
];

function curatedWeek(weekStart, postsPerDay) {
  const week = [];
  let idx = 0;
  for (let i = 0; i < 7; i++) {
    const date = addDaysISO(weekStart, i);
    const dow = DOW[new Date(date + 'T00:00:00').getDay()];
    const posts = [];
    for (let p = 0; p < postsPerDay; p++) {
      const item = POOL[idx % POOL.length];
      idx++;
      posts.push({
        time: postsPerDay === 1 ? '09:00' : p === 0 ? '09:00' : '17:00',
        type: item.type,
        pilar: item.pilar,
        topic: item.topic,
        hook: item.hook,
        status: 'pendente',
      });
    }
    week.push({ date, dayOfWeek: dow, posts });
  }
  return week;
}

// ---- Geração via OpenAI ----------------------------------------------------
async function generateWithOpenAI(weekStart, postsPerDay, apiKey) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDaysISO(weekStart, i);
    days.push(`${DOW[new Date(date + 'T00:00:00').getDay()]} (${date})`);
  }
  const userPrompt = `Monte um CALENDÁRIO EDITORIAL de 7 dias para o Instagram/Meta Ads da Givo, começando em ${weekStart}.
Gere ${postsPerDay} post(s) por dia (total de ${postsPerDay * 7} posts na semana).
Respeite a proporção 70% dor operacional / 20% prova social / 10% institucional no conjunto da semana.
Varie os formatos entre: ${FORMATS.join(', ')}. Não repita o mesmo ângulo em dias seguidos.
Dias da semana, nesta ordem: ${days.join('; ')}.

Responda APENAS com JSON válido (sem texto fora do JSON), no formato:
{"week":[{"date":"YYYY-MM-DD","dayOfWeek":"Segunda","posts":[{"time":"09:00","type":"Carrossel","pilar":"Dor operacional","topic":"tema específico e concreto","hook":"gancho curto com tensão real"}]}]}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.8,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PROMPT_MESTRE },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || 'Erro na API da OpenAI.');
  const parsed = JSON.parse(json.choices?.[0]?.message?.content || '{}');
  const week = Array.isArray(parsed.week) ? parsed.week : [];
  if (!week.length) throw new Error('Resposta sem calendário.');
  week.forEach(d => (d.posts || []).forEach(p => { p.status = p.status || 'pendente'; }));
  return week;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }
  try {
    const body = req.body || {};
    const weekStart = String(body.weekStart || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) throw new Error('Informe a data de início da semana (weekStart).');
    const postsPerDay = Math.min(Math.max(parseInt(body.postsPerDay, 10) || 1, 1), 3);

    const apiKey = process.env.OPENAI_API_KEY;
    let week, generated = false;
    if (apiKey) {
      try {
        week = await generateWithOpenAI(weekStart, postsPerDay, apiKey);
        generated = true;
      } catch {
        week = curatedWeek(weekStart, postsPerDay);
      }
    } else {
      week = curatedWeek(weekStart, postsPerDay);
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ weekStart, postsPerDay, week, generated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
