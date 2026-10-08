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

// Переписано: раньше проверяли bet_axis; теперь варианты — ограничения («куда бьём»).
Deno.test("interpret-okr-input: SYSTEM_PROMPT — «куда бьём», без bet_axis и «драйвер»", async () => {
  const { SYSTEM_PROMPT } = await import("./index.ts");
  for (const s of ["куда бьём", "boundary_conditions", "reframed_solutions", "next_constraint"]) {
    assert(SYSTEM_PROMPT.includes(s), s);
  }
  assert(!SYSTEM_PROMPT.includes("bet_axis"));
  assert(!/драйвер/i.test(SYSTEM_PROMPT));
});

Deno.test("interpret-okr-input: схема — у варианта нет bet_axis, angle К/О/У", async () => {
  const { PARAMETERS } = await import("./index.ts");
  const v = (PARAMETERS as any).properties.reasoning.properties.variants.items.properties;
  assert(!("bet_axis" in v));
  assertEquals(v.kr_directions.items.properties.angle.enum, ["К", "О", "У"]);
  assertEquals(v.origin.enum, ["group", "suggested"]);
});

Deno.test("interpret-okr-input: known_constraints попадает в userPrompt (мок AI)", async () => {
  const orig = globalThis.fetch;
  const origKey = Deno.env.get("AIAI_API_KEY");
  Deno.env.set("AIAI_API_KEY", "test-key");
  const prompts: string[] = [];
  globalThis.fetch = ((_u: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    prompts.push(String(body.messages?.find((m: any) => m.role === "user")?.content ?? ""));
    return Promise.resolve(new Response(JSON.stringify({ error: "mock" }), { status: 500 }));
  }) as typeof fetch;
  try {
    await callHandler(handler, {
      raw_input: "Монетизация: проникновение 37,49%",
      known_constraints: ["Клиент не видит предложение партнёра", 42, ""],
    });
    assert(prompts.length >= 1);
    assert(prompts[0].includes("ОГРАНИЧЕНИЯ, НАЗВАННЫЕ ГРУППОЙ"));
    assert(prompts[0].includes("Клиент не видит предложение партнёра"));
  } finally {
    globalThis.fetch = orig;
    if (origKey !== undefined) Deno.env.set("AIAI_API_KEY", origKey);
  }
});

const FIXTURE_62 = "Монетизация: проникновение небанковских продуктов 37,49%, цель 55%. Разные юрлица, не можем передавать базы клиентов. Отсутствует единый профиль клиента.";

Deno.test({
  name: "interpret-okr-input [AI]: фикстура 6.2 — юрлица в boundary_conditions, профиль в reframed_solutions",
  ignore: !RUN_AI,
  async fn() {
    const { status, data } = await callHandler(handler, { raw_input: FIXTURE_62, horizon: "block_12m" });
    assertEquals(status, 200);
    const r = data.reasoning;
    assert(r.boundary_conditions.some((b: any) => /юрлиц/i.test(b.statement)));
    assert(!r.variants.some((v: any) => /юрлиц/i.test(v.strike_at)));
    assert(r.reframed_solutions.some((x: any) => /профил/i.test(x.original)));
    assertEquals(data.reasoning_quality.distinct_constraints, true);
    assert(r.variants.every((v: any) => v.if_removed.next_constraint.trim().length > 0));
    assert(data.detected_mode && Array.isArray(data.clarifying_questions));
  },
});

Deno.test({
  name: "interpret-okr-input [AI]: known_constraints — варианты группы, suggested не больше одного",
  ignore: !RUN_AI,
  async fn() {
    const { status, data } = await callHandler(handler, {
      raw_input: FIXTURE_62, horizon: "block_12m",
      known_constraints: [
        "Клиент не встречает предложение партнёра в момент потребности",
        "Оформление продукта партнёра требует повторной идентификации",
      ],
    });
    assertEquals(status, 200);
    const v = data.reasoning.variants;
    assert(v.filter((x: any) => x.origin === "group").length >= 2);
    assert(v.filter((x: any) => x.origin === "suggested").length <= 1);
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
    assertEquals(data.reasoning.lever_label, "показатель направления");
    assert(data.detected_mode && data.topic_summary !== undefined && Array.isArray(data.clarifying_questions));
  },
});
