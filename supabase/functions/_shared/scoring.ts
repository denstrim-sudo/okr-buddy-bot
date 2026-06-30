// Серверный пересчёт score по канонической формуле из okr_rules.ts.
// Источник истины для гейтов в UI — не доверяем числу, которое вернула модель.

export type RuleSeverity = "critical" | "important" | "improve";

export interface ScoringRule {
  id?: string;
  pass: boolean;
  severity?: RuleSeverity | string;
}

const WEIGHTS: Record<RuleSeverity, number> = {
  critical: 3,
  important: 2,
  improve: 1,
};

const CRITICAL_FAIL_CAP = 60;

function weightOf(sev: ScoringRule["severity"]): number {
  if (sev === "critical" || sev === "important" || sev === "improve") {
    return WEIGHTS[sev];
  }
  // Неизвестная/отсутствующая severity трактуется как самая мягкая.
  return WEIGHTS.improve;
}

/**
 * Считает overall score (0..100) по правилам аудита.
 * weights: critical=3, important=2, improve=1.
 * score = round(100 * sum(weights of passed) / sum(weights of all)).
 * Жёсткий потолок: если есть хотя бы одно правило с pass=false и severity="critical",
 * итог не может превысить 60.
 */
export function recomputeScore(rules: ScoringRule[]): number {
  if (!Array.isArray(rules) || rules.length === 0) return 0;

  let totalWeight = 0;
  let passedWeight = 0;
  let hasCriticalFail = false;

  for (const r of rules) {
    const w = weightOf(r.severity);
    totalWeight += w;
    if (r.pass) passedWeight += w;
    else if (r.severity === "critical") hasCriticalFail = true;
  }

  if (totalWeight === 0) return 0;

  const raw = Math.round((100 * passedWeight) / totalWeight);
  return hasCriticalFail ? Math.min(raw, CRITICAL_FAIL_CAP) : raw;
}
