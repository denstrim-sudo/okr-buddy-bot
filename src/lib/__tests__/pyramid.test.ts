import { describe, it, expect } from "vitest";
import { findGaps, liveContributions, krKey, emptyPyramid, describeContribution } from "@/lib/pyramid";
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

describe("pyramid lib", () => {
  it("krKey формирует ключ okrId:krIndex", () => {
    expect(krKey("a", 2)).toBe("a:2");
  });

  it("liveContributions отбрасывает связи на несуществующие OKR/KR", () => {
    const items = [mk("a", ["KR"]), mk("b", ["KR"])];
    const state = {
      ...emptyPyramid(),
      contributions: [
        { from: { okrId: "a", krIndex: 0 }, to: { okrId: "b", krIndex: 0 } },
        { from: { okrId: "ghost", krIndex: 0 }, to: { okrId: "b", krIndex: 0 } },
        { from: { okrId: "a", krIndex: 5 }, to: { okrId: "b", krIndex: 0 } },
      ],
    };
    expect(liveContributions(items, state)).toHaveLength(1);
  });

  it("findGaps игнорирует OKR без назначенного уровня", () => {
    expect(findGaps([mk("a", ["KR"])], emptyPyramid())).toHaveLength(0);
  });

  it("findGaps сообщает objective и текст KR в разрыве", () => {
    const gaps = findGaps([mk("a", ["Мой KR"])], { ...emptyPyramid(), levels: { a: "bank" } });
    expect(gaps[0].objective).toBe("Цель a");
    expect(gaps[0].krText).toBe("Мой KR");
  });
});

describe("describeContribution", () => {
  const items = [mk("bank", ["KR банка A", "KR банка B"])];
  const state = { ...emptyPyramid(), levels: { bank: "bank" as const } };

  it("возвращает уровень родителя, номер KR и текст KR", () => {
    const d = describeContribution(
      { from: { okrId: "dir", krIndex: 0 }, to: { okrId: "bank", krIndex: 1 } },
      items,
      state,
    );
    expect(d.orphaned).toBe(false);
    expect(d.level).toBe("bank");
    expect(d.levelLabel).toBe("Банк");
    expect(d.krLabel).toBe("KR2");
    expect(d.krText).toBe("KR банка B");
    expect(d.okrObjective).toBe("Цель bank");
  });

  it("для связи на удалённый OKR возвращает orphaned и не падает", () => {
    const d = describeContribution(
      { from: { okrId: "dir", krIndex: 0 }, to: { okrId: "ghost", krIndex: 3 } },
      items,
      state,
    );
    expect(d.orphaned).toBe(true);
    expect(d.krLabel).toBe("KR4");
    expect(d.krText).toBe("");
    expect(d.okrObjective).toBe("");
  });
});

import { traceSolution, suggestedMetricForSolution } from "@/lib/pyramid";
import type { PyramidState } from "@/lib/pyramid";

const metrics = [
  { id: "m1", name: "Доля автономных заказов", createdAt: "" },
  { id: "m2", name: "NPS", createdAt: "" },
];

describe("traceSolution", () => {
  const dir = mk("dir", ["KR направления"]);
  const bank = mk("bank", ["KR банка"]);
  const items = [dir, bank];

  const baseState = (over: Partial<PyramidState> = {}): PyramidState => ({
    ...emptyPyramid(),
    levels: { dir: "direction", bank: "bank" },
    ...over,
  });

  const sol = { id: "s1", title: "Решение", description: "Описание" };

  it("возвращает отдельную цепочку на каждую метрику Решения", () => {
    const state = baseState({
      krMetrics: { "dir:0": "m1", "bank:0": "m2" },
      solutionMetrics: [
        { solutionId: "s1", metricId: "m1" },
        { solutionId: "s1", metricId: "m2" },
      ],
      contributions: [{ from: { okrId: "dir", krIndex: 0 }, to: { okrId: "bank", krIndex: 0 } }],
    });
    const chains = traceSolution(sol, state, items, metrics);
    expect(chains).toHaveLength(2);
    expect(chains.map((c) => c.metricId)).toEqual(["m1", "m2"]);
    expect(chains[0].metricName).toBe("Доля автономных заказов");
  });

  it("полная цепочка Решение → метрика → KR направления → KR банка = complete", () => {
    const state = baseState({
      krMetrics: { "dir:0": "m1" },
      solutionMetrics: [{ solutionId: "s1", metricId: "m1" }],
      contributions: [{ from: { okrId: "dir", krIndex: 0 }, to: { okrId: "bank", krIndex: 0 } }],
    });
    const [c] = traceSolution(sol, state, items, metrics);
    expect(c.status).toBe("complete");
    expect(c.path.map((p) => p.level)).toEqual(["direction", "bank"]);
    expect(c.path[1].krText).toBe("KR банка");
    expect(c.path[0].okrObjective).toBe("Цель dir");
  });

  it("обрыв на уровне направления → broken_at_direction с указанием KR", () => {
    const state = baseState({
      krMetrics: { "dir:0": "m1" },
      solutionMetrics: [{ solutionId: "s1", metricId: "m1" }],
    });
    const [c] = traceSolution(sol, state, items, metrics);
    expect(c.status).toBe("broken_at_direction");
    expect(c.brokenAt).toEqual({ okrId: "dir", krIndex: 0, krText: "KR направления" });
  });

  it("метрика не используется ни в одном KR → orphan_metric", () => {
    const state = baseState({ solutionMetrics: [{ solutionId: "s1", metricId: "m2" }] });
    const [c] = traceSolution(sol, state, items, metrics);
    expect(c.status).toBe("orphan_metric");
    expect(c.path).toHaveLength(0);
  });

  it("Решение без метрик → одна цепочка со статусом no_metrics", () => {
    const chains = traceSolution(sol, baseState(), items, metrics);
    expect(chains).toHaveLength(1);
    expect(chains[0].status).toBe("no_metrics");
  });

  it("цепочка через удалённый OKR не роняет трассировку", () => {
    const state = baseState({
      krMetrics: { "dir:0": "m1", "ghost:0": "m1" },
      solutionMetrics: [{ solutionId: "s1", metricId: "m1" }],
      contributions: [{ from: { okrId: "dir", krIndex: 0 }, to: { okrId: "ghost", krIndex: 0 } }],
    });
    const [c] = traceSolution(sol, state, items, metrics);
    expect(c.status).toBe("broken_at_direction");
    expect(c.brokenAt?.okrId).toBe("dir");
  });
});

