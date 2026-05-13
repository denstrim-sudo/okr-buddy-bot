import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { handler } from "./index.ts";
import { callHandler, RUN_AI } from "../_shared/test_utils.ts";

Deno.test("interpret-okr-input: rejects empty raw_input", async () => {
  const { status, data } = await callHandler(handler, { raw_input: "" });
  assertEquals(status, 400);
  assert(typeof data?.error === "string");
});

Deno.test("interpret-okr-input: rejects too-short raw_input", async () => {
  const { status } = await callHandler(handler, { raw_input: "ab" });
  assertEquals(status, 400);
});

Deno.test({
  name: "interpret-okr-input [AI]: detects from_scratch on plain goal",
  ignore: !RUN_AI,
  async fn() {
    const { status, data } = await callHandler(handler, {
      raw_input: "Хотим за год удвоить активацию новых пользователей в мобильном приложении",
      horizon: "block_12m",
    });
    assertEquals(status, 200);
    assertEquals(data.detected_mode, "from_scratch");
    assert(["strategic_3y", "block_12m"].includes(data.detected_horizon));
    assert(Array.isArray(data.clarifying_questions));
  },
});

Deno.test({
  name: "interpret-okr-input [AI]: detects rewrite_existing on pasted OKR",
  ignore: !RUN_AI,
  async fn() {
    const { status, data } = await callHandler(handler, {
      raw_input:
        "Objective: Стать лидером в категории онбординга\nKR1: Поднять активацию с 30% до 50%\nKR2: NPS с 32 до 50",
      horizon: "block_12m",
    });
    assertEquals(status, 200);
    assertEquals(data.detected_mode, "rewrite_existing");
    assertEquals(data.has_existing_okr, true);
  },
});
