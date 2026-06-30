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

/**
 * true, если |modelScore - recomputed| > 10.
 * Используется как триггер серверной подмены score: чтобы не дёргать UI
 * на мелких округлениях модели, но ловить системные расхождения с формулой.
 */
export function scoreDiscrepancy(modelScore: number, recomputed: number): boolean {
  return Math.abs(modelScore - recomputed) > 10;
}

/**
 * Канонический id → severity для правил из okr_rules.ts.
 * Источник правды — BASE_RULES и QUARTER-SPECIFIC overrides в okr_rules.ts.
 */
export const SEVERITY_BY_RULE_ID: Record<string, RuleSeverity> = {
  O1: "important",
  O2: "important",
  O3: "critical",
  KR1: "critical",
  KR2: "critical",
  KR3: "critical",
  KR4: "important",
  KR10: "important",
  // quarter-only:
  "Q-Focus": "important",
  "Q-Theme": "improve",
  "Q-Reach": "important",
};

/**
 * Резолвит severity по id правила c учётом horizon-override.
 * Для quarter_3m KR10 повышается до critical (см. OKR_RULES_BLOCK_QUARTER).
 */
export function severityFor(ruleId: string, horizon?: string): RuleSeverity {
  if (horizon === "quarter_3m" && ruleId === "KR10") return "critical";
  return SEVERITY_BY_RULE_ID[ruleId] ?? "improve";
}

/** Полный список known rule ids для горизонта — нужен draft-okr, чтобы из self_audit собрать псевдо-rules. */
export function knownRuleIdsFor(horizon?: string): string[] {
  const base = ["O1", "O2", "O3", "KR1", "KR2", "KR3", "KR4", "KR10"];
  return horizon === "quarter_3m" ? [...base, "Q-Focus", "Q-Theme", "Q-Reach"] : base;
}
