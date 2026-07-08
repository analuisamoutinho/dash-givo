// GIVO — Vercel Serverless Function
// Busca os insights do Meta Ads no servidor, usando o token guardado como
// variável de ambiente na Vercel. O token nunca chega ao navegador.
//
// Variáveis de ambiente esperadas (Project Settings → Environment Variables):
//   META_ACCESS_TOKEN   → token de sistema/usuário com permissão ads_read
//   META_AD_ACCOUNT_ID  → ID da conta de anúncios, sem o prefixo "act_"
//
// Query params opcionais: ?since=YYYY-MM-DD&until=YYYY-MM-DD (padrão: últimos 7 dias)

const GRAPH_VERSION = 'v21.0';

async function metaFetch(path, params) {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error('META_ACCESS_TOKEN não configurado na Vercel.');

  const query = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}?${query}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || 'Erro na API do Meta');
  return json;
}

function actionsCount(actions) {
  if (!actions) return 0;
  const keys = ['onsite_conversion.messaging_conversation_started_7d', 'lead', 'offsite_conversion.fb_pixel_lead'];
  return actions.filter(a => keys.includes(a.action_type)).reduce((s, a) => s + Number(a.value), 0);
}

function toISO(d) {
  return d.toISOString().slice(0, 10);
}

module.exports = async function handler(req, res) {
  try {
    const acct = process.env.META_AD_ACCOUNT_ID;
    if (!acct) throw new Error('META_AD_ACCOUNT_ID não configurado na Vercel.');

    const now = new Date();
    const defaultUntil = toISO(now);
    const defaultSince = toISO(new Date(now.getTime() - 6 * 86400000));
    const since = (req.query.since || defaultSince).slice(0, 10);
    const until = (req.query.until || defaultUntil).slice(0, 10);
    const timeRange = JSON.stringify({ since, until });

    const base = `act_${acct}/insights`;
    const [summary, series, ads] = await Promise.all([
      metaFetch(base, { time_range: timeRange, fields: 'spend,impressions,clicks,cpc,ctr,reach,frequency' }),
      metaFetch(base, { time_range: timeRange, time_increment: 1, fields: 'spend,clicks' }),
      metaFetch(base, {
        time_range: timeRange,
        level: 'ad',
        fields: 'ad_name,adset_name,spend,impressions,clicks,cpc,ctr,actions',
        limit: 500,
      }),
    ]);

    const adsList = (ads.data || [])
      .map(a => ({
        name: a.ad_name,
        adset: a.adset_name,
        spend: Number(a.spend || 0),
        impressions: Number(a.impressions || 0),
        clicks: Number(a.clicks || 0),
        cpc: Number(a.cpc || 0),
        ctr: Number(a.ctr || 0),
        conversions: actionsCount(a.actions),
      }))
      .filter(a => a.impressions >= 1)
      .sort((x, y) => y.conversions - x.conversions || y.spend - x.spend)
      .slice(0, 20);

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.status(200).json({
      range: { since, until },
      summary: summary.data[0] || {},
      series: series.data.map(d => ({ date: d.date_start, spend: Number(d.spend || 0), clicks: Number(d.clicks || 0) })),
      ads: adsList,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
