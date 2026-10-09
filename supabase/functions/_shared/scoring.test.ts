import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyRuleContext, knownRuleIdsFor, modelRuleIdsFor, recomputeScore, ruleApplicability, scoreDiscrepancy,
  severityFor, SEVERITY_BY_RULE_ID, TYPE_NOT_DECLARED_HINT, type ScoringRule,
} from "./scoring.ts";

const BASE_IDS = [
  "OKR-TYPE-DECLARED", "OBJ-NO-NUMBERS", "OBJ-QUALITATIVE", "KR-COUNT", "KR-MEASURABLE", "KR-OUTCOME",
  "KR-REQUIRED-ANGLES", "KR-QUALITY-PAIR", "KR-LEARNING-FORM", "KR-LEADING", "KR-TIMEBOUND",
];
// Переписано (чек-лист О1–О17, 09.10.2026): добавлены OBJ-END-STATE (О3), OKR-OWNER (О9),
// OKR-WAY-KNOWN (О17), KR-RISK-NAMED (О7).
const BASE_IDS_V2 = [
  "OKR-TYPE-DECLARED", "OBJ-NO-NUMBERS", "OBJ-QUALITATIVE", "OBJ-END-STATE", "OKR-OWNER", "OKR-WAY-KNOWN",
  "KR-COUNT", "KR-MEASURABLE", "KR-OUTCOME", "KR-REQUIRED-ANGLES", "KR-QUALITY-PAIR", "KR-LEARNING-FORM",
  "KR-LEADING", "KR-TIMEBOUND", "KR-RISK-NAMED",
];

// --- recomputeScore ---

Deno.test("recomputeScore: 100 при всех правилах pass=true", () => {
  const rules: ScoringRule[] = [
    { id: "OBJ-QUALITATIVE", pass: true, severity: "important" },
    { id: "OBJ-NO-NUMBERS", pass: true, severity: "critical" },
    { id: "KR-MEASURABLE", pass: true, severity: "critical" },
  ];
  assertEquals(recomputeScore(rules), 100);
});

Deno.test("recomputeScore: потолок 60 при ≥1 critical fail", () => {
  const rules: ScoringRule[] = [
    { id: "OBJ-NO-NUMBERS", pass: false, severity: "critical" },
    { id: "KR-MEASURABLE", pass: true, severity: "critical" },
    { id: "KR-OUTCOME", pass: true, severity: "critical" },
    { id: "OBJ-QUALITATIVE", pass: true, severity: "important" },
    { id: "KR-TIMEBOUND", pass: true, severity: "important" },
    { id: "KR-LEADING", pass: true, severity: "important" },
  ];
  assertEquals(recomputeScore(rules), 60);
});

Deno.test("recomputeScore: веса critical=3/important=2/improve=1", () => {
  const rules: ScoringRule[] = [
    { id: "A", pass: true, severity: "critical" },
    { id: "B", pass: false, severity: "important" },
    { id: "C", pass: true, severity: "improve" },
    { id: "D", pass: false, severity: "important" },
  ];
  assertEquals(recomputeScore(rules), 50);
});

Deno.test("recomputeScore: improve-fail НЕ триггерит потолок 60", () => {
  assertEquals(recomputeScore([
    { id: "A", pass: true, severity: "critical" },
    { id: "B", pass: true, severity: "important" },
    { id: "C", pass: false, severity: "improve" },
  ]), 83);
});

Deno.test("recomputeScore: пустой массив → 0", () => {
  assertEquals(recomputeScore([]), 0);
});

Deno.test("recomputeScore: правила с applicable=false не учитываются", () => {
  const base: ScoringRule[] = [
    { id: "A", pass: true, severity: "critical" },
    { id: "B", pass: false, severity: "important" },
  ];
  assertEquals(
    recomputeScore([...base, { id: "KR-OUTCOME", pass: false, severity: "critical", applicable: false }]),
    recomputeScore(base),
  );
});

// --- scoreDiscrepancy ---

Deno.test("scoreDiscrepancy: >10 → true, ≤10 → false", () => {
  assertEquals(scoreDiscrepancy(85, 74), true);
  assertEquals(scoreDiscrepancy(85, 75), false);
  assertEquals(scoreDiscrepancy(60, 60), false);
  assertEquals(scoreDiscrepancy(60, 71), true);
});

// --- knownRuleIdsFor (OKR-PI) ---
// Переписано: раньше ожидали KR-BASELINE-TARGET, KR-PERSPECTIVES и Q-FOCUS/Q-THEME.
// По OKR-PI 3.3/3.4 свод заменён на ракурсы, пару количество/качество и форму обучения.

