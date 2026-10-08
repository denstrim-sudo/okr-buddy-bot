// Модуль 1.1: варианты OKR — это ОГРАНИЧЕНИЯ, которые держат результат («куда бьём»),
// а не ракурсы. Ракурсы К/О/У — метки KR внутри каждого варианта (OKR-PI 3.3).

export type Angle = "К" | "О" | "У";

export interface Fact { id: string; statement: string; source: string; source_unverified?: boolean }
export interface Tension { id: string; gap: string; who_affected: string; evidence_fact_ids: string[] }
export interface BoundaryCondition { statement: string; how_to_work_around: string }
export interface ReframedSolution { original: string; why_not_constraint: string; question: string }

export interface Variant {
  id: string;
  origin: "group" | "suggested";
  strike_at: string;
  where_it_holds: { lever: string; step: string };
  evidence: { status: "data" | "hypothesis"; what_shows: string; data_needed: string };
  if_removed: { lever_change: string; effect_formula: string; next_constraint: string };
  hypothesis: { if: string; then: string; because: string };
  refutation: { signal: string; by_when: string };
  narrowing: string;
  objective_sketch: string;
  kr_directions: Array<{ text: string; angle: Angle }>;
  supports_fact_ids: string[];
  addresses_tension_ids: string[];
  key_risk: string;
  unknowns: string[];
  solution_in_disguise?: boolean;
  effect_unverified?: boolean;
  is_boundary?: boolean;
}

export interface Reasoning {
  facts: Fact[];
  tensions: Tension[];
  lever_tree: string;
  boundary_conditions: BoundaryCondition[];
  reframed_solutions: ReframedSolution[];
  variants: Variant[];
  choice_question: string;
  discriminating_data: string[];
  lever_label?: string;
}

export interface ReasoningQuality {
  variants_count: number;
  distinct_constraints: boolean;
  unsupported_variant_ids: string[];
  solution_in_disguise_ids: string[];
  angles_incomplete_ids: string[];
  no_narrowing_ids: string[];
  missing_next_constraint_ids: string[];
  suggested_count?: number;
  boundary_variant_ids?: string[];
}
export type ReasoningWarning = "variants_not_distinct" | "too_few_variants" | "too_many_suggested";
export interface NormalizedReasoning { reasoning: Reasoning; quality: ReasoningQuality; warning?: ReasoningWarning }

export interface NormalizeOptions {
  docNames?: string[];
  /** raw_input + extra_context + known_constraints — где искать числа. */
  haystack?: string;
  /** Передан ли список ограничений группы (включает лимит suggested). */
  knownConstraints?: string[];
}

export const REASONING_RULES = `REASONING (поле reasoning заполняется ПЕРВЫМ — рассуждение до выводов):
- facts: 3–10 конкретных фактов из источников (числа, сегменты, продукты, сроки). ЗАПРЕЩЕНЫ общие фразы. source = "input", "doc:<точное имя документа из заголовка блока --- имя --->" или "assumption".
- tensions: 1–4 разрыва «как есть / как нужно», с evidence_fact_ids и тем, кого затрагивает.
- Варианты — это 2–3 РАЗНЫХ ОГРАНИЧЕНИЯ, которые сейчас держат результат (куда бьём). НЕ делай варианты по ракурсам клиент / риски / обучение: ракурсы — метки KR ВНУТРИ каждого варианта.
- Сначала разложи целевой показатель на слагаемые формулой с переменными (lever_tree), например «Доход = Клиенты × Проникновение × Доход на продукт». Затем найди ограничения.
- Ограничение — это СОСТОЯНИЕ РЕАЛЬНОСТИ (клиент не видит, процесс требует, сотрудник не может), а НЕ отсутствие решения. «Нет единого профиля», «не внедрена CRM» — это решения в маске ограничения: вынеси их в reframed_solutions с вопросом, какое состояние клиента или процесса они должны изменить.
- Ограничения, которые за год не снять (правовые, регуляторные, разные юрлица), вынеси в boundary_conditions с тем, как их обойти. Вариантами они НЕ становятся.
- Каждое утверждение из ввода попадает РОВНО в одну корзину: вариант (устранимое ограничение), boundary_conditions (неустранимое за год) или reframed_solutions (описывает отсутствие решения). Правовое ограничение — это boundary_condition, а не решение в маске.
- Для каждого варианта:
  • strike_at — куда бьём: ограничение как состояние реальности;
  • where_it_holds — какой показатель и на каком шаге держит ограничение;
  • evidence — какие данные показывают, что это узкое место; если данных нет, status = hypothesis и напиши, какие данные нужны;
  • if_removed — насколько вырастет показатель, ПОКА НЕ УПРЁТСЯ в следующее ограничение; effect_formula — как прирост переходит в целевой показатель, с переменными; next_constraint обязателен: эффекты ограничений не складываются;
  • hypothesis — «если устраним [ограничение], то [показатель] сдвинется, потому что [механизм]»;
  • refutation — какой сигнал и к какому сроку покажет, что ограничение не было узким местом;
  • narrowing — что выпадает из фокуса, если бить сюда («ничего» — признак проблемы);
  • objective_sketch — качественный набросок Objective без цифр и без способа;
  • kr_directions — 3–4 направления метрик без целевых чисел, с меткой ракурса angle (К / О / У); в каждом варианте обязательно есть К и У.
- objective_sketch и kr_directions соответствуют горизонту (strategic_3y — 3 года, block_12m — год, quarter_3m — квартал). Если передан PARENT KEY RESULT — каждый вариант должен явно продвигать именно его.
- Если передан список ограничений группы — строй варианты из него (origin = group) и добавь не больше одного своего (origin = suggested), только если видишь узкое место, которого в списке нет. Без списка все варианты origin = suggested.
- В режиме rewrite_existing V1 = ограничение, в которое бьёт исходный OKR, остальные — альтернативы.
- choice_question — ОДИН вопрос: какое ограничение держит сильнее сейчас. discriminating_data — 1–3 вида данных банка, которые это покажут.
- clarifying_questions — про то, что сильнее всего влияет на выбор между ограничениями.
- НЕ придумывай цифры банка. Число допустимо, только если оно есть во вводе или документах; иначе X и Y.`;

