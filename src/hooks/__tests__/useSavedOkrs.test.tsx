import { describe, it, expect, beforeEach, vi } from "vitest";
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

  it("save() возвращает { item, ok: true } при успешной записи", () => {
    const { result } = renderHook(() => useSavedOkrs());
    let res!: { item: SavedOkr; ok: boolean };
    act(() => {
      res = result.current.save("X", makePlan());
    });
    expect(res.ok).toBe(true);
    expect(res.item.id).toBeTruthy();
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
      parent = result.current.save("P", makePlan()).item;
    });
    let c1!: SavedOkr, c2!: SavedOkr;
    act(() => {
      c1 = result.current.save("c1", makePlan(), { parentOkrId: parent.id, parentKrIndex: 0 }).item;
    });
    act(() => {
      c2 = result.current.save("c2", makePlan(), { parentOkrId: parent.id, parentKrIndex: 1 }).item;
    });
    const children = result.current.getChildren(parent.id);
    expect(children.map((c) => c.id)).toEqual([c1.id, c2.id]);
  });

  it("getRoots() возвращает OKR без parentOkrId", () => {
    const { result } = renderHook(() => useSavedOkrs());
    let root!: SavedOkr;
    act(() => {
      root = result.current.save("root", makePlan("strategic_3y")).item;
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
      a = result.current.save("A", makePlan()).item;
    });
    act(() => {
      b = result.current.save("B", makePlan(), { parentOkrId: a.id, parentKrIndex: 0 }).item;
    });
    act(() => {
      c = result.current.save("C", makePlan(), { parentOkrId: b.id, parentKrIndex: 0 }).item;
    });
    expect(result.current.items).toHaveLength(3);
    act(() => {
      result.current.removeWithDescendants(a.id);
    });
    expect(result.current.items).toHaveLength(0);
    expect(b.id && c.id).toBeTruthy();
  });

  describe("exportJson / importJson", () => {
    it("exportJson() возвращает строку с версией схемы и массивом items", () => {
      const { result } = renderHook(() => useSavedOkrs());
      act(() => {
        result.current.save("A", makePlan("quarter_3m"));
      });
      const raw = result.current.exportJson();
      const parsed = JSON.parse(raw);
      expect(parsed.version).toBe("aimbot.savedOkrs.v1");
      expect(Array.isArray(parsed.items)).toBe(true);
      expect(parsed.items).toHaveLength(1);
      expect(parsed.items[0].objective).toBe("A");
    });

    it("importJson(replace) заменяет все items содержимым файла", () => {
      const { result } = renderHook(() => useSavedOkrs());
      act(() => { result.current.save("old", makePlan()); });
      const payload = JSON.stringify({
        version: "aimbot.savedOkrs.v1",
        items: [{ id: "new_1", objective: "new", plan: makePlan(), savedAt: new Date().toISOString() }],
      });
      let res!: any;
      act(() => { res = result.current.importJson(payload, "replace"); });
      expect(res.ok).toBe(true);
      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0].id).toBe("new_1");
    });

    it("importJson(merge) добавляет items, пропуская дубли по id", () => {
      const { result } = renderHook(() => useSavedOkrs());
      let existing!: SavedOkr;
      act(() => { existing = result.current.save("keep", makePlan()).item; });
      const payload = JSON.stringify({
        version: "aimbot.savedOkrs.v1",
        items: [
          { id: existing.id, objective: "dup", plan: makePlan(), savedAt: new Date().toISOString() },
          { id: "fresh", objective: "fresh", plan: makePlan(), savedAt: new Date().toISOString() },
        ],
      });
      let res!: any;
      act(() => { res = result.current.importJson(payload, "merge"); });
      expect(res.ok).toBe(true);
      expect(res.skipped).toBe(1);
      expect(result.current.items.map((i) => i.id).sort()).toEqual([existing.id, "fresh"].sort());
    });

    it("importJson с невалидным JSON возвращает ok:false и не меняет items", () => {
      const { result } = renderHook(() => useSavedOkrs());
      act(() => { result.current.save("keep", makePlan()); });
      const before = result.current.items;
      let res!: any;
      act(() => { res = result.current.importJson("{ not json", "replace"); });
      expect(res.ok).toBe(false);
      expect(result.current.items).toBe(before);
    });

    it("importJson с чужой version возвращает ok:false", () => {
      const { result } = renderHook(() => useSavedOkrs());
      const payload = JSON.stringify({ version: "other.app.v9", items: [] });
      let res!: any;
      act(() => { res = result.current.importJson(payload, "replace"); });
      expect(res.ok).toBe(false);
    });

    it("importJson merge не создаёт цикл (сирота вместо цикла)", () => {
      const { result } = renderHook(() => useSavedOkrs());
      // Файл содержит два элемента: A с parent=B и B с parent=A → цикл
      const payload = JSON.stringify({
        version: "aimbot.savedOkrs.v1",
        items: [
          { id: "A", objective: "A", plan: makePlan(), savedAt: "2025-01-01T00:00:00.000Z" },
          { id: "B", objective: "B", plan: makePlan(), savedAt: "2025-01-02T00:00:00.000Z", parentOkrId: "A", parentKrIndex: 0 },
          { id: "C", objective: "C", plan: makePlan(), savedAt: "2025-01-03T00:00:00.000Z", parentOkrId: "B", parentKrIndex: 0 },
        ],
      });
      // Затем ещё один файл, где A ссылается на C — цикл A→C→B→A
      act(() => { result.current.importJson(payload, "replace"); });
      const cyclePayload = JSON.stringify({
        version: "aimbot.savedOkrs.v1",
        items: [
          { id: "D", objective: "D", plan: makePlan(), savedAt: "2025-02-01T00:00:00.000Z", parentOkrId: "D", parentKrIndex: 0 },
        ],
      });
      let res!: any;
      act(() => { res = result.current.importJson(cyclePayload, "merge"); });
      expect(res.ok).toBe(true);
      const d = result.current.items.find((i) => i.id === "D");
      expect(d?.parentOkrId).toBeUndefined();
    });
  });

  describe("persistError", () => {
    it("если localStorage.setItem бросает, save() возвращает ok:false и persistError=true", () => {
      const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("QuotaExceeded");
      });
      const { result } = renderHook(() => useSavedOkrs());
      let res!: { item: SavedOkr; ok: boolean };
      act(() => { res = result.current.save("X", makePlan()); });
      expect(res.ok).toBe(false);
      expect(result.current.persistError).toBe(true);
      spy.mockRestore();
    });

    it("успешная запись сбрасывает persistError в false", () => {
      const { result } = renderHook(() => useSavedOkrs());
      act(() => { result.current.save("ok", makePlan()); });
      expect(result.current.persistError).toBe(false);
    });
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
