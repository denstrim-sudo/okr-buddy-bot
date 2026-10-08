import { describe, it, expect } from "vitest";
import { ruleState, caseStability, caseAccuracy, summarize, estimateMinutes, type AuditRun } from "@/lib/stability";

const run = (rules: AuditRun["rules"], extra: Partial<AuditRun> = {}): AuditRun => ({ score: 80, rules, ...extra });
const base = [
  { id: "A", pass: true },
  { id: "B", pass: false },
  { id: "C", pass: true, applicable: false },
];

describe("ruleState", () => {
  it("n/a > unreliable > unconfirmed > pass/fail", () => {
    expect(ruleState({ id: "x", applicable: false, unreliable: true })).toBe("n/a");
    expect(ruleState({ id: "x", unreliable: true, unconfirmed: true })).toBe("unreliable");
    expect(ruleState({ id: "x", unconfirmed: true })).toBe("unconfirmed");
    expect(ruleState({ id: "x", pass: true })).toBe("pass");
    expect(ruleState({ id: "x", pass: false })).toBe("fail");
  });
});

describe("caseStability", () => {
  it("3 одинаковых прогона → 1", () => {
    expect(caseStability([run(base), run(base), run(base)])).toEqual({ stableShare: 1, flappingRuleIds: [] });
  });
  it("правило меняется pass/fail → < 1 и в flapping", () => {
    const r = caseStability([run(base), run(base), run([{ id: "A", pass: false }, base[1], base[2]])]);
    expect(r.stableShare).toBeLessThan(1);
    expect(r.flappingRuleIds).toEqual(["A"]);
  });
  it("правило отсутствует в одном прогоне → нестабильно", () => {
    expect(caseStability([run(base), run(base.slice(0, 2))]).flappingRuleIds).toEqual(["C"]);
  });
});

describe("caseAccuracy", () => {
  it("ожидание fail при unconfirmed → промах", () => {
    const r = caseAccuracy([run([{ id: "B", pass: false, unconfirmed: true }])], { fail: ["B"] });
    expect(r).toEqual({ matched: 0, total: 1, misses: [{ ruleId: "B", expected: "fail", got: ["unconfirmed"] }] });
  });
  it("pass / notApplicable совпали", () => {
    const r = caseAccuracy([run(base), run(base)], { pass: ["A"], notApplicable: ["C"] });
    expect(r.matched).toBe(4);
    expect(r.total).toBe(4);
  });
});

describe("summarize", () => {
  it("средняя стабильность, точность, прыгуны, ненадёжные случаи, разброс оценки", () => {
    const flip = [{ id: "A", pass: false }, base[1], base[2]];
    const s = summarize([
      { caseId: "P1", runs: [run(base, { score: 70 }), run(base, { score: 90 })], expect: { pass: ["A"] } },
      { caseId: "N1", runs: [run(base), run(flip, { audit_unreliable: true })], expect: { fail: ["B"] } },
    ]);
    expect(s.stableShare).toBeCloseTo((1 + 2 / 3) / 2);
    expect(s.accuracy).toBe(1);
    expect(s.flappingTop).toEqual([{ ruleId: "A", count: 1 }]);
    expect(s.unreliableCases).toEqual(["N1"]);
    expect(s.scoreSpread).toEqual({ P1: 20, N1: 0 });
  });
});

describe("estimateMinutes", () => {
  it("M × 25 с / concurrency, вверх", () => {
    expect(estimateMinutes(48, 2)).toBe(10);
    expect(estimateMinutes(5, 2)).toBe(2);
  });
});
