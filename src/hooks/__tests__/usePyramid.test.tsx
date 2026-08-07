import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePyramid } from "@/hooks/usePyramid";
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

describe("usePyramid", () => {
  beforeEach(() => localStorage.clear());

  it("setNodeLevel помечает сохранённый OKR уровнем пирамиды", () => {
    const { result } = renderHook(() => usePyramid());
    act(() => {
      result.current.setNodeLevel("a", "bank");
      result.current.setNodeLevel("b", "direction");
    });
    expect(result.current.getLevel("a")).toBe("bank");
    expect(result.current.getLevel("b")).toBe("direction");
    expect(JSON.parse(localStorage.getItem("aimbot.pyramid.v1")!).levels.a).toBe("bank");
  });

  it("linkKrToMetric связывает KR с метрикой; повторный вызов заменяет связь", () => {
    const { result } = renderHook(() => usePyramid());
    act(() => {
      result.current.linkKrToMetric("a", 0, "m1");
    });
    expect(result.current.getMetricId("a", 0)).toBe("m1");
    act(() => {
      result.current.linkKrToMetric("a", 0, "m2");
    });
    expect(result.current.getMetricId("a", 0)).toBe("m2");
    expect(Object.keys(result.current.state.krMetrics)).toHaveLength(1);
  });

  it("linkKrContribution создаёт связь вверх и поддерживает many-to-many", () => {
    const { result } = renderHook(() => usePyramid());
    act(() => {
      result.current.linkKrContribution("child", 0, "bank1", 0);
      result.current.linkKrContribution("child", 0, "bank2", 1);
    });
    expect(result.current.state.contributions).toHaveLength(2);
    expect(result.current.getContributionsFrom("child", 0)).toHaveLength(2);
  });

  it("unlinkKrContribution удаляет конкретную связь, не задевая остальные", () => {
    const { result } = renderHook(() => usePyramid());
    act(() => {
      result.current.linkKrContribution("child", 0, "bank1", 0);
      result.current.linkKrContribution("child", 0, "bank2", 1);
    });
    act(() => {
      result.current.unlinkKrContribution("child", 0, "bank1", 0);
    });
    expect(result.current.state.contributions).toHaveLength(1);
    expect(result.current.state.contributions[0].to.okrId).toBe("bank2");
  });

  it("связи на удалённый OKR игнорируются при чтении (не падаем)", () => {
    const { result } = renderHook(() => usePyramid());
    const bank = mk("bank", ["KR банка"]);
    act(() => {
      result.current.setNodeLevel("bank", "bank");
      result.current.linkKrContribution("ghost", 0, "bank", 0);
    });
    let gaps!: ReturnType<typeof result.current.findGaps>;
    act(() => {
      gaps = result.current.findGaps([bank]);
    });
    // связь оборвана → банковский KR всё ещё без контрибьюторов
    expect(gaps.some((g) => g.type === "bank_kr_no_contributors")).toBe(true);
  });

  it("findGaps возвращает разрывы: без метрики, без связи вверх, без контрибьюторов", () => {
    const { result } = renderHook(() => usePyramid());
    const bank = mk("bank", ["KR банка"]);
    const dir = mk("dir", ["KR направления"]);
    act(() => {
      result.current.setNodeLevel("bank", "bank");
      result.current.setNodeLevel("dir", "direction");
    });
    let gaps!: ReturnType<typeof result.current.findGaps>;
    act(() => {
      gaps = result.current.findGaps([bank, dir]);
    });
    expect(gaps.filter((g) => g.type === "kr_no_metric")).toHaveLength(2);
    expect(gaps.filter((g) => g.type === "direction_kr_no_parent")).toHaveLength(1);
    expect(gaps.filter((g) => g.type === "bank_kr_no_contributors")).toHaveLength(1);

    act(() => {
      result.current.linkKrToMetric("dir", 0, "m1");
      result.current.linkKrContribution("dir", 0, "bank", 0);
    });
    act(() => {
      gaps = result.current.findGaps([bank, dir]);
    });
    expect(gaps.filter((g) => g.type === "direction_kr_no_parent")).toHaveLength(0);
    expect(gaps.filter((g) => g.type === "bank_kr_no_contributors")).toHaveLength(0);
    expect(gaps.filter((g) => g.type === "kr_no_metric")).toHaveLength(1);
  });

  it("exportPyramid/importPyramid работают, невалидный формат → ok:false без изменения данных", () => {
    const { result } = renderHook(() => usePyramid());
    act(() => {
      result.current.setNodeLevel("a", "bank");
      result.current.linkKrToMetric("a", 0, "m1");
    });
    const dump = result.current.exportPyramid();
    expect(JSON.parse(dump).version).toBe("aimbot.pyramid.v1");

    act(() => {
      result.current.clear();
    });
    expect(result.current.getLevel("a")).toBeUndefined();

    let res!: { ok: boolean };
    act(() => {
      res = result.current.importPyramid(dump);
    });
    expect(res.ok).toBe(true);
    expect(result.current.getLevel("a")).toBe("bank");
    expect(result.current.getMetricId("a", 0)).toBe("m1");

    act(() => {
      res = result.current.importPyramid('{"version":"other","state":{}}');
    });
    expect(res.ok).toBe(false);
    expect(result.current.getLevel("a")).toBe("bank");

    act(() => {
      res = result.current.importPyramid("не json");
    });
    expect(res.ok).toBe(false);
    expect(result.current.getLevel("a")).toBe("bank");
  });
});

