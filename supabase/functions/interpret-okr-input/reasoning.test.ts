import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  extractDocNames, normalizeReasoning, ensureDistinctVariants, normalizeText, isSolutionInDisguise,
  extractNumbers, leverLabel, REASONING_RULES, type Reasoning, type Variant,
} from "./reasoning.ts";

const variant = (id: string, strike_at: string, over: Partial<Variant> = {}): Variant => ({
  id,
  origin: "suggested",
  strike_at,
  where_it_holds: { lever: "Проникновение", step: "предложение" },
  evidence: { status: "hypothesis", what_shows: "", data_needed: "воронка" },
  if_removed: { lever_change: "проникновение с X до Y", effect_formula: "Доход = Клиенты × Проникновение", next_constraint: "ёмкость партнёра" },
  hypothesis: { if: "a", then: "b", because: "c" },
  refutation: { signal: "s", by_when: "Q2" },
  narrowing: "выпадает работа с новыми клиентами",
  objective_sketch: "o",
  kr_directions: [{ text: "k1", angle: "К" }, { text: "k2", angle: "У" }, { text: "k3", angle: "О" }],
  supports_fact_ids: ["F1"],
  addresses_tension_ids: ["T1"],
  key_risk: "",
  unknowns: [],
  ...over,
});

const base = (): Reasoning => ({
  facts: [
    { id: "F1", statement: "a", source: "input" },
    { id: "F2", statement: "b", source: "doc:План 2026.docx" },
    { id: "F3", statement: "c", source: "doc:Несуществующий.pdf" },
    { id: "F4", statement: "d", source: "assumption" },
  ],
  tensions: [{ id: "T1", gap: "g", who_affected: "w", evidence_fact_ids: ["F1"] }],
  lever_tree: "Доход = Клиенты × Проникновение × Доход на продукт",
  boundary_conditions: [],
  reframed_solutions: [],
  variants: [
    variant("V1", "Клиент не встречает предложение партнёра в момент потребности", { supports_fact_ids: ["F1", "F9"], addresses_tension_ids: ["T1", "T7"] }),
    variant("V2", "Оформление продукта партнёра требует повторной идентификации", { supports_fact_ids: ["F99"] }),
  ],
  choice_question: "?",
  discriminating_data: ["воронка"],
});

// --- extractDocNames ---

Deno.test("extractDocNames: разбирает блоки --- имя ---", () => {
  assertEquals(extractDocNames("\n--- План 2026.docx ---\ntext\n--- notes.txt ---\nmore"), ["План 2026.docx", "notes.txt"]);
});
Deno.test("extractDocNames: пусто/undefined", () => {
  assertEquals(extractDocNames(""), []);
  assertEquals(extractDocNames(undefined), []);
});

// --- normalizeText ---

Deno.test("normalizeText: регистр, обрезка, кавычки, пробелы, ё→е", () => {
  assertEquals(normalizeText("  «Клиент   НЕ видит» ёлку "), "клиент не видит елку");
});

// --- isSolutionInDisguise ---

Deno.test("isSolutionInDisguise: отсутствие решения → true, состояние реальности → false", () => {
  assertEquals(isSolutionInDisguise("Отсутствует единый профиль клиента"), true);
  assertEquals(isSolutionInDisguise("Нет CRM для работы с базой"), true);
  assertEquals(isSolutionInDisguise("Клиент не встречает предложение партнёра в момент потребности"), false);
  assertEquals(isSolutionInDisguise("Оформление продукта партнёра требует повторной идентификации"), false);
});

Deno.test("Вариант-решение в маске не отбрасывается, а помечается", () => {
  const r = base();
  r.variants[1] = variant("V2", "Нет единого профиля клиента");
  const { reasoning, quality } = normalizeReasoning(r, []);
  assertEquals(reasoning.variants.length, 2);
  assertEquals(reasoning.variants[1].solution_in_disguise, true);
  assertEquals(quality.solution_in_disguise_ids, ["V2"]);
});

// --- extractNumbers ---

Deno.test("extractNumbers: проценты, разряды, десятичные", () => {
  assertEquals(extractNumbers("45 %"), ["45"]);
  assertEquals(extractNumbers("45%"), ["45"]);
  assertEquals(extractNumbers("1 000"), ["1000"]);
  assertEquals(extractNumbers("1000"), ["1000"]);
  assertEquals(extractNumbers("0,8"), ["0.8"]);
  assertEquals(extractNumbers("0.8"), ["0.8"]);
  assertEquals(extractNumbers("37,49%"), ["37.49"]);
});

