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
 *     Defaults to gemini-3-flash-preview (known-good).
 *   - GEMINI_THINKING_LEVEL (optional) — minimal | low | medium | high.
 *     UNSET by default, which keeps the request in the known-good shape. Set
 *     it only together with a thinking-capable model (e.g. GEMINI_MODEL=
 *     gemini-3.5-flash) AND verify replies still return — the 3.5 request
 *     shape differs and must be confirmed against the live API key.
 *   - ALLOWED_ORIGINS (optional) — comma-separated origins (e.g.
 *     "https://colorado-gov.org"). When set, browser requests from other
 *     origins are rejected. Unset = allow all (default), so embeds keep
 *     working. This is a soft signal; non-browser clients send no Origin.
 *
 * Abuse protection: this Worker is intentionally public (no auth) so the
 * static site can call it. The strongest, lowest-effort protection is a
 * Cloudflare *Rate Limiting Rule* on the Worker route (dashboard →
 * the worker → Settings → add a rate-limiting rule, e.g. 20 requests/min
 * per IP). The guards below (body-size cap, optional origin allowlist) are
 * defense-in-depth, not a substitute for that rule.
 */

const CATALOG_URL = 'https://colorado-gov.org/service-catalog-v8.json';
const CATALOG_TTL_SECONDS = 3600;
const MAX_HISTORY_TURNS = 10;
const MAX_TURN_CHARS = 1500;
// Known-good default. Gemini 3.5 + thinking is opt-in via env (see below):
// it requires a different request shape and must be verified against the
// live API key before relying on it.
const DEFAULT_MODEL = 'gemini-3-flash-preview';
const MAX_BODY_BYTES = 32 * 1024; // 32KB — generous for a message + 10 turns

function originAllowed(request, env) {
  const allowList = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);
  if (!allowList.length) return true; // not configured: allow all
  const origin = request.headers.get('Origin');
  if (!origin) return true; // non-browser client sends no Origin; soft signal only
  return allowList.includes(origin);
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function loadCatalogSummary(lang) {
  // Never let catalog loading crash the request. If anything fails (fetch,
  // Cache API, JSON parse), degrade to an empty catalog: the assistant can
  // still answer (less precisely) instead of returning an error to the user.
  try {
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
      // cache.put can throw on some upstream header combinations; don't let
      // that take down the request.
      try {
        await cache.put(cacheKey, response.clone());
      } catch (e) {
        // caching is best-effort
      }
    }

    const catalog = await response.json();
    return (catalog.services || [])
      .map(s => {
        const name = (s.name && (s.name[lang] || s.name.en)) || '';
        return `${name} | ${s.url}`;
      })
      .join('\n');
  } catch (e) {
    console.error('loadCatalogSummary failed:', e.message);
    return '';
  }
}

function legacyCatalogSummary(catalog) {
  let parsed = catalog;
  try {
    if (typeof catalog === 'string') parsed = JSON.parse(catalog);
  } catch (e) {
    parsed = null;
  }
  // Accept either a bare array (what the old client sent) or a full catalog
  // object { services: [...] }, so a malformed-but-reasonable request still
  // summarizes instead of throwing a 500.
  const services = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.services)
      ? parsed.services
      : [];
  return services.map(s => `${s.name} | ${s.url}`).join('\n');
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

    if (!originAllowed(request, env)) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    // Reject oversized bodies up front so a hostile caller can't force us to
    // buffer or forward a huge payload to Gemini.
    const declaredLength = Number(request.headers.get('Content-Length') || 0);
    if (declaredLength > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ error: 'Request too large' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    try {
      const raw = await request.text();
      if (raw.length > MAX_BODY_BYTES) {
        return new Response(JSON.stringify({ error: 'Request too large' }), {
          status: 413,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        });
      }
      const { message, history, catalog, lang = 'en' } = JSON.parse(raw);

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

      // Known-good request shape (what ran reliably on gemini-3-flash-preview).
      // thinkingConfig is added ONLY when GEMINI_THINKING_LEVEL is set, so the
      // default request stays exactly the shape Gemini already accepted. To try
      // Gemini 3.5: set GEMINI_MODEL=gemini-3.5-flash and GEMINI_THINKING_LEVEL
      // (minimal|low|medium|high), then confirm replies still come back.
      const generationConfig = {
        temperature: 0.2,
        maxOutputTokens: 2048,
      };
      if (env.GEMINI_THINKING_LEVEL) {
        generationConfig.thinkingConfig = { thinkingLevel: env.GEMINI_THINKING_LEVEL };
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents, generationConfig }),
        }
      );

      const data = await response.json();

      if (data.error) {
        // Log upstream errors so they're visible in the Cloudflare dashboard
        // (Workers → this worker → Logs) without exposing detail to callers.
        console.error('Gemini error:', response.status, JSON.stringify(data.error));
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
      console.error('Worker error:', error.message);
      return new Response(JSON.stringify({ error: 'Service unavailable' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }
  },
};
