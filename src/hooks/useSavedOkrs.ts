import { useCallback, useEffect, useRef, useState } from "react";
import type { GeneratedPlan, OkrOrigin, OkrStatus, OkrType } from "@/types/okr";

export interface OkrMeta {
  okrType?: OkrType;
  okrStatus?: OkrStatus;
  okrOrigin?: OkrOrigin;
  owner?: string;
  wayKnown?: boolean;
}

export interface SavedOkr {
  id: string;
  objective: string;
  plan: GeneratedPlan;
  savedAt: string;
  /** Обновляется при replace(). savedAt сохраняется исходным, чтобы не ломать
   *  порядок в дереве / сортировки. */
  updatedAt?: string;
  parentOkrId?: string;
  parentKrIndex?: number;
  /** Тип и статус OKR (OKR-PI). Необязательные: старые записи без них валидны. */
  okrType?: OkrType;
  /** Устарело (до 09.10.2026). Новые записи пишут okrOrigin. */
  okrStatus?: OkrStatus;
  okrOrigin?: OkrOrigin;
  owner?: string;
  wayKnown?: boolean;
}

export interface OkrExport {
  version: string;
  items: SavedOkr[];
}

export type ImportMode = "replace" | "merge";
export type ImportResult =
  | { ok: true; count: number; skipped?: number }
  | { ok: false; error: string };

const KEY = "aimbot.savedOkrs.v1";