Deno.test("knownRuleIdsFor(ctx): базовый набор OKR-PI", () => {
  assertEquals(knownRuleIdsFor({ horizon: "block_12m", okr_type: "committed", okr_status: "regular" }), BASE_IDS_V2);
  assert(BASE_IDS.every((id) => BASE_IDS_V2.includes(id)));
});

Deno.test("knownRuleIdsFor: OBJ-AMBITIOUS только для aspirational/mixed", () => {
  assert(knownRuleIdsFor({ okr_type: "aspirational" }).includes("OBJ-AMBITIOUS"));
  assert(knownRuleIdsFor({ okr_type: "mixed" }).includes("OBJ-AMBITIOUS"));
  assert(!knownRuleIdsFor({ okr_type: "committed" }).includes("OBJ-AMBITIOUS"));
  assert(!knownRuleIdsFor({}).includes("OBJ-AMBITIOUS"));
});

Deno.test("knownRuleIdsFor: Q-REACH только для квартала (Q-FOCUS/Q-THEME удалены, OKR-PI 3.4)", () => {
  assertEquals(knownRuleIdsFor("quarter_3m"), [...BASE_IDS_V2, "Q-REACH"]);
  assert(!knownRuleIdsFor("block_12m").includes("Q-REACH"));
});

Deno.test("knownRuleIdsFor: старая сигнатура (horizon) = тип не объявлен, обычный OKR", () => {
  assertEquals(knownRuleIdsFor("block_12m"), BASE_IDS_V2);
  assertEquals(knownRuleIdsFor(undefined), BASE_IDS_V2);
});

Deno.test("knownRuleIdsFor не содержит удалённых и старых id", () => {
  const all = [
    ...knownRuleIdsFor({ horizon: "quarter_3m", okr_type: "mixed" }),
    ...knownRuleIdsFor("block_12m"),
  ];
  for (const dead of ["KR-BASELINE-TARGET", "KR-PERSPECTIVES", "Q-FOCUS", "Q-THEME", "O1", "KR3", "KR10"]) {
    assert(!all.includes(dead), dead);
  }
});

// Переписано (замер стабильности 2026-10-08): модель оценивает только смысловые правила,
// формальные и разметочные считает сервер.
// Переписано (О1–О17): добавлены серверные OKR-OWNER, OKR-WAY-KNOWN, KR-RISK-NAMED и модельное OBJ-END-STATE.
const SERVER_IDS = ["OKR-TYPE-DECLARED", "KR-COUNT", "KR-REQUIRED-ANGLES", "OBJ-NO-NUMBERS", "KR-OUTCOME", "KR-MEASURABLE", "KR-TIMEBOUND", "KR-LEADING", "OKR-OWNER", "OKR-WAY-KNOWN", "KR-RISK-NAMED"];
Deno.test("modelRuleIdsFor: без серверных правил — только смысловые", () => {
  const ids = modelRuleIdsFor("block_12m");
  for (const id of SERVER_IDS) assert(!ids.includes(id), id);
  assertEquals(ids, ["OBJ-QUALITATIVE", "OBJ-END-STATE", "KR-QUALITY-PAIR", "KR-LEARNING-FORM"]);
  assertEquals(modelRuleIdsFor({ horizon: "quarter_3m", okr_type: "aspirational" }).sort(),
    ["KR-LEARNING-FORM", "KR-QUALITY-PAIR", "OBJ-AMBITIOUS", "OBJ-END-STATE", "OBJ-QUALITATIVE", "Q-REACH"]);
  const known = knownRuleIdsFor("block_12m");
  assert(known.includes("KR-COUNT") && known.includes("KR-REQUIRED-ANGLES"));
});

// --- severityFor ---

Deno.test("severityFor: OBJ-NO-NUMBERS, KR-MEASURABLE, KR-OUTCOME → critical", () => {
  for (const id of ["OBJ-NO-NUMBERS", "KR-MEASURABLE", "KR-OUTCOME"]) {
    assertEquals(severityFor(id, { horizon: "block_12m" }), "critical");
  }
});

Deno.test("severityFor: KR-REQUIRED-ANGLES critical для направления, иначе important", () => {
  assertEquals(severityFor("KR-REQUIRED-ANGLES", { okr_status: "direction" }), "critical");
  assertEquals(severityFor("KR-REQUIRED-ANGLES", { okr_status: "regular" }), "important");
});

// Переписано: для обычного годового OKR KR-LEADING — рекомендация (improve), а не important.
Deno.test("severityFor: KR-LEADING critical для квартала или направления, иначе improve", () => {
  assertEquals(severityFor("KR-LEADING", "quarter_3m"), "critical");
  assertEquals(severityFor("KR-LEADING", { horizon: "block_12m", okr_status: "direction" }), "critical");
  assertEquals(severityFor("KR-LEADING", "block_12m"), "improve");
});

