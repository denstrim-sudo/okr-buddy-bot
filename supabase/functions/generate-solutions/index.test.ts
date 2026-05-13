import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { handler } from "./index.ts";
import { callHandler, RUN_AI } from "../_shared/test_utils.ts";

Deno.test("generate-solutions: requires objective", async () => {
  const { status } = await callHandler(handler, { objective: "", key_result: "kr text" });
  assertEquals(status, 400);
});

Deno.test("generate-solutions: requires key_result", async () => {
  const { status } = await callHandler(handler, { objective: "Стать лидером", key_result: "" });
  assertEquals(status, 400);
});

Deno.test({
  name: "generate-solutions [AI]: returns 3..5 solutions with required fields",
  ignore: !RUN_AI,
  async fn() {
    const { status, data } = await callHandler(handler, {
      objective: "Стать самым любимым онбордингом",
      key_result: "Поднять активацию с 30% до 50% к концу года",
    });
    assertEquals(status, 200);
    assert(Array.isArray(data.solutions));
    assert(data.solutions.length >= 3 && data.solutions.length <= 5);
    for (const s of data.solutions) {
      for (const f of ["problem", "bet", "result_image", "leading_metric", "validation"]) {
        assert(typeof s[f] === "string" && s[f].length > 0, `field ${f} missing`);
      }
      assert(["Low", "Medium", "High"].includes(s.confidence));
      assert(["S", "M", "L", "XL"].includes(s.effort));
    }
  },
});
