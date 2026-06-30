import { useCallback, useEffect, useState } from "react";
import type { GeneratedPlan } from "@/types/okr";

export interface SavedOkr {
  id: string;
  objective: string;
  plan: GeneratedPlan;
  savedAt: string;
  parentOkrId?: string;
  parentKrIndex?: number;
}

const KEY = "aimbot.savedOkrs.v1";

const load = (): SavedOkr[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedOkr[]) : [];
  } catch {
    return [];
  }
};

export function useSavedOkrs() {
  const [items, setItems] = useState<SavedOkr[]>(() => load());

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {}
  }, [items]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setItems(load());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const save = useCallback(
    (
      objective: string,
      plan: GeneratedPlan,
      link?: { parentOkrId: string; parentKrIndex: number },
    ) => {
      const item: SavedOkr = {
        id: `okr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        objective: objective.trim() || plan.objective_refined || "Без названия",
        plan,
        savedAt: new Date().toISOString(),
        ...(link ? { parentOkrId: link.parentOkrId, parentKrIndex: link.parentKrIndex } : {}),
      };
      setItems((prev) => [item, ...prev]);
      return item;
    },
    [],
  );

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const getChildren = useCallback(
    (parentOkrId: string) =>
      items
        .filter((i) => i.parentOkrId === parentOkrId)
        .slice()
        .sort((a, b) => (a.savedAt < b.savedAt ? -1 : 1)),
    [items],
  );

  const getRoots = useCallback(() => items.filter((i) => !i.parentOkrId), [items]);

  const removeWithDescendants = useCallback((id: string) => {
    setItems((prev) => {
      const toRemove = new Set<string>();
      const collect = (targetId: string) => {
        toRemove.add(targetId);
        prev.filter((i) => i.parentOkrId === targetId).forEach((c) => collect(c.id));
      };
      collect(id);
      return prev.filter((i) => !toRemove.has(i.id));
    });
  }, []);

  return { items, save, remove, clear, getChildren, getRoots, removeWithDescendants };
}

/**
 * Возвращает true, если установка proposedParentId как родителя для childId
 * создаст цикл (т.е. proposedParentId уже является потомком childId,
 * либо childId === proposedParentId).
 */
export function detectCycle(
  items: SavedOkr[],
  childId: string,
  proposedParentId: string,
): boolean {
  if (childId === proposedParentId) return true;
  const childrenOf = (id: string) => items.filter((i) => i.parentOkrId === id);
  const stack: string[] = [childId];
  const visited = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const c of childrenOf(cur)) {
      if (c.id === proposedParentId) return true;
      stack.push(c.id);
    }
  }
  return false;
}
