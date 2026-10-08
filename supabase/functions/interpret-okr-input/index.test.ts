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

Deno.test("interpret-okr-input: SYSTEM_PROMPT includes REASONING_RULES and old instructions", async () => {
  const { SYSTEM_PROMPT } = await import("./index.ts");
  const { REASONING_RULES } = await import("./reasoning.ts");
  assert(SYSTEM_PROMPT.includes(REASONING_RULES));
  assert(SYSTEM_PROMPT.includes("clarifying_questions"));
});

Deno.test({
  name: "interpret-okr-input [AI]: returns reasoning with 2-3 variants",
  ignore: !RUN_AI,
  async fn() {
    const { status, data } = await callHandler(handler, {
      raw_input: "Хотим за год удвоить активацию новых пользователей в мобильном приложении, отток 45% на первой неделе",
      horizon: "block_12m",
    });
    assertEquals(status, 200);
    assert(data.reasoning.facts.length >= 3);
    assert(data.reasoning.variants.length >= 2 && data.reasoning.variants.length <= 3);
    assert(data.reasoning_quality);
    assert(data.detected_mode && data.topic_summary !== undefined && Array.isArray(data.clarifying_questions));
  },
});

Deno.test({
  name: "interpret-okr-input [AI]: cites doc source",
  ignore: !RUN_AI,
  async fn() {
    const { status, data } = await callHandler(handler, {
      raw_input: "Хотим за год удвоить активацию новых пользователей в мобильном приложении",
      horizon: "block_12m",
      extra_context: "--- metrics.txt ---\nDAU 12 000, retention D7 18%",
    });
    assertEquals(status, 200);
    assert(data.reasoning.facts.some((f: { source: string }) => f.source === "doc:metrics.txt"));
  },
});