Deno.test("severityFor: остальные правила OKR-PI → important", () => {
  for (const id of ["OKR-TYPE-DECLARED", "OBJ-QUALITATIVE", "OBJ-AMBITIOUS", "KR-COUNT", "KR-QUALITY-PAIR", "KR-LEARNING-FORM", "KR-TIMEBOUND", "Q-REACH"]) {
    assertEquals(severityFor(id, "block_12m"), "important", id);
  }
});

Deno.test("severityFor: старые и неизвестные id → improve", () => {
  assertEquals(severityFor("KR3"), "improve");
  assertEquals(severityFor("XYZ"), "improve");
  assert(!("KR-BASELINE-TARGET" in SEVERITY_BY_RULE_ID));
});

// --- ruleApplicability (OKR-PI 3.4.8) ---

// Переписано (О1–О17): ракурсы зависят от происхождения, а не от типа — правило применяется всегда.
Deno.test("ruleApplicability: KR-REQUIRED-ANGLES без типа → applies", () => {
  assertEquals(ruleApplicability("KR-REQUIRED-ANGLES", {}), "applies");
  assertEquals(ruleApplicability("KR-REQUIRED-ANGLES", { okr_type: "aspirational" }), "applies");
});

Deno.test("ruleApplicability: KR-OUTCOME неприменимо только для committed+regular", () => {
  assertEquals(ruleApplicability("KR-OUTCOME", { okr_type: "committed", okr_status: "regular" }), "not_applicable");
  assertEquals(ruleApplicability("KR-OUTCOME", { okr_type: "committed", okr_status: "direction" }), "applies");
  assertEquals(ruleApplicability("KR-OUTCOME", { okr_type: "aspirational" }), "applies");
});

// --- applyRuleContext: серверная постобработка ---

Deno.test("applyRuleContext: добавляет OKR-TYPE-DECLARED pass=false с подсказкой, если тип не объявлен", () => {
  const out = applyRuleContext([{ id: "KR-MEASURABLE", pass: true }], { horizon: "block_12m" });
  const t = out.find((r) => r.id === "OKR-TYPE-DECLARED");
  assertEquals(t.pass, false);
  assertEquals(t.hint, TYPE_NOT_DECLARED_HINT);
});

Deno.test("applyRuleContext: OKR-TYPE-DECLARED от модели игнорируется, сервер решает сам", () => {
  const out = applyRuleContext([{ id: "OKR-TYPE-DECLARED", pass: false }], { okr_type: "committed" });
  const t = out.filter((r) => r.id === "OKR-TYPE-DECLARED");
  assertEquals(t.length, 1);
  assertEquals(t[0].pass, true);
});

Deno.test("applyRuleContext: провал KR-OUTCOME при committed+regular не меняет score", () => {
  const ctx = { horizon: "block_12m", okr_type: "committed" as const, okr_status: "regular" as const };
  const others = [
    { id: "OBJ-NO-NUMBERS", pass: true },
    { id: "KR-MEASURABLE", pass: true },
    { id: "KR-COUNT", pass: false },
  ];
  const withFail = applyRuleContext([...others, { id: "KR-OUTCOME", pass: false }], ctx);
  const withPass = applyRuleContext([...others, { id: "KR-OUTCOME", pass: true }], ctx);
  const outcome = withFail.find((r) => r.id === "KR-OUTCOME");
  assertEquals(outcome.applicable, false);
  assertEquals(outcome.pass, true);
  assertEquals(recomputeScore(withFail), recomputeScore(withPass));
});

// --- Правила отсутствия и серверные правила ---
import { RULE_EVIDENCE_KIND, computeKrCount, computeRequiredAngles, addServerRules } from "./scoring.ts";

// Переписано: OBJ-NO-NUMBERS, KR-OUTCOME, KR-MEASURABLE, KR-TIMEBOUND, KR-LEADING теперь server.
Deno.test("RULE_EVIDENCE_KIND: server / quote", () => {
  for (const id of SERVER_IDS) assertEquals(RULE_EVIDENCE_KIND[id], "server", id);
  for (const id of ["OBJ-QUALITATIVE", "KR-QUALITY-PAIR", "KR-LEARNING-FORM"]) assertEquals(RULE_EVIDENCE_KIND[id], "quote");
});

