import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { handler } from "./index.ts";
import { callHandler, RUN_AI } from "../_shared/test_utils.ts";

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
