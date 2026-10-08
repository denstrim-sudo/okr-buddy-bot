// Серверный пересчёт score по канонической формуле из okr_rules.ts.
// Источник истины для гейтов в UI — не доверяем числу, которое вернула модель.
// Свод правил приведён к методологии банка OKR-PI (тип и статус OKR).

export type RuleSeverity = "critical" | "important" | "improve";
export type OkrType = "committed" | "aspirational" | "mixed";
export type OkrStatus = "direction" | "regular";

export interface RuleCtx {
  horizon?: string;
  okr_type?: OkrType;
  okr_status?: OkrStatus;
}

export interface ScoringRule {
  id?: string;
  pass: boolean;
  severity?: RuleSeverity | string;
  /** false — правило неприменимо к типу/статусу OKR и в score не учитывается. */
  applicable?: boolean;
  /** true — провал без цитаты: показывается, но в score не учитывается. */
  unconfirmed?: boolean;
  /** true — сервер не смог надёжно проверить правило; в score не учитывается. */
  unreliable?: boolean;
}

export function normalizeOkrType(v: unknown): OkrType | undefined {
  return v === "committed" || v === "aspirational" || v === "mixed" ? v : undefined;
}
export function normalizeOkrStatus(v: unknown): OkrStatus {
  return v === "direction" ? "direction" : "regular";
}

/** Совместимость: старая сигнатура (horizon) и новая (ctx). */
export function toCtx(x?: string | RuleCtx): Required<Pick<RuleCtx, "okr_status">> & RuleCtx {
  if (x && typeof x === "object") {
    return { horizon: x.horizon, okr_type: normalizeOkrType(x.okr_type), okr_status: normalizeOkrStatus(x.okr_status) };
  }
  return { horizon: typeof x === "string" ? x : undefined, okr_type: undefined, okr_status: "regular" };
}

const WEIGHTS: Record<RuleSeverity, number> = { critical: 3, important: 2, improve: 1 };
const CRITICAL_FAIL_CAP = 60;

function weightOf(sev: ScoringRule["severity"]): number {
  if (sev === "critical" || sev === "important" || sev === "improve") return WEIGHTS[sev];
  return WEIGHTS.improve;
}

/**
 * score = round(100 * sum(weights of passed) / sum(weights of all)), веса 3/2/1.
 * Потолок 60 при ≥1 critical fail. Правила с applicable=false пропускаются.
 */
export function recomputeScore(rules: ScoringRule[]): number {
  if (!Array.isArray(rules) || rules.length === 0) return 0;
  let totalWeight = 0;
  let passedWeight = 0;
  let hasCriticalFail = false;
  for (const r of rules) {
    if (r.applicable === false || r.unconfirmed === true || r.unreliable === true) continue;
    const w = weightOf(r.severity);
    totalWeight += w;
    if (r.pass) passedWeight += w;
    else if (r.severity === "critical") hasCriticalFail = true;
  }
  if (totalWeight === 0) return 0;
  const raw = Math.round((100 * passedWeight) / totalWeight);
  return hasCriticalFail ? Math.min(raw, CRITICAL_FAIL_CAP) : raw;
}

/** true, если |modelScore - recomputed| > 10. */
export function scoreDiscrepancy(modelScore: number, recomputed: number): boolean {
  return Math.abs(modelScore - recomputed) > 10;
}

/**
 * Базовая severity по id (OKR-PI). Контекстные повышения — в severityFor.
 * Идентификаторы правил — ИМЕНА ПРАВИЛ, НЕ номера KR пользователя.
 */
export const SEVERITY_BY_RULE_ID: Record<string, RuleSeverity> = {
  "OKR-TYPE-DECLARED": "important",
  "OBJ-NO-NUMBERS": "critical",
  "OBJ-QUALITATIVE": "important",
  "OBJ-AMBITIOUS": "important",
  "KR-COUNT": "important",
  "KR-MEASURABLE": "critical",
  "KR-OUTCOME": "critical",
  "KR-REQUIRED-ANGLES": "important",
  "KR-QUALITY-PAIR": "important",
  "KR-LEARNING-FORM": "important",
  "KR-LEADING": "important",
  "KR-TIMEBOUND": "important",
  "Q-REACH": "important",
};

export function severityFor(ruleId: string, ctxOrHorizon?: string | RuleCtx): RuleSeverity {
  const ctx = toCtx(ctxOrHorizon);
  if (ruleId === "KR-REQUIRED-ANGLES") return ctx.okr_status === "direction" ? "critical" : "important";
  if (ruleId === "KR-LEADING") {
    return ctx.horizon === "quarter_3m" || ctx.okr_status === "direction" ? "critical" : "important";
  }
  return SEVERITY_BY_RULE_ID[ruleId] ?? "improve";
}

