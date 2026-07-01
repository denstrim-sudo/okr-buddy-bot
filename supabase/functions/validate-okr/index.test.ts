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
  { id: "O1", label: "L", pass: true, hint: "", severity: "improve", why: "" },
  { id: "O3", label: "L", pass: false, hint: "h", severity: "critical", why: "w" },
  { id: "KR1", label: "L", pass: true, hint: "", severity: "improve", why: "" },
  { id: "KR2", label: "L", pass: true, hint: "", severity: "improve", why: "" },
  { id: "KR3", label: "L", pass: true, hint: "", severity: "improve", why: "" },
  { id: "KR10", label: "L", pass: true, hint: "", severity: "improve", why: "" },
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
  { id: "O1", label: "L", pass: true, hint: "", severity: "improve", why: "", evidence: "" },
  // evidence реально встречается во втором KR
  { id: "KR3", label: "L", pass: false, hint: "h", severity: "important", why: "w", evidence: "NPS вырастет" },
  // evidence выдумана
  { id: "KR2", label: "L", pass: false, hint: "h", severity: "important", why: "w", evidence: "несуществующая фраза zzz" },
  { id: "KR1", label: "L", pass: true, hint: "", severity: "improve", why: "", evidence: "" },
  { id: "KR10", label: "L", pass: true, hint: "", severity: "improve", why: "", evidence: "" },
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
    const r = data.rules.find((x: any) => x.id === "KR3");
    assertEquals(r.grounded, true);
    // pass/severity сохранены
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
    const r = data.rules.find((x: any) => x.id === "KR2");
    assertEquals(r.grounded, false);
    assertEquals(r.pass, false, "pass не должен переопределяться");
    assertEquals(r.severity, "important", "severity не должна переопределяться");
  } finally {
    _restoreFetch();
  }
});

Deno.test("handler: pass=true правила получают grounded=true автоматически", async () => {
  Deno.env.set("AIAI_API_KEY", "test-key");
  queueAiResponses([reportWithEvidence]);
  try {
    const { data } = await callHandler(handler, baseBody);
    const r = data.rules.find((x: any) => x.id === "O1");
    assertEquals(r.grounded, true);
  } finally {
    _restoreFetch();
  }
});
