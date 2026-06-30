import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { handler, sanitizeRewrittenObjective, buildSystemPrompt, applyScoreRecompute, isAuditSuspicious } from "./index.ts";
import { callHandler, RUN_AI } from "../_shared/test_utils.ts";
import { containsDigits } from "../_shared/textGuards.ts";

Deno.test("validate-okr: requires objective", async () => {
  const { status } = await callHandler(handler, { objective: "", key_results: ["a"] });
  assertEquals(status, 400);
});

Deno.test("validate-okr: requires at least one KR", async () => {
  const { status } = await callHandler(handler, { objective: "Стать лидером", key_results: [] });
  assertEquals(status, 400);
});

// --- buildSystemPrompt: правила переключаются по горизонту ---
Deno.test("buildSystemPrompt('quarter_3m') содержит маркеры квартальных правил", () => {
  const p = buildSystemPrompt("quarter_3m");
  assert(p.includes("Q-Focus"));
  assert(p.includes("Q-Theme"));
  assert(p.includes("Q-Reach"));
  assert(p.includes("применяй КВАРТАЛЬНЫЙ набор правил"));
});

Deno.test("buildSystemPrompt('block_12m') НЕ содержит квартальных маркеров", () => {
  const p = buildSystemPrompt("block_12m");
  assert(!p.includes("Q-Focus"));
  assert(!p.includes("Q-Theme"));
  assert(!p.includes("Q-Reach"));
});

Deno.test("buildSystemPrompt('strategic_3y') НЕ содержит квартальных маркеров", () => {
  const p = buildSystemPrompt("strategic_3y");
  assert(!p.includes("Q-Focus"));
  assert(!p.includes("применяй КВАРТАЛЬНЫЙ"));
});

Deno.test({
  name: "validate-okr [AI]: quarter_3m + no leading KR → KR10 critical fail",
  ignore: !RUN_AI,
  async fn() {
    const { status, data } = await callHandler(handler, {
      objective: "Сфокусироваться на удержании активных пользователей квартала",
      key_results: [
        "Retention 30d вырос с 40% до 50%",
        "MRR вырос с 100k до 130k",
      ],
      horizon: "quarter_3m",
    });
    assertEquals(status, 200);
    const kr10 = (data.rules || []).find((r: any) => r.id === "KR10");
    assert(kr10, "KR10 must be present in rules");
    assertEquals(kr10.pass, false);
    assertEquals(kr10.severity, "critical");
  },
});

// --- textGuards (продублирован тут на случай, если раннер не подхватывает _shared) ---
Deno.test("containsDigits: 'Удвоить выручку к 2026 году' → true", () => {
  assertEquals(containsDigits("Удвоить выручку к 2026 году"), true);
});
Deno.test("containsDigits: чистый текст → false", () => {
  assertEquals(containsDigits("Стать предсказуемой опорой роста для команды"), false);
});

// --- sanitizeRewrittenObjective: чистая логика, без сети ---

interface TestReport {
  score: number;
  status: "pass" | "warn" | "fail";
  summary: string;
  rules: unknown[];
  rewritten_objective: string;
  rewritten_key_results: string[];
  rewritten_objective_warning?: boolean;
}

const makeReport = (rewritten: string): TestReport => ({
  score: 75,
  status: "pass",
  summary: "ok",
  rules: [],
  rewritten_objective: rewritten,
  rewritten_key_results: ["KR1 без цифр в этой строке"],
});

Deno.test("sanitize: чистый rewritten_objective → redo НЕ вызывается, ответ как есть", async () => {
  const initial = makeReport("Стать предсказуемой опорой роста");
  let redoCalls = 0;
  const result = await sanitizeRewrittenObjective(initial, async () => {
    redoCalls++;
    return makeReport("never used");
  });
  assertEquals(redoCalls, 0);
  assertEquals(result.rewritten_objective, "Стать предсказуемой опорой роста");
  assertEquals(result.rewritten_objective_warning, undefined);
});

Deno.test("sanitize: грязный rewritten_objective → ровно ОДИН redo, чистый результат, без warning", async () => {
  const initial = makeReport("Удвоить выручку к 2026 году");
  let redoCalls = 0;
  const result = await sanitizeRewrittenObjective(initial, async () => {
    redoCalls++;
    return makeReport("Стать опорой роста для команды");
  });
  assertEquals(redoCalls, 1);
  assertEquals(result.rewritten_objective, "Стать опорой роста для команды");
  assertEquals(result.rewritten_objective_warning, undefined);
});

