// Серверный пересчёт score по канонической формуле из okr_rules.ts.
// Источник истины для гейтов в UI — не доверяем числу, которое вернула модель.
// Свод правил приведён к методологии банка OKR-PI (тип и статус OKR).

import { findExecutionVerb, hasDigitsInObjective } from "./textGuards.ts";

export type RuleSeverity = "critical" | "important" | "improve";
export type OkrType = "committed" | "aspirational" | "mixed";
export type OkrStatus = "direction" | "regular";
/** Происхождение OKR (обновление OKR-PI от 09.10.2026). */
export type OkrOrigin = "growth_direction" | "protection_direction" | "regular";

export interface RuleCtx {
  horizon?: string;
  okr_type?: OkrType;
  /** Устарело: используется только для совместимости, если okr_origin не передан. */
  okr_status?: OkrStatus;
  okr_origin?: OkrOrigin;
  owner?: string;
  way_known?: boolean;
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

export function normalizeOkrOrigin(v: unknown, legacyStatus?: unknown): OkrOrigin {
  if (v === "growth_direction" || v === "protection_direction" || v === "regular") return v;
  return legacyStatus === "direction" ? "growth_direction" : "regular";
}
export function isDirectionOrigin(o?: OkrOrigin): boolean {
  return o === "growth_direction" || o === "protection_direction";
}

export type NormalizedCtx = RuleCtx & { okr_status: OkrStatus; okr_origin: OkrOrigin; owner: string; way_known: boolean };

/**
 * Совместимость: старая сигнатура (horizon) и новая (ctx).
 * okr_status выводится из okr_origin (direction ⇔ OKR из направления).
 * Для OKR из направления тип принудительно «амбициозный» (обновление OKR-PI, таблица 5.2).
 */
export function toCtx(x?: string | RuleCtx): NormalizedCtx {
  if (x && typeof x === "object") {
    const okr_origin = normalizeOkrOrigin(x.okr_origin, x.okr_status);
    const dir = isDirectionOrigin(okr_origin);
    return {
      horizon: x.horizon,
      okr_type: dir ? "aspirational" : normalizeOkrType(x.okr_type),
      okr_status: dir ? "direction" : "regular",
      okr_origin,
      owner: typeof x.owner === "string" ? x.owner.trim() : "",
      way_known: x.way_known !== false,
    };
  }
  return { horizon: typeof x === "string" ? x : undefined, okr_type: undefined, okr_status: "regular", okr_origin: "regular", owner: "", way_known: true };
}

/** Обязательные ракурсы по происхождению OKR (тип на них не влияет). */
export function requiredAnglesFor(origin?: OkrOrigin): AngleMark[] {
  if (origin === "growth_direction") return ["К", "У"];
  if (origin === "protection_direction") return ["К", "О", "У"];
  return ["К", "О"];
}

/** Номер пункта чек-листа О1–О17 (обновление OKR-PI 09.10.2026). */
export const CHECKLIST_REF: Record<string, string> = {
  "OBJ-QUALITATIVE": "О1, О2",
  "OBJ-NO-NUMBERS": "О2",
  "OBJ-END-STATE": "О3",
  "KR-OUTCOME": "О4",
  "KR-MEASURABLE": "О4, О5",
  "KR-TIMEBOUND": "О5",
  "KR-QUALITY-PAIR": "О6",
  "KR-RISK-NAMED": "О7",
  "OKR-TYPE-DECLARED": "О8",
  "OKR-OWNER": "О9",
  "KR-COUNT": "О15",
  "KR-LEADING": "О13",
  "KR-LEARNING-FORM": "О14",
  "KR-REQUIRED-ANGLES": "О16",
  "OKR-WAY-KNOWN": "О17",
  "OBJ-AMBITIOUS": "доп.",
  "Q-REACH": "доп.",
};
export function checklistRef(id: string, ctxOrHorizon?: string | RuleCtx): string {
  const ctx = toCtx(ctxOrHorizon);
  const dir = isDirectionOrigin(ctx.okr_origin);
  if (id === "KR-COUNT") return dir ? "О11" : "О15";
  if (id === "KR-REQUIRED-ANGLES") return dir ? "5.2" : "О16";
  return CHECKLIST_REF[id] ?? "доп.";
}
/** Ключ сортировки: О1…О17, затем «5.2», затем «доп.». */
export function checklistOrder(ref: string | undefined): number {
  const m = String(ref ?? "").match(/^О(\d+)/);
  if (m) return Number(m[1]);
  if (String(ref).startsWith("5.2")) return 100;
  return 200;
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
  "OBJ-END-STATE": "important",
  "OKR-OWNER": "important",
  "OKR-WAY-KNOWN": "important",
  "KR-RISK-NAMED": "important",
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
    "OBJ-END-STATE",
    "OKR-OWNER",
    "OKR-WAY-KNOWN",
    "KR-COUNT",
    "KR-MEASURABLE",
    "KR-OUTCOME",
    "KR-REQUIRED-ANGLES",
    "KR-QUALITY-PAIR",
    "KR-LEARNING-FORM",
    "KR-LEADING",
    "KR-TIMEBOUND",
    "KR-RISK-NAMED",
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
  "OKR-OWNER": "server",
  "OKR-WAY-KNOWN": "server",
  "KR-RISK-NAMED": "server",
  "OBJ-QUALITATIVE": "quote",
  "OBJ-END-STATE": "quote",
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
  for (const a of requiredAnglesFor(ctx.okr_origin)) if (!has.has(a)) missing.push(a);
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

/** Исключение OKR-PI 3.4.8: обязательный обычный OKR (OKR из направления обязательным не бывает). */
export function isCommittedRegular(ctx: NormalizedCtx): boolean {
  return ctx.okr_type === "committed" && ctx.okr_origin === "regular";
}

/** OKR-PI 3.4.3/3.4.8: измеримость по форме каждого KR; исполнение и бинарность — только в committed. */
export function computeMeasurable(labels: unknown, krCount: number, ctxOrHorizon?: string | RuleCtx): ServerVerdict {
  const ctx = toCtx(ctxOrHorizon);
  const forms = labelsByIndex(labels, krCount, "form");
  if (!forms) return UNRELIABLE("форму");
  const bad: string[] = [];
  for (const [i, f] of [...forms.entries()].sort((a, b) => a[0] - b[0])) {
    if (f === "unmeasurable" || ((f === "execution" || f === "binary") && !isCommittedRegular(ctx))) {
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
  if (isCommittedRegular(ctx)) return { pass: true, hint: "", evidence: "" };
  const bin = [...forms.entries()].filter(([, f]) => f === "binary").map(([i]) => `KR №${i + 1}`).sort();
  if (!bin.length) return { pass: true, hint: "", evidence: "" };
  return { pass: false, evidence: "", hint: `${bin.join(", ")} — бинарный: добавьте градиент прогресса («с X до Y»)` };
}

/** OKR-PI 3.4.2: хотя бы один опережающий KR (применимость — ruleApplicability). */
export const LEADING_RECOMMENDATION_HINT =
  "Рекомендация: добавьте опережающий KR, чтобы видеть движение чаще, чем раз в год, например ежемесячно или по каждому PI";
export const DIRECTION_LEADING_HINT = "О13: нужен опережающий [К] — драйвер с контрольными точками внутри года";
export function computeLeading(labels: unknown, krCount: number, ctxOrHorizon?: string | RuleCtx): ServerVerdict {
  const ctx = toCtx(ctxOrHorizon);
  const timings = labelsByIndex(labels, krCount, "timing");
  if (!timings) return UNRELIABLE("опережающие/запаздывающие");
  if (isDirectionOrigin(ctx.okr_origin)) {
    // О13: для OKR из направления нужен опережающий именно [К].
    const angles = new Map<number, string>();
    (Array.isArray(labels) ? labels : []).forEach((l: KrLabel, i: number) => {
      if (l && typeof l.perspective === "string") angles.set(typeof l.index === "number" ? l.index : i, l.perspective);
    });
    if (angles.size < krCount) return UNRELIABLE("ракурсы");
    const ok = [...timings.entries()].some(([i, t]) => t === "leading" && angles.get(i) === "К");
    return ok ? { pass: true, hint: "", evidence: "" } : { pass: false, evidence: "", hint: DIRECTION_LEADING_HINT };
  }
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
  "OKR-OWNER": { label: "Владелец OKR назван", why: "Без владельца OKR некому отвечать за результат.", basis: "по полю «Владелец»" },
  "OKR-WAY-KNOWN": { label: "Способ достижения известен", why: "Обычный OKR без известного способа — это защитное направление.", basis: "по признаку «Способ достижения известен»" },
  "KR-RISK-NAMED": { label: "Для каждого [О] назван риск", why: "Порог без названного риска не защищает ни от чего конкретного.", basis: "по разметке kr_perspectives.guards_against" },
  "KR-LEADING": { label: "Есть опережающий KR", why: "Без опережающего KR нельзя скорректироваться внутри периода.", basis: "по разметке опережающий/запаздывающий (kr_perspectives.timing)" },
};
const COMPUTED_IDS = ["KR-COUNT", "KR-REQUIRED-ANGLES", "OKR-OWNER", "OKR-WAY-KNOWN", "KR-RISK-NAMED", ...Object.keys(SERVER_RULE_META)];

export const OWNER_HINT = "О9: назовите владельца поимённо";
export const WAY_UNKNOWN_HINT = "О17: способ неизвестен — кандидат возвращается на проверку как защитное направление";

/** О9: владелец назван. */
export function computeOwner(ctxOrHorizon?: string | RuleCtx): ServerVerdict {
  const ctx = toCtx(ctxOrHorizon);
  return ctx.owner ? { pass: true, hint: "", evidence: "" } : { pass: false, hint: OWNER_HINT, evidence: "" };
}
/** О17: способ достижения известен (применимость — только regular, см. ruleApplicability). */
export function computeWayKnown(ctxOrHorizon?: string | RuleCtx): ServerVerdict {
  const ctx = toCtx(ctxOrHorizon);
  return ctx.way_known ? { pass: true, hint: "", evidence: "" } : { pass: false, hint: WAY_UNKNOWN_HINT, evidence: "" };
}
/** О7: у каждого KR с ракурсом [О] назван риск (guards_against). */
export function computeRiskNamed(labels: unknown, krCount: number): ServerVerdict {
  const list = (Array.isArray(labels) ? labels : []) as Array<KrLabel & { guards_against?: unknown }>;
  const byIndex = new Map<number, KrLabel & { guards_against?: unknown }>();
  list.forEach((l, i) => {
    if (l && (l.perspective === "К" || l.perspective === "О" || l.perspective === "У")) byIndex.set(typeof l.index === "number" ? l.index : i, l);
  });
  if (krCount <= 0 || byIndex.size < krCount) return UNRELIABLE("ракурсы");
  const bad = [...byIndex.entries()]
    .filter(([, l]) => l.perspective === "О" && !(typeof l.guards_against === "string" && l.guards_against.trim()))
    .map(([i]) => i).sort((a, b) => a - b).map((i) => `KR №${i + 1}`);
  if (!bad.length) return { pass: true, hint: "", evidence: "" };
  return { pass: false, evidence: "", hint: `О7: для ${bad.join(", ")} не назван риск — от какого конкретного ухудшения защищает этот [О]` };
}

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
    "OKR-OWNER": computeOwner(ctx),
    "OKR-WAY-KNOWN": computeWayKnown(ctx),
    "KR-RISK-NAMED": computeRiskNamed(perspectives, krCount),
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
  if (id === "KR-OUTCOME" && isCommittedRegular(ctx)) return "not_applicable";
  if (id === "OKR-WAY-KNOWN" && ctx.okr_origin !== "regular") return "not_applicable";
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
      return { ...r, severity, pass: true, applicable: false, checklist_ref: checklistRef(id, ctx) };
    }
    return { ...r, severity, applicable: true, checklist_ref: checklistRef(id, ctx) };
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
    checklist_ref: checklistRef("OKR-TYPE-DECLARED", ctx),
  });
  return out;
}
