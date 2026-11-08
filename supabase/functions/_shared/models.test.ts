import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CURATED_MODELS, isSlowModel, primaryAttemptMsFor, SLOW_PRIMARY_ATTEMPT_MS, FAST_PRIMARY_ATTEMPT_MS } from "./models.ts";

Deno.test("каталог: нет устаревших моделей, которых AIAI.BY больше не отдаёт", () => {
  const ids = CURATED_MODELS.map((m) => m.id);
  for (const gone of ["gemini-3.1-pro-preview", "gemini-3-flash-preview", "qwen3-max"]) {
    assert(!ids.includes(gone), `${gone} должна быть удалена`);
  }
});

Deno.test("каталог: есть актуальные поколения моделей", () => {
  const ids = CURATED_MODELS.map((m) => m.id);
  for (const fresh of ["claude-sonnet-5.5", "gemini-3.1-pro", "gpt-6.1-sol", "grok-4.7"]) {
    assert(ids.includes(fresh), `${fresh} должна быть в каталоге`);
  }
  assertEquals(ids[0], "gpt-4o");
});

Deno.test("каталог: reasoning-модели помечены slow, быстрые — нет", () => {
  assertEquals(isSlowModel("deepseek-v4-pro"), true);
  assertEquals(isSlowModel("claude-opus-5.5"), true);
  assertEquals(isSlowModel("gpt-4o"), false);
  assertEquals(isSlowModel("gemini-3.5-flash"), false);
  assertEquals(isSlowModel(undefined), false);
  for (const m of CURATED_MODELS) if (m.slow) assert(m.hint.includes("медленн"), `${m.id}: подсказка про скорость`);
});

Deno.test("бюджет: медленной модели больше времени на первую попытку, но остаётся запас на GPT-4o", () => {
  assertEquals(primaryAttemptMsFor("deepseek-v4-pro"), SLOW_PRIMARY_ATTEMPT_MS);
  assertEquals(primaryAttemptMsFor("gemini-3.5-flash"), FAST_PRIMARY_ATTEMPT_MS);
  assert(SLOW_PRIMARY_ATTEMPT_MS > FAST_PRIMARY_ATTEMPT_MS);
  assert(140_000 - SLOW_PRIMARY_ATTEMPT_MS >= 15_000, "запас на fallback не меньше MIN_ATTEMPT_MS");
});
