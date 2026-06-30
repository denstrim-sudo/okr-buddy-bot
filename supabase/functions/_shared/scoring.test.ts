import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { recomputeScore, scoreDiscrepancy, severityFor, type ScoringRule } from "./scoring.ts";

Deno.test("recomputeScore: 100 при всех правилах pass=true", () => {
  const rules: ScoringRule[] = [
    { id: "O1", pass: true, severity: "important" },
    { id: "O3", pass: true, severity: "critical" },
    { id: "KR1", pass: true, severity: "critical" },
    { id: "KR2", pass: true, severity: "critical" },
    { id: "KR3", pass: true, severity: "critical" },
    { id: "KR4", pass: true, severity: "important" },
    { id: "KR10", pass: true, severity: "important" },
  ];
  assertEquals(recomputeScore(rules), 100);
});

Deno.test("recomputeScore: потолок 60 при ≥1 critical fail, даже если взвешенная сумма выше", () => {
  // 1 critical fail (вес 3) из 7 правил; остальные 6 — pass с большим суммарным весом.
  // Total = 3+3+3+3+2+2+2 = 18; passed = 18-3 = 15 → raw = round(100*15/18) = 83 > 60.
  const rules: ScoringRule[] = [
    { id: "O3", pass: false, severity: "critical" }, // единственный fail
    { id: "KR1", pass: true, severity: "critical" },
    { id: "KR2", pass: true, severity: "critical" },
    { id: "KR3", pass: true, severity: "critical" },
    { id: "O1", pass: true, severity: "important" },
    { id: "KR4", pass: true, severity: "important" },
    { id: "KR10", pass: true, severity: "important" },
  ];
  const s = recomputeScore(rules);
  assert(s <= 60, `expected <=60, got ${s}`);
  assertEquals(s, 60);
});

Deno.test("recomputeScore: корректно считает по весам critical=3/important=2/improve=1", () => {
  // Без critical fail. Total = 3+2+1+2 = 8; passed = 3+1 = 4. round(100*4/8)=50.
  const rules: ScoringRule[] = [
    { id: "A", pass: true, severity: "critical" },   // +3 passed, +3 total
    { id: "B", pass: false, severity: "important" }, // +0 passed, +2 total
    { id: "C", pass: true, severity: "improve" },    // +1 passed, +1 total
    { id: "D", pass: false, severity: "important" }, // +0 passed, +2 total
  ];
  assertEquals(recomputeScore(rules), 50);
});

Deno.test("recomputeScore: improve-fail НЕ триггерит потолок 60", () => {
  // Только improve-fail (вес 1), без critical fails. Total = 3+2+1 = 6; passed = 3+2 = 5 → 83.
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

// --- severityFor: KR10 override для quarter_3m ---

Deno.test("severityFor: KR10 для block_12m → important", () => {
  assertEquals(severityFor("KR10", "block_12m"), "important");
});

Deno.test("severityFor: KR10 для quarter_3m → critical (override)", () => {
  assertEquals(severityFor("KR10", "quarter_3m"), "critical");
});

Deno.test("severityFor: неизвестный id → improve", () => {
  assertEquals(severityFor("XYZ"), "improve");
});