const kr = (n: number) => Array.from({ length: n }, (_, i) => `KR ${i}`);
Deno.test("computeKrCount: regular 6 → fail с подсказкой про перечень работ", () => {
  const r = computeKrCount(kr(6), { okr_status: "regular" });
  assertEquals(r.pass, false);
  assert(r.hint.includes("от 3 до 5 KR, сейчас 6"));
  assert(r.hint.includes("перечень работ"));
});
Deno.test("computeKrCount: regular 3 → pass; пустые KR не считаются", () => {
  assertEquals(computeKrCount([...kr(3), "  "], { okr_status: "regular" }).pass, true);
});
Deno.test("computeKrCount: direction 5 → fail, direction 2 → pass", () => {
  assertEquals(computeKrCount(kr(5), { okr_status: "direction" }).pass, false);
  assertEquals(computeKrCount(kr(2), { okr_status: "direction" }).pass, true);
});

const P = (...a: string[]) => a.map((perspective, index) => ({ index, perspective }));
// Переписано (О1–О17): ракурсы по происхождению. Раньше «aspirational К,К,О → missing У»; теперь это growth_direction.
Deno.test("computeRequiredAngles: growth_direction К,К,О → fail, missing У (N1 v2)", () => {
  const r = computeRequiredAngles(P("К", "К", "О"), 3, { okr_origin: "growth_direction" });
  assertEquals(r.pass, false);
  assertEquals(r.missing, ["У"]);
  assert(r.hint.includes("[У]"));
});
Deno.test("computeRequiredAngles: aspirational К,О,У → pass", () => {
  assertEquals(computeRequiredAngles(P("К", "О", "У"), 3, { okr_type: "aspirational" }).pass, true);
});
Deno.test("computeRequiredAngles: committed К,О,О → pass (эталон «Надёжность в пиковые дни»)", () => {
  assertEquals(computeRequiredAngles(P("К", "О", "О"), 3, { okr_type: "committed" }).pass, true);
});
// Переписано (О1–О17): смешанный тип больше не даёт «О или У» — тип на ракурсы не влияет.
Deno.test("computeRequiredAngles: тип mixed не влияет — regular К,У → fail, missing О (N11)", () => {
  const r = computeRequiredAngles(P("К", "К", "У"), 3, { okr_type: "mixed" });
  assertEquals(r.pass, false);
  assertEquals(r.missing, ["О"]);
});
Deno.test("computeRequiredAngles: protection_direction К,К,У → fail, missing О (N10)", () => {
  const r = computeRequiredAngles(P("К", "К", "У"), 3, { okr_origin: "protection_direction" });
  assertEquals(r.missing, ["О"]);
});
Deno.test("computeRequiredAngles: разметка неполная (3 из 4) → unreliable", () => {
  const r = computeRequiredAngles(P("К", "К", "О"), 4, { okr_type: "committed" });
  assertEquals(r.unreliable, true);
  assertEquals(r.pass, false);
});
// Переписано (О1–О17): неприменимость при неизвестном типе убрана.
Deno.test("computeRequiredAngles: тип не объявлен, regular К,К,О,У → pass (N9 v2)", () => {
  const r = computeRequiredAngles(P("К", "К", "О", "У"), 4, {});
  assertEquals(r.applicable, true);
  assertEquals(r.pass, true);
});
Deno.test("recomputeScore: unreliable правило не входит в оценку", () => {
  const base = [{ id: "A", pass: true, severity: "critical" as const }];
  assertEquals(
    recomputeScore([...base, { id: "KR-REQUIRED-ANGLES", pass: false, severity: "important", unreliable: true }]),
    recomputeScore(base),
  );
});
// Переписано (О1–О17): [У] обязателен по происхождению (рост), а не по типу.
Deno.test("интеграция: OKR из направления роста без [У] получает оценку ниже, чем с [У]", () => {
  const ctx = { okr_origin: "growth_direction" as const, horizon: "block_12m" };
  const modelRules = ["OBJ-NO-NUMBERS", "OBJ-QUALITATIVE", "OBJ-AMBITIOUS", "KR-MEASURABLE", "KR-OUTCOME", "KR-QUALITY-PAIR", "KR-LEARNING-FORM", "KR-LEADING", "KR-TIMEBOUND"]
    .map((id) => ({ id, pass: true }));
  const score = (p: unknown) => recomputeScore(applyRuleContext(addServerRules(modelRules, kr(3), p, ctx), ctx));
  assert(score(P("К", "К", "О")) < score(P("К", "К", "У")));
});

// --- Серверные правила по разметке каждого KR (замер стабильности) ---
import {
  computeMeasurable, computeTimebound, computeLeading, computeOutcome, computeObjNoNumbers, type KrLabel,
} from "./scoring.ts";

const L = (...a: Array<[string, string, string]>): KrLabel[] =>
  a.map(([perspective, form, timing], index) => ({ index, perspective, form, timing, rationale: "" } as KrLabel));