// Монотонный счётчик — чтобы savedAt был строго возрастающим даже при
// нескольких save() внутри одного мс (иначе сортировка нестабильна).
let saveSeq = 0;
const nextSavedAt = () => new Date(Date.now() + saveSeq++).toISOString();

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
  const [persistError, setPersistError] = useState(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) {
        const fresh = load();
        itemsRef.current = fresh;
        setItems(fresh);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persist = useCallback((next: SavedOkr[]): boolean => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      setPersistError(false);
      return true;
    } catch {
      setPersistError(true);
      return false;
    }
  }, []);

  const commit = useCallback(
    (next: SavedOkr[]): boolean => {
      const ok = persist(next);
      itemsRef.current = next;
      setItems(next);
      return ok;
    },
    [persist],
  );

  const save = useCallback(
    (
      objective: string,
      plan: GeneratedPlan,
      link?: { parentOkrId: string; parentKrIndex: number },
      meta?: OkrMeta,
    ): { item: SavedOkr; ok: boolean } => {
      const item: SavedOkr = {
        id: `okr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        objective: objective.trim() || plan.objective_refined || "Без названия",
        plan,
        savedAt: nextSavedAt(),
        ...(link ? { parentOkrId: link.parentOkrId, parentKrIndex: link.parentKrIndex } : {}),
        ...(meta?.okrType ? { okrType: meta.okrType } : {}),
        ...(meta?.okrStatus ? { okrStatus: meta.okrStatus } : {}),
        ...(meta?.okrOrigin ? { okrOrigin: meta.okrOrigin } : {}),
        ...(meta?.owner ? { owner: meta.owner } : {}),
        ...(meta?.wayKnown === false ? { wayKnown: false } : {}),
      };
      const ok = commit([item, ...itemsRef.current]);
      return { item, ok };
    },
    [commit],
  );

  const replace = useCallback(
    (
      id: string,
      objective: string,
      plan: GeneratedPlan,
      meta?: OkrMeta,
    ): { ok: boolean; item?: SavedOkr } => {
      const current = itemsRef.current;
      const idx = current.findIndex((x) => x.id === id);
      if (idx === -1) return { ok: false };
      const prev = current[idx];
      const updated: SavedOkr = {
        ...prev,
        objective: objective.trim() || plan.objective_refined || prev.objective,
        plan,
        updatedAt: new Date().toISOString(),
        ...(meta && "okrType" in meta ? { okrType: meta.okrType } : {}),
        ...(meta && "okrStatus" in meta ? { okrStatus: meta.okrStatus } : {}),
        ...(meta && "okrOrigin" in meta ? { okrOrigin: meta.okrOrigin, okrStatus: undefined } : {}),
        ...(meta && "owner" in meta ? { owner: meta.owner } : {}),
        ...(meta && "wayKnown" in meta ? { wayKnown: meta.wayKnown } : {}),
        // id / savedAt / parentOkrId / parentKrIndex — СОХРАНЯЕМ исходные, чтобы:
        // (1) дети продолжали ссылаться на этот id,
        // (2) связь с родителем не терялась,
        // (3) порядок в дереве не прыгал.
      };
      const next = current.slice();
      next[idx] = updated;
      const ok = commit(next);
      return { ok, ...(ok ? { item: updated } : {}) };
    },
    [commit],
  );

  const remove = useCallback(
    (id: string) => {
      commit(itemsRef.current.filter((x) => x.id !== id));
    },
    [commit],
  );

  const clear = useCallback(() => {
    commit([]);
  }, [commit]);

  const getChildren = useCallback(
    (parentOkrId: string) =>
      items
        .filter((i) => i.parentOkrId === parentOkrId)
        .slice()
        .sort((a, b) => (a.savedAt < b.savedAt ? -1 : 1)),
    [items],
  );

  const getRoots = useCallback(() => items.filter((i) => !i.parentOkrId), [items]);

  const removeWithDescendants = useCallback(
    (id: string) => {
      const toRemove = new Set<string>();
      const collect = (targetId: string) => {
        toRemove.add(targetId);
        itemsRef.current.filter((i) => i.parentOkrId === targetId).forEach((c) => collect(c.id));
      };
      collect(id);
      commit(itemsRef.current.filter((i) => !toRemove.has(i.id)));
    },
    [commit],
  );

  const exportJson = useCallback(
    () => JSON.stringify({ version: KEY, items } satisfies OkrExport, null, 2),
    [items],
  );

  const importJson = useCallback(
    (raw: string, mode: ImportMode): ImportResult => {
      let parsed: OkrExport;
      try {
        parsed = JSON.parse(raw) as OkrExport;
      } catch {
        return { ok: false, error: "Не удалось прочитать файл" };
      }
      if (!parsed || parsed.version !== KEY || !Array.isArray(parsed.items)) {
        return { ok: false, error: "Несовместимый формат файла" };
      }
      // Валидация формы элементов
      const valid = parsed.items.filter(
        (i) => i && typeof i.id === "string" && typeof i.objective === "string" && i.plan,
      );

      let next: SavedOkr[];
      let skipped = 0;
      if (mode === "replace") {
        next = valid;
      } else {
        const existingIds = new Set(itemsRef.current.map((i) => i.id));
        const additions: SavedOkr[] = [];
        // Инкрементально добавляем в кандидатный список, проверяя цикл через detectCycle
        const candidate: SavedOkr[] = [...itemsRef.current];
        for (const inc of valid) {
          if (existingIds.has(inc.id)) {
            skipped++;
            continue;
          }
          // Если у входящего есть parent, проверяем, что не появится цикл.
          if (inc.parentOkrId) {
            const withInc = [...candidate, inc];
            if (detectCycle(withInc, inc.id, inc.parentOkrId)) {
              // отбрасываем родителя, оставляем как сироту
              const orphan = { ...inc } as SavedOkr;
              delete orphan.parentOkrId;
              delete orphan.parentKrIndex;
              candidate.push(orphan);
              additions.push(orphan);
              existingIds.add(orphan.id);
              continue;
            }
          }
          candidate.push(inc);
          additions.push(inc);
          existingIds.add(inc.id);
        }
        next = [...additions, ...itemsRef.current];
      }

      const ok = commit(next);
      if (!ok) return { ok: false, error: "Хранилище недоступно" };
      return { ok: true, count: valid.length, skipped };
    },
    [commit],
  );

  return {
    items,
    persistError,
    save,
    replace,
    remove,
    clear,
    getChildren,
    getRoots,
    removeWithDescendants,
    exportJson,
    importJson,
  };
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
