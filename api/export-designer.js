// GIVO — Vercel Serverless Function
// A partir de um tema aprovado, gera o conteúdo já estruturado slide a slide,
// pronto para o designer (formato: capa, desenvolvimento, conclusão, CTA +
// legenda e hashtags). Segue o Prompt Mestre da Givo.
//
// Variáveis de ambiente:
//   OPENAI_API_KEY  → chave da API da OpenAI (opcional — há fallback estruturado)

const { PROMPT_MESTRE } = require('./_promptMestre');

const OPENAI_MODEL = 'gpt-4o';

function fallbackSlides(topic, hook) {
  const gancho = hook || topic;
  return {
    title: topic,
    slides: [
      { role: 'CAPA', heading: gancho, body: 'Abertura que cria tensão sobre o problema operacional — sem prometer, sem vender.' },
      { role: 'DESENVOLVIMENTO', heading: 'Onde o problema começa', body: 'Descreva o cenário real do RH/People: planilha, e-mail e improviso sustentando a operação de kits e onboarding.' },
      { role: 'DESENVOLVIMENTO', heading: 'O custo invisível', body: 'Mostre o impacto: tempo perdido, estoque sem controle, custo por colaborador desconhecido, primeiro dia inconsistente.' },
      { role: 'DESENVOLVIMENTO', heading: 'A mudança de perspectiva', body: 'Não é falta de esforço do RH — é falta de processo e visibilidade. O problema é estrutural, não pessoal.' },
      { role: 'CONCLUSÃO', heading: 'Como fica quando há controle', body: 'Pedidos, aprovações, estoque e entregas centralizados em um só lugar, com indicadores e padronização entre unidades.' },
      { role: 'CTA', heading: 'Veja como funciona', body: 'Convite consultivo para conhecer a plataforma — nunca agressivo, sem urgência artificial.' },
    ],
    legenda: `${gancho}\n\nA operação de kits e onboarding não precisa depender de planilha, e-mail e improviso. Quando pedidos, estoque e entregas ficam num só lugar, o RH ganha controle e o colaborador ganha uma experiência consistente.\n\nSalve este conteúdo para quando for revisar sua operação.`,
    hashtags: ['#RH', '#EmployerBranding', '#Onboarding', '#EmployeeExperience', '#Givo'],
  };
}

async function generateWithOpenAI(topic, formato, hook, apiKey) {
  const userPrompt = `Gere o conteúdo completo, pronto para o designer, sobre o tema: "${topic}".
${formato ? `Formato: ${formato}.` : 'Formato: Carrossel.'}
${hook ? `Gancho de referência: "${hook}".` : ''}

Estruture como slides. Cada slide tem uma função (role): CAPA, DESENVOLVIMENTO, CONCLUSÃO ou CTA.
Responda APENAS com JSON válido no formato:
{"title":"título do conteúdo","slides":[{"role":"CAPA","heading":"headline do slide","body":"texto do slide"}],"legenda":"legenda completa do post","hashtags":["#...","#..."]}
Use de 6 a 9 slides. Respeite o tom de voz da Givo (consultivo, sem tom de vendedor de brinde) e os temas a evitar.`;

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
  if (!Array.isArray(parsed.slides) || !parsed.slides.length) throw new Error('Resposta sem slides.');
  return {
    title: parsed.title || topic,
    slides: parsed.slides,
    legenda: parsed.legenda || '',
    hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }
  try {
    const body = req.body || {};
    const topic = String(body.topic || '').trim();
    if (!topic) throw new Error('Informe o tema (topic).');
    const formato = String(body.formato || '').trim();
    const hook = String(body.hook || '').trim();

    const apiKey = process.env.OPENAI_API_KEY;
    let data, generated = false;
    if (apiKey) {
      try {
        data = await generateWithOpenAI(topic, formato, hook, apiKey);
        generated = true;
      } catch {
        data = fallbackSlides(topic, hook);
      }
    } else {
      data = fallbackSlides(topic, hook);
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ...data, generated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
