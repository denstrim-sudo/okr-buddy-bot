const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-retry-count",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

import { CURATED_MODELS } from "../_shared/models.ts";

/** Curated whitelist (см. _shared/models.ts); IDs, которых нет в живом каталоге, отбрасываются. */
export const CURATED = CURATED_MODELS;

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