// --- источники и цифры ---

Deno.test("normalizeReasoning: неизвестный документ → assumption + source_unverified", () => {
  const { reasoning } = normalizeReasoning(base(), ["План 2026.docx"]);
  assertEquals(reasoning.facts[0].source, "input");
  assertEquals(reasoning.facts[1].source, "doc:План 2026.docx");
  assertEquals(reasoning.facts[1].source_unverified, undefined);
  assertEquals(reasoning.facts[2].source, "assumption");
  assertEquals(reasoning.facts[2].source_unverified, true);
  assertEquals(reasoning.facts[3].source, "assumption");
});

Deno.test("Цифры: факт с числом не из haystack → source_unverified, source сохраняется", () => {
  const r = base();
  r.facts = [
    { id: "F1", statement: "Отток 45% на первой неделе", source: "input" },
    { id: "F2", statement: "Отток 60%", source: "input" },
    { id: "F3", statement: "Без чисел", source: "input" },
  ];
  const { reasoning } = normalizeReasoning(r, { docNames: [], haystack: "отток 45 % на первой неделе" });
  assertEquals(reasoning.facts[0].source_unverified, undefined);
  assertEquals(reasoning.facts[1].source, "input");
  assertEquals(reasoning.facts[1].source_unverified, true);
  assertEquals(reasoning.facts[2].source_unverified, undefined);
});

Deno.test("Цифры: lever_change с выдуманным числом → effect_unverified, X/Y не проверяются", () => {
  const r = base();
  r.variants[0].if_removed.lever_change = "охват с 20% до 35%";
  const { reasoning } = normalizeReasoning(r, { haystack: "охват 20%" });
  assertEquals(reasoning.variants[0].effect_unverified, true);
  assertEquals(reasoning.variants[1].effect_unverified, undefined);
});

// --- качество ---

Deno.test("quality: удаляет несуществующие id, distinct_constraints, unsupported", () => {
  const { reasoning, quality } = normalizeReasoning(base(), []);
  assertEquals(reasoning.variants[0].supports_fact_ids, ["F1"]);
  assertEquals(reasoning.variants[0].addresses_tension_ids, ["T1"]);
  assertEquals(quality.variants_count, 2);
  assertEquals(quality.distinct_constraints, true);
  assertEquals(quality.unsupported_variant_ids, ["V2"]);
  assert(!("distinct_axes" in quality));
});

Deno.test("quality: одинаковые ограничения с разницей в регистре/кавычках → не различны; максимум 3", () => {
  const r = base();
  const v = r.variants[0];
  r.variants = [v, { ...v, id: "V2", strike_at: `«${v.strike_at.toUpperCase()}»` }, { ...v, id: "V3" }, { ...v, id: "V4" }];
  const { reasoning, quality } = normalizeReasoning(r, []);
  assertEquals(reasoning.variants.length, 3);
  assertEquals(quality.distinct_constraints, false);
});

Deno.test("quality: angles_incomplete_ids — нет К или нет У", () => {
  const r = base();
  r.variants[1].kr_directions = [{ text: "a", angle: "К" }, { text: "b", angle: "О" }];
  assertEquals(normalizeReasoning(r, []).quality.angles_incomplete_ids, ["V2"]);
});

Deno.test("quality: no_narrowing_ids — пусто, «ничего», «никакая», «нет»", () => {
  const r = base();
  r.variants = [
    variant("A", "a1", { narrowing: "" }),
    variant("B", "b1", { narrowing: "Ничего" }),
    variant("C", "c1", { narrowing: "никакая" }),
  ];
  assertEquals(normalizeReasoning(r, []).quality.no_narrowing_ids, ["A", "B", "C"]);
  r.variants = [variant("D", "d1", { narrowing: "НЕТ" })];
  assertEquals(normalizeReasoning(r, []).quality.no_narrowing_ids, ["D"]);
});

Deno.test("quality: missing_next_constraint_ids", () => {
  const r = base();
  r.variants[0].if_removed.next_constraint = "  ";
  assertEquals(normalizeReasoning(r, []).quality.missing_next_constraint_ids, ["V1"]);
});

