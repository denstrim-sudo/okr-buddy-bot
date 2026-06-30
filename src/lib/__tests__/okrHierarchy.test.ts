import { describe, it, expect } from "vitest";
import { parentHorizonFor, eligibleParents } from "@/lib/okrHierarchy";
import type { SavedOkr } from "@/hooks/useSavedOkrs";
import type { OkrHorizon } from "@/types/okr";

const mk = (id: string, horizon?: OkrHorizon): SavedOkr => ({
  id,
  objective: id,
  plan: {
    objective_refined: id,
    score: 0,
    key_results: [],
    ...(horizon ? { horizon } : {}),
  },
  savedAt: new Date().toISOString(),
});

describe("parentHorizonFor", () => {
  it("quarter_3m → block_12m", () => {
    expect(parentHorizonFor("quarter_3m")).toBe("block_12m");
  });
  it("block_12m → strategic_3y", () => {
    expect(parentHorizonFor("block_12m")).toBe("strategic_3y");
  });
  it("strategic_3y → null (корень иерархии)", () => {
    expect(parentHorizonFor("strategic_3y")).toBeNull();
  });
});

describe("eligibleParents", () => {
  it("для quarter_3m возвращает только block_12m", () => {
    const items = [mk("a", "block_12m"), mk("b", "strategic_3y"), mk("c", "quarter_3m")];
    const out = eligibleParents(items, "quarter_3m");
    expect(out.map((i) => i.id)).toEqual(["a"]);
  });
  it("игнорирует записи без plan.horizon (старые до фазы 8a)", () => {
    const items = [mk("legacy"), mk("b", "block_12m")];
    const out = eligibleParents(items, "quarter_3m");
    expect(out.map((i) => i.id)).toEqual(["b"]);
  });
});
