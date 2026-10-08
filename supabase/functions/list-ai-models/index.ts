const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-retry-count",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

/**
 * Curated whitelist with friendly labels/hints.
 * Only IDs in this list are exposed to the UI, even if AIAI.BY publishes more.
 * IDs not present in the live catalog are dropped.
 */
export const CURATED: Array<{ id: string; label: string; hint: string }> = [
  { id: "gpt-4o", label: "GPT-4o", hint: "Стабильный режим (по умолчанию)" },
  { id: "gpt-5.5", label: "GPT-5.5", hint: "OpenAI, сильнейшая модель" },
  { id: "gpt-5.4", label: "GPT-5.4", hint: "OpenAI, топ предыдущего поколения" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 mini", hint: "OpenAI, баланс цены и качества" },
  { id: "gpt-5.2", label: "GPT-5.2", hint: "OpenAI, проверенная версия" },
  { id: "gpt-5-mini", label: "GPT-5 mini", hint: "OpenAI, быстрая и дешёвая" },
  { id: "gpt-4.1", label: "GPT-4.1", hint: "OpenAI, без рассуждений, быстро" },
  { id: "claude-opus-4.8", label: "Claude Opus 4.8", hint: "Anthropic, премиум-качество" },
  { id: "claude-opus-4.6", label: "Claude Opus 4.6", hint: "Anthropic, премиум предыдущего поколения" },
  { id: "claude-sonnet-4.6", label: "Claude Sonnet 4.6", hint: "Anthropic, силён в аудите текста" },
  { id: "claude-sonnet-4.5", label: "Claude Sonnet 4.5", hint: "Anthropic, стабильный" },
  { id: "claude-haiku-4.5", label: "Claude Haiku 4.5", hint: "Anthropic, быстрый и дешёвый" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", hint: "Google, быстрый и точный" },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (preview)", hint: "Google, превью топ-модели" },
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash (preview)", hint: "Google, превью" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", hint: "Google, сильная модель" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", hint: "Google, баланс" },
  { id: "deepseek-v4-pro", label: "DeepSeek v4 Pro", hint: "Сильный open-weight" },
  { id: "deepseek-v4-flash", label: "DeepSeek v4 Flash", hint: "Очень дешёвый и быстрый" },
  { id: "grok-4.3", label: "Grok 4.3", hint: "xAI, новое поколение" },
  { id: "qwen3-max", label: "Qwen 3 Max", hint: "Alibaba, сильная модель" },
  { id: "kimi-k2.6", label: "Kimi K2.6", hint: "Moonshot, длинный контекст" },
  { id: "glm-5", label: "GLM-5", hint: "Zhipu, сильный open-weight" },
  { id: "minimax-m2.5", label: "MiniMax M2.5", hint: "Дешёвая альтернатива" },
];

export const FALLBACK_LIST = [
  { id: "gpt-4o", label: "GPT-4o", hint: "Стабильный режим (по умолчанию)" },
  { id: "gpt-4o-mini", label: "GPT-4o mini", hint: "Дешевле" },
];

const AIAI_BASE_URL = (Deno.env.get("AIAI_BASE_URL") ?? "https://vedai.by/api/v1").replace(/\/+$/, "");
export const CACHE_TTL_MS = 10 * 60 * 1000;
export const STALE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  at: number;
  models: typeof CURATED;
  degraded: boolean;
}
let cache: CacheEntry | null = null;

/** Reset module-level cache between tests. */
export function __resetCacheForTests() {
  cache = null;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function fetchLiveIds(): Promise<Set<string> | null> {
  const RAW_KEY = Deno.env.get("AIAI_API_KEY");
  const API_KEY = RAW_KEY?.replace(/[^\x21-\x7E]/g, "");
  if (!API_KEY) return null;
  try {
    const r = await fetch(`${AIAI_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) {
      await r.text().catch(() => "");
      return null;
    }
    const body = await r.json();
    const ids = new Set<string>();
    for (const m of body?.data ?? []) {
      if (typeof m?.id === "string") ids.add(m.id);
    }
    return ids;
  } catch (e) {
    console.error("list-ai-models fetch failed", e);
    return null;
  }
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return json({ models: cache.models, degraded: cache.degraded, cached: true });
  }

  const liveIds = await fetchLiveIds();
  if (!liveIds || liveIds.size === 0) {
    // upstream down — serve last-known-good cache while it's within STALE_TTL.
    if (cache && now - cache.at < STALE_TTL_MS) {
      return json({ models: cache.models, degraded: true, cached: true, stale: true });
    }
    return json({ models: FALLBACK_LIST, degraded: true });
  }

  const filtered = CURATED.filter((m) => liveIds.has(m.id));
  const models = filtered.length ? filtered : FALLBACK_LIST;
  cache = { at: now, models, degraded: !filtered.length };
  return json({ models, degraded: !filtered.length });
};


Deno.serve(handler);
