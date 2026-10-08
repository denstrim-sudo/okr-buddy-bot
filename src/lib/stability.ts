// Чистые функции замера стабильности аудита (validate-okr) на эталонном наборе.

export type RuleState = "pass" | "fail" | "n/a" | "unconfirmed" | "unreliable";

export interface AuditRule {
  id: string;
  pass?: boolean;
  applicable?: boolean;
  unconfirmed?: boolean;
  unreliable?: boolean;
}
export interface AuditRun {
  score?: number;
  rules?: AuditRule[];
  audit_unreliable?: boolean;
  [k: string]: unknown;
}
export interface CaseExpect {
  pass?: string[];
  fail?: string[];
  notApplicable?: string[];
}
export interface CaseResult {
  caseId: string;
  runs: AuditRun[];
  expect: CaseExpect;
}

export function ruleState(rule: AuditRule | undefined): RuleState | undefined {
  if (!rule) return undefined;
  if (rule.applicable === false) return "n/a";
  if (rule.unreliable === true) return "unreliable";
  if (rule.unconfirmed === true) return "unconfirmed";
  return rule.pass ? "pass" : "fail";
}

const ruleOf = (run: AuditRun, id: string) => (run.rules ?? []).find((r) => r.id === id);

export function allRuleIds(runs: AuditRun[]): string[] {
  const ids: string[] = [];
  for (const run of runs) for (const r of run.rules ?? []) if (!ids.includes(r.id)) ids.push(r.id);
  return ids;
}

export function caseStability(runs: AuditRun[]): { stableShare: number; flappingRuleIds: string[] } {
  const ids = allRuleIds(runs);
  if (ids.length === 0 || runs.length === 0) return { stableShare: 0, flappingRuleIds: [] };
  const flapping: string[] = [];
  for (const id of ids) {
    const states = runs.map((run) => ruleState(ruleOf(run, id)));
    if (states.some((s) => s === undefined) || new Set(states).size > 1) flapping.push(id);
  }
  return { stableShare: (ids.length - flapping.length) / ids.length, flappingRuleIds: flapping };
}

export function caseAccuracy(
  runs: AuditRun[],
  expect: CaseExpect,
): { matched: number; total: number; misses: Array<{ ruleId: string; expected: string; got: string[] }> } {
  const checks: Array<[string, RuleState]> = [
    ...(expect.pass ?? []).map((id) => [id, "pass"] as [string, RuleState]),
    ...(expect.fail ?? []).map((id) => [id, "fail"] as [string, RuleState]),
    ...(expect.notApplicable ?? []).map((id) => [id, "n/a"] as [string, RuleState]),
  ];
  let matched = 0;
  let total = 0;
  const misses: Array<{ ruleId: string; expected: string; got: string[] }> = [];
  for (const [id, want] of checks) {
    const got = runs.map((run) => ruleState(ruleOf(run, id)) ?? "нет");
    total += runs.length;
    const ok = got.filter((g) => g === want).length;
    matched += ok;
    if (ok < runs.length) misses.push({ ruleId: id, expected: want, got });
  }
  return { matched, total, misses };
}

export function scoreSpread(runs: AuditRun[]): number {
  const s = runs.map((r) => r.score).filter((x): x is number => typeof x === "number");
  return s.length ? Math.max(...s) - Math.min(...s) : 0;
}

export function summarize(results: CaseResult[]) {
  const withRuns = results.filter((r) => r.runs.length > 0);
  const stab = withRuns.map((r) => caseStability(r.runs));
  const stableShare = stab.length ? stab.reduce((a, s) => a + s.stableShare, 0) / stab.length : 0;
  let matched = 0;
  let total = 0;
  for (const r of withRuns) {
    const a = caseAccuracy(r.runs, r.expect);
    matched += a.matched;
    total += a.total;
  }
  const counts = new Map<string, number>();
  for (const s of stab) for (const id of s.flappingRuleIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const flappingTop = [...counts.entries()]
    .map(([ruleId, count]) => ({ ruleId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  return {
    stableShare,
    accuracy: total ? matched / total : 0,
    flappingTop,
    unreliableCases: withRuns.filter((r) => r.runs.some((x) => x.audit_unreliable === true)).map((r) => r.caseId),
    scoreSpread: Object.fromEntries(withRuns.map((r) => [r.caseId, scoreSpread(r.runs)])) as Record<string, number>,
  };
}

export function estimateMinutes(calls: number, concurrency: number): number {
  return Math.ceil((calls * 25) / Math.max(1, concurrency) / 60);
}
