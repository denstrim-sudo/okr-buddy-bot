import { describe, it, expect } from "vitest";
import { buildPyramidDoc, PYRAMID_DOC_VERSION } from "@/lib/pyramidExport";
import { emptyPyramid, krKey, type PyramidSolution } from "@/lib/pyramid";
import type { SavedOkr } from "@/hooks/useSavedOkrs";

const mk = (id: string, krs: string[]): SavedOkr => ({
  id,
  objective: `Цель ${id}`,
  savedAt: "2025-01-01T00:00:00.000Z",
  plan: {
    objective_refined: `Цель ${id}`,
    score: 80,
    key_results: krs.map((t) => ({
      text: t,
      baseline: "",
      target: "",
      metric: "",
      kr_type: "leading" as const,
      solutions: [],
    })),
  },
});

const items = [mk("bank", ["KR банка"]), mk("dir", ["KR направления"])];
const metrics = [
  { id: "m1", name: "NPS", unit: "балл" },
  { id: "m2", name: "Отток", unit: "%" },
];

const state = {
  ...emptyPyramid(),
  levels: { bank: "bank" as const, dir: "direction" as const },
  krMetrics: { [krKey("dir", 0)]: "m1", [krKey("bank", 0)]: "m1" },
  contributions: [{ from: { okrId: "dir", krIndex: 0 }, to: { okrId: "bank", krIndex: 0 } }],
  solutionMetrics: [
    { solutionId: "s:0", metricId: "m1" },
    { solutionId: "s:1", metricId: "m2" },
  ],
};

const solutions: PyramidSolution[] = [
  { id: "s:0", title: "Решение в проекте", description: "описание" },
  { id: "s:1", title: "Черновик" },
];

const studio = { slices: { s: { solutions: [{}, {}], selected: [0] } } };

describe("buildPyramidDoc", () => {
  it("включает только Решения со статусом «в проекте»", () => {
    const doc = buildPyramidDoc({ items, state, metrics, solutions, studioState: studio });
    expect(doc.version).toBe(PYRAMID_DOC_VERSION);
    expect(doc.solutions.map((s) => s.id)).toEqual(["s:0"]);
  });

  it("сохраняет трассировки и метрики показанных Решений", () => {
    const doc = buildPyramidDoc({ items, state, metrics, solutions, studioState: studio });
    expect(doc.solutions[0].metrics.map((m) => m.name)).toEqual(["NPS"]);
    expect(doc.solutions[0].chains[0].status).toBe("complete");
    expect(doc.metrics.map((m) => m.id)).toEqual(["m1"]);
  });

  it("сохраняет связи вверх для KR показанных метрик", () => {
    const doc = buildPyramidDoc({ items, state, metrics, solutions, studioState: studio });
    const dir = doc.okrs.find((o) => o.okrId === "dir");
    expect(dir?.key_results[0].contributions[0]).toMatchObject({
      toOkrId: "bank",
      toKrIndex: 0,
      toKrText: "KR банка",
      toLevel: "bank",
    });
    expect(doc.okrs.find((o) => o.okrId === "bank")).toBeTruthy();
  });

  it("не включает метрики и KR, относящиеся только к черновикам", () => {
    const doc = buildPyramidDoc({ items, state, metrics, solutions, studioState: studio });
    expect(doc.metrics.some((m) => m.id === "m2")).toBe(false);
  });

  it("пустой документ, если ни одно Решение не в проекте", () => {
    const doc = buildPyramidDoc({
      items,
      state,
      metrics,
      solutions,
      studioState: { slices: { s: { solutions: [{}, {}], selected: [] } } },
    });
    expect(doc.solutions).toEqual([]);
    expect(doc.metrics).toEqual([]);
    expect(doc.okrs).toEqual([]);
  });
});