Deno.test("computeMeasurable: unmeasurable → fail с номером KR", () => {
  const r = computeMeasurable(L(["К", "range", "lagging"], ["У", "unmeasurable", "lagging"]), 2, { okr_type: "aspirational" });
  assertEquals(r.pass, false);
  assert(r.hint.includes("KR №2"));
});
Deno.test("computeMeasurable: execution/binary → fail, кроме committed (OKR-PI 3.4.8)", () => {
  const labels = L(["К", "threshold", "lagging"], ["О", "binary", "lagging"], ["О", "execution", "lagging"]);
  assertEquals(computeMeasurable(labels, 3, { okr_type: "aspirational" }).pass, false);
  assertEquals(computeMeasurable(labels, 3, { okr_type: "committed" }).pass, true);
});
Deno.test("computeMeasurable: неполная разметка → unreliable, не ложный провал и не ложный проход", () => {
  const r = computeMeasurable(L(["К", "range", "lagging"]), 3, { okr_type: "aspirational" });
  assertEquals(r.unreliable, true);
  const noForm = computeMeasurable([{ index: 0, perspective: "К" }, { index: 1, perspective: "О" }] as KrLabel[], 2, {});
  assertEquals(noForm.unreliable, true);
});
Deno.test("computeTimebound: binary → fail, кроме committed (OKR-PI 3.4.5)", () => {
  const labels = L(["К", "range", "lagging"], ["О", "binary", "lagging"]);
  assertEquals(computeTimebound(labels, 2, { okr_type: "mixed" }).pass, false);
  assertEquals(computeTimebound(labels, 2, { okr_type: "committed" }).pass, true);
  assertEquals(computeTimebound(L(["К", "execution", "lagging"]), 1, {}).pass, true);
});
Deno.test("computeLeading: нет leading → fail; есть → pass; неполная → unreliable", () => {
  const ctx = { horizon: "quarter_3m" };
  assertEquals(computeLeading(L(["К", "range", "lagging"], ["О", "threshold", "lagging"]), 2, ctx).pass, false);
  assertEquals(computeLeading(L(["К", "range", "leading"], ["О", "threshold", "lagging"]), 2, ctx).pass, true);
  assertEquals(computeLeading(L(["К", "range", "leading"]), 2, ctx).unreliable, true);
});
// Переписано: KR-LEADING применяется всегда; строгость зависит от статуса и горизонта.
Deno.test("ruleApplicability: KR-LEADING применяется всегда (OKR-PI 3.4.2)", () => {
  assertEquals(ruleApplicability("KR-LEADING", { horizon: "block_12m", okr_status: "regular" }), "applies");
  assertEquals(ruleApplicability("KR-LEADING", { horizon: "quarter_3m" }), "applies");
  assertEquals(ruleApplicability("KR-LEADING", { horizon: "block_12m", okr_status: "direction" }), "applies");
});
Deno.test("computeOutcome: глагол исполнения → fail, evidence = слово, hint с номером KR", () => {
  const r = computeOutcome(["Доля активных с 20% до 40%", "Запустить новый экран приветствия"], {});
  assertEquals(r.pass, false);
  assertEquals(r.evidence, "запустить");
  assert(r.hint.includes("KR №2"));
});
Deno.test("computeObjNoNumbers: цифра → fail, evidence = фрагмент с цифрой", () => {
  const r = computeObjNoNumbers("Новый клиент становится активным в первый же день: 60% новых клиентов с операцией за сутки.");
  assertEquals(r.pass, false);
  assertEquals(r.evidence, "60%");
  assertEquals(computeObjNoNumbers("Новый клиент становится активным в первый же день.").pass, true);
});

// Эталоны из goldenSet (тексты продублированы — goldenSet не меняем и не импортируем во фронт-слой).
const rule = (rules: any[], id: string) => rules.find((r) => r.id === id);
const audit = (objective: string, krTexts: string[], labels: KrLabel[], ctx: any) =>
  applyRuleContext(addServerRules([], krTexts, labels, ctx, objective), ctx);

