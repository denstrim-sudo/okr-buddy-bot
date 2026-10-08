// Серверный пересчёт score по канонической формуле из okr_rules.ts.
// Источник истины для гейтов в UI — не доверяем числу, которое вернула модель.
// Свод правил приведён к методологии банка OKR-PI (тип и статус OKR).

import { findExecutionVerb, hasDigitsInObjective } from "./textGuards.ts";

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
    // OKR-PI 3.4.2: обязателен для направления и квартала; для обычного годового — рекомендация.
    return ctx.horizon === "quarter_3m" || ctx.okr_status === "direction" ? "critical" : "improve";
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
  // Замер стабильности: суждения о наборе KR меняли вердикт между прогонами,
  // поэтому формальные правила считает сервер по тексту и разметке каждого KR.
  "OBJ-NO-NUMBERS": "server",
  "KR-OUTCOME": "server",
  "KR-MEASURABLE": "server",
  "KR-TIMEBOUND": "server",
  "KR-LEADING": "server",
  "OBJ-QUALITATIVE": "quote",
  "OBJ-AMBITIOUS": "quote",
  "KR-QUALITY-PAIR": "quote",
  "KR-LEARNING-FORM": "quote",
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

// ---------- Разметка каждого KR от модели и серверные вердикты ----------

export type KrForm = "range" | "threshold" | "learning" | "execution" | "binary" | "unmeasurable";
export type KrTiming = "leading" | "lagging";
export interface KrLabel {
  index: number;
  perspective?: string;
  form?: KrForm | string;
  timing?: KrTiming | string;
  rationale?: string;
}
const FORMS = new Set(["range", "threshold", "learning", "execution", "binary", "unmeasurable"]);
const TIMINGS = new Set(["leading", "lagging"]);

/** Метки по индексу KR; null — разметка неполная (меньше валидных меток, чем KR). */
function labelsByIndex(labels: unknown, krCount: number, field: "form" | "timing"): Map<number, string> | null {
  const valid = field === "form" ? FORMS : TIMINGS;
  const map = new Map<number, string>();
  (Array.isArray(labels) ? labels : []).forEach((l: KrLabel, i: number) => {
    const v = l?.[field];
    if (typeof v === "string" && valid.has(v)) map.set(typeof l.index === "number" ? l.index : i, v);
  });
  if (krCount <= 0 || map.size < krCount) return null;
  return map;
}

export interface ServerVerdict { pass: boolean; hint: string; evidence: string; unreliable?: boolean }
const UNRELIABLE = (what: string): ServerVerdict =>
  ({ pass: false, hint: `Не удалось разметить ${what} всех KR — проверьте вручную`, evidence: "", unreliable: true });

const FORM_REASON: Record<string, string> = {
  unmeasurable: "нельзя понять, выполнен ли",
  execution: "факт поставки, а не исход",
  binary: "выполнено / не выполнено без градиента",
};

/** OKR-PI 3.4.3/3.4.8: измеримость по форме каждого KR; исполнение и бинарность — только в committed. */
export function computeMeasurable(labels: unknown, krCount: number, ctxOrHorizon?: string | RuleCtx): ServerVerdict {
  const ctx = toCtx(ctxOrHorizon);
  const forms = labelsByIndex(labels, krCount, "form");
  if (!forms) return UNRELIABLE("форму");
  const bad: string[] = [];
  for (const [i, f] of [...forms.entries()].sort((a, b) => a[0] - b[0])) {
    if (f === "unmeasurable" || ((f === "execution" || f === "binary") && ctx.okr_type !== "committed")) {
      bad.push(`KR №${i + 1} — ${FORM_REASON[f]}`);
    }
  }
  if (!bad.length) return { pass: true, hint: "", evidence: "" };
  return { pass: false, evidence: "", hint: `${bad.join("; ")}. Нужна форма «с X до Y», «остаётся выше/ниже X» или «к дате известно, что…, с порогом…»` };
}

/** OKR-PI 3.4.5: достижение — вопрос степени; бинарный KR допустим только в committed. */
export function computeTimebound(labels: unknown, krCount: number, ctxOrHorizon?: string | RuleCtx): ServerVerdict {
  const ctx = toCtx(ctxOrHorizon);
  const forms = labelsByIndex(labels, krCount, "form");
  if (!forms) return UNRELIABLE("форму");
  if (ctx.okr_type === "committed") return { pass: true, hint: "", evidence: "" };
  const bin = [...forms.entries()].filter(([, f]) => f === "binary").map(([i]) => `KR №${i + 1}`).sort();
  if (!bin.length) return { pass: true, hint: "", evidence: "" };
  return { pass: false, evidence: "", hint: `${bin.join(", ")} — бинарный: добавьте градиент прогресса («с X до Y»)` };
}

