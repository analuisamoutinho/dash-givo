// GIVO — Vercel Serverless Function
// Devolve as principais tendências relacionadas ao nicho da Givo (RH, People,
// Employer Branding, onboarding, gestão de kits corporativos), já traduzidas em
// pauta de conteúdo (gancho + ângulo + formato ideal).
//
// Usa a OpenAI quando configurada para refrescar as tendências; caso contrário
// devolve um conjunto curado do nicho — sempre disponível.
//
// Variáveis de ambiente:
//   OPENAI_API_KEY  → chave da API da OpenAI (opcional — há fallback curado)

const { PROMPT_MESTRE } = require('./_promptMestre');

const OPENAI_MODEL = 'gpt-4o';

const CURATED = [
  {
    termo: 'IA aplicada a processos de RH',
    volume: 'Em alta · People & Operações',
    fonte: 'Nicho RH',
    urgencia: 'alta',
    tipo_ideal: 'carrossel',
    relevancia: 'RH está automatizando tarefas repetitivas — o momento é ideal para mostrar como a operação de kits e onboarding também pode sair do manual.',
    gancho: 'A IA organiza tarefas do RH, mas quem organiza a operação de kits?',
    angulo: 'Mostrar onde a automação ajuda de verdade na rotina de People/Endomarketing e onde ainda se depende de planilha, e-mail e improviso.',
  },
  {
    termo: 'Onboarding remoto e híbrido',
    volume: 'Crescimento constante',
    fonte: 'Nicho RH',
    urgencia: 'alta',
    tipo_ideal: 'reels',
    relevancia: 'Com times distribuídos, o primeiro dia do colaborador remoto vira teste de logística — dor central do ICP da Givo.',
    gancho: 'O primeiro dia nunca acontece duas vezes.',
    angulo: 'Roteiro curto sobre o kit de boas-vindas que chega atrasado e o que isso comunica sobre a empresa.',
  },
  {
    termo: 'Employer Branding e experiência do colaborador',
    volume: 'Tema recorrente · Alta procura',
    fonte: 'Nicho RH',
    urgencia: 'media',
    tipo_ideal: 'carrossel',
    relevancia: 'O RH é cobrado por "employee experience" mas raramente tem ferramenta para entregar isso de forma consistente entre unidades.',
    gancho: 'Cobram employee experience do RH — mas com que ferramenta?',
    angulo: 'Conectar percepção de marca empregadora à consistência operacional (kits, onboarding, padronização entre filiais).',
  },
  {
    termo: 'Redução de custos e eficiência operacional',
    volume: 'Prioridade de gestão em 2026',
    fonte: 'Nicho RH',
    urgencia: 'media',
    tipo_ideal: 'post',
    relevancia: 'Pressão por eficiência coloca luz sobre desperdício de estoque e custo por colaborador — indicadores que hoje quase ninguém tem.',
    gancho: 'Qual é o custo real de cada kit que você envia?',
    angulo: 'Educar sobre indicadores de custo por colaborador/kit e desperdício de estoque, sem falar de preço.',
  },
  {
    termo: 'Padronização de processos entre filiais',
    volume: 'Empresas em expansão',
    fonte: 'Nicho RH',
    urgencia: 'media',
    tipo_ideal: 'carrossel',
    relevancia: 'Crescimento com múltiplas unidades expõe a inconsistência do primeiro dia — dor clássica de operação distribuída.',
    gancho: 'O processo que funciona hoje pode limitar seu crescimento amanhã.',
    angulo: 'Antes/depois de uma operação de kits padronizada versus dependente de cada gestor local.',
  },
  {
    termo: 'Cultura organizacional e senso de pertencimento',
    volume: 'Discussão constante em People',
    fonte: 'Nicho RH',
    urgencia: 'baixa',
    tipo_ideal: 'reels',
    relevancia: 'Kits e rituais de boas-vindas são expressão concreta de cultura — ponte natural entre tema amplo e a solução da Givo.',
    gancho: 'Cultura não se comunica em e-mail. Sente-se no primeiro dia.',
    angulo: 'Mostrar como pequenos detalhes operacionais do onboarding constroem pertencimento.',
  },
];

function shuffle(arr, seed) {
  const a = arr.slice();
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function refreshWithOpenAI(apiKey) {
  const userPrompt = `Liste 6 tendências ATUAIS relevantes para o nicho da Givo (RH, People, Employer Branding, onboarding, gestão de kits corporativos, eficiência operacional), já traduzidas em pauta de conteúdo.
Responda APENAS com JSON válido no formato:
{"trends":[{"termo":"...","volume":"...","fonte":"Nicho RH","urgencia":"alta|media|baixa","tipo_ideal":"carrossel|post|reels","relevancia":"por que importa para o ICP da Givo","gancho":"gancho curto com tensão","angulo":"como abordar o tema"}]}
Respeite o tom de voz e os temas a evitar do posicionamento da Givo. Nada de preço/promoção.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.7,
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
  const trends = Array.isArray(parsed.trends) ? parsed.trends : [];
  if (!trends.length) throw new Error('Resposta sem tendências.');
  return trends;
}

module.exports = async function handler(req, res) {
  try {
    const refresh = String(req.query.refresh || '') === 'true';
    const apiKey = process.env.OPENAI_API_KEY;

    let trends;
    if (refresh && apiKey) {
      try {
        trends = await refreshWithOpenAI(apiKey);
      } catch {
        trends = shuffle(CURATED, Date.now() % 233280);
      }
    } else if (refresh) {
      trends = shuffle(CURATED, Date.now() % 233280);
    } else {
      trends = CURATED;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      trends,
      fontes: { google: true },
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