Deno.test("эталон P4 (committed): бинарный второй KR → KR-MEASURABLE и KR-TIMEBOUND pass", () => {
  const ctx = { okr_type: "committed", okr_status: "regular", horizon: "block_12m" };
  const rules = audit("Требования регулятора внедряем спокойно и с запасом.", [
    "100% регуляторных изменений в проде не позже чем за 10 рабочих дней до срока",
    "Ёмкость на регуляторику закладывается при планировании PI, без изъятий внутри PI",
    "Ноль переносов бизнес-обязательств из-за регуляторных авралов",
  ], L(["К", "threshold", "lagging"], ["О", "binary", "lagging"], ["О", "threshold", "lagging"]), ctx);
  assertEquals(rule(rules, "KR-MEASURABLE").pass, true);
  assertEquals(rule(rules, "KR-TIMEBOUND").pass, true);
  assertEquals(rule(rules, "OBJ-NO-NUMBERS").pass, true);
  // Переписано: KR-LEADING теперь применим — рекомендация improve для обычного годового.
  assertEquals(rule(rules, "KR-LEADING").applicable, true);
  assertEquals(rule(rules, "KR-LEADING").severity, "improve");
});
const P3_KRS = ["Доля клиентов с операцией в первый день с 35% до 60%", "NPS онбординга с 20 до 40", "Отток в первый месяц остаётся ниже 8%"];
const P3_LABELS = () => L(["К", "range", "lagging"], ["К", "range", "lagging"], ["О", "threshold", "lagging"]);
Deno.test("KR-LEADING: P3 обычный годовой без опережающих → fail, improve, рекомендация", () => {
  const ctx = { okr_type: "aspirational", okr_status: "regular", horizon: "block_12m" } as any;
  const r = rule(audit("Новый клиент быстро становится активным.", P3_KRS, P3_LABELS(), ctx), "KR-LEADING");
  assertEquals(r.pass, false);
  assertEquals(r.applicable, true);
  assertEquals(r.severity, "improve");
  assert(r.hint.startsWith("Рекомендация: добавьте опережающий KR"));
});
// Переписано (О13): для OKR из направления hint требует опережающий именно [К].
Deno.test("KR-LEADING: тот же набор со старым статусом direction → fail, critical, О13", () => {
  const ctx = { okr_type: "aspirational", okr_status: "direction", horizon: "block_12m" } as any;
  const r = rule(audit("Новый клиент быстро становится активным.", P3_KRS, P3_LABELS(), ctx), "KR-LEADING");
  assertEquals(r.pass, false);
  assertEquals(r.severity, "critical");
  assert(r.hint.startsWith("О13: нужен опережающий [К]"));
});
Deno.test("KR-LEADING: квартальный горизонт → fail, critical", () => {
  const ctx = { okr_type: "aspirational", okr_status: "regular", horizon: "quarter_3m" } as any;
  const r = rule(audit("Новый клиент быстро становится активным.", P3_KRS, P3_LABELS(), ctx), "KR-LEADING");
  assertEquals(r.pass, false);
  assertEquals(r.severity, "critical");
});
Deno.test("эталон N6: «Провести исследование…» unmeasurable → KR-MEASURABLE fail", () => {
  const ctx = { okr_type: "aspirational", okr_status: "regular", horizon: "block_12m" };
  const rules = audit("Клиент получает кредитное решение быстрее, чем успевает передумать.", [
    "Конверсия с 18% до 26%", "Доля автоматических решений с 40% до 75%", "Просрочка не выше текущей",
    "Провести исследование клиентского пути заёмщика в мобильном приложении",
  ], L(["К", "range", "lagging"], ["К", "range", "leading"], ["О", "threshold", "lagging"], ["У", "unmeasurable", "lagging"]), ctx);
  assertEquals(rule(rules, "KR-MEASURABLE").pass, false);
  assert(rule(rules, "KR-MEASURABLE").hint.includes("KR №4"));
});
Deno.test("эталон N7: KR-OUTCOME fail «запустить», OBJ-NO-NUMBERS pass", () => {
  const ctx = { okr_type: "aspirational", okr_status: "regular", horizon: "block_12m" };
  const rules = audit("Новый клиент становится активным в первый же день.", [
    "KR a", "KR b", "KR c", "KR d",
    "Запустить новый экран приветствия в мобильном приложении",
    "Обучить сотрудников контакт-центра сценарию онбординга",
  ], [], ctx);
  assertEquals(rule(rules, "KR-OUTCOME").pass, false);
  assertEquals(rule(rules, "KR-OUTCOME").evidence, "запустить");
  assertEquals(rule(rules, "OBJ-NO-NUMBERS").pass, true);
});
Deno.test("эталон P6: KR-OUTCOME pass («Новое правило попадает в прод…»)", () => {
  const ctx = { okr_type: "mixed", okr_status: "regular", horizon: "block_12m" };
  const rules = audit("Клиент защищён от мошенников и не страдает от защиты.", [
    "Потери от мошенничества на 1 млн операций снижены на 30%",
    "Доля ложных блокировок с 2% до 0,8%",
    "Новое правило попадает в прод за 4 часа вместо 5 дней",
    "К концу PI на исторических данных проверены две поведенческие модели, известна точность каждой",
  ], [], ctx);
  assertEquals(rule(rules, "KR-OUTCOME").pass, true);
});
Deno.test("эталон N3: OBJ-NO-NUMBERS fail", () => {
  const rules = audit("Новый клиент становится активным в первый же день: 60% новых клиентов с операцией за сутки.",
    ["a", "b", "c"], [], { okr_type: "aspirational", okr_status: "regular", horizon: "block_12m" });
  assertEquals(rule(rules, "OBJ-NO-NUMBERS").pass, false);
});
Deno.test("addServerRules: вердикты модели по серверным правилам отбрасываются", () => {
  const ctx = { okr_type: "aspirational", okr_status: "regular", horizon: "block_12m" } as any;
  const rules = addServerRules([{ id: "OBJ-NO-NUMBERS", pass: false, evidence: "x" }, { id: "OBJ-QUALITATIVE", pass: true }],
    ["a", "b", "c"], [], ctx, "Цель без цифр");
  assertEquals(rules.filter((r: any) => r.id === "OBJ-NO-NUMBERS").length, 1);
  assertEquals(rule(rules, "OBJ-NO-NUMBERS").pass, true);
  assertEquals(rule(rules, "OBJ-QUALITATIVE").pass, true);
});

