import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSavedOkrs, detectCycle, type SavedOkr } from "@/hooks/useSavedOkrs";
import type { GeneratedPlan, OkrHorizon } from "@/types/okr";

const makePlan = (horizon?: OkrHorizon): GeneratedPlan => ({
  objective_refined: "Obj",
  score: 80,
  key_results: [
    { text: "KR1", baseline: "0", target: "1", metric: "%", kr_type: "leading", solutions: [] },
  ],
  ...(horizon ? { horizon } : {}),
});

describe("useSavedOkrs", () => {
  beforeEach(() => localStorage.clear());

  it("save() сохраняет horizon из переданного plan", () => {
    const { result } = renderHook(() => useSavedOkrs());
    act(() => {
      result.current.save("Цель 1", makePlan("quarter_3m"));
    });
    expect(result.current.items[0].plan.horizon).toBe("quarter_3m");
  });

  it("save() с link сохраняет parentOkrId/parentKrIndex", () => {
    const { result } = renderHook(() => useSavedOkrs());
    act(() => {
      result.current.save("child", makePlan(), { parentOkrId: "okr_1", parentKrIndex: 0 });
    });
    expect(result.current.items[0].parentOkrId).toBe("okr_1");
    expect(result.current.items[0].parentKrIndex).toBe(0);
  });

  it("save() без link оставляет parent-поля undefined", () => {
    const { result } = renderHook(() => useSavedOkrs());
    act(() => {
      result.current.save("solo", makePlan());
    });
    expect(result.current.items[0].parentOkrId).toBeUndefined();
    expect(result.current.items[0].parentKrIndex).toBeUndefined();
  });

  it("getChildren() возвращает потомков, отсортированных по savedAt", () => {
    const { result } = renderHook(() => useSavedOkrs());
    let parent!: SavedOkr;
    act(() => {
      parent = result.current.save("P", makePlan());
    });
    let c1!: SavedOkr, c2!: SavedOkr;
    act(() => {
      c1 = result.current.save("c1", makePlan(), { parentOkrId: parent.id, parentKrIndex: 0 });
    });
    act(() => {
      c2 = result.current.save("c2", makePlan(), { parentOkrId: parent.id, parentKrIndex: 1 });
    });
    const children = result.current.getChildren(parent.id);
    expect(children.map((c) => c.id)).toEqual([c1.id, c2.id]);
  });

  it("getRoots() возвращает OKR без parentOkrId", () => {
    const { result } = renderHook(() => useSavedOkrs());
    let root!: SavedOkr;
    act(() => {
      root = result.current.save("root", makePlan("strategic_3y"));
    });
    act(() => {
      result.current.save("child", makePlan(), { parentOkrId: root.id, parentKrIndex: 0 });
    });
    const roots = result.current.getRoots();
    expect(roots.map((r) => r.id)).toEqual([root.id]);
  });

  it("removeWithDescendants() удаляет узел и всех потомков рекурсивно", () => {
    const { result } = renderHook(() => useSavedOkrs());
    let a!: SavedOkr, b!: SavedOkr, c!: SavedOkr;
    act(() => {
      a = result.current.save("A", makePlan());
    });
    act(() => {
      b = result.current.save("B", makePlan(), { parentOkrId: a.id, parentKrIndex: 0 });
    });
    act(() => {
      c = result.current.save("C", makePlan(), { parentOkrId: b.id, parentKrIndex: 0 });
    });
    expect(result.current.items).toHaveLength(3);
    act(() => {
      result.current.removeWithDescendants(a.id);
    });
    expect(result.current.items).toHaveLength(0);
    expect(b.id && c.id).toBeTruthy();
  });
});

describe("detectCycle", () => {
  const mk = (id: string, parentOkrId?: string): SavedOkr => ({
    id,
    objective: id,
    plan: { objective_refined: id, score: 0, key_results: [] },
    savedAt: new Date().toISOString(),
    parentOkrId,
    parentKrIndex: parentOkrId ? 0 : undefined,
  });

  it("возвращает true, если proposedParent уже потомок child (цикл)", () => {
    // A -> B -> C ; нельзя сделать C родителем A
    const items: SavedOkr[] = [mk("A"), mk("B", "A"), mk("C", "B")];
    expect(detectCycle(items, "A", "C")).toBe(true);
  });

  it("возвращает false для валидной связи", () => {
    const items: SavedOkr[] = [mk("A"), mk("B", "A")];
    expect(detectCycle(items, "C", "A")).toBe(false);
  });

  it("возвращает true для self-parent", () => {
    const items: SavedOkr[] = [mk("A")];
    expect(detectCycle(items, "A", "A")).toBe(true);
  });
});
