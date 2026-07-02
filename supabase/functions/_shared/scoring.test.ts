import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { recomputeScore, scoreDiscrepancy, severityFor, knownRuleIdsFor, SEVERITY_BY_RULE_ID, type ScoringRule } from "./scoring.ts";

Deno.test("recomputeScore: 100 при всех правилах pass=true", () => {
  const rules: ScoringRule[] = [
    { id: "OBJ-QUALITATIVE", pass: true, severity: "important" },
    { id: "OBJ-NO-NUMBERS", pass: true, severity: "critical" },
    { id: "KR-MEASURABLE", pass: true, severity: "critical" },
    { id: "KR-BASELINE-TARGET", pass: true, severity: "critical" },
    { id: "KR-OUTCOME", pass: true, severity: "critical" },
    { id: "KR-TIMEBOUND", pass: true, severity: "important" },
    { id: "KR-LEADING", pass: true, severity: "important" },
  ];
  assertEquals(recomputeScore(rules), 100);
});

Deno.test("recomputeScore: потолок 60 при ≥1 critical fail, даже если взвешенная сумма выше", () => {
  const rules: ScoringRule[] = [
    { id: "OBJ-NO-NUMBERS", pass: false, severity: "critical" },
    { id: "KR-MEASURABLE", pass: true, severity: "critical" },
    { id: "KR-BASELINE-TARGET", pass: true, severity: "critical" },
    { id: "KR-OUTCOME", pass: true, severity: "critical" },
    { id: "OBJ-QUALITATIVE", pass: true, severity: "important" },
    { id: "KR-TIMEBOUND", pass: true, severity: "important" },
    { id: "KR-LEADING", pass: true, severity: "important" },
  ];
  const s = recomputeScore(rules);
  assert(s <= 60, `expected <=60, got ${s}`);
  assertEquals(s, 60);
});

Deno.test("recomputeScore: корректно считает по весам critical=3/important=2/improve=1", () => {
  const rules: ScoringRule[] = [
    { id: "A", pass: true, severity: "critical" },
    { id: "B", pass: false, severity: "important" },
    { id: "C", pass: true, severity: "improve" },
    { id: "D", pass: false, severity: "important" },
  ];
  assertEquals(recomputeScore(rules), 50);
});

Deno.test("recomputeScore: improve-fail НЕ триггерит потолок 60", () => {
  const rules: ScoringRule[] = [
    { id: "A", pass: true, severity: "critical" },
    { id: "B", pass: true, severity: "important" },
    { id: "C", pass: false, severity: "improve" },
  ];
  const s = recomputeScore(rules);
  assertEquals(s, 83);
  assert(s > 60, "improve-fail не должен включать потолок 60");
});

Deno.test("recomputeScore: пустой массив → 0", () => {
  assertEquals(recomputeScore([]), 0);
});

// --- scoreDiscrepancy ---

Deno.test("scoreDiscrepancy: разница 11 → true", () => {
  assertEquals(scoreDiscrepancy(85, 74), true);
});

Deno.test("scoreDiscrepancy: граница 10 → false", () => {
  assertEquals(scoreDiscrepancy(85, 75), false);
});

Deno.test("scoreDiscrepancy: разница 0 → false", () => {
  assertEquals(scoreDiscrepancy(60, 60), false);
});

Deno.test("scoreDiscrepancy: модель занизила (60 vs 71) → true", () => {
  assertEquals(scoreDiscrepancy(60, 71), true);
});

// --- knownRuleIdsFor: семантические id, старые мертвы ---

Deno.test("knownRuleIdsFor('block_12m') возвращает ровно 8 новых семантических id", () => {
  assertEquals(knownRuleIdsFor("block_12m"), [
    "OBJ-QUALITATIVE",
    "OBJ-AMBITIOUS",
    "OBJ-NO-NUMBERS",
    "KR-MEASURABLE",
    "KR-BASELINE-TARGET",
    "KR-OUTCOME",
    "KR-TIMEBOUND",
    "KR-LEADING",
  ]);
});

Deno.test("knownRuleIdsFor('quarter_3m') добавляет Q-FOCUS/Q-THEME/Q-REACH", () => {
  const ids = knownRuleIdsFor("quarter_3m");
  assertEquals(ids.length, 11);
  for (const q of ["Q-FOCUS", "Q-THEME", "Q-REACH"]) {
    assert(ids.includes(q), `${q} должен присутствовать в quarter ids`);
  }
});

Deno.test("knownRuleIdsFor не содержит старых id (O1/O2/O3/KR1/KR2/KR3/KR4/KR10)", () => {
  const all = [...knownRuleIdsFor("block_12m"), ...knownRuleIdsFor("quarter_3m")];
  for (const dead of ["O1", "O2", "O3", "KR1", "KR2", "KR3", "KR4", "KR10", "Q-Focus", "Q-Theme", "Q-Reach"]) {
    assert(!all.includes(dead), `старый id ${dead} не должен возвращаться`);
  }
});

// --- severityFor ---

Deno.test("severityFor: KR-LEADING для block_12m → important", () => {
  assertEquals(severityFor("KR-LEADING", "block_12m"), "important");
});

Deno.test("severityFor: KR-LEADING для quarter_3m → critical (override)", () => {
  assertEquals(severityFor("KR-LEADING", "quarter_3m"), "critical");
});

Deno.test("severityFor: OBJ-NO-NUMBERS всегда critical", () => {
  assertEquals(severityFor("OBJ-NO-NUMBERS"), "critical");
  assertEquals(severityFor("OBJ-NO-NUMBERS", "block_12m"), "critical");
  assertEquals(severityFor("OBJ-NO-NUMBERS", "quarter_3m"), "critical");
});

Deno.test("severityFor: старые id мертвы — 'KR3' резолвится в improve (дефолт), НЕ critical", () => {
  assertEquals(severityFor("KR3"), "improve");
  assertEquals(severityFor("KR10", "quarter_3m"), "improve");
  assertEquals(severityFor("O3"), "improve");
  assert(!("KR3" in SEVERITY_BY_RULE_ID), "KR3 не должен присутствовать в SEVERITY_BY_RULE_ID");
  assert(!("KR10" in SEVERITY_BY_RULE_ID), "KR10 не должен присутствовать в SEVERITY_BY_RULE_ID");
});

Deno.test("severityFor: неизвестный id → improve", () => {
  assertEquals(severityFor("XYZ"), "improve");
});