/** OKR-PI 3.4.2: хотя бы один опережающий KR (применимость — ruleApplicability). */
export const LEADING_RECOMMENDATION_HINT =
  "Рекомендация: добавьте опережающий KR, чтобы видеть движение чаще, чем раз в год, например ежемесячно или по каждому PI";
export function computeLeading(labels: unknown, krCount: number, ctxOrHorizon?: string | RuleCtx): ServerVerdict {
  const ctx = toCtx(ctxOrHorizon);
  const timings = labelsByIndex(labels, krCount, "timing");
  if (!timings) return UNRELIABLE("опережающие/запаздывающие");
  if ([...timings.values()].includes("leading")) return { pass: true, hint: "", evidence: "" };
  if (ctx.okr_status !== "direction" && ctx.horizon !== "quarter_3m") {
    return { pass: false, evidence: "", hint: LEADING_RECOMMENDATION_HINT };
  }
  return { pass: false, evidence: "", hint: "Все KR запаздывающие. Добавьте опережающий KR, который сдвигается раньше результата и позволяет скорректироваться внутри периода" };
}

/** OKR-PI 3.4.8: глаголы исполнения ищет код. Неприменимость для committed+regular — в applyRuleContext. */
export function computeOutcome(krTexts: string[], _ctxOrHorizon?: string | RuleCtx): ServerVerdict {
  const list = Array.isArray(krTexts) ? krTexts : [];
  for (let i = 0; i < list.length; i++) {
    const verb = findExecutionVerb(String(list[i] ?? ""));
    if (verb) {
      return { pass: false, evidence: verb, hint: `KR №${i + 1} описывает работу («${verb}»), а не исход. Сформулируйте, что изменится у клиента или банка` };
    }
  }
  return { pass: true, hint: "", evidence: "" };
}

/** OKR-PI: в Objective нет цифр. evidence — первый фрагмент с цифрой. */
export function computeObjNoNumbers(objective: string): ServerVerdict {
  if (!hasDigitsInObjective(objective)) return { pass: true, hint: "", evidence: "" };
  const frag = String(objective).match(/\S*\d\S*/)?.[0]?.replace(/[.,;:!?]+$/, "") ?? "";
  return { pass: false, evidence: frag, hint: "Уберите цифры из Objective — они место в KR" };
}

const SERVER_RULE_META: Record<string, { label: string; why: string; basis: string }> = {
  "OBJ-NO-NUMBERS": { label: "В Objective нет цифр", why: "Цифры в Objective превращают цель в KPI.", basis: "по тексту Objective" },
  "KR-OUTCOME": { label: "KR — исходы, а не задачи", why: "Выполненная работа не гарантирует изменения у клиента или банка.", basis: "по глаголам исполнения в тексте KR" },
  "KR-MEASURABLE": { label: "Каждый KR измерим", why: "Без измеримой формы нельзя понять, достигнут ли KR.", basis: "по форме каждого KR (kr_perspectives.form)" },
  "KR-TIMEBOUND": { label: "KR с градиентом прогресса", why: "Бинарный KR не показывает степень достижения.", basis: "по форме каждого KR (kr_perspectives.form)" },
  "KR-LEADING": { label: "Есть опережающий KR", why: "Без опережающего KR нельзя скорректироваться внутри периода.", basis: "по разметке опережающий/запаздывающий (kr_perspectives.timing)" },
};
const COMPUTED_IDS = ["KR-COUNT", "KR-REQUIRED-ANGLES", ...Object.keys(SERVER_RULE_META)];

/** Все серверные правила вместо вердиктов модели (вердикты модели по этим id отбрасываются). */
// deno-lint-ignore no-explicit-any
export function addServerRules(rules: any[], krTexts: string[], perspectives: unknown, ctxOrHorizon?: string | RuleCtx, objective = ""): any[] {
  const ctx = toCtx(ctxOrHorizon);
  const list = (Array.isArray(rules) ? rules : []).filter((r) => !COMPUTED_IDS.includes(r?.id));
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
  const verdicts: Record<string, ServerVerdict> = {
    "OBJ-NO-NUMBERS": computeObjNoNumbers(objective),
    "KR-OUTCOME": computeOutcome(krTexts, ctx),
    "KR-MEASURABLE": computeMeasurable(perspectives, krCount, ctx),
    "KR-TIMEBOUND": computeTimebound(perspectives, krCount, ctx),
    "KR-LEADING": computeLeading(perspectives, krCount, ctx),
  };
  for (const [id, v] of Object.entries(verdicts)) {
    const m = SERVER_RULE_META[id];
    list.push({
      id, label: m.label, pass: v.pass, hint: v.hint, evidence: v.evidence,
      severity: severityFor(id, ctx), ...(v.unreliable ? { unreliable: true } : {}),
      why: v.pass ? "" : m.why, reasoning: `Проверяется сервером ${m.basis}.`,
    });
  }
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
