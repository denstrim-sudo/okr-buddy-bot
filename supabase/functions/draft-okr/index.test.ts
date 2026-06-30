import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { handler, capKeyResults } from "./index.ts";
import { callHandler, RUN_AI } from "../_shared/test_utils.ts";

Deno.test("capKeyResults: quarter_3m НЕ обрезает 4 KR", () => {
  const data = {
    key_results: [{ text: "a" }, { text: "b" }, { text: "c" }, { text: "d" }],
    horizon_fit: { key_results: [{ index: 0 }, { index: 1 }, { index: 2 }, { index: 3 }] },
  };
  const out = capKeyResults(data, "quarter_3m");
  assertEquals(out.key_results.length, 4);
  assertEquals(out.horizon_fit.key_results.length, 4);
});

Deno.test("capKeyResults: block_12m обрезает 4 KR до 3", () => {
  const data = {
    key_results: [{ text: "a" }, { text: "b" }, { text: "c" }, { text: "d" }],
    horizon_fit: { key_results: [{ index: 0 }, { index: 1 }, { index: 2 }, { index: 3 }] },
  };
  const out = capKeyResults(data, "block_12m");
  assertEquals(out.key_results.length, 3);
  assertEquals(out.horizon_fit.key_results.length, 3);
});

Deno.test("capKeyResults: strategic_3y обрезает 4 KR до 3", () => {
  const data = { key_results: [1, 2, 3, 4] as any };
  const out = capKeyResults(data, "strategic_3y");
  assertEquals(out.key_results.length, 3);
});

Deno.test("capKeyResults: не трогает, если KR <= лимита", () => {
  const data = { key_results: [{ text: "a" }, { text: "b" }] };
  assertEquals(capKeyResults(data, "block_12m").key_results.length, 2);
  assertEquals(capKeyResults(data, "quarter_3m").key_results.length, 2);
});

Deno.test("draft-okr: rejects empty raw_input", async () => {
  const { status } = await callHandler(handler, { raw_input: "", horizon: "block_12m" });
  assertEquals(status, 400);
});

Deno.test({
  name: "draft-okr [AI]: returns 1 objective and 1..3 KRs with horizon_fit",
  ignore: !RUN_AI,
  async fn() {
    const { status, data } = await callHandler(handler, {
      raw_input: "Удвоить активацию новых пользователей в мобильном приложении за год",
      horizon: "block_12m",
      mode: "from_scratch",
    });
    assertEquals(status, 200);
    assert(typeof data.objective === "string" && data.objective.length > 3);
    assert(Array.isArray(data.key_results));
    assert(data.key_results.length >= 1 && data.key_results.length <= 3);
    for (const kr of data.key_results) {
      assertEquals(kr.is_outcome, true);
      assert(["leading", "lagging"].includes(kr.kr_type));
    }
    assert(data.horizon_fit);
    assertEquals(data.horizon_fit.horizon, "block_12m");
    assert(data.horizon_fit.overall_score >= 0 && data.horizon_fit.overall_score <= 100);
  },
});