Deno.test("sanitize: после redo цифра осталась → warning=true, ровно один redo (без петли)", async () => {
  const initial = makeReport("Удвоить выручку к 2026 году");
  let redoCalls = 0;
  const result = await sanitizeRewrittenObjective(initial, async () => {
    redoCalls++;
    return makeReport("Достичь 2x роста"); // снова с цифрой
  });
  assertEquals(redoCalls, 1);
  assertEquals(result.rewritten_objective_warning, true);
  // вернули именно второй ответ (с пометкой)
  assert(result.rewritten_objective.includes("2x"));
});

Deno.test("sanitize: если redo бросает — initial помечается warning и возвращается", async () => {
  const initial = makeReport("Удвоить выручку к 2026 году");
  const result = await sanitizeRewrittenObjective(initial, async () => {
    throw new Error("network");
  });
  assertEquals(result.rewritten_objective_warning, true);
  assertEquals(result.rewritten_objective, "Удвоить выручку к 2026 году");
});

// --- applyScoreRecompute: чистая логика серверного пересчёта ---

Deno.test("applyScoreRecompute: расхождение >10 → подменяет score, ставит флаг", () => {
  // 1 critical fail из 7 правил, остальные pass → recomputed=60 (потолок). Модель отдала 85.
  const data: any = {
    score: 85,
    rules: [
      { id: "O3", pass: false, severity: "critical" },
      { id: "KR1", pass: true, severity: "critical" },
      { id: "KR2", pass: true, severity: "critical" },
      { id: "KR3", pass: true, severity: "critical" },
      { id: "O1", pass: true, severity: "important" },
      { id: "KR4", pass: true, severity: "important" },
      { id: "KR10", pass: true, severity: "important" },
    ],
  };
  applyScoreRecompute(data);
  assertEquals(data.score, 60);
  assertEquals(data.score_recomputed, true);
});

Deno.test("applyScoreRecompute: расхождение ≤10 → не трогает score, без флага", () => {
  const data: any = {
    score: 85,
    rules: [
      { id: "A", pass: true, severity: "critical" },
      { id: "B", pass: true, severity: "important" },
      { id: "C", pass: false, severity: "improve" },
    ],
  };
  // recomputed = round(100 * 5/6) = 83. |85-83| = 2 ≤ 10.
  applyScoreRecompute(data);
  assertEquals(data.score, 85);
  assertEquals(data.score_recomputed, undefined);
});

Deno.test("applyScoreRecompute: severity отсутствует → резолвится из severityFor по id (KR10 для quarter_3m = critical)", () => {
  // KR10 без severity, pass=false, horizon=quarter_3m → должен сработать потолок 60.
  const data: any = {
    score: 90,
    rules: [
      { id: "KR10", pass: false }, // нет severity, но id → critical для quarter
      { id: "O1", pass: true },
      { id: "KR1", pass: true },
    ],
  };
  applyScoreRecompute(data, "quarter_3m");
  assert(data.score <= 60, `expected ≤60, got ${data.score}`);
  assertEquals(data.score_recomputed, true);
});

Deno.test("applyScoreRecompute: пустые/отсутствующие rules → no-op", () => {
  const data: any = { score: 42 };
  applyScoreRecompute(data);
  assertEquals(data.score, 42);
  assertEquals(data.score_recomputed, undefined);
});


Deno.test({
  name: "validate-okr [AI]: returns rules + rewrites with same KR count",
  ignore: !RUN_AI,
  async fn() {
    const { status, data } = await callHandler(handler, {
      objective: "Стать самым любимым онбордингом",
      key_results: [
        "Поднять активацию с 30% до 50% к концу года",
        "NPS вырастет с 32 до 50",
      ],
    });
    assertEquals(status, 200);
    assert(typeof data.score === "number");
    assert(Array.isArray(data.rules) && data.rules.length >= 5);
    assertEquals(data.rewritten_key_results.length, 2);
  },
});

// --- isAuditSuspicious: чистая логика ---

Deno.test("isAuditSuspicious: rules=[] → true", () => {
  assertEquals(isAuditSuspicious({ rules: [] }), true);
});
Deno.test("isAuditSuspicious: rules=undefined → true", () => {
  assertEquals(isAuditSuspicious({ rules: undefined }), true);
});
Deno.test("isAuditSuspicious: все правила pass=false → true", () => {
  assertEquals(
    isAuditSuspicious({ rules: [{ pass: false }, { pass: false }, { pass: false }] }),
    true,
  );
});
Deno.test("isAuditSuspicious: смешанный pass — норма → false", () => {
  assertEquals(isAuditSuspicious({ rules: [{ pass: true }, { pass: false }] }), false);
});
Deno.test("isAuditSuspicious: data=null → true", () => {
  assertEquals(isAuditSuspicious(null), true);
});