/** Подпись уровня показателя для будущего экрана вариантов. */
export function leverLabel(horizon?: string): string {
  if (horizon === "strategic_3y") return "эффект в доходе";
  if (horizon === "quarter_3m") return "показатель способа";
  return "показатель направления";
}

export function extractDocNames(extra_context?: string | null): string[] {
  if (typeof extra_context !== "string" || !extra_context) return [];
  const out: string[] = [];
  for (const m of extra_context.matchAll(/^---\s+(.+?)\s+---\s*$/gm)) {
    const name = m[1].trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

export function normalizeText(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/["'«»„“”‘’`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const DISGUISE_MARKERS = [
  "отсутству", "нет единого", "нет системы", "нет инструмента", "нет платформы", "нет crm", "нет профиля",
  "не внедрен", "не реализован", "не построен", "не автоматизирован", "нужно внедрить", "нужно создать",
];

/** true, если формулировка описывает отсутствие решения, а не ограничение. */
export function isSolutionInDisguise(s: unknown): boolean {
  const t = normalizeText(s);
  return DISGUISE_MARKERS.some((m) => t.includes(m));
}

/** Нормализованные числа: «45 %»→"45", «1 000»→"1000", «0,8»→"0.8". */
export function extractNumbers(s: unknown): string[] {
  const text = String(s ?? "");
  const out: string[] = [];
  for (const m of text.matchAll(/\d+(?:[\s\u00a0\u202f]\d{3})*(?:[.,]\d+)?/g)) {
    const n = m[0].replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

/** Убирает числа, которые не являются фактами банка: годы, кварталы, PI, номера KR. */
export function stripNonFactNumbers(s: unknown): string {
  return String(s ?? "")
    .replace(/(?<!\d)(?:202\d|203[0-5])(?!\d)/g, " ")
    .replace(/(?:\bQ|\bPI\s|квартал\s)\s*\d+/giu, " ")
    .replace(/\d+(?:\s+квартал|\s+PI\b)/giu, " ")
    .replace(/\bKR\s*(?:№\s*)?[1-4](?!\d)/giu, " ");
}

export function hasUnknownNumber(s: unknown, known: Set<string>): boolean {
  const nums = extractNumbers(stripNonFactNumbers(s));
  return nums.length > 0 && nums.some((n) => !known.has(n));
}

/** Совпадение утверждений: одно содержит другое ИЛИ доля общих слов (≥4 символов) ≥ 0.6 от меньшей строки. */
export function sameStatement(a: unknown, b: unknown): boolean {
  const x = normalizeText(a).replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const y = normalizeText(b).replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  if (!x || !y) return false;
  if (x.includes(y) || y.includes(x)) return true;
  const words = (t: string) => new Set(t.split(" ").filter((w) => w.length >= 4));
  const wx = words(x), wy = words(y);
  const [small, big] = wx.size <= wy.size ? [wx, wy] : [wy, wx];
  if (small.size === 0) return false;
  let common = 0;
  for (const w of small) if (big.has(w)) common++;
  return common / small.size >= 0.6;
}

/** Одно утверждение — одна корзина: boundary_conditions приоритетнее reframed_solutions; варианты-границы помечаются. */
export function dedupeBuckets(n: NormalizedReasoning): NormalizedReasoning {
  const bounds = n.reasoning.boundary_conditions.map((b) => b?.statement);
  const isBound = (t: unknown) => bounds.some((b) => sameStatement(b, t));
  const reframed = n.reasoning.reframed_solutions.filter((r) => !isBound(r?.original));
  const variants = n.reasoning.variants.map((v) => (isBound(v?.strike_at) ? { ...v, is_boundary: true } : v));
  const boundaryIds = variants.filter((v) => v.is_boundary).map((v) => v.id);
  return {
    ...n,
    reasoning: { ...n.reasoning, reframed_solutions: reframed, variants },
    quality: { ...n.quality, boundary_variant_ids: boundaryIds },
  };
}

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const NO_NARROWING = new Set(["", "ничего", "никакая", "никакой", "нет"]);

function toOptions(x?: string[] | NormalizeOptions): NormalizeOptions {
  return Array.isArray(x) ? { docNames: x } : (x ?? {});
}

export function normalizeReasoning(raw: unknown, optsIn?: string[] | NormalizeOptions): NormalizedReasoning {
  const opts = toOptions(optsIn);
  const docNames = opts.docNames ?? [];
  const known = opts.haystack !== undefined ? new Set(extractNumbers(opts.haystack)) : null;
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Reasoning>;

  const facts: Fact[] = arr<Fact>(r.facts).map((f) => {
    const src = str(f?.source).trim();
    if (src === "assumption") return { ...f, source: src };
    const verifiedSource = src === "input" || (src.startsWith("doc:") && docNames.includes(src.slice(4).trim()));
    if (!verifiedSource) return { ...f, source: "assumption", source_unverified: true };
    if (known && hasUnknownNumber(f?.statement, known)) return { ...f, source: src, source_unverified: true };
    return { ...f, source: src };
  });
  const factIds = new Set(facts.map((f) => f.id));
  const tensions: Tension[] = arr<Tension>(r.tensions).map((t) => ({
    ...t,
    evidence_fact_ids: arr<string>(t?.evidence_fact_ids).filter((id) => factIds.has(id)),
  }));
  const tensionIds = new Set(tensions.map((t) => t.id));

  let variants: Variant[] = arr<Variant>(r.variants).map((v) => {
    const out: Variant = {
      ...v,
      supports_fact_ids: arr<string>(v?.supports_fact_ids).filter((id) => factIds.has(id)),
      addresses_tension_ids: arr<string>(v?.addresses_tension_ids).filter((id) => tensionIds.has(id)),
      kr_directions: arr<{ text: string; angle: Angle }>(v?.kr_directions),
    };
    if (isSolutionInDisguise(v?.strike_at)) out.solution_in_disguise = true;
    if (known && hasUnknownNumber(v?.if_removed?.lever_change, known)) out.effect_unverified = true;
    return out;
  });

  let warning: ReasoningWarning | undefined;
  let suggested_count: number | undefined;
  if (opts.knownConstraints && opts.knownConstraints.length > 0) {
    suggested_count = variants.filter((v) => v.origin === "suggested").length;
    if (suggested_count > 1) {
      let kept = false;
      variants = variants.filter((v) => {
        if (v.origin !== "suggested") return true;
        if (kept) return false;
        kept = true;
        return true;
      });
      warning = "too_many_suggested";
    }
  }
  variants = variants.slice(0, 3);

  const keys = variants.map((v) => normalizeText(v.strike_at));
  const quality: ReasoningQuality = {
    variants_count: variants.length,
    distinct_constraints: new Set(keys).size === keys.length && keys.every((k) => k.length > 0),
    unsupported_variant_ids: variants.filter((v) => v.supports_fact_ids.length === 0).map((v) => v.id),
    solution_in_disguise_ids: variants.filter((v) => v.solution_in_disguise).map((v) => v.id),
    angles_incomplete_ids: variants
      .filter((v) => {
        const angles = new Set(v.kr_directions.map((k) => k?.angle));
        return !angles.has("К") || !angles.has("У");
      })
      .map((v) => v.id),
    no_narrowing_ids: variants.filter((v) => NO_NARROWING.has(normalizeText(v.narrowing))).map((v) => v.id),
    missing_next_constraint_ids: variants.filter((v) => !str(v.if_removed?.next_constraint).trim()).map((v) => v.id),
    ...(suggested_count !== undefined ? { suggested_count } : {}),
  };

  return dedupeBuckets({
    reasoning: {
      facts,
      tensions,
      lever_tree: str(r.lever_tree),
      boundary_conditions: arr<BoundaryCondition>(r.boundary_conditions),
      reframed_solutions: arr<ReframedSolution>(r.reframed_solutions),
      variants,
      choice_question: str(r.choice_question),
      discriminating_data: arr<string>(r.discriminating_data),
      ...(typeof r.lever_label === "string" ? { lever_label: r.lever_label } : {}),
    },
    quality,
    ...(warning ? { warning } : {}),
  });
}

const isGood = (q: ReasoningQuality) => q.distinct_constraints && q.variants_count >= 2;

/** Не более одного корректирующего повтора. */
export async function ensureDistinctVariants(
  first: unknown,
  redo: () => Promise<Reasoning | null>,
  opts?: string[] | NormalizeOptions,
): Promise<NormalizedReasoning> {
  const a = normalizeReasoning(first, opts);
  if (isGood(a.quality)) return a;
  try {
    const next = await redo();
    if (next) {
      const b = normalizeReasoning(next, opts);
      if (isGood(b.quality)) return b;
    }
  } catch (e) {
    console.warn("ensureDistinctVariants redo failed", e);
  }
  return { ...a, warning: a.quality.variants_count < 2 ? "too_few_variants" : "variants_not_distinct" };
}