describe("suggestedMetricForSolution", () => {
  it("берёт метрику KR-происхождения", () => {
    const state = { ...emptyPyramid(), krMetrics: { "dir:2": "m1" } };
    expect(suggestedMetricForSolution({ id: "s", title: "t", originOkrId: "dir", originKrIndex: 2 }, state)).toBe("m1");
    expect(suggestedMetricForSolution({ id: "s", title: "t" }, state)).toBeNull();
  });
});

import { solutionsForPyramid } from "@/lib/pyramid";

describe("solutionsForPyramid", () => {
  const studio = {
    slices: {
      "kr-0": { solutions: [{ id: "a" }, { id: "b" }], selected: [1] },
      "kr-1": { solutions: [{ id: "c" }], selected: [] },
    },
  };

  it("возвращает только Решения со статусом «в проекте»", () => {
    expect(solutionsForPyramid(studio)).toEqual(["kr-0:1"]);
  });

  it("если ни одно Решение не помечено «в проекте» — пустой массив", () => {
    expect(solutionsForPyramid({ slices: { "kr-0": { solutions: [{}], selected: [] } } })).toEqual([]);
    expect(solutionsForPyramid(null)).toEqual([]);
  });

  it("связи solutionMetrics Решения без статуса сохраняются в PyramidState", () => {
    const state: PyramidState = {
      ...emptyPyramid(),
      solutionMetrics: [
        { solutionId: "kr-0:0", metricId: "m1" },
        { solutionId: "kr-0:1", metricId: "m2" },
      ],
    };
    const visible = solutionsForPyramid(studio);
    expect(visible).not.toContain("kr-0:0");
    expect(state.solutionMetrics).toHaveLength(2);
    expect(state.solutionMetrics.find((l) => l.solutionId === "kr-0:0")).toBeTruthy();
  });
});

import { shortenMetricName } from "@/lib/pyramid";

describe("shortenMetricName", () => {
  it("сокращает длинное имя до ≤40 символов, сохраняя суть", () => {
    const full =
      "Конверсия в отказ от проведения операции на этапе прохождения контекстного опроса безопасности";
    const short = shortenMetricName(full);
    expect(short.length).toBeLessThanOrEqual(40);
    expect(short).toMatch(/Конверсия/);
    expect(short).toMatch(/безопасност/i);
  });

  it("короткое имя возвращается как есть", () => {
    expect(shortenMetricName("  Время   ответа ")).toBe("Время ответа");
  });
});

describe("suggestedMetricForSolution · приоритет опережающей метрики", () => {
  const state = { ...emptyPyramid(), krMetrics: { "dir:2": "m1" } };
  const cat = [
    { id: "m1", name: "Доля автономных заказов", createdAt: "" },
    { id: "m2", name: "Время ответа", createdAt: "" },
  ];

  it("опережающая метрика совпадает со справочником → existing", () => {
    const r = suggestedMetricForSolution(
      { id: "s", title: "t", leadingMetric: "  время   ОТВЕТА ", originOkrId: "dir", originKrIndex: 2 },
      cat,
      state,
    );
    expect(r).toEqual({ kind: "existing", metricId: "m2" });
  });

  it("опережающей метрики нет в справочнике → new с сокращённым именем и fullName", () => {
    const full =
      "Конверсия в отказ от проведения операции на этапе прохождения контекстного опроса безопасности";
    const r = suggestedMetricForSolution({ id: "s", title: "t", leadingMetric: full }, cat, state);
    expect(r?.kind).toBe("new");
    if (r?.kind === "new") {
      expect(r.name.length).toBeLessThanOrEqual(40);
      expect(r.fullName).toBe(full);
    }
  });

  it("короткая новая метрика — без fullName", () => {
    const r = suggestedMetricForSolution({ id: "s", title: "t", leadingMetric: "Отток" }, cat, state);
    expect(r).toEqual({ kind: "new", name: "Отток" });
  });

  it("поле пустое → падение на метрику KR-происхождения", () => {
    expect(
      suggestedMetricForSolution({ id: "s", title: "t", originOkrId: "dir", originKrIndex: 2 }, cat, state),
    ).toEqual({ kind: "existing", metricId: "m1" });
    expect(suggestedMetricForSolution({ id: "s", title: "t" }, cat, state)).toBeNull();
  });
});