describe("usePyramid: дубли связей", () => {
  beforeEach(() => localStorage.clear());

  it("linkKrContribution НЕ создаёт дубль на ту же пару {from,to}", () => {
    const { result } = renderHook(() => usePyramid());
    let res!: { ok: boolean; duplicate?: boolean };
    act(() => {
      result.current.linkKrContribution("child", 0, "bank", 0);
    });
    act(() => {
      res = result.current.linkKrContribution("child", 0, "bank", 0);
    });
    expect(res.ok).toBe(true);
    expect(res.duplicate).toBe(true);
    expect(result.current.state.contributions).toHaveLength(1);
  });

  it("разные krIndex одного родительского OKR — две разные связи", () => {
    const { result } = renderHook(() => usePyramid());
    act(() => {
      result.current.linkKrContribution("child", 0, "bank", 0);
      result.current.linkKrContribution("child", 0, "bank", 1);
    });
    expect(result.current.state.contributions).toHaveLength(2);
  });
});

describe("usePyramid: связи Решение→метрика", () => {
  beforeEach(() => localStorage.clear());

  it("linkSolutionToMetric связывает Решение с метрикой, many-to-many", () => {
    const { result } = renderHook(() => usePyramid());
    act(() => {
      result.current.linkSolutionToMetric("s1", "m1");
      result.current.linkSolutionToMetric("s1", "m2");
    });
    expect(result.current.getSolutionMetrics("s1")).toEqual(["m1", "m2"]);
  });

  it("unlinkSolutionFromMetric удаляет одну связь, не задевая остальные", () => {
    const { result } = renderHook(() => usePyramid());
    act(() => {
      result.current.linkSolutionToMetric("s1", "m1");
      result.current.linkSolutionToMetric("s1", "m2");
      result.current.linkSolutionToMetric("s2", "m1");
    });
    act(() => {
      result.current.unlinkSolutionFromMetric("s1", "m1");
    });
    expect(result.current.getSolutionMetrics("s1")).toEqual(["m2"]);
    expect(result.current.getSolutionMetrics("s2")).toEqual(["m1"]);
  });

  it("linkSolutionToMetric не создаёт дубль на ту же пару", () => {
    const { result } = renderHook(() => usePyramid());
    let res!: { ok: boolean; duplicate?: boolean };
    act(() => {
      result.current.linkSolutionToMetric("s1", "m1");
    });
    act(() => {
      res = result.current.linkSolutionToMetric("s1", "m1");
    });
    expect(res.duplicate).toBe(true);
    expect(result.current.state.solutionMetrics).toHaveLength(1);
  });

  it("suggestedMetricForSolution возвращает метрику KR-происхождения или null", () => {
    const { result } = renderHook(() => usePyramid());
    act(() => {
      result.current.linkKrToMetric("dir", 1, "m9");
    });
    expect(
      result.current.suggestedMetricForSolution({ id: "s1", title: "T", originOkrId: "dir", originKrIndex: 1 }),
    ).toEqual({ kind: "existing", metricId: "m9" });

    expect(
      result.current.suggestedMetricForSolution({ id: "s2", title: "T", originOkrId: "dir", originKrIndex: 0 }),
    ).toBeNull();
    expect(result.current.suggestedMetricForSolution({ id: "s3", title: "T" })).toBeNull();
  });

  it("связи Решений входят в exportPyramid/importPyramid", () => {
    const { result } = renderHook(() => usePyramid());
    act(() => {
      result.current.linkSolutionToMetric("s1", "m1");
    });
    const dump = result.current.exportPyramid();
    act(() => {
      result.current.clear();
    });
    expect(result.current.getSolutionMetrics("s1")).toEqual([]);
    act(() => {
      result.current.importPyramid(dump);
    });
    expect(result.current.getSolutionMetrics("s1")).toEqual(["m1"]);
  });
});

