import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handler, __resetCacheForTests, CURATED, FALLBACK_LIST } from "./index.ts";

const originalFetch = globalThis.fetch;
const originalKey = Deno.env.get("AIAI_API_KEY");

function restore() {
  globalThis.fetch = originalFetch;
  if (originalKey !== undefined) Deno.env.set("AIAI_API_KEY", originalKey);
  else Deno.env.delete("AIAI_API_KEY");
  __resetCacheForTests();
}

function stubModelsResponse(ids: string[]) {
  let calls = 0;
  globalThis.fetch = ((_url: string, _init?: RequestInit) => {
    calls++;
    const body = { data: ids.map((id) => ({ id })) };
    return Promise.resolve(
      new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
  }) as typeof fetch;
  return () => calls;
}

function makeReq() {
  return new Request("http://localhost/list-ai-models", { method: "GET" });
}

Deno.test("list-ai-models: пересекает CURATED с живым каталогом, отбрасывает лишнее и неподдерживаемое", async () => {
  __resetCacheForTests();
  Deno.env.set("AIAI_API_KEY", "test-key");
  // Переписано: gpt-4o-mini убран из каталога моделей — третий id берём из CURATED.
  const third = CURATED.find((c) => c.id !== "gpt-4o" && c.id !== "claude-haiku-4.5")!.id;
  const someCurated = ["gpt-4o", third, "claude-haiku-4.5"];
  stubModelsResponse([...someCurated, "non-curated-extra-id"]);
  try {
    const res = await handler(makeReq());
    assertEquals(res.status, 200);
    const data = await res.json();
    const ids = data.models.map((m: any) => m.id).sort();
    assertEquals(ids, [...someCurated].sort());
    assertEquals(data.degraded, false);
    // все возвращённые id принадлежат CURATED
    for (const m of data.models) {
      assert(CURATED.find((c) => c.id === m.id));
    }
  } finally {
    restore();
  }
});

Deno.test("list-ai-models: без AIAI_API_KEY → FALLBACK_LIST + degraded:true", async () => {
  __resetCacheForTests();
  Deno.env.delete("AIAI_API_KEY");
  try {
    const res = await handler(makeReq());
    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.models, FALLBACK_LIST);
    assertEquals(data.degraded, true);
  } finally {
    restore();
  }
});

Deno.test("list-ai-models: апстрим падает, кэша нет → FALLBACK_LIST + degraded:true", async () => {
  __resetCacheForTests();
  Deno.env.set("AIAI_API_KEY", "test-key");
  globalThis.fetch = (() => Promise.reject(new Error("network down"))) as typeof fetch;
  try {
    const res = await handler(makeReq());
    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.models, FALLBACK_LIST);
    assertEquals(data.degraded, true);
  } finally {
    restore();
  }
});

Deno.test("list-ai-models: апстрим падает, кэш свежий (в пределах STALE_TTL) → отдаёт кэш с stale:true", async () => {
  __resetCacheForTests();
  Deno.env.set("AIAI_API_KEY", "test-key");
  stubModelsResponse(["gpt-4o", "claude-haiku-4.5"]);
  await handler(makeReq()).then((r) => r.text());
  // Сдвигаем время за пределы FRESH TTL, но внутри STALE TTL.
  const realNow = Date.now;
  Date.now = () => realNow() + 11 * 60 * 1000;
  globalThis.fetch = (() => Promise.reject(new Error("network down"))) as typeof fetch;
  try {
    const res = await handler(makeReq());
    const data = await res.json();
    assertEquals(res.status, 200);
    assert(Array.isArray(data.models) && data.models.length > 0);
    assertEquals(data.degraded, true);
    assertEquals(data.cached, true);
    assertEquals(data.stale, true);
  } finally {
    Date.now = realNow;
    restore();
  }
});

Deno.test("list-ai-models: кэш просрочен по STALE_TTL и апстрим падает → FALLBACK_LIST", async () => {
  __resetCacheForTests();
  Deno.env.set("AIAI_API_KEY", "test-key");
  stubModelsResponse(["gpt-4o", "claude-haiku-4.5"]);
  await handler(makeReq()).then((r) => r.text());
  const realNow = Date.now;
  Date.now = () => realNow() + 25 * 60 * 60 * 1000; // > STALE_TTL_MS
  globalThis.fetch = (() => Promise.reject(new Error("network down"))) as typeof fetch;
  try {
    const res = await handler(makeReq());
    const data = await res.json();
    assertEquals(data.models, FALLBACK_LIST);
    assertEquals(data.degraded, true);
    assertEquals(data.stale, undefined);
  } finally {
    Date.now = realNow;
    restore();
  }
});

Deno.test("list-ai-models: в пределах CACHE_TTL_MS второй вызов отдаёт cached:true без нового fetch", async () => {
  __resetCacheForTests();
  Deno.env.set("AIAI_API_KEY", "test-key");
  const calls = stubModelsResponse(["gpt-4o"]);
  try {
    const r1 = await handler(makeReq());
    await r1.text();
    const r2 = await handler(makeReq());
    const d2 = await r2.json();
    assertEquals(calls(), 1); // ровно один реальный fetch
    assertEquals(d2.cached, true);
  } finally {
    restore();
  }
});

