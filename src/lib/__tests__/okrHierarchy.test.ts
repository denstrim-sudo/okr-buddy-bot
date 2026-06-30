import { describe, it, expect } from "vitest";
import { parentHorizonFor, eligibleParents, buildForest } from "@/lib/okrHierarchy";
import type { SavedOkr } from "@/hooks/useSavedOkrs";
import type { OkrHorizon } from "@/types/okr";

const mk = (
  id: string,
  horizon?: OkrHorizon,
  savedAt = "2025-01-01T00:00:00.000Z",
  link?: { parentOkrId: string; parentKrIndex: number },
  krs: string[] = [],
): SavedOkr => ({
  id,
  objective: id,
  plan: {
    objective_refined: id,
    score: 0,
    key_results: krs.map((t) => ({
      text: t,
      baseline: "",
      target: "",
      metric: "",
      kr_type: "leading",
      solutions: [],
    })),
    ...(horizon ? { horizon } : {}),
  },
  savedAt,
  ...(link ? { parentOkrId: link.parentOkrId, parentKrIndex: link.parentKrIndex } : {}),
});

describe("parentHorizonFor", () => {
  it("quarter_3m → block_12m", () => {
    expect(parentHorizonFor("quarter_3m")).toBe("block_12m");
  });
  it("block_12m → strategic_3y", () => {
    expect(parentHorizonFor("block_12m")).toBe("strategic_3y");
  });
  it("strategic_3y → null", () => {
    expect(parentHorizonFor("strategic_3y")).toBeNull();
  });
});

describe("eligibleParents", () => {
  it("для quarter_3m возвращает только block_12m", () => {
    const items = [mk("a", "block_12m"), mk("b", "strategic_3y"), mk("c", "quarter_3m")];
    const out = eligibleParents(items, "quarter_3m");
    expect(out.map((i) => i.id)).toEqual(["a"]);
  });
  it("игнорирует записи без plan.horizon", () => {
    const items = [mk("legacy"), mk("b", "block_12m")];
    const out = eligibleParents(items, "quarter_3m");
    expect(out.map((i) => i.id)).toEqual(["b"]);
  });
});

describe("buildForest", () => {
  it("OKR без parentOkrId становится корнем", () => {
    const items = [mk("a", "strategic_3y")];
    const forest = buildForest(items);
    expect(forest).toHaveLength(1);
    expect(forest[0].okr.id).toBe("a");
    expect(forest[0].children).toEqual([]);
    expect(forest[0].orphaned).toBe(false);
  });

  it("OKR с валидным parentOkrId становится children своего родителя", () => {
    const items = [
      mk("p", "block_12m", "2025-01-01T00:00:00.000Z", undefined, ["KR-A"]),
      mk("c", "quarter_3m", "2025-01-02T00:00:00.000Z", { parentOkrId: "p", parentKrIndex: 0 }),
    ];
    const forest = buildForest(items);
    expect(forest).toHaveLength(1);
    expect(forest[0].okr.id).toBe("p");
    expect(forest[0].children).toHaveLength(1);
    expect(forest[0].children[0].okr.id).toBe("c");
  });

  it("OKR с parentOkrId на удалённого родителя становится корнем и помечается orphaned", () => {
    const items = [
      mk("c", "quarter_3m", "2025-01-02T00:00:00.000Z", { parentOkrId: "ghost", parentKrIndex: 0 }),
    ];
    const forest = buildForest(items);
    expect(forest).toHaveLength(1);
    expect(forest[0].okr.id).toBe("c");
    expect(forest[0].orphaned).toBe(true);
  });

  it("у дочернего узла заполнено parentKrText из родительского KR", () => {
    const items = [
      mk("p", "block_12m", "2025-01-01T00:00:00.000Z", undefined, ["KR-первый", "KR-второй"]),
      mk("c", "quarter_3m", "2025-01-02T00:00:00.000Z", { parentOkrId: "p", parentKrIndex: 1 }),
    ];
    const forest = buildForest(items);
    expect(forest[0].children[0].parentKrText).toBe("KR-второй");
  });

  it("глубина 3 уровня — внук виден в children.children", () => {
    const items = [
      mk("s", "strategic_3y", "2025-01-01T00:00:00.000Z", undefined, ["KR-s"]),
      mk("b", "block_12m", "2025-01-02T00:00:00.000Z", { parentOkrId: "s", parentKrIndex: 0 }, ["KR-b"]),
      mk("q", "quarter_3m", "2025-01-03T00:00:00.000Z", { parentOkrId: "b", parentKrIndex: 0 }),
    ];
    const forest = buildForest(items);
    expect(forest[0].children[0].children[0].okr.id).toBe("q");
  });

  it("корни и дети сортируются по savedAt по возрастанию (старые выше)", () => {
    const items = [
      mk("old", "strategic_3y", "2025-01-01T00:00:00.000Z"),
      mk("new", "strategic_3y", "2025-02-01T00:00:00.000Z"),
      mk("p", "block_12m", "2025-01-10T00:00:00.000Z", undefined, ["k"]),
      mk("c2", "quarter_3m", "2025-01-20T00:00:00.000Z", { parentOkrId: "p", parentKrIndex: 0 }),
      mk("c1", "quarter_3m", "2025-01-15T00:00:00.000Z", { parentOkrId: "p", parentKrIndex: 0 }),
    ];
    const forest = buildForest(items);
    expect(forest.map((n) => n.okr.id)).toEqual(["old", "p", "new"]);
    const pNode = forest.find((n) => n.okr.id === "p")!;
    expect(pNode.children.map((c) => c.okr.id)).toEqual(["c1", "c2"]);
  });
});
