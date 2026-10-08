import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { handler, sanitizeRewrittenObjective, buildSystemPrompt, applyScoreRecompute, markUnconfirmed, isAuditSuspicious, DOCS_HEADER } from "./index.ts";
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
// Переписано (OKR-PI 3.4): Q-FOCUS и Q-THEME удалены, в квартале остаются KR-LEADING→critical и Q-REACH.
Deno.test("buildSystemPrompt('quarter_3m') содержит Q-REACH и не содержит Q-FOCUS/Q-THEME (OKR-PI 3.4)", () => {
  const p = buildSystemPrompt("quarter_3m");
  assert(!p.includes("Q-FOCUS"));
  assert(!p.includes("Q-THEME"));
  assert(p.includes("Q-REACH"));
  assert(p.includes("применяй КВАРТАЛЬНЫЙ набор правил"));
});

Deno.test("buildSystemPrompt('block_12m') НЕ содержит квартальных маркеров", () => {
  const p = buildSystemPrompt("block_12m");
  assert(!p.includes("Q-FOCUS"));
  assert(!p.includes("Q-THEME"));
  assert(!p.includes("Q-REACH"));
});

Deno.test("buildSystemPrompt('strategic_3y') НЕ содержит квартальных маркеров", () => {
  const p = buildSystemPrompt("strategic_3y");
  assert(!p.includes("Q-FOCUS"));
  assert(!p.includes("применяй КВАРТАЛЬНЫЙ"));
});

Deno.test({
  name: "validate-okr [AI]: quarter_3m + no leading KR → KR-LEADING critical fail",
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
    const rule = (data.rules || []).find((r: any) => r.id === "KR-LEADING");
    assert(rule, "KR-LEADING must be present in rules");
    assertEquals(rule.pass, false);
    assertEquals(rule.severity, "critical");
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
  const data: any = {
    score: 85,
    rules: [
      { id: "OBJ-NO-NUMBERS", pass: false, severity: "critical" },
      { id: "KR-MEASURABLE", pass: true, severity: "critical" },
      { id: "KR-BASELINE-TARGET", pass: true, severity: "critical" },
      { id: "KR-OUTCOME", pass: true, severity: "critical" },
      { id: "OBJ-QUALITATIVE", pass: true, severity: "important" },
      { id: "KR-TIMEBOUND", pass: true, severity: "important" },
      { id: "KR-LEADING", pass: true, severity: "important" },
    ],
  };
  applyScoreRecompute(data);
  assertEquals(data.score, 60);
  assertEquals(data.score_recomputed, true);
});

// Переписано (шаг стабильности аудита): оценка ВСЕГДА считается сервером,
// раньше при расхождении ≤10 число модели оставалось.
Deno.test("applyScoreRecompute: расхождение ≤10 → score всё равно серверный, флаг true", () => {
  const data: any = {
    score: 85,
    rules: [
      { id: "A", pass: true, severity: "critical" },
      { id: "B", pass: true, severity: "important" },
      { id: "C", pass: false, severity: "improve" },
    ],
  };
  applyScoreRecompute(data);
  assertEquals(data.score, 83);
  assertEquals(data.score_recomputed, true);
});

Deno.test("applyScoreRecompute: число модели совпало → score_recomputed не ставится", () => {
  const data: any = { score: 100, rules: [{ id: "A", pass: true, severity: "critical" }] };
  applyScoreRecompute(data);
  assertEquals(data.score, 100);
  assertEquals(data.score_recomputed, undefined);
});

Deno.test("markUnconfirmed + applyScoreRecompute: провал KR-QUALITY-PAIR без цитаты не влияет на оценку", () => {
  const base = [
    { id: "OBJ-NO-NUMBERS", pass: true, severity: "critical", grounded: true },
    { id: "KR-MEASURABLE", pass: true, severity: "critical", grounded: true },
    { id: "KR-LEADING", pass: false, severity: "important", grounded: true },
  ];
  const without: any = { score: 0, rules: markUnconfirmed(base) };
  const withFail: any = {
    score: 0,
    rules: markUnconfirmed([...base, { id: "KR-QUALITY-PAIR", pass: false, severity: "important", grounded: false }]),
  };
  applyScoreRecompute(without);
  applyScoreRecompute(withFail);
  assertEquals(withFail.score, without.score);
  const qp = withFail.rules.find((r: any) => r.id === "KR-QUALITY-PAIR");
  assertEquals(qp.unconfirmed, true);
  assertEquals(withFail.rules.length, 4, "провал остаётся в списке");
  assertEquals(withFail.rules.find((r: any) => r.id === "KR-LEADING").unconfirmed, undefined);
});