Deno.test("known_constraints: лишние suggested отбрасываются, остаётся первый, warning", () => {
  const r = base();
  r.variants = [
    variant("V1", "a", { origin: "group" }),
    variant("V2", "b", { origin: "suggested" }),
    variant("V3", "c", { origin: "suggested" }),
  ];
  const out = normalizeReasoning(r, { knownConstraints: ["a"] });
  assertEquals(out.quality.suggested_count, 2);
  assertEquals(out.reasoning.variants.map((v) => v.id), ["V1", "V2"]);
  assertEquals(out.warning, "too_many_suggested");
});

Deno.test("Без known_constraints suggested не ограничиваются", () => {
  const r = base();
  const out = normalizeReasoning(r, {});
  assertEquals(out.quality.suggested_count, undefined);
  assertEquals(out.warning, undefined);
});

// --- ensureDistinctVariants ---

Deno.test("ensureDistinctVariants: хороший первый ответ → без повтора", async () => {
  let calls = 0;
  const out = await ensureDistinctVariants(base(), async () => { calls++; return null; }, []);
  assertEquals(calls, 0);
  assertEquals(out.warning, undefined);
});

Deno.test("ensureDistinctVariants: совпадающие ограничения, хороший повтор → берём повтор", async () => {
  const bad = base();
  bad.variants[1].strike_at = bad.variants[0].strike_at;
  let calls = 0;
  const out = await ensureDistinctVariants(bad, async () => { calls++; return base(); }, []);
  assertEquals(calls, 1);
  assertEquals(out.quality.distinct_constraints, true);
  assertEquals(out.warning, undefined);
});

Deno.test("ensureDistinctVariants: повтор упал → первый ответ с variants_not_distinct", async () => {
  const bad = base();
  bad.variants[1].strike_at = bad.variants[0].strike_at;
  let calls = 0;
  const out = await ensureDistinctVariants(bad, async () => { calls++; throw new Error("x"); }, []);
  assertEquals(calls, 1);
  assertEquals(out.warning, "variants_not_distinct");
  assertEquals(out.reasoning.variants[1].id, "V2");
});

Deno.test("ensureDistinctVariants: мало вариантов → too_few_variants", async () => {
  const one = base();
  one.variants = [one.variants[0]];
  let calls = 0;
  const out = await ensureDistinctVariants(one, async () => { calls++; return null; }, []);
  assertEquals(calls, 1);
  assertEquals(out.warning, "too_few_variants");
});

Deno.test("ensureDistinctVariants: без reasoning", async () => {
  const out = await ensureDistinctVariants(null, async () => null, []);
  assertEquals(out.warning, "too_few_variants");
});

// --- leverLabel и правила ---

Deno.test("leverLabel по горизонту", () => {
  assertEquals(leverLabel("strategic_3y"), "эффект в доходе");
  assertEquals(leverLabel("block_12m"), "показатель направления");
  assertEquals(leverLabel("quarter_3m"), "показатель способа");
});

Deno.test("REASONING_RULES: «куда бьём», без «драйвер» и bet_axis", () => {
  assert(REASONING_RULES.includes("куда бьём"));
  assert(!/драйвер/i.test(REASONING_RULES));
  assert(!REASONING_RULES.includes("bet_axis"));
});

// --- Фикстура разбора 6.2 методологии банка ---

Deno.test("Фикстура 6.2: два ограничения различны, не решения в маске, цифры проверены", () => {
  const raw_input = "Монетизация: проникновение небанковских продуктов 37,49%, цель 55%. Разные юрлица, не можем передавать базы клиентов. Отсутствует единый профиль клиента.";
  const r = base();
  r.facts = [
    { id: "F1", statement: "Проникновение небанковских продуктов 37,49%", source: "input" },
    { id: "F2", statement: "Проникновение 41%", source: "input" },
  ];
  r.variants = [
    variant("V1", "клиент не встречает предложение партнёра в момент потребности"),
    variant("V2", "оформление продукта партнёра требует повторной идентификации"),
  ];
  const { reasoning, quality } = normalizeReasoning(r, { docNames: [], haystack: raw_input });
  assertEquals(quality.distinct_constraints, true);
  assertEquals(quality.solution_in_disguise_ids, []);
  assertEquals(reasoning.facts[0].source_unverified, undefined);
  assertEquals(reasoning.facts[1].source_unverified, true);
});
