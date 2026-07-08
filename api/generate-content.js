// GIVO — Vercel Serverless Function
// Gera sugestões de conteúdo (orgânico e para Meta Ads) usando o Prompt Mestre
// da Givo como system prompt de um modelo da OpenAI, enriquecido com dados
// reais de desempenho vindos da API do Meta Ads (quando configurada).
//
// Variáveis de ambiente esperadas (Project Settings → Environment Variables):
//   OPENAI_API_KEY      → chave da API da OpenAI (obrigatória)
//   META_ACCESS_TOKEN   → mesma usada em /api/meta-insights (opcional, dá contexto real)
//   META_AD_ACCOUNT_ID  → mesma usada em /api/meta-insights (opcional, dá contexto real)

const { PROMPT_MESTRE } = require('./_promptMestre');

const GRAPH_VERSION = 'v21.0';
const OPENAI_MODEL = 'gpt-4o';

async function fetchMetaContext() {
  const token = process.env.META_ACCESS_TOKEN;
  const acct = process.env.META_AD_ACCOUNT_ID;
  if (!token || !acct) return null;

  try {
    const now = new Date();
    const since = new Date(now.getTime() - 29 * 86400000).toISOString().slice(0, 10);
    const until = now.toISOString().slice(0, 10);
    const params = new URLSearchParams({
      time_range: JSON.stringify({ since, until }),
      level: 'ad',
      fields: 'ad_name,adset_name,spend,impressions,clicks,ctr,actions',
      limit: '15',
      access_token: token,
    });
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/act_${acct}/insights?${params}`);
    const json = await res.json();
    if (json.error || !Array.isArray(json.data)) return null;

    return json.data
      .map(a => ({
        name: a.ad_name,
        adset: a.adset_name,
        spend: Number(a.spend || 0),
        clicks: Number(a.clicks || 0),
        ctr: Number(a.ctr || 0),
      }))
      .filter(a => a.clicks > 0)
      .sort((x, y) => y.clicks - x.clicks)
      .slice(0, 5);
  } catch {
    return null;
  }
}

function buildUserPrompt({ formato, pilar, tema, historico, paraAnuncio }, metaContext) {
  const parts = [];
  parts.push(`Formato solicitado: ${formato}.`);
  parts.push(
    pilar && pilar !== 'auto'
      ? `Pilar: ${pilar}.`
      : 'Pilar: escolha o mais adequado ao tema, respeitando a proporção 70% dor / 20% prova / 10% institucional.'
  );
  if (tema && tema.trim()) parts.push(`Tema ou briefing do usuário: ${tema.trim()}`);
  if (Array.isArray(historico) && historico.length) {
    parts.push(`Últimos temas/ângulos já usados (NÃO repita o mesmo tema ou ângulo): ${historico.slice(-10).join('; ')}`);
  }
  if (paraAnuncio) {
    parts.push('Este conteúdo é para Meta Ads (não apenas orgânico) — inclua variações de gancho/headline, objetivo de campanha sugerido e a versão para os 3 primeiros segundos sem áudio, conforme instruído.');
  }
  if (metaContext && metaContext.length) {
    const lines = metaContext
      .map(a => `- "${a.name}" (${a.adset}): ${a.clicks} cliques, CTR ${a.ctr.toFixed(2)}%, R$ ${a.spend.toFixed(2)} investidos nos últimos 30 dias`)
      .join('\n');
    parts.push(`Dados reais de desempenho da conta de Meta Ads da Givo, últimos 30 dias (use como inspiração do que já está funcionando, não copie literalmente):\n${lines}`);
  }
  return parts.join('\n\n');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY não configurado na Vercel.');

    const body = req.body || {};
    const formato = String(body.formato || '').trim();
    if (!formato) throw new Error('Informe o formato do conteúdo.');

    const metaContext = await fetchMetaContext();
    const userPrompt = buildUserPrompt(body, metaContext);

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.85,
        messages: [
          { role: 'system', content: PROMPT_MESTRE },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    const json = await openaiRes.json();
    if (json.error) throw new Error(json.error.message || 'Erro na API da OpenAI.');

    const content = json.choices?.[0]?.message?.content || '';
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      content,
      usedMetaContext: Boolean(metaContext && metaContext.length),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