// --- Чек-лист О1–О17 (обновление OKR-PI 09.10.2026) ---
import {
  toCtx as toCtxV2, requiredAnglesFor, checklistRef, computeOwner, computeWayKnown, computeRiskNamed,
} from "./scoring.ts";
import { GOLDEN_SET } from "../../../src/lib/goldenSet.ts";

Deno.test("toCtx: okr_origin, owner, way_known; совместимость со старым okr_status", () => {
  assertEquals(toCtxV2({ okr_status: "direction" }).okr_origin, "growth_direction");
  assertEquals(toCtxV2({ okr_status: "regular" }).okr_origin, "regular");
  assertEquals(toCtxV2({}).okr_origin, "regular");
  const c = toCtxV2({ okr_origin: "protection_direction", owner: "  Иванов ", way_known: false, okr_type: "committed" });
  assertEquals(c.okr_origin, "protection_direction");
  assertEquals(c.owner, "Иванов");
  assertEquals(c.way_known, false);
  assertEquals(c.okr_type, "aspirational", "для OKR из направления тип принудительно амбициозный");
  assertEquals(toCtxV2({}).way_known, true);
});
Deno.test("OKR-TYPE-DECLARED: для OKR из направления pass без объявленного типа", () => {
  const r = applyRuleContext([], { okr_origin: "growth_direction" }).find((x: any) => x.id === "OKR-TYPE-DECLARED");
  assertEquals(r.pass, true);
});
Deno.test("requiredAnglesFor по происхождению", () => {
  assertEquals(requiredAnglesFor("growth_direction"), ["К", "У"]);
  assertEquals(requiredAnglesFor("protection_direction"), ["К", "О", "У"]);
  assertEquals(requiredAnglesFor("regular"), ["К", "О"]);
});
Deno.test("KR-COUNT: growth/protection 2–4 (О11), regular 3–5 (О15)", () => {
  assertEquals(computeKrCount(kr(2), { okr_origin: "protection_direction" }).pass, true);
  assertEquals(computeKrCount(kr(5), { okr_origin: "growth_direction" }).pass, false);
  assertEquals(computeKrCount(kr(2), { okr_origin: "regular" }).pass, false);
  assertEquals(computeKrCount(kr(5), { okr_origin: "regular" }).pass, true);
});
Deno.test("KR-LEADING (О13): из направления нужен опережающий именно [К]", () => {
  const onlyO = L(["К", "range", "lagging"], ["О", "threshold", "leading"]);
  const r = computeLeading(onlyO, 2, { okr_origin: "growth_direction" });
  assertEquals(r.pass, false);
  assertEquals(r.hint, "О13: нужен опережающий [К] — драйвер с контрольными точками внутри года");
  assertEquals(computeLeading(L(["К", "range", "leading"], ["О", "threshold", "lagging"]), 2, { okr_origin: "protection_direction" }).pass, true);
  assertEquals(severityFor("KR-LEADING", { okr_origin: "protection_direction" }), "critical");
  // квартал и обычный годовой — как раньше: любой опережающий
  assertEquals(computeLeading(onlyO, 2, { horizon: "quarter_3m" }).pass, true);
  assertEquals(severityFor("KR-LEADING", { okr_origin: "regular", horizon: "block_12m" }), "improve");
});
Deno.test("KR-REQUIRED-ANGLES severity: направление → critical, regular → important", () => {
  assertEquals(severityFor("KR-REQUIRED-ANGLES", { okr_origin: "growth_direction" }), "critical");
  assertEquals(severityFor("KR-REQUIRED-ANGLES", { okr_origin: "protection_direction" }), "critical");
  assertEquals(severityFor("KR-REQUIRED-ANGLES", { okr_origin: "regular" }), "important");
});
Deno.test("Исключение для обязательных — только committed+regular (P4 «Регуляторные изменения НБРБ»)", () => {
  const p4 = GOLDEN_SET.find((c) => c.id === "P4")!;
  assertEquals(p4.okr_type, "committed");
  const ctx = { okr_type: "committed" as const, okr_origin: "regular" as const, horizon: "block_12m" };
  const labels = L(["К", "execution", "lagging"], ["К", "binary", "lagging"], ["О", "threshold", "lagging"]);
  assertEquals(computeMeasurable(labels, 3, ctx).pass, true);
  assertEquals(computeTimebound(labels, 3, ctx).pass, true);
  assertEquals(ruleApplicability("KR-OUTCOME", ctx), "not_applicable");
  // OKR из направления обязательным не бывает
  const dir = { okr_type: "committed" as const, okr_origin: "growth_direction" as const };
  assertEquals(computeMeasurable(labels, 3, dir).pass, false);
  assertEquals(ruleApplicability("KR-OUTCOME", dir), "applies");
});
Deno.test("OKR-OWNER (О9): pass, если владелец назван", () => {
  assertEquals(computeOwner({ owner: "  " }).pass, false);
  assertEquals(computeOwner({ owner: "  " }).hint, "О9: назовите владельца поимённо");
  assertEquals(computeOwner({ owner: "Петров" }).pass, true);
});
Deno.test("OKR-WAY-KNOWN (О17): только regular; pass, если way_known !== false", () => {
  assertEquals(computeWayKnown({ way_known: false }).pass, false);
  assert(computeWayKnown({ way_known: false }).hint.startsWith("О17: способ неизвестен"));
  assertEquals(computeWayKnown({}).pass, true);
  assertEquals(ruleApplicability("OKR-WAY-KNOWN", { okr_origin: "growth_direction" }), "not_applicable");
  assertEquals(ruleApplicability("OKR-WAY-KNOWN", { okr_origin: "regular" }), "applies");
});
Deno.test("KR-RISK-NAMED (О7): каждый [О] с guards_against; без [О] — pass; неполная разметка — unreliable", () => {
  const lab = (a: Array<[string, string]>) => a.map(([perspective, guards_against], index) => ({ index, perspective, guards_against }));
  const r = computeRiskNamed(lab([["К", ""], ["О", ""], ["О", "заморозка релизов"]]), 3);
  assertEquals(r.pass, false);
  assert(r.hint.includes("KR №2") && !r.hint.includes("KR №3"));
  assertEquals(computeRiskNamed(lab([["К", ""], ["У", ""]]), 2).pass, true);
  assertEquals(computeRiskNamed(lab([["К", ""]]), 2).unreliable, true);
});
Deno.test("RULE_EVIDENCE_KIND: новые серверные правила и OBJ-END-STATE по цитате", () => {
  for (const id of ["OKR-OWNER", "OKR-WAY-KNOWN", "KR-RISK-NAMED"]) assertEquals(RULE_EVIDENCE_KIND[id], "server");
  assertEquals(RULE_EVIDENCE_KIND["OBJ-END-STATE"], "quote");
  assertEquals(severityFor("OBJ-END-STATE", {}), "important");
});
Deno.test("checklist_ref: есть у каждого правила; KR-COUNT и ракурсы зависят от происхождения", () => {
  for (const ctx of [{ horizon: "quarter_3m", okr_type: "mixed" as const }, { okr_origin: "growth_direction" as const }]) {
    const rules = applyRuleContext(knownRuleIdsFor(ctx).filter((id) => id !== "OKR-TYPE-DECLARED").map((id) => ({ id, pass: true })), ctx);
    for (const id of knownRuleIdsFor(ctx)) {
      const r = rules.find((x: any) => x.id === id);
      assert(r && typeof r.checklist_ref === "string" && r.checklist_ref.length > 0, id);
    }
  }
  assertEquals(checklistRef("KR-COUNT", { okr_origin: "growth_direction" }), "О11");
  assertEquals(checklistRef("KR-COUNT", {}), "О15");
  assertEquals(checklistRef("KR-REQUIRED-ANGLES", { okr_origin: "protection_direction" }), "5.2");
  assertEquals(checklistRef("KR-REQUIRED-ANGLES", {}), "О16");
  assertEquals(checklistRef("OBJ-END-STATE", {}), "О3");
  assertEquals(checklistRef("Q-REACH", {}), "доп.");
});