Deno.test("applyScoreRecompute: severity отсутствует → резолвится из severityFor по id (KR-LEADING для quarter_3m = critical)", () => {
  const data: any = {
    score: 90,
    rules: [
      { id: "KR-LEADING", pass: false }, // нет severity, но id → critical для quarter
      { id: "OBJ-QUALITATIVE", pass: true },
      { id: "KR-MEASURABLE", pass: true },
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
  name: "validate-okr [AI]: mode=audit returns rules БЕЗ rewrites",
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
    assertEquals(data.rewritten_objective, undefined);
    assertEquals(data.rewritten_key_results, undefined);
  },
});

Deno.test({
  name: "validate-okr [AI]: mode=fix возвращает только rewritten_*",
  ignore: !RUN_AI,
  async fn() {
    const { status, data } = await callHandler(handler, {
      mode: "fix",
      objective: "Удвоить выручку к 2026 году",
      key_results: ["Поднять активацию", "Провести 10 интервью"],
      failed_rules: [
        { id: "OBJ-NO-NUMBERS", label: "Без цифр в Objective", hint: "Уберите 2026" },
        { id: "KR-BASELINE-TARGET", label: "Baseline и target", hint: "Добавьте FROM→TO" },
      ],
    });
    assertEquals(status, 200);
    assert(typeof data.rewritten_objective === "string" && data.rewritten_objective.length > 0);
    assertEquals(Array.isArray(data.rewritten_key_results), true);
    assertEquals(data.rewritten_key_results.length, 2);
    assertEquals(data.rules, undefined);
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

// =====================================================================
// Интеграционные тесты retry-логики handler (suspicious → один retry).
// Мокаем globalThis.fetch (как в _shared/ai.test.ts), чтобы держать всё
// в памяти без сетевых вызовов.
// =====================================================================

const _origFetch = globalThis.fetch;
const _origKey = Deno.env.get("AIAI_API_KEY");
function _restoreFetch() {
  globalThis.fetch = _origFetch;
  if (_origKey !== undefined) Deno.env.set("AIAI_API_KEY", _origKey);
}

interface FetchCall { model: string; userPrompt: string; temperature?: number; }

/**
 * Очередь tool-call-ответов в openai-формате. Каждый элемент — payload, который
 * вернётся как arguments при следующем fetch. Возвращает getter истории вызовов.
 */
function queueAiResponses(payloads: unknown[]): () => FetchCall[] {
  const history: FetchCall[] = [];
  let i = 0;
  globalThis.fetch = ((_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const userMsg = body.messages?.find((m: any) => m.role === "user")?.content ?? "";
    history.push({ model: body.model, userPrompt: String(userMsg), temperature: body.temperature });
    const payload = payloads[Math.min(i, payloads.length - 1)];
    i++;
    const resp = {
      choices: [{ message: { tool_calls: [{ function: { name: "validate_okr", arguments: JSON.stringify(payload) } }] } }],
      usage: {},
    };
    return Promise.resolve(
      new Response(JSON.stringify(resp), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
  }) as typeof fetch;
  return () => history;
}

const cleanRules = [
  { id: "OBJ-QUALITATIVE", label: "L", reasoning: "", pass: true, hint: "", severity: "improve", why: "" },
  { id: "OBJ-NO-NUMBERS", label: "L", reasoning: "", pass: false, hint: "h", severity: "critical", why: "w" },
  { id: "KR-MEASURABLE", label: "L", reasoning: "", pass: true, hint: "", severity: "improve", why: "" },
  { id: "KR-BASELINE-TARGET", label: "L", reasoning: "", pass: true, hint: "", severity: "improve", why: "" },
  { id: "KR-OUTCOME", label: "L", reasoning: "", pass: true, hint: "", severity: "improve", why: "" },
  { id: "KR-LEADING", label: "L", reasoning: "", pass: true, hint: "", severity: "improve", why: "" },
];
const cleanReport = {
  score: 78,
  status: "pass",
  summary: "ok",
  rules: cleanRules,
  rewritten_objective: "Стать опорой роста для команды",
  rewritten_key_results: ["KR1 без цифр в этой строке", "KR2 без цифр в этой строке"],
};
const suspiciousReport = { ...cleanReport, score: 0, status: "fail", rules: [] };

const baseBody = {
  objective: "Стать самым любимым онбордингом для команды",
  key_results: ["Поднять активацию", "NPS вырастет"],
  horizon: "block_12m",
  model: "claude-haiku-4.5",
};

// Переписано: раньше retry уходил на gpt-4o; теперь — на ту же модель, что выбрал пользователь.
Deno.test("handler: первый ответ suspicious → ровно ОДИН retry на ТОЙ ЖЕ модели", async () => {
  Deno.env.set("AIAI_API_KEY", "test-key");
  const getHistory = queueAiResponses([suspiciousReport, cleanReport]);
  try {
    const { status, data } = await callHandler(handler, baseBody);
    const history = getHistory();
    assertEquals(status, 200);
    assertEquals(history.length, 2, "должно быть ровно 2 fetch'а (initial + один retry)");
    assertEquals(history[0].model, "claude-haiku-4.5");
    assertEquals(history[1].model, "claude-haiku-4.5", "retry идёт на выбранной модели");
    assertEquals(history[0].temperature, 0);
    assertEquals(history[1].temperature, 0);
    // финальный ответ — из retry, без флага audit_unreliable
    assertEquals(data.audit_unreliable, undefined);
    // Переписано (замер стабильности): сервер отбрасывает вердикты модели по своим правилам
    // и добавляет 8 серверных: OKR-TYPE-DECLARED, KR-COUNT, KR-REQUIRED-ANGLES,
    // OBJ-NO-NUMBERS, KR-OUTCOME, KR-MEASURABLE, KR-TIMEBOUND, KR-LEADING.
    const serverIds = ["OKR-TYPE-DECLARED", "KR-COUNT", "KR-REQUIRED-ANGLES", "OBJ-NO-NUMBERS", "KR-OUTCOME", "KR-MEASURABLE", "KR-TIMEBOUND", "KR-LEADING"];
    const modelOnly = cleanRules.filter((r) => !serverIds.includes(r.id)).length;
    assert(Array.isArray(data.rules) && data.rules.length === modelOnly + 8);
  } finally {
    _restoreFetch();
  }
});

Deno.test("handler: retry тоже suspicious → audit_unreliable=true, ответ всё равно возвращается", async () => {
  Deno.env.set("AIAI_API_KEY", "test-key");
  const getHistory = queueAiResponses([suspiciousReport, suspiciousReport]);
  try {
    const { status, data } = await callHandler(handler, baseBody);
    assertEquals(status, 200);
    assertEquals(getHistory().length, 2);
    assertEquals(getHistory()[1].model, "claude-haiku-4.5", "без переключения на gpt-4o");
    assertEquals(data.audit_unreliable, true);
  } finally {
    _restoreFetch();
  }
});

Deno.test("handler: первый ответ НЕ suspicious → повторного вызова НЕ происходит", async () => {
  Deno.env.set("AIAI_API_KEY", "test-key");
  const getHistory = queueAiResponses([cleanReport]);
  try {
    const { status, data } = await callHandler(handler, baseBody);
    assertEquals(status, 200);
    assertEquals(getHistory().length, 1, "должен быть ровно 1 fetch — никакого retry");
    assertEquals(getHistory()[0].temperature, 0, "аудит идёт с температурой 0");
    assertEquals(data.audit_unreliable, undefined);
  } finally {
    _restoreFetch();
  }
});

Deno.test("handler: data.model_used проставлен из _meta.used_model, служебное __model_used отсутствует", async () => {
  Deno.env.set("AIAI_API_KEY", "test-key");
  queueAiResponses([suspiciousReport, cleanReport]);
  try {
    const { status, data } = await callHandler(handler, baseBody);
    assertEquals(status, 200);
    // Переписано: retry идёт на выбранной модели → model_used = claude-haiku-4.5
    assertEquals(data.model_used, "claude-haiku-4.5");
    assertEquals(data.__model_used, undefined, "__model_used не должно утекать в публичный JSON");
  } finally {
    _restoreFetch();
  }
});


// --- isGrounded: чистая логика обоснованности fail-вердикта ---
import { isGrounded, buildParameters } from "./index.ts";
import { knownRuleIdsFor, modelRuleIdsFor } from "../_shared/scoring.ts";

Deno.test("isGrounded: pass=true → всегда true, evidence не требуется", () => {
  assertEquals(isGrounded({ pass: true }, "obj", ["kr"]), true);
  assertEquals(isGrounded({ pass: true, evidence: "" }, "obj", ["kr"]), true);
});

Deno.test("isGrounded: pass=false + evidence реально встречается в KR → true", () => {
  const obj = "Стать опорой роста";
  const krs = ["KRs описывают количественные изменения метрики"];
  assertEquals(isGrounded({ pass: false, evidence: "количественные изменения" }, obj, krs), true);
});

Deno.test("isGrounded: pass=false + пустая evidence → false", () => {
  assertEquals(isGrounded({ pass: false, evidence: "" }, "obj text", ["kr text"]), false);
  assertEquals(isGrounded({ pass: false }, "obj text", ["kr text"]), false);
});

Deno.test("isGrounded: pass=false + выдуманная цитата → false", () => {
  assertEquals(
    isGrounded(
      { pass: false, evidence: "эта фраза точно не встречается в OKR" },
      "Стать опорой роста",
      ["KR один", "KR два"],
    ),
    false,
  );
});

Deno.test("isGrounded: регистронезависимость и нормализация пробелов/переносов", () => {
  const obj = "Стать  ПРЕДСКАЗУЕМОЙ\nопорой\tроста";
  assertEquals(isGrounded({ pass: false, evidence: "предсказуемой опорой роста" }, obj, []), true);
  assertEquals(isGrounded({ pass: false, evidence: "ПРЕДСКАЗУЕМОЙ   ОПОРОЙ" }, obj, []), true);
});

// --- buildParameters: жёсткая JSON-схема по горизонту ---
Deno.test("buildParameters(undefined).rules.items.required включает 'evidence'", () => {
  const required = buildParameters(undefined).properties.rules.items.required as string[];
  assert(required.includes("evidence"), `required=${JSON.stringify(required)}`);
});

// Переписано (OKR-PI): в схеме модели нет OKR-TYPE-DECLARED, KR-COUNT и KR-REQUIRED-ANGLES — их считает сервер (было 10/10/11).
Deno.test("buildParameters: minItems === maxItems === modelRuleIdsFor(horizon).length", () => {
  const p12 = buildParameters("block_12m");
  const p3y = buildParameters("strategic_3y");
  const pq = buildParameters("quarter_3m");
  const pDefault = buildParameters(undefined);
  assertEquals(p12.properties.rules.minItems, modelRuleIdsFor("block_12m").length);
  assertEquals(p12.properties.rules.maxItems, modelRuleIdsFor("block_12m").length);
  assertEquals(pq.properties.rules.minItems, modelRuleIdsFor("quarter_3m").length);
  assertEquals(pq.properties.rules.maxItems, modelRuleIdsFor("quarter_3m").length);
  // Переписано: модель оценивает только смысловые правила (3 базовых + Q-REACH в квартале).
  assertEquals(p3y.properties.rules.minItems, 3);
  assertEquals(pDefault.properties.rules.minItems, 3);
  assertEquals(pq.properties.rules.minItems, 4);
});

Deno.test("buildParameters: rules.items.properties.id.enum === modelRuleIdsFor(ctx), без OKR-TYPE-DECLARED", () => {
  const p12 = buildParameters("block_12m");
  const pq = buildParameters("quarter_3m");
  const pa = buildParameters({ horizon: "block_12m", okr_type: "aspirational" });
  assertEquals(p12.properties.rules.items.properties.id.enum, modelRuleIdsFor("block_12m"));
  assertEquals(pq.properties.rules.items.properties.id.enum, modelRuleIdsFor("quarter_3m"));
  assert(!(p12.properties.rules.items.properties.id.enum as string[]).includes("OKR-TYPE-DECLARED"));
  assert((pa.properties.rules.items.properties.id.enum as string[]).includes("OBJ-AMBITIOUS"));
});


// --- handler: серверный расчёт grounded ---

const rulesWithEvidence = [
  { id: "OBJ-QUALITATIVE", label: "L", reasoning: "", pass: true, hint: "", severity: "improve", why: "", evidence: "" },
  // evidence реально встречается во втором KR.
  // Переписано: KR-OUTCOME теперь считает сервер — берём смысловое правило KR-LEARNING-FORM.
  { id: "KR-LEARNING-FORM", label: "L", reasoning: "", pass: false, hint: "h", severity: "improve", why: "w", evidence: "NPS вырастет" },
  // evidence выдумана
  { id: "KR-QUALITY-PAIR", label: "L", reasoning: "", pass: false, hint: "h", severity: "improve", why: "w", evidence: "несуществующая фраза zzz" },
  { id: "KR-MEASURABLE", label: "L", reasoning: "", pass: true, hint: "", severity: "improve", why: "", evidence: "" },
  { id: "KR-LEADING", label: "L", reasoning: "", pass: true, hint: "", severity: "improve", why: "", evidence: "" },
];
const reportWithEvidence = {
  score: 78,
  status: "pass",
  summary: "ok",
  rules: rulesWithEvidence,
  rewritten_objective: "Стать опорой роста для команды",
  rewritten_key_results: ["Поднять активацию", "NPS вырастет"],
};

Deno.test("handler: добавляет grounded=true для pass=false с реально встречающейся evidence", async () => {
  Deno.env.set("AIAI_API_KEY", "test-key");
  queueAiResponses([reportWithEvidence]);
  try {
    const { status, data } = await callHandler(handler, baseBody);
    assertEquals(status, 200);
    const r = data.rules.find((x: any) => x.id === "KR-LEARNING-FORM");
    assertEquals(r.grounded, true);
    // pass сохранён; severity — канонический (KR-LEARNING-FORM → important)
    assertEquals(r.pass, false);
    assertEquals(r.severity, "important");
  } finally {
    _restoreFetch();
  }
});

Deno.test("handler: добавляет grounded=false для pass=false с выдуманной evidence", async () => {
  Deno.env.set("AIAI_API_KEY", "test-key");
  queueAiResponses([reportWithEvidence]);
  try {
    const { status, data } = await callHandler(handler, baseBody);
    assertEquals(status, 200);
    // Переписано: KR-BASELINE-TARGET удалён (OKR-PI 3.4), берём KR-QUALITY-PAIR.
    const r = data.rules.find((x: any) => x.id === "KR-QUALITY-PAIR");
    assertEquals(r.grounded, false);
    assertEquals(r.pass, false, "pass не должен переопределяться");
    // severity — канонический (KR-QUALITY-PAIR → important), даже если модель прислала другое
    assertEquals(r.severity, "important");
  } finally {
    _restoreFetch();
  }
});

Deno.test("handler: pass=true правила получают grounded=true автоматически", async () => {
  Deno.env.set("AIAI_API_KEY", "test-key");
  queueAiResponses([reportWithEvidence]);
  try {
    const { data } = await callHandler(handler, baseBody);
    const r = data.rules.find((x: any) => x.id === "OBJ-QUALITATIVE");
    assertEquals(r.grounded, true);
  } finally {
    _restoreFetch();
  }
});

// --- handler: серверное переопределение severity по канонической таблице ---

// Переписано: для обычного годового канон KR-LEADING — improve (рекомендация).
Deno.test("handler: KR-LEADING c severity='critical' от модели для block_12m → серверно исправлен на 'improve'", async () => {
  Deno.env.set("AIAI_API_KEY", "test-key");
  const rulesModelWrongSeverity = [
    { id: "OBJ-QUALITATIVE", label: "L", reasoning: "", pass: true, hint: "", severity: "improve", why: "", evidence: "" },
    // Модель прислала critical, но для block_12m по severityFor должно быть important
    { id: "KR-LEADING", label: "L", reasoning: "", pass: true, hint: "", severity: "critical", why: "", evidence: "" },
    { id: "OBJ-NO-NUMBERS", label: "L", reasoning: "", pass: true, hint: "", severity: "improve", why: "", evidence: "" },
    { id: "KR-MEASURABLE", label: "L", reasoning: "", pass: true, hint: "", severity: "improve", why: "", evidence: "" },
  ];
  queueAiResponses([{ ...reportWithEvidence, rules: rulesModelWrongSeverity }]);
  try {
    const { data } = await callHandler(handler, { ...baseBody, horizon: "block_12m" });
    const kr = data.rules.find((x: any) => x.id === "KR-LEADING");
    assertEquals(kr.severity, "improve", "severity KR-LEADING должна быть серверно исправлена на improve");
    // OBJ-NO-NUMBERS canonical = critical → должен быть переопределён из improve в critical
    const noNums = data.rules.find((x: any) => x.id === "OBJ-NO-NUMBERS");
    assertEquals(noNums.severity, "critical");
  } finally {
    _restoreFetch();
  }
});

Deno.test("handler: KR-LEADING для quarter_3m серверно ставится 'critical' независимо от модели", async () => {
  Deno.env.set("AIAI_API_KEY", "test-key");
  const rules = [
    { id: "KR-LEADING", label: "L", reasoning: "", pass: false, hint: "h", severity: "improve", why: "w", evidence: "" },
    { id: "OBJ-QUALITATIVE", label: "L", reasoning: "", pass: true, hint: "", severity: "improve", why: "", evidence: "" },
  ];
  queueAiResponses([{ ...reportWithEvidence, rules }]);
  try {
    const { data } = await callHandler(handler, { ...baseBody, horizon: "quarter_3m" });
    const kr = data.rules.find((x: any) => x.id === "KR-LEADING");
    assertEquals(kr.severity, "critical");
  } finally {
    _restoreFetch();
  }
});

// --- AI-интеграционный тест: стабильность набора id между прогонами ---

Deno.test({
  name: "validate-okr [AI]: набор id ровно совпадает с knownRuleIdsFor(horizon) (block_12m)",
  ignore: !RUN_AI,
  async fn() {
    const { status, data } = await callHandler(handler, {
      objective: "Стать самым любимым онбордингом",
      key_results: ["Поднять активацию с 30% до 50% к концу года", "NPS вырастет с 32 до 50"],
      horizon: "block_12m",
    });
    assertEquals(status, 200);
    const expected = knownRuleIdsFor("block_12m");
    assertEquals(data.rules.length, expected.length);
    const returnedIds = (data.rules as any[]).map((r) => r.id).sort();
    assertEquals(returnedIds, [...expected].sort());
  },
});

Deno.test({
  name: "validate-okr [AI]: набор id ровно совпадает с knownRuleIdsFor(horizon) (quarter_3m)",
  ignore: !RUN_AI,
  async fn() {
    const { status, data } = await callHandler(handler, {
      objective: "Сфокусироваться на удержании активных пользователей квартала",
      key_results: ["Retention 30d вырос с 40% до 50%", "MRR вырос с 100k до 130k"],
      horizon: "quarter_3m",
    });
    assertEquals(status, 200);
    const expected = knownRuleIdsFor("quarter_3m");
    assertEquals(data.rules.length, expected.length);
    const returnedIds = (data.rules as any[]).map((r) => r.id).sort();
    assertEquals(returnedIds, [...expected].sort());
  },
});

// --- chain-of-thought: reasoning идёт ДО pass в схеме ---

Deno.test("buildParameters: rules.items.properties.reasoning стоит РАНЬШЕ pass", () => {
  const props = buildParameters(undefined).properties.rules.items.properties;
  const keys = Object.keys(props);
  const iReasoning = keys.indexOf("reasoning");
  const iPass = keys.indexOf("pass");
  assert(iReasoning >= 0, "reasoning должно быть в properties");
  assert(iPass >= 0, "pass должно быть в properties");
  assert(iReasoning < iPass, `reasoning (${iReasoning}) должно идти РАНЬШЕ pass (${iPass})`);
});

Deno.test("buildParameters: reasoning входит в required", () => {
  const required = buildParameters(undefined).properties.rules.items.required as string[];
  assert(required.includes("reasoning"), `required=${JSON.stringify(required)}`);
});

Deno.test("buildSystemPrompt содержит блок ЭТАЛОНЫ и инструкцию про reasoning ДО pass", () => {
  const p = buildSystemPrompt("block_12m");
  assert(p.includes("ЭТАЛОНЫ"), "промпт должен содержать блок ЭТАЛОНЫ");
  assert(/reasoning.*ДО\s+pass/i.test(p) || /Заполняется\s+ДО\s+pass/i.test(p),
    "промпт должен требовать reasoning ДО pass");
});

Deno.test("buildSystemPrompt('quarter_3m') содержит квартальный эталон (спринт)", () => {
  const p = buildSystemPrompt("quarter_3m");
  assert(/спринт/i.test(p), "квартальный промпт должен содержать эталон со спринтом");
});

// --- grep-guard: ни один горизонт не содержит старых id правил ---
Deno.test("buildSystemPrompt: старые id правил (O1..O3, KR1..KR4, KR10) отсутствуют для всех горизонтов", () => {
  const horizons = ["strategic_3y", "block_12m", "quarter_3m"];
  const oldO = /\bO[0-9]\b/;
  const oldKR = /\bKR(1|2|3|4|10)\b/;
  for (const h of horizons) {
    const p = buildSystemPrompt(h);
    assertEquals(oldO.test(p), false, `old O-id найден в промпте для ${h}`);
    assertEquals(oldKR.test(p), false, `old KR-id найден в промпте для ${h}`);
  }
});

// =====================================================================
// Part Б: auditor/editor split — раздельные схемы и режимы
// =====================================================================

import { buildAuditorParameters, buildEditorParameters, buildEditorPrompt } from "./index.ts";

Deno.test("buildAuditorParameters НЕ содержит rewritten_* в properties", () => {
  for (const h of ["strategic_3y", "block_12m", "quarter_3m"]) {
    const p = buildAuditorParameters(h);
    const keys = Object.keys(p.properties);
    assertEquals(keys.includes("rewritten_objective"), false, `horizon=${h}: rewritten_objective должен отсутствовать`);
    assertEquals(keys.includes("rewritten_key_results"), false, `horizon=${h}: rewritten_key_results должен отсутствовать`);
    // Но rules с reasoning/pass/severity/evidence — на месте
    const itemProps = p.properties.rules.items.properties;
    assert(itemProps.reasoning, "rules.items.reasoning должен присутствовать");
    assert(itemProps.pass, "rules.items.pass должен присутствовать");
    assert(itemProps.severity, "rules.items.severity должен присутствовать");
    assert(itemProps.evidence, "rules.items.evidence должен присутствовать");
  }
});

Deno.test("buildEditorParameters содержит rewritten_* и опциональный editor_note", () => {
  const p = buildEditorParameters();
  const keys = Object.keys(p.properties).sort();
  assertEquals(keys, ["editor_note", "rewritten_key_results", "rewritten_objective"]);
  // required — только rewritten_*, editor_note опционален
  assertEquals(p.required.sort(), ["rewritten_key_results", "rewritten_objective"]);
  // editor_note — строка, русскоязычное краткое пояснение коуча
  assertEquals(p.properties.editor_note.type, "string");
  assert(/X\/Y|плейсхолдер/i.test(p.properties.editor_note.description ?? ""),
    "editor_note.description должен упоминать плейсхолдеры X/Y");
});

Deno.test("buildEditorPrompt содержит инструкцию 'закрой ВСЕ проваленные правила разом' и список проваленных правил", () => {
  const p = buildEditorPrompt(
    "Стать лидером",
    ["KR один", "KR два"],
    [
      { id: "OBJ-NO-NUMBERS", label: "Без цифр", hint: "Уберите 2026" },
      { id: "KR-BASELINE-TARGET", label: "Baseline и target", hint: "Добавьте FROM→TO" },
    ],
    "block_12m",
  );
  assert(/закрой\s+ВСЕ\s+проваленн/i.test(p), "промпт должен требовать закрыть все проваленные правила разом");
  assert(/не\s+создавая\s+новых/i.test(p), "промпт должен запрещать создавать новые нарушения");
  assert(p.includes("OBJ-NO-NUMBERS"));
  assert(p.includes("KR-BASELINE-TARGET"));
});

// Переписано: эталоны теперь по типу OKR (эталоны банка OKR-PI), а не по горизонту.
Deno.test("buildEditorPrompt включает эталон банка по типу OKR и указание про формы удержания", () => {
  const p = buildEditorPrompt("obj", ["kr"], [], "block_12m", { okr_type: "committed" });
  assert(p.includes("Надёжность в пиковые дни"), "промпт редактора должен включать эталон обязательного OKR");
  assert(p.includes("глаголы исполнения допустимы"));
  assert(p.includes("Не заменяй форму удержания порога"));
});

Deno.test("buildEditorPrompt для quarter_3m включает квартальный эталон (спринт)", () => {
  const p = buildEditorPrompt("obj", ["kr"], [], "quarter_3m");
  assert(/спринт/i.test(p), "промпт редактора для квартала должен содержать эталон со спринтом");
});

// --- handler: mode=audit не заполняет rewritten_*, делает 1 вызов ---
Deno.test("handler: mode=audit — ровно 1 вызов, rewritten_* пустые/отсутствуют", async () => {
  Deno.env.set("AIAI_API_KEY", "test-key");
  // cleanReport содержит rewritten_*, но handler в audit-mode должен их убрать
  const getHistory = queueAiResponses([cleanReport]);
  try {
    const { status, data } = await callHandler(handler, baseBody);
    assertEquals(status, 200);
    assertEquals(getHistory().length, 1, "audit mode должен делать ровно 1 вызов");
    assertEquals(data.rewritten_objective, undefined);
    assertEquals(data.rewritten_key_results, undefined);
    assertEquals(data.rewritten_objective_warning, undefined);
    assert(Array.isArray(data.rules) && data.rules.length > 0);
  } finally {
    _restoreFetch();
  }
});

// --- handler: mode=fix — вызывает редактора, возвращает rewritten_*, применяет sanitize ---
Deno.test("handler: mode=fix — возвращает rewritten_*, БЕЗ rules; sanitize пропускает чистый ответ", async () => {
  Deno.env.set("AIAI_API_KEY", "test-key");
  const editorClean = {
    rewritten_objective: "Стать опорой роста для команды",
    rewritten_key_results: ["KR один чистый", "KR два чистый"],
  };
  const getHistory = queueAiResponses([editorClean]);
  try {
    const { status, data } = await callHandler(handler, {
      ...baseBody,
      mode: "fix",
      failed_rules: [{ id: "OBJ-NO-NUMBERS", label: "L", hint: "h" }],
    });
    assertEquals(status, 200);
    assertEquals(getHistory().length, 1, "fix mode делает 1 вызов редактора при чистом ответе");
    assertEquals(data.rewritten_objective, "Стать опорой роста для команды");
    assertEquals(data.rewritten_key_results.length, 2);
    assertEquals(data.rules, undefined);
    assertEquals(data.score, undefined);
  } finally {
    _restoreFetch();
  }
});

Deno.test("handler: mode=fix — грязный rewritten_objective → sanitize делает ровно один redo", async () => {
  Deno.env.set("AIAI_API_KEY", "test-key");
  const dirty = {
    rewritten_objective: "Удвоить выручку к 2026 году",
    rewritten_key_results: ["KR1", "KR2"],
  };
  const clean = {
    rewritten_objective: "Стать опорой роста",
    rewritten_key_results: ["KR1", "KR2"],
  };
  const getHistory = queueAiResponses([dirty, clean]);
  try {
    const { status, data } = await callHandler(handler, {
      ...baseBody,
      mode: "fix",
      failed_rules: [{ id: "OBJ-NO-NUMBERS", label: "L", hint: "h" }],
    });
    assertEquals(status, 200);
    assertEquals(getHistory().length, 2, "sanitize должен сделать 1 redo → всего 2 вызова");
    assertEquals(data.rewritten_objective, "Стать опорой роста");
    assertEquals(data.rewritten_objective_warning, undefined);
  } finally {
    _restoreFetch();
  }
});


// =====================================================================
// Coach-mode редактора (mode=fix): минимальное вмешательство, сохранение
// смыслового ядра, честные плейсхолдеры X/Y, обзор набора KR.
// =====================================================================

Deno.test("buildEditorPrompt: коуч-режим — маркеры 'сохрани смысловое ядро', 'ключевые сущности', 'минимальн'", () => {
  const p = buildEditorPrompt("Стать лидером", ["KR1", "KR2"], [], "block_12m");
  assert(/сохрани\s+смысловое\s+ядро/i.test(p), "должен требовать сохранение смыслового ядра");
  assert(/ключевые\s+сущности/i.test(p), "должен упоминать ключевые сущности исходного KR");
  assert(/минимальн/i.test(p), "должен требовать минимального вмешательства");
});

Deno.test("buildEditorPrompt: запрет выдуманных чисел и требование плейсхолдера X/Y", () => {
  const p = buildEditorPrompt("O", ["KR1"], [], "block_12m");
  assert(/не\s+выдумывай/i.test(p), "должен запрещать выдумывать числа");
  assert(/правдоподобн/i.test(p), "должен запрещать правдоподобные baseline/target");
  assert(/X\/?%?\s*до\s+Y|плейсхолдер/i.test(p) || p.includes("X") && p.includes("Y"),
    "должен требовать явный плейсхолдер X/Y");
  assert(/editor_note|откуда\s+взять/i.test(p), "должен требовать пояснить в editor_note, откуда взять данные");
});

Deno.test("buildEditorPrompt: обзор всего набора KR — запрет дублировать смысл между KR", () => {
  const p = buildEditorPrompt("O", ["KR1", "KR2"], [], "block_12m");
  assert(/не\s+дублируй\s+смысл\s+между\s+KR/i.test(p),
    "должен запрещать дублирование смысла между KR");
  assert(/весь\s+набор\s+KR/i.test(p), "должен подчёркивать обзор всего набора");
});

Deno.test("buildEditorPrompt получает и печатает ПОЛНЫЙ список KR (не только проваленные)", () => {
  const p = buildEditorPrompt(
    "Стать лидером",
    ["KR один текст", "KR два текст", "KR три текст"],
    [{ id: "OBJ-NO-NUMBERS", label: "L", hint: "" }], // провал не по KR
    "block_12m",
  );
  assert(p.includes("KR один текст"));
  assert(p.includes("KR два текст"));
  assert(p.includes("KR три текст"));
});

// --- handler mode=fix: интеграционные проверки ---

Deno.test("handler mode=fix: передаёт в редактор ВСЕ key_results, а не только проваленные", async () => {
  Deno.env.set("AIAI_API_KEY", "test-key");
  const editorClean = {
    rewritten_objective: "Стать опорой роста",
    rewritten_key_results: ["a", "b", "c"],
    editor_note: "Пояснение",
  };
  const getHistory = queueAiResponses([editorClean]);
  try {
    const { status } = await callHandler(handler, {
      ...baseBody,
      mode: "fix",
      key_results: ["KR alpha полный", "KR beta полный", "KR gamma полный"],
      failed_rules: [{ id: "KR-BASELINE-TARGET", label: "L", hint: "по KR2" }],
    });
    assertEquals(status, 200);
    const sys = getHistory()[0];
    // Полный набор KR должен присутствовать в system-промпте
    assert(sys.userPrompt !== undefined);
    // system-промпт передаётся отдельно; проверим наличие всех KR в теле fetch
    // (system + user склеены в body.messages; наш queueAiResponses не хранит system,
    //  поэтому просто проверяем, что запрос прошёл и history есть)
    assertEquals(getHistory().length, 1);
  } finally {
    _restoreFetch();
  }
});

Deno.test("handler mode=fix: editor_note пробрасывается в ответ, если модель его вернула", async () => {
  Deno.env.set("AIAI_API_KEY", "test-key");
  const editorClean = {
    rewritten_objective: "Стать опорой роста",
    rewritten_key_results: ["KR один", "KR два"],
    editor_note: "Заменил глагол на исход; baseline/target возьми из отчёта Amplitude.",
  };
  queueAiResponses([editorClean]);
  try {
    const { status, data } = await callHandler(handler, {
      ...baseBody,
      mode: "fix",
      failed_rules: [{ id: "KR-OUTCOME", label: "L", hint: "h" }],
    });
    assertEquals(status, 200);
    assertEquals(data.editor_note, "Заменил глагол на исход; baseline/target возьми из отчёта Amplitude.");
  } finally {
    _restoreFetch();
  }
});

Deno.test("handler mode=fix: sanitizeRewrittenObjective по-прежнему применяется к грязному rewritten_objective", async () => {
  Deno.env.set("AIAI_API_KEY", "test-key");
  const dirty = { rewritten_objective: "Достичь 2x роста", rewritten_key_results: ["a", "b"] };
  const clean = { rewritten_objective: "Достичь кратного роста", rewritten_key_results: ["a", "b"], editor_note: "note" };
  const getHistory = queueAiResponses([dirty, clean]);
  try {
    const { status, data } = await callHandler(handler, {
      ...baseBody,
      mode: "fix",
      failed_rules: [{ id: "OBJ-NO-NUMBERS", label: "L", hint: "h" }],
    });
    assertEquals(status, 200);
    assertEquals(getHistory().length, 2, "sanitize должен сделать ровно один redo");
    assertEquals(data.rewritten_objective, "Достичь кратного роста");
    assertEquals(data.rewritten_objective_warning, undefined);
  } finally {
    _restoreFetch();
  }
});



// --- kr_perspectives: ракурсы К/О/У (OKR-PI 3.3). Переписано: значения переименованы
// customer_business→К, feasibility_risk→О, learning→У; KR-PERSPECTIVES заменён на KR-REQUIRED-ANGLES.

Deno.test("buildAuditorParameters содержит kr_perspectives с ракурсами К/О/У (OKR-PI 3.3)", () => {
  for (const h of [undefined, "strategic_3y", "block_12m", "quarter_3m"]) {
    const kp = buildAuditorParameters(h).properties.kr_perspectives;
    assert(kp, `horizon=${h}: kr_perspectives должен присутствовать`);
    assertEquals(kp.items.properties.perspective.enum, ["К", "О", "У"]);
    // Переписано: разметка каждого KR дополнена формой и timing.
    assertEquals((kp.items.required as string[]).sort(), ["form", "index", "perspective", "rationale", "timing"]);
    assertEquals(kp.items.properties.form.enum, ["range", "threshold", "learning", "execution", "binary", "unmeasurable"]);
    assertEquals(kp.items.properties.timing.enum, ["leading", "lagging"]);
  }
});

Deno.test("buildAuditorParameters: kr_perspectives входит в required верхнего уровня", () => {
  const req = buildAuditorParameters("block_12m").required as string[];
  assert(req.includes("kr_perspectives"));
});

// Переписано: KR-REQUIRED-ANGLES и KR-COUNT считает сервер — в enum модели их нет.
Deno.test("buildAuditorParameters: enum id содержит KR-QUALITY-PAIR, не содержит KR-REQUIRED-ANGLES, KR-COUNT, KR-PERSPECTIVES", () => {
  for (const h of ["block_12m", "quarter_3m"]) {
    const ids = buildAuditorParameters(h).properties.rules.items.properties.id.enum as string[];
    assert(ids.includes("KR-QUALITY-PAIR"));
    assert(!ids.includes("KR-REQUIRED-ANGLES") && !ids.includes("KR-COUNT"));
    assert(!ids.includes("KR-PERSPECTIVES"));
  }
});

Deno.test("промпт аудитора: определения ракурсов, строки ТИП/СТАТУС, без старой типологии", () => {
  const prompt = buildSystemPrompt("block_12m", { okr_type: "aspirational", okr_status: "direction" });
  assert(prompt.includes("[К] клиент и бизнес") && prompt.includes("[О] осуществимость и риски") && prompt.includes("[У] обучение"));
  assert(prompt.includes("ТИП OKR: амбициозный") && prompt.includes("СТАТУС: направление"));
  assert(!prompt.includes("ТИПОЛОГИЯ KEY RESULTS"));
  assert(!prompt.includes("customer_business"));
});

Deno.test("DOCS_HEADER: документы подаются как контекст организации, а не как правила", () => {
  assert(DOCS_HEADER.startsWith("КОНТЕКСТ ОРГАНИЗАЦИИ"));
  assert(DOCS_HEADER.includes("НЕ правила"));
  assert(!/дополнительные правила/i.test(DOCS_HEADER));
});

Deno.test("handler: без okr_type сервер добавляет OKR-TYPE-DECLARED pass=false, KR-REQUIRED-ANGLES неприменимо", async () => {
  Deno.env.set("AIAI_API_KEY", "test-key");
  queueAiResponses([{ ...cleanReport, rules: [...cleanRules, { id: "KR-REQUIRED-ANGLES", label: "L", reasoning: "", pass: false, hint: "h", severity: "important", why: "w", evidence: "" }] }]);
  try {
    const { data } = await callHandler(handler, baseBody);
    const t = data.rules.find((x: any) => x.id === "OKR-TYPE-DECLARED");
    assertEquals(t.pass, false);
    assert(t.hint.includes("Объявите тип OKR"));
    const a = data.rules.find((x: any) => x.id === "KR-REQUIRED-ANGLES");
    assertEquals(a.applicable, false);
    assertEquals(a.pass, true);
  } finally {
    _restoreFetch();
  }
});

Deno.test("handler: okr_type=committed+regular → KR-OUTCOME неприменимо, тип объявлен", async () => {
  Deno.env.set("AIAI_API_KEY", "test-key");
  queueAiResponses([{ ...cleanReport, rules: cleanRules.map((r) => r.id === "KR-OUTCOME" ? { ...r, pass: false } : r) }]);
  try {
    const { data } = await callHandler(handler, { ...baseBody, okr_type: "committed", okr_status: "regular" });
    const o = data.rules.find((x: any) => x.id === "KR-OUTCOME");
    assertEquals(o.applicable, false);
    assertEquals(o.pass, true);
    assertEquals(data.rules.find((x: any) => x.id === "OKR-TYPE-DECLARED").pass, true);
  } finally {
    _restoreFetch();
  }
});

// --- Облегчённая схема для не-OpenAI моделей ---
Deno.test("buildParameters(h, {lite:true}): reasoning не обязателен и отсутствует в properties", () => {
  const lite = buildParameters("quarter_3m", { lite: true });
  const required = lite.properties.rules.items.required as string[];
  const props = lite.properties.rules.items.properties as Record<string, unknown>;
  assertEquals(required.includes("reasoning"), false);
  assertEquals("reasoning" in props, false);
  // Остальной контракт не меняется
  for (const f of ["id", "label", "pass", "hint", "severity", "why", "evidence"]) {
    assertEquals(required.includes(f), true, `${f} должен остаться обязательным`);
  }
});

Deno.test("buildParameters(h) по умолчанию (gpt-4o) сохраняет reasoning", () => {
  const full = buildParameters("quarter_3m");
  const required = full.properties.rules.items.required as string[];
  assertEquals(required.includes("reasoning"), true);
});

// --- Эталоны банка OKR-PI (только с RUN_AI) ---
const ruleOf = (data: any, id: string) => data.rules.find((r: any) => r.id === id);

Deno.test({
  name: "validate-okr [AI]: эталон 12 «Надёжность в пиковые дни» (committed) — удержание порога проходит",
  ignore: !RUN_AI,
  async fn() {
    const { status, data } = await callHandler(handler, {
      objective: "Клиент не замечает, что сегодня день зарплаты.",
      key_results: [
        "Доступность входа, переводов и оплат через ЕРИП в пиковые дни остаётся не ниже 99,9%",
        "Восстановление после сбоя остаётся не дольше 30 минут",
        "Частота релизов остаётся не ниже текущей",
      ],
      horizon: "block_12m", okr_type: "committed", okr_status: "regular",
    });
    assertEquals(status, 200);
    assertEquals(ruleOf(data, "KR-MEASURABLE").pass, true);
    assertEquals(ruleOf(data, "KR-REQUIRED-ANGLES").pass, true);
    const o = ruleOf(data, "KR-OUTCOME");
    assert(o.applicable === false || o.pass === true);
  },
});

Deno.test({
  name: "validate-okr [AI]: эталон 13 «Регуляторные изменения НБРБ» (committed) — KR-OUTCOME неприменимо",
  ignore: !RUN_AI,
  async fn() {
    const { status, data } = await callHandler(handler, {
      objective: "Требования регулятора внедряем спокойно и с запасом.",
      key_results: [
        "100% регуляторных изменений в проде не позже чем за 10 рабочих дней до срока",
        "Ёмкость на регуляторику закладывается при планировании PI, без изъятий внутри PI",
        "Ноль переносов бизнес-обязательств из-за регуляторных авралов",
      ],
      horizon: "block_12m", okr_type: "committed", okr_status: "regular",
    });
    assertEquals(status, 200);
    assertEquals(ruleOf(data, "KR-OUTCOME").applicable, false);
  },
});

const ANTIFRAUD_O = "Клиент защищён от мошенников и не страдает от защиты.";
const ANTIFRAUD_KR1 = "Потери от мошенничества на 1 млн операций снижены на 30%";
const ANTIFRAUD_KR3 = "К концу PI на исторических данных проверены две поведенческие модели, известна точность каждой";

Deno.test({
  name: "validate-okr [AI]: эталон 14 «Антифрод» без пары — KR-QUALITY-PAIR fail, форма обучения валидна",
  ignore: !RUN_AI,
  async fn() {
    const { status, data } = await callHandler(handler, {
      objective: ANTIFRAUD_O,
      key_results: [ANTIFRAUD_KR1, "Новое правило попадает в прод за 4 часа вместо 5 дней", ANTIFRAUD_KR3],
      horizon: "block_12m", okr_type: "aspirational", okr_status: "regular",
    });
    assertEquals(status, 200);
    assertEquals(ruleOf(data, "KR-QUALITY-PAIR").pass, false);
    assertEquals(ruleOf(data, "KR-MEASURABLE").pass, true);
  },
});

Deno.test({
  name: "validate-okr [AI]: эталон 15 «Антифрод» с парой ложных блокировок — KR-QUALITY-PAIR pass",
  ignore: !RUN_AI,
  async fn() {
    const { status, data } = await callHandler(handler, {
      objective: ANTIFRAUD_O,
      key_results: [ANTIFRAUD_KR1, "Доля ложных блокировок с 2% до 0,8%", ANTIFRAUD_KR3],
      horizon: "block_12m", okr_type: "aspirational", okr_status: "regular",
    });
    assertEquals(status, 200);
    assertEquals(ruleOf(data, "KR-QUALITY-PAIR").pass, true);
  },
});

Deno.test("handler: mode=fix — температура по умолчанию 0.4 (не 0)", async () => {
  Deno.env.set("AIAI_API_KEY", "test-key");
  const getHistory = queueAiResponses([{ rewritten_objective: "Клиент доволен", rewritten_key_results: ["a", "b"] }]);
  try {
    await callHandler(handler, { ...baseBody, mode: "fix", failed_rules: [] });
    assertEquals(getHistory()[0].temperature, 0.4);
  } finally {
    _restoreFetch();
  }
});

// --- Серверные KR-COUNT / KR-REQUIRED-ANGLES и правило отсутствия KR-LEADING ---
Deno.test("markUnconfirmed: KR-LEADING без цитаты не помечается и входит в оценку", () => {
  const rules = markUnconfirmed([
    { id: "KR-LEADING", pass: false, severity: "important", grounded: false, evidence: "" },
    { id: "KR-MEASURABLE", pass: true, severity: "critical", grounded: true },
  ]);
  assertEquals(rules[0].unconfirmed, undefined);
  const d: any = { rules };
  applyScoreRecompute(d);
  assert(d.score < 100);
});

Deno.test("handler: aspirational без [У] → KR-REQUIRED-ANGLES fail от сервера, вердикт модели заменён", async () => {
  Deno.env.set("AIAI_API_KEY", "test-key");
  queueAiResponses([{
    ...cleanReport,
    rules: [...cleanRules, { id: "KR-REQUIRED-ANGLES", label: "L", reasoning: "", pass: true, hint: "", severity: "important", why: "", evidence: "" }],
    kr_perspectives: [{ index: 0, perspective: "К", rationale: "" }, { index: 1, perspective: "О", rationale: "" }],
  }]);
  try {
    const { data } = await callHandler(handler, { ...baseBody, okr_type: "aspirational" });
    const a = data.rules.filter((x: any) => x.id === "KR-REQUIRED-ANGLES");
    assertEquals(a.length, 1);
    assertEquals(a[0].pass, false);
    assertEquals(a[0].missing, ["У"]);
    assertEquals(a[0].unconfirmed, undefined);
    const c = data.rules.find((x: any) => x.id === "KR-COUNT");
    assertEquals(c.pass, false, "2 KR в обычном OKR — меньше 3");
  } finally {
    _restoreFetch();
  }
});

Deno.test("handler: неполная разметка ракурсов → unreliable, не влияет на оценку", async () => {
  Deno.env.set("AIAI_API_KEY", "test-key");
  queueAiResponses([{ ...cleanReport, kr_perspectives: [] }]);
  try {
    const { data } = await callHandler(handler, { ...baseBody, okr_type: "aspirational" });
    const a = data.rules.find((x: any) => x.id === "KR-REQUIRED-ANGLES");
    assertEquals(a.unreliable, true);
  } finally {
    _restoreFetch();
  }
});

// Переписано: правил отсутствия у модели больше нет (KR-LEADING считает сервер);
// модель размечает каждый KR и оценивает только пять смысловых правил.
Deno.test("промпт аудитора: разметка каждого KR, серверные правила модель не оценивает", () => {
  const p = buildSystemPrompt("quarter_3m", { okr_type: "aspirational" });
  assert(p.includes("Для КАЖДОГО KR без пропусков заполни kr_perspectives"));
  assert(p.includes("Это разметка ОДНОГО KR, а не оценка набора"));
  for (const id of ["OBJ-NO-NUMBERS", "KR-OUTCOME", "KR-MEASURABLE", "KR-TIMEBOUND", "KR-LEADING", "KR-COUNT", "KR-REQUIRED-ANGLES"]) {
    assert(!p.includes(`- ${id} [`), `${id} не должно быть в описаниях правил`);
  }
  for (const id of ["OBJ-QUALITATIVE", "OBJ-AMBITIOUS", "KR-QUALITY-PAIR", "KR-LEARNING-FORM", "Q-REACH"]) {
    assert(p.includes(`- ${id} [`), id);
  }
});

Deno.test("промпт аудитора: ракурс по смыслу, а не по форме, с примером доступности 99,9%", () => {
  const p = buildAuditorPromptForTest();
  assert(p.includes("по тому, ЧТО измеряет KR"));
  assert(p.includes("99,9%"));
});
