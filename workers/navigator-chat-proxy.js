/**
 * navigator-chat-proxy — Cloudflare Worker
 *
 * Proxies chat messages from the Colorado Service Navigator to Gemini.
 *
 * Request body: { message, history?, catalog?, lang? }
 *   - history: optional array of prior turns [{ role: 'user'|'assistant', text }]
 *     so the assistant remembers the conversation. Capped server-side.
 *   - catalog: legacy field (older clients sent the full catalog with every
 *     message). If absent, the worker fetches the published catalog from the
 *     site and caches it for an hour — preferred, saves ~100KB per message.
 *
 * Deploy: Cloudflare dashboard → Workers & Pages → navigator-chat-proxy →
 * Edit code → replace contents with this file → Deploy.
 *
 * Environment:
 *   - GEMINI_API_KEY (secret, required)
 *   - GEMINI_MODEL (optional) — overrides the model id without a redeploy.
 *     Defaults to gemini-3.5-flash.
 *   - GEMINI_THINKING_LEVEL (optional) — minimal | low | medium | high.
 *     Defaults to "low": this is a simple service-lookup task, so we keep
 *     thinking cheap and fast. Gemini 3.5 enables thinking at "medium" by
 *     default, which would add latency and token cost for no real benefit
 *     here. Raise it only if answer quality needs it.
 */

const CATALOG_URL = 'https://colorado-gov.org/service-catalog-v8.json';
const CATALOG_TTL_SECONDS = 3600;
const MAX_HISTORY_TURNS = 10;
const MAX_TURN_CHARS = 1500;
const DEFAULT_MODEL = 'gemini-3.5-flash';
const DEFAULT_THINKING_LEVEL = 'low';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function loadCatalogSummary(lang) {
  const cache = caches.default;
  const cacheKey = new Request(CATALOG_URL);

  let response = await cache.match(cacheKey);
  if (!response) {
    response = await fetch(CATALOG_URL, {
      headers: { 'User-Agent': 'navigator-chat-proxy/2.0' },
    });
    if (!response.ok) return '';
    response = new Response(response.body, response);
    response.headers.set('Cache-Control', `s-maxage=${CATALOG_TTL_SECONDS}`);
    await cache.put(cacheKey, response.clone());
  }

  const catalog = await response.json();
  return (catalog.services || [])
    .map(s => {
      const name = (s.name && (s.name[lang] || s.name.en)) || '';
      return `${name} | ${s.url}`;
    })
    .join('\n');
}

function legacyCatalogSummary(catalog) {
  let services = [];
  try {
    services = typeof catalog === 'string' ? JSON.parse(catalog) : catalog;
  } catch (e) {
    services = [];
  }
  return (services || []).map(s => `${s.name} | ${s.url}`).join('\n');
}

function historyToContents(history) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-MAX_HISTORY_TURNS)
    .filter(turn => turn && typeof turn.text === 'string' && turn.text.trim())
    .map(turn => ({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(turn.text).slice(0, MAX_TURN_CHARS) }],
    }));
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const { message, history, catalog, lang = 'en' } = await request.json();

      const catalogSummary = catalog
        ? legacyCatalogSummary(catalog)
        : await loadCatalogSummary(lang);

      const systemPrompts = {
        en: `You help users find Colorado government services. Be concise (2-3 sentences max).

RULES:
- Format links as markdown: [Text](url)
- Use EXACT URLs from the catalog - do not modify them
- If no exact match, suggest searching the main site

SERVICES:
${catalogSummary}`,
        es: `Ayudas a los usuarios a encontrar servicios gubernamentales de Colorado. Sé conciso (2-3 oraciones máximo). Responde siempre en español.

REGLAS:
- Formatea los enlaces como markdown: [Texto](url)
- Usa las URLs EXACTAS del catálogo - no las modifiques
- Si no hay coincidencia exacta, sugiere buscar en el sitio principal

SERVICIOS:
${catalogSummary}`,
      };

      const modelResponses = {
        en: "Got it. I'll help find services using markdown links.",
        es: 'Entendido. Ayudaré a encontrar servicios usando enlaces en markdown.',
      };

      const systemPrompt = systemPrompts[lang] || systemPrompts.en;
      const modelResponse = modelResponses[lang] || modelResponses.en;

      const contents = [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: modelResponse }] },
        ...historyToContents(history),
        { role: 'user', parts: [{ text: String(message || '').slice(0, MAX_TURN_CHARS) }] },
      ];

      const model = env.GEMINI_MODEL || DEFAULT_MODEL;
      const thinkingLevel = env.GEMINI_THINKING_LEVEL || DEFAULT_THINKING_LEVEL;

      // Gemini 3.5 migration notes:
      // - temperature / top_p / top_k are no longer recommended on 3.x
      //   thinking models; the strict system prompt handles grounding.
      // - thinkingConfig.thinkingLevel replaces the old thinking_budget.
      // - thinking tokens count toward maxOutputTokens, so we leave headroom
      //   above the short answer we actually want.
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            generationConfig: {
              maxOutputTokens: 4096,
              thinkingConfig: { thinkingLevel },
            },
          }),
        }
      );

      const data = await response.json();

      if (data.error) {
        return new Response(JSON.stringify({ error: data.error.message }), {
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        });
      }

      const defaultReply =
        lang === 'es'
          ? 'No pude encontrar servicios relevantes. Intente usar la barra de búsqueda.'
          : "I couldn't find relevant services. Try the search bar above.";

      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || defaultReply;

      return new Response(JSON.stringify({ reply }), {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Service unavailable' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }
  },
};
