export type BetAxis = "customer_business" | "feasibility_risk" | "learning";

export interface Fact { id: string; statement: string; source: string; source_unverified?: boolean }
export interface Tension { id: string; gap: string; who_affected: string; evidence_fact_ids: string[] }
export interface Variant {
  id: string;
  bet_axis: BetAxis;
  bet_thesis: string;
  objective_sketch: string;
  kr_directions: string[];
  supports_fact_ids: string[];
  addresses_tension_ids: string[];
  trade_off: string;
  key_risk: string;
  unknowns: string[];
}
export interface Reasoning { facts: Fact[]; tensions: Tension[]; variants: Variant[]; choice_question: string }
export interface ReasoningQuality { variants_count: number; distinct_axes: boolean; unsupported_variant_ids: string[] }
export interface NormalizedReasoning { reasoning: Reasoning; quality: ReasoningQuality }
export type ReasoningWarning = "variants_not_distinct" | "too_few_variants";

export const REASONING_RULES = `REASONING (поле reasoning заполняется ПЕРВЫМ — рассуждение до выводов):
- facts: 3–10 конкретных фактов из источников (числа, сегменты, названия продуктов, сроки). ЗАПРЕЩЕНЫ общие фразы вроде «важно улучшать клиентский опыт». source = "input" (из ввода пользователя), "doc:<точное имя документа из заголовка блока --- имя --->" или "assumption", если источника нет.
- tensions: 1–4 разрыва «как есть / как нужно». Каждое напряжение опирается на факты (evidence_fact_ids) и называет, кого оно затрагивает.
- variants: 2–3 РАЗНЫЕ СТАВКИ, а не перефразировки одной идеи. У каждого варианта свой bet_axis:
  • customer_business — ценность для клиента/бизнеса;
  • feasibility_risk — можем ли сделать и не сломать критичное;
  • learning — что нужно узнать/проверить первым.
  objective_sketch — качественный набросок Objective БЕЗ цифр. kr_directions — 2–3 направления метрик РЕЗУЛЬТАТА без целевых чисел. Укажи supports_fact_ids, addresses_tension_ids, trade_off (чем жертвуем), key_risk, unknowns (что проверить).
- objective_sketch и kr_directions соответствуют горизонту (strategic_3y — 3 года, block_12m — год, quarter_3m — квартал). Если передан PARENT KEY RESULT — каждый вариант должен явно продвигать именно его.
- В режиме rewrite_existing V1 = ставка исходного OKR (улучшенная), остальные — альтернативы.
- choice_question — ОДИН вопрос группе, ответ на который различает варианты.
- clarifying_questions — про то, что сильнее всего влияет на выбор между вариантами (лучше 1–2 точных вопроса, чем 0).`;

export function extractDocNames(extra_context?: string | null): string[] {
  if (typeof extra_context !== "string" || !extra_context) return [];
  const out: string[] = [];
  for (const m of extra_context.matchAll(/^---\s+(.+?)\s+---\s*$/gm)) {
    const name = m[1].trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function normalizeReasoning(raw: unknown, docNames: string[]): NormalizedReasoning {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Reasoning>;
  const facts: Fact[] = arr<Fact>(r.facts).map((f) => {
    const src = typeof f?.source === "string" ? f.source.trim() : "";
    if (src === "input" || src === "assumption") return { ...f, source: src };
    if (src.startsWith("doc:") && docNames.includes(src.slice(4).trim())) return { ...f, source: src };
    return { ...f, source: "assumption", source_unverified: true };
  });
  const factIds = new Set(facts.map((f) => f.id));
  const tensions: Tension[] = arr<Tension>(r.tensions).map((t) => ({
    ...t,
    evidence_fact_ids: arr<string>(t?.evidence_fact_ids).filter((id) => factIds.has(id)),
  }));
  const tensionIds = new Set(tensions.map((t) => t.id));
  const variants: Variant[] = arr<Variant>(r.variants).slice(0, 3).map((v) => ({
    ...v,
    supports_fact_ids: arr<string>(v?.supports_fact_ids).filter((id) => factIds.has(id)),
    addresses_tension_ids: arr<string>(v?.addresses_tension_ids).filter((id) => tensionIds.has(id)),
  }));
  const axes = variants.map((v) => v.bet_axis);
  return {
    reasoning: { facts, tensions, variants, choice_question: typeof r.choice_question === "string" ? r.choice_question : "" },
    quality: {
      variants_count: variants.length,
      distinct_axes: new Set(axes).size === axes.length,
      unsupported_variant_ids: variants.filter((v) => v.supports_fact_ids.length === 0).map((v) => v.id),
    },
  };
}

const isGood = (q: ReasoningQuality) => q.distinct_axes && q.variants_count >= 2;

/** Не более одного корректирующего повтора. */
export async function ensureDistinctVariants(
  first: unknown,
  redo: () => Promise<Reasoning | null>,
  docNames: string[],
): Promise<NormalizedReasoning & { warning?: ReasoningWarning }> {
  const a = normalizeReasoning(first, docNames);
  if (isGood(a.quality)) return a;
  try {
    const next = await redo();
    if (next) {
      const b = normalizeReasoning(next, docNames);
      if (isGood(b.quality)) return b;
    }
  } catch (e) {
    console.warn("ensureDistinctVariants redo failed", e);
  }
  return { ...a, warning: a.quality.variants_count < 2 ? "too_few_variants" : "variants_not_distinct" };
}
