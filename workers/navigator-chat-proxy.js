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
 *   - GEMINI_MODEL (optional) — primary model. Defaults to gemini-3.5-flash.
 *   - GEMINI_FALLBACK_MODEL (optional) — used if the primary errors.
 *     Defaults to gemini-3-flash-preview (known-good).
 *   - GEMINI_THINKING_LEVEL (optional) — minimal | low | medium | high for the
 *     primary (thinking) model. Defaults to "low".
 *
 * Model strategy: the Worker tries the primary model, and if it errors (wrong
 * id, param not accepted by this key, etc.) it automatically falls back to the
 * known-good model and logs why. So the chat can't go down from a model
 * misconfig. A GET request to the Worker URL lists the gemini models this key
 * can use — handy for confirming the exact 3.5 id. Each chat response includes
 * a "model" field naming which model actually served it.
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
// We TRY the primary model and fall back to the known-good model if it errors,
// so the chat can never go down just because a model id/param isn't accepted
// by this API key. Override either via env (GEMINI_MODEL / GEMINI_FALLBACK_MODEL).
const PRIMARY_MODEL = 'gemini-3.5-flash';
const FALLBACK_MODEL = 'gemini-3-flash-preview';
const DEFAULT_THINKING_LEVEL = 'low';
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

// Gemini 3.5 (a thinking model) wants thinkingConfig and discourages
// temperature; the older fallback uses the plain known-good config.
function buildGenerationConfig(useThinking, env) {
  if (useThinking) {
    return {
      maxOutputTokens: 4096, // headroom: thinking tokens count toward this
      thinkingConfig: { thinkingLevel: env.GEMINI_THINKING_LEVEL || DEFAULT_THINKING_LEVEL },
    };
  }
  return { temperature: 0.2, maxOutputTokens: 2048 };
}

async function callGemini(model, contents, generationConfig, env) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig }),
    }
  );
  const data = await response.json();
  return { status: response.status, data, error: data.error || (!response.ok ? { message: `HTTP ${response.status}` } : null) };
}

// GET diagnostic: list the gemini models this API key can actually use, so the
// correct model id can be confirmed without trial-and-error. Returns names
// only — the API key is never exposed.
async function listModels(env) {
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${env.GEMINI_API_KEY}`);
    const d = await r.json();
    if (d.error) return { error: d.error.message };
    const names = (d.models || [])
      .map(m => (m.name || '').replace(/^models\//, ''))
      .filter(n => n.includes('gemini'));
    return { availableModels: names };
  } catch (e) {
    return { error: e.message };
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // Visit the worker URL in a browser to see which gemini models this key
    // supports — used to confirm the correct 3.5 model id.
    if (request.method === 'GET') {
      const info = await listModels(env);
      return new Response(JSON.stringify(info, null, 2), {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
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

      const primaryModel = env.GEMINI_MODEL || PRIMARY_MODEL;
      const fallbackModel = env.GEMINI_FALLBACK_MODEL || FALLBACK_MODEL;

      // Try the primary model (Gemini 3.5 + thinking). If it errors — wrong
      // model id, param not accepted by this key, etc. — fall back to the
      // known-good model so the chat never goes down, and log why so the
      // primary can be fixed. No fallback call if both are the same model.
      let result = await callGemini(primaryModel, contents, buildGenerationConfig(true, env), env);
      let servedBy = primaryModel;

      if (result.error && fallbackModel && fallbackModel !== primaryModel) {
        console.error(`Primary model "${primaryModel}" failed (`, result.status, JSON.stringify(result.error), `); falling back to "${fallbackModel}"`);
        result = await callGemini(fallbackModel, contents, buildGenerationConfig(false, env), env);
        servedBy = fallbackModel;
      }

      if (result.error) {
        console.error(`All models failed. Last: "${servedBy}"`, result.status, JSON.stringify(result.error));
        return new Response(JSON.stringify({ error: result.error.message }), {
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        });
      }

      const defaultReply =
        lang === 'es'
          ? 'No pude encontrar servicios relevantes. Intente usar la barra de búsqueda.'
          : "I couldn't find relevant services. Try the search bar above.";

      const reply = result.data.candidates?.[0]?.content?.parts?.[0]?.text || defaultReply;

      return new Response(JSON.stringify({ reply, model: servedBy }), {
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