/** Полный список правил для контекста (включая серверное OKR-TYPE-DECLARED). */
export function knownRuleIdsFor(ctxOrHorizon?: string | RuleCtx): string[] {
  const ctx = toCtx(ctxOrHorizon);
  const ids = [
    "OKR-TYPE-DECLARED",
    "OBJ-NO-NUMBERS",
    "OBJ-QUALITATIVE",
    "KR-COUNT",
    "KR-MEASURABLE",
    "KR-OUTCOME",
    "KR-REQUIRED-ANGLES",
    "KR-QUALITY-PAIR",
    "KR-LEARNING-FORM",
    "KR-LEADING",
    "KR-TIMEBOUND",
  ];
  if (ctx.okr_type === "aspirational" || ctx.okr_type === "mixed") ids.push("OBJ-AMBITIOUS");
  if (ctx.horizon === "quarter_3m") ids.push("Q-REACH");
  return ids;
}

/** Правила, которые оценивает модель (без серверного OKR-TYPE-DECLARED). */
export function modelRuleIdsFor(ctxOrHorizon?: string | RuleCtx): string[] {
  return knownRuleIdsFor(ctxOrHorizon).filter((id) => RULE_EVIDENCE_KIND[id] !== "server");
}

/**
 * Вид доказательства провала: quote — дословная цитата из OKR;
 * absence — провал означает отсутствие нужного KR (цитировать нечего);
 * server — правило считает сервер.
 */
export type EvidenceKind = "quote" | "absence" | "server";
export const RULE_EVIDENCE_KIND: Record<string, EvidenceKind> = {
  "OKR-TYPE-DECLARED": "server",
  "KR-COUNT": "server",
  "KR-REQUIRED-ANGLES": "server",
  "KR-LEADING": "absence",
  "OBJ-NO-NUMBERS": "quote",
  "OBJ-QUALITATIVE": "quote",
  "OBJ-AMBITIOUS": "quote",
  "KR-MEASURABLE": "quote",
  "KR-OUTCOME": "quote",
  "KR-QUALITY-PAIR": "quote",
  "KR-LEARNING-FORM": "quote",
  "KR-TIMEBOUND": "quote",
  "Q-REACH": "quote",
};
export function evidenceKindOf(id: string): EvidenceKind {
  return RULE_EVIDENCE_KIND[id] ?? "quote";
}

/** OKR-PI 3.4.1: число непустых KR в диапазоне статуса. */
export function computeKrCount(krTexts: string[], ctxOrHorizon?: string | RuleCtx): { pass: boolean; hint: string; evidence: string } {
  const ctx = toCtx(ctxOrHorizon);
  const k = (Array.isArray(krTexts) ? krTexts : []).filter((t) => String(t ?? "").trim().length > 0).length;
  const [min, max] = ctx.okr_status === "direction" ? [2, 4] : [3, 5];
  if (k >= min && k <= max) return { pass: true, hint: "", evidence: "" };
  const who = ctx.okr_status === "direction" ? "направления" : "обычного OKR";
  let hint = `Для ${who} нужно от ${min} до ${max} KR, сейчас ${k}`;
  if (k > max) hint += ". Пятый и далее — признак того, что в набор попал перечень работ (OKR-PI 3.4.1)";
  return { pass: false, hint, evidence: "" };
}

export type AngleMark = "К" | "О" | "У";
const ANGLE_HINT: Record<string, string> = {
  "К": "Не хватает ракурса [К] — результат для клиента и банка: «с X до Y»",
  "О": "Не хватает ракурса [О] — удержание порога: «остаётся выше/ниже X»",
  "У": "Не хватает ракурса [У] — обучение: «К [дата] известно, [что], с порогом [какой]»",
  "О или У": "Не хватает ракурса [О] или [У] — удержание порога «остаётся выше/ниже X» или обучение «К [дата] известно, [что], с порогом [какой]»",
};

