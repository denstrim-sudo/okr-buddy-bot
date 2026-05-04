import { useCallback, useEffect, useState } from "react";
import type { GeneratedPlan } from "@/types/okr";

export interface SavedOkr {
  id: string;
  objective: string;
  plan: GeneratedPlan;
  savedAt: string;
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

  // sync across tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setItems(load());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const save = useCallback((objective: string, plan: GeneratedPlan) => {
    const item: SavedOkr = {
      id: `okr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      objective: objective.trim() || plan.objective_refined || "Без названия",
      plan,
      savedAt: new Date().toISOString(),
    };
    setItems((prev) => [item, ...prev]);
    return item;
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  return { items, save, remove, clear };
}
