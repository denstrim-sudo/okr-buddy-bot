import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyRuleContext, knownRuleIdsFor, modelRuleIdsFor, recomputeScore, ruleApplicability, scoreDiscrepancy,
  severityFor, SEVERITY_BY_RULE_ID, TYPE_NOT_DECLARED_HINT, type ScoringRule,
} from "./scoring.ts";

const BASE_IDS = [
  "OKR-TYPE-DECLARED", "OBJ-NO-NUMBERS", "OBJ-QUALITATIVE", "KR-COUNT", "KR-MEASURABLE", "KR-OUTCOME",
  "KR-REQUIRED-ANGLES", "KR-QUALITY-PAIR", "KR-LEARNING-FORM", "KR-LEADING", "KR-TIMEBOUND",
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
  assertEquals(knownRuleIdsFor({ horizon: "block_12m", okr_type: "committed", okr_status: "regular" }), BASE_IDS);
});

Deno.test("knownRuleIdsFor: OBJ-AMBITIOUS только для aspirational/mixed", () => {
  assert(knownRuleIdsFor({ okr_type: "aspirational" }).includes("OBJ-AMBITIOUS"));
  assert(knownRuleIdsFor({ okr_type: "mixed" }).includes("OBJ-AMBITIOUS"));
  assert(!knownRuleIdsFor({ okr_type: "committed" }).includes("OBJ-AMBITIOUS"));
  assert(!knownRuleIdsFor({}).includes("OBJ-AMBITIOUS"));
});

Deno.test("knownRuleIdsFor: Q-REACH только для квартала (Q-FOCUS/Q-THEME удалены, OKR-PI 3.4)", () => {
  assertEquals(knownRuleIdsFor("quarter_3m"), [...BASE_IDS, "Q-REACH"]);
  assert(!knownRuleIdsFor("block_12m").includes("Q-REACH"));
});

Deno.test("knownRuleIdsFor: старая сигнатура (horizon) = тип не объявлен, обычный OKR", () => {
  assertEquals(knownRuleIdsFor("block_12m"), BASE_IDS);
  assertEquals(knownRuleIdsFor(undefined), BASE_IDS);
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

// Переписано: модель больше не оценивает KR-COUNT и KR-REQUIRED-ANGLES — их считает сервер.
Deno.test("modelRuleIdsFor: без серверных OKR-TYPE-DECLARED, KR-COUNT, KR-REQUIRED-ANGLES", () => {
  const ids = modelRuleIdsFor("block_12m");
  for (const id of ["OKR-TYPE-DECLARED", "KR-COUNT", "KR-REQUIRED-ANGLES"]) assert(!ids.includes(id), id);
  assertEquals(ids.length, BASE_IDS.length - 3);
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

Deno.test("severityFor: KR-LEADING critical для квартала или направления, иначе important", () => {
  assertEquals(severityFor("KR-LEADING", "quarter_3m"), "critical");
  assertEquals(severityFor("KR-LEADING", { horizon: "block_12m", okr_status: "direction" }), "critical");
  assertEquals(severityFor("KR-LEADING", "block_12m"), "important");
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

Deno.test("ruleApplicability: KR-REQUIRED-ANGLES без типа → not_applicable", () => {
  assertEquals(ruleApplicability("KR-REQUIRED-ANGLES", {}), "not_applicable");
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

Deno.test("RULE_EVIDENCE_KIND: server / absence / quote", () => {
  for (const id of ["OKR-TYPE-DECLARED", "KR-COUNT", "KR-REQUIRED-ANGLES"]) assertEquals(RULE_EVIDENCE_KIND[id], "server");
  assertEquals(RULE_EVIDENCE_KIND["KR-LEADING"], "absence");
  for (const id of ["OBJ-NO-NUMBERS", "KR-MEASURABLE", "KR-QUALITY-PAIR"]) assertEquals(RULE_EVIDENCE_KIND[id], "quote");
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
Deno.test("computeRequiredAngles: aspirational К,К,О → fail, missing У", () => {
  const r = computeRequiredAngles(P("К", "К", "О"), 3, { okr_type: "aspirational" });
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
Deno.test("computeRequiredAngles: mixed К,У → pass; К,К → fail «О или У»", () => {
  assertEquals(computeRequiredAngles(P("К", "У"), 2, { okr_type: "mixed" }).pass, true);
  const r = computeRequiredAngles(P("К", "К"), 2, { okr_type: "mixed" });
  assertEquals(r.pass, false);
  assertEquals(r.missing, ["О или У"]);
});
Deno.test("computeRequiredAngles: разметка неполная (3 из 4) → unreliable", () => {
  const r = computeRequiredAngles(P("К", "К", "О"), 4, { okr_type: "committed" });
  assertEquals(r.unreliable, true);
  assertEquals(r.pass, false);
});
Deno.test("computeRequiredAngles: тип не объявлен → applicable=false", () => {
  assertEquals(computeRequiredAngles(P("К"), 1, {}).applicable, false);
});
Deno.test("recomputeScore: unreliable правило не входит в оценку", () => {
  const base = [{ id: "A", pass: true, severity: "critical" as const }];
  assertEquals(
    recomputeScore([...base, { id: "KR-REQUIRED-ANGLES", pass: false, severity: "important", unreliable: true }]),
    recomputeScore(base),
  );
});
Deno.test("интеграция: амбициозный OKR без [У] получает оценку ниже, чем с [У]", () => {
  const ctx = { okr_type: "aspirational" as const, okr_status: "regular" as const, horizon: "block_12m" };
  const modelRules = ["OBJ-NO-NUMBERS", "OBJ-QUALITATIVE", "OBJ-AMBITIOUS", "KR-MEASURABLE", "KR-OUTCOME", "KR-QUALITY-PAIR", "KR-LEARNING-FORM", "KR-LEADING", "KR-TIMEBOUND"]
    .map((id) => ({ id, pass: true }));
  const score = (p: unknown) => recomputeScore(applyRuleContext(addServerRules(modelRules, kr(3), p, ctx), ctx));
  assert(score(P("К", "К", "О")) < score(P("К", "К", "У")));
});