describe("usePyramid: связи метрика→метрика", () => {
  beforeEach(() => localStorage.clear());

  it("linkMetricInfluence создаёт связь влияния, many-to-many", () => {
    const { result } = renderHook(() => usePyramid());
    act(() => {
      result.current.linkMetricInfluence("a", "b");
      result.current.linkMetricInfluence("a", "c");
    });
    expect(result.current.state.metricInfluences).toEqual([
      { from: "a", to: "b" },
      { from: "a", to: "c" },
    ]);
    expect(result.current.getIncomingInfluences("b")).toEqual(["a"]);
  });

  it("unlinkMetricInfluence удаляет одну связь, не задевая остальные", () => {
    const { result } = renderHook(() => usePyramid());
    act(() => {
      result.current.linkMetricInfluence("a", "b");
      result.current.linkMetricInfluence("a", "c");
    });
    act(() => {
      result.current.unlinkMetricInfluence("a", "b");
    });
    expect(result.current.state.metricInfluences).toEqual([{ from: "a", to: "c" }]);
  });

  it("не создаётся дубль на ту же пару", () => {
    const { result } = renderHook(() => usePyramid());
    let res!: { ok: boolean; duplicate?: boolean };
    act(() => {
      result.current.linkMetricInfluence("a", "b");
    });
    act(() => {
      res = result.current.linkMetricInfluence("a", "b");
    });
    expect(res).toEqual({ ok: true, duplicate: true });
    expect(result.current.state.metricInfluences).toHaveLength(1);
  });

  it("нельзя связать метрику саму с собой", () => {
    const { result } = renderHook(() => usePyramid());
    let res!: { ok: boolean };
    act(() => {
      res = result.current.linkMetricInfluence("a", "a");
    });
    expect(res.ok).toBe(false);
    expect(result.current.state.metricInfluences).toHaveLength(0);
  });

  it("детектится цикл: A→B есть, B→A запрещена", () => {
    const { result } = renderHook(() => usePyramid());
    act(() => {
      result.current.linkMetricInfluence("a", "b");
    });
    let res!: { ok: boolean; reason?: string };
    act(() => {
      res = result.current.linkMetricInfluence("b", "a");
    });
    expect(res).toEqual({ ok: false, reason: "cycle" });
    expect(result.current.state.metricInfluences).toHaveLength(1);
  });

  it("metricInfluences входят в exportPyramid/importPyramid", () => {
    const { result } = renderHook(() => usePyramid());
    act(() => {
      result.current.linkMetricInfluence("a", "b");
    });
    const dump = result.current.exportPyramid();
    act(() => {
      result.current.clear();
    });
    expect(result.current.state.metricInfluences).toEqual([]);
    act(() => {
      result.current.importPyramid(dump);
    });
    expect(result.current.state.metricInfluences).toEqual([{ from: "a", to: "b" }]);
  });
});
