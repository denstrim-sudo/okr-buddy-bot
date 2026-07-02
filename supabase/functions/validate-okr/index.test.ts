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
  assert(p.includes("Q-FOCUS"));
  assert(p.includes("Q-THEME"));
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

Deno.test("applyScoreRecompute: расхождение ≤10 → не трогает score, без флага", () => {
  const data: any = {
    score: 85,
    rules: [
      { id: "A", pass: true, severity: "critical" },
      { id: "B", pass: true, severity: "important" },
      { id: "C", pass: false, severity: "improve" },
    ],
  };
  applyScoreRecompute(data);
  assertEquals(data.score, 85);
  assertEquals(data.score_recomputed, undefined);
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

interface FetchCall { model: string; userPrompt: string; }

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
    history.push({ model: body.model, userPrompt: String(userMsg) });
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

Deno.test("handler: первый ответ suspicious → ровно ОДИН retry без явного model (DEFAULT_MODEL)", async () => {
  Deno.env.set("AIAI_API_KEY", "test-key");
  const getHistory = queueAiResponses([suspiciousReport, cleanReport]);
  try {
    const { status, data } = await callHandler(handler, baseBody);
    const history = getHistory();
    assertEquals(status, 200);
    assertEquals(history.length, 2, "должно быть ровно 2 fetch'а (initial + один retry)");
    assertEquals(history[0].model, "claude-haiku-4.5");
    assertEquals(history[1].model, "gpt-4o", "retry должен идти на DEFAULT_MODEL");
    // финальный ответ — из retry, без флага audit_unreliable
    assertEquals(data.audit_unreliable, undefined);
    assert(Array.isArray(data.rules) && data.rules.length === cleanRules.length);
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
    // retry прошёл через DEFAULT_MODEL → model_used должно быть gpt-4o
    assertEquals(data.model_used, "gpt-4o");
    assertEquals(data.__model_used, undefined, "__model_used не должно утекать в публичный JSON");
  } finally {
    _restoreFetch();
  }
});


// --- isGrounded: чистая логика обоснованности fail-вердикта ---
import { isGrounded, buildParameters } from "./index.ts";
import { knownRuleIdsFor } from "../_shared/scoring.ts";

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

Deno.test("buildParameters: minItems === maxItems === knownRuleIdsFor(horizon).length", () => {
  const p12 = buildParameters("block_12m");
  const p3y = buildParameters("strategic_3y");
  const pq = buildParameters("quarter_3m");
  const pDefault = buildParameters(undefined);
  assertEquals(p12.properties.rules.minItems, knownRuleIdsFor("block_12m").length);
  assertEquals(p12.properties.rules.maxItems, knownRuleIdsFor("block_12m").length);
  assertEquals(pq.properties.rules.minItems, knownRuleIdsFor("quarter_3m").length);
  assertEquals(pq.properties.rules.maxItems, knownRuleIdsFor("quarter_3m").length);
  assertEquals(p3y.properties.rules.minItems, 8);
  assertEquals(pDefault.properties.rules.minItems, 8);
  assertEquals(pq.properties.rules.minItems, 11);
});

Deno.test("buildParameters: rules.items.properties.id.enum === knownRuleIdsFor(horizon)", () => {
  const p12 = buildParameters("block_12m");
  const pq = buildParameters("quarter_3m");
  assertEquals(p12.properties.rules.items.properties.id.enum, knownRuleIdsFor("block_12m"));
  assertEquals(pq.properties.rules.items.properties.id.enum, knownRuleIdsFor("quarter_3m"));
});


// --- handler: серверный расчёт grounded ---

const rulesWithEvidence = [
  { id: "OBJ-QUALITATIVE", label: "L", reasoning: "", pass: true, hint: "", severity: "improve", why: "", evidence: "" },
  // evidence реально встречается во втором KR
  { id: "KR-OUTCOME", label: "L", reasoning: "", pass: false, hint: "h", severity: "important", why: "w", evidence: "NPS вырастет" },
  // evidence выдумана
  { id: "KR-BASELINE-TARGET", label: "L", reasoning: "", pass: false, hint: "h", severity: "important", why: "w", evidence: "несуществующая фраза zzz" },
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
    const r = data.rules.find((x: any) => x.id === "KR-OUTCOME");
    assertEquals(r.grounded, true);
    // pass сохранён; severity — канонический (KR-OUTCOME → critical)
    assertEquals(r.pass, false);
    assertEquals(r.severity, "critical");
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
    const r = data.rules.find((x: any) => x.id === "KR-BASELINE-TARGET");
    assertEquals(r.grounded, false);
    assertEquals(r.pass, false, "pass не должен переопределяться");
    // severity — канонический (KR-BASELINE-TARGET → critical), даже если модель прислала другое
    assertEquals(r.severity, "critical");
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

Deno.test("handler: KR-LEADING c severity='critical' от модели для block_12m → серверно исправлен на 'important'", async () => {
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
    assertEquals(kr.severity, "important", "severity KR-LEADING должна быть серверно исправлена на important");
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

Deno.test("buildEditorParameters содержит ТОЛЬКО rewritten_*", () => {
  const p = buildEditorParameters();
  const keys = Object.keys(p.properties).sort();
  assertEquals(keys, ["rewritten_key_results", "rewritten_objective"]);
  assertEquals(p.required.sort(), ["rewritten_key_results", "rewritten_objective"]);
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

Deno.test("buildEditorPrompt для block_12m включает getFewShotBlock (эталон годового горизонта)", () => {
  const p = buildEditorPrompt("obj", ["kr"], [], "block_12m");
  assert(/годовой горизонт/i.test(p), "промпт редактора должен включать годовые эталоны");
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