/** OKR-PI 3.3: обязательные ракурсы по разметке kr_perspectives от модели. */
export function computeRequiredAngles(
  perspectives: unknown,
  krCount: number,
  ctxOrHorizon?: string | RuleCtx,
): { pass: boolean; applicable: boolean; missing: string[]; hint: string; unreliable?: boolean } {
  const ctx = toCtx(ctxOrHorizon);
  if (ctx.okr_type === undefined) return { pass: true, applicable: false, missing: [], hint: "" };
  const list = (Array.isArray(perspectives) ? perspectives : []) as Array<{ index?: number; perspective?: string }>;
  const byIndex = new Map<number, string>();
  list.forEach((p, i) => {
    if (p && (p.perspective === "К" || p.perspective === "О" || p.perspective === "У")) {
      byIndex.set(typeof p.index === "number" ? p.index : i, p.perspective);
    }
  });
  if (byIndex.size === 0 || byIndex.size < krCount) {
    return { pass: false, applicable: true, missing: [], unreliable: true, hint: "Не удалось разметить ракурсы всех KR — проверьте вручную" };
  }
  const has = new Set(byIndex.values());
  const missing: string[] = [];
  if (ctx.okr_type === "aspirational") { for (const a of ["К", "У"]) if (!has.has(a)) missing.push(a); }
  else if (ctx.okr_type === "committed") { for (const a of ["К", "О"]) if (!has.has(a)) missing.push(a); }
  else {
    if (!has.has("К")) missing.push("К");
    if (!has.has("О") && !has.has("У")) missing.push("О или У");
  }
  return { pass: missing.length === 0, applicable: true, missing, hint: missing.map((m) => ANGLE_HINT[m]).join(". ") };
}

/** Серверные правила KR-COUNT и KR-REQUIRED-ANGLES вместо вердиктов модели. */
// deno-lint-ignore no-explicit-any
export function addServerRules(rules: any[], krTexts: string[], perspectives: unknown, ctxOrHorizon?: string | RuleCtx): any[] {
  const ctx = toCtx(ctxOrHorizon);
  const list = (Array.isArray(rules) ? rules : []).filter((r) => r?.id !== "KR-COUNT" && r?.id !== "KR-REQUIRED-ANGLES");
  const krCount = (krTexts ?? []).filter((t) => String(t ?? "").trim()).length;
  const c = computeKrCount(krTexts, ctx);
  const a = computeRequiredAngles(perspectives, krCount, ctx);
  list.push({
    id: "KR-COUNT", label: "Число KR в допустимом диапазоне", pass: c.pass, hint: c.hint, evidence: "",
    severity: severityFor("KR-COUNT", ctx), why: c.pass ? "" : "Слишком много или мало KR размывает фокус.",
    reasoning: "Проверяется сервером по числу KR.",
  });
  list.push({
    id: "KR-REQUIRED-ANGLES", label: "Обязательные ракурсы KR", pass: a.pass, hint: a.hint, evidence: "",
    severity: severityFor("KR-REQUIRED-ANGLES", ctx), missing: a.missing,
    ...(a.unreliable ? { unreliable: true } : {}),
    why: a.pass ? "" : "Без обязательных ракурсов рост достигается за счёт клиента, риска или без проверки гипотез.",
    reasoning: "Проверяется сервером по разметке ракурсов kr_perspectives.",
  });
  return list;
}

/**
 * OKR-PI 3.4.8: исполнение допустимо только в обязательных обычных OKR
 * (в направлениях запрещено всегда). Ракурсы без объявленного типа не проверить.
 */
export function ruleApplicability(id: string, ctxOrHorizon?: string | RuleCtx): "applies" | "not_applicable" {
  const ctx = toCtx(ctxOrHorizon);
  if (id === "KR-REQUIRED-ANGLES" && ctx.okr_type === undefined) return "not_applicable";
  if (id === "KR-OUTCOME" && ctx.okr_type === "committed" && ctx.okr_status === "regular") return "not_applicable";
  return "applies";
}

export const TYPE_NOT_DECLARED_HINT =
  "Объявите тип OKR: обязательный или амбициозный. Тип объявляется при планировании, а не задним числом";

/**
 * Серверная постобработка правил: каноническая severity, применимость,
 * детерминированное OKR-TYPE-DECLARED. Не меняет pass применимых правил.
 */
// deno-lint-ignore no-explicit-any
export function applyRuleContext(rules: any[], ctxOrHorizon?: string | RuleCtx): any[] {
  const ctx = toCtx(ctxOrHorizon);
  const list = (Array.isArray(rules) ? rules : []).filter((r) => r?.id !== "OKR-TYPE-DECLARED");
  const out = list.map((r) => {
    const id = typeof r?.id === "string" ? r.id : "";
    const severity = severityFor(id, ctx);
    if (ruleApplicability(id, ctx) === "not_applicable") {
      return { ...r, severity, pass: true, applicable: false };
    }
    return { ...r, severity, applicable: true };
  });
  const declared = ctx.okr_type !== undefined;
  out.unshift({
    id: "OKR-TYPE-DECLARED",
    label: "Тип OKR объявлен",
    pass: declared,
    severity: severityFor("OKR-TYPE-DECLARED", ctx),
    applicable: true,
    hint: declared ? "" : TYPE_NOT_DECLARED_HINT,
    why: declared ? "" : "От типа зависят обязательные ракурсы и допустимость KR исполнения.",
    evidence: "",
    reasoning: "Проверяется сервером по объявленному типу OKR.",
  });
  return out;
}
