import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractDocNames, normalizeReasoning, ensureDistinctVariants, type Reasoning } from "./reasoning.ts";

const base = (): Reasoning => ({
  facts: [
    { id: "F1", statement: "a", source: "input" },
    { id: "F2", statement: "b", source: "doc:План 2026.docx" },
    { id: "F3", statement: "c", source: "doc:Несуществующий.pdf" },
    { id: "F4", statement: "d", source: "assumption" },
  ],
  tensions: [{ id: "T1", gap: "g", who_affected: "w", evidence_fact_ids: ["F1"] }],
  variants: [
    { id: "V1", bet_axis: "customer_business", bet_thesis: "", objective_sketch: "", kr_directions: [], supports_fact_ids: ["F1", "F9"], addresses_tension_ids: ["T1", "T7"], trade_off: "", key_risk: "", unknowns: [] },
    { id: "V2", bet_axis: "learning", bet_thesis: "", objective_sketch: "", kr_directions: [], supports_fact_ids: ["F99"], addresses_tension_ids: [], trade_off: "", key_risk: "", unknowns: [] },
  ],
  choice_question: "?",
});

Deno.test("extractDocNames: parses blocks", () => {
  const ctx = "\n--- План 2026.docx ---\ntext\n--- notes.txt ---\nmore";
  assertEquals(extractDocNames(ctx), ["План 2026.docx", "notes.txt"]);
});

Deno.test("extractDocNames: empty/undefined", () => {
  assertEquals(extractDocNames(""), []);
  assertEquals(extractDocNames(undefined), []);
});

Deno.test("normalizeReasoning: sources", () => {
  const { reasoning } = normalizeReasoning(base(), ["План 2026.docx"]);
  assertEquals(reasoning.facts[0].source, "input");
  assertEquals(reasoning.facts[3].source, "assumption");
  assertEquals(reasoning.facts[1].source, "doc:План 2026.docx");
  assertEquals(reasoning.facts[2].source, "assumption");
  assertEquals(reasoning.facts[2].source_unverified, true);
  assertEquals(reasoning.facts[1].source_unverified, undefined);
});

Deno.test("normalizeReasoning: strips unknown ids and computes quality", () => {
  const { reasoning, quality } = normalizeReasoning(base(), []);
  assertEquals(reasoning.variants[0].supports_fact_ids, ["F1"]);
  assertEquals(reasoning.variants[0].addresses_tension_ids, ["T1"]);
  assertEquals(quality.variants_count, 2);
  assertEquals(quality.distinct_axes, true);
  assertEquals(quality.unsupported_variant_ids, ["V2"]);
});

Deno.test("normalizeReasoning: caps variants at 3, detects same axes", () => {
  const r = base();
  const v = r.variants[0];
  r.variants = [v, { ...v, id: "V2" }, { ...v, id: "V3" }, { ...v, id: "V4" }];
  const { reasoning, quality } = normalizeReasoning(r, []);
  assertEquals(reasoning.variants.length, 3);
  assertEquals(quality.distinct_axes, false);
});

Deno.test("ensureDistinctVariants: good first → no redo", async () => {
  let calls = 0;
  const out = await ensureDistinctVariants(base(), async () => { calls++; return null; }, []);
  assertEquals(calls, 0);
  assertEquals(out.warning, undefined);
});

Deno.test("ensureDistinctVariants: bad first, good redo → takes redo", async () => {
  const bad = base();
  bad.variants[1].bet_axis = "customer_business";
  let calls = 0;
  const out = await ensureDistinctVariants(bad, async () => { calls++; return base(); }, []);
  assertEquals(calls, 1);
  assertEquals(out.quality.distinct_axes, true);
  assertEquals(out.warning, undefined);
});

Deno.test("ensureDistinctVariants: redo fails → keeps first with warning", async () => {
  const bad = base();
  bad.variants[1].bet_axis = "customer_business";
  let calls = 0;
  const out = await ensureDistinctVariants(bad, async () => { calls++; throw new Error("x"); }, []);
  assertEquals(calls, 1);
  assertEquals(out.warning, "variants_not_distinct");
  assertEquals(out.reasoning.variants[1].id, "V2");
});

Deno.test("ensureDistinctVariants: too few variants", async () => {
  const one = base();
  one.variants = [one.variants[0]];
  let calls = 0;
  const out = await ensureDistinctVariants(one, async () => { calls++; return null; }, []);
  assertEquals(calls, 1);
  assertEquals(out.warning, "too_few_variants");
});

Deno.test("ensureDistinctVariants: handles missing reasoning", async () => {
  const out = await ensureDistinctVariants(null, async () => null, []);
  assert(out.warning === "too_few_variants");
});
