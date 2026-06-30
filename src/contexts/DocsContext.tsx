import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";

export type DocCategory = "okr_context" | "methodology" | "solutions_kb";

export interface DocItem {
  id: string;
  name: string;
  category: DocCategory;
  text: string;
  size: number;
  addedAt: string;
}

export interface DocUsageEntry {
  id: string;
  name: string;
  category: DocCategory;
  includedChars: number;
  totalChars: number;
  truncated: boolean;
}

export interface DocsUsageReport {
  text: string;
  used: number;
  limit: number;
  docs: DocUsageEntry[];
}

interface DocsCtx {
  docs: DocItem[];
  add: (doc: Omit<DocItem, "id" | "addedAt">) => void;
  remove: (id: string) => void;
  clear: (category?: DocCategory) => void;
  byCategory: (category: DocCategory) => DocItem[];
  buildContext: (categories: DocCategory[], maxChars?: number) => string;
  buildContextWithUsage: (categories: DocCategory[], maxChars?: number) => DocsUsageReport;
}

const Ctx = createContext<DocsCtx | null>(null);
const SESSION_KEY = "aimbot.docs.session.v1";

const CATEGORY_LABELS: Record<DocCategory, string> = {
  okr_context: "КОНТЕКСТ КОМАНДЫ/ПРОДУКТА",
  methodology: "МЕТОДОЛОГИЯ И ПРАВИЛА",
  solutions_kb: "БАЗА ЗНАНИЙ ДЛЯ РЕШЕНИЙ",
};

/**
 * Recency-weighted budget allocation.
 * - Sort newest-first by addedAt.
 * - Assign weights n, n-1, ..., 1 (newest highest).
 * - Initial share = floor(maxChars * w_i / sum(w)); rounding remainder goes to newest.
 * - If a doc's full text fits in its share, take only what's needed; leftover redistributes
 *   to remaining docs newest-first.
 * Deterministic: depends only on docs + maxChars.
 */
const allocateBudget = (docs: DocItem[], maxChars: number): Map<string, number> => {
  const result = new Map<string, number>();
  if (!docs.length || maxChars <= 0) {
    docs.forEach((d) => result.set(d.id, 0));
    return result;
  }
  const sorted = [...docs].sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1)); // newest first
  const n = sorted.length;
  const weights = sorted.map((_, i) => n - i);
  const totalW = weights.reduce((a, b) => a + b, 0);
  const shares = weights.map((w) => Math.floor((maxChars * w) / totalW));
  const drift = maxChars - shares.reduce((a, b) => a + b, 0);
  shares[0] += drift;

  const allocated = shares.slice();
  let leftover = 0;
  for (let i = 0; i < n; i++) {
    const total = sorted[i].text.length;
    if (allocated[i] > total) {
      leftover += allocated[i] - total;
      allocated[i] = total;
    }
  }
  for (let i = 0; i < n && leftover > 0; i++) {
    const need = sorted[i].text.length - allocated[i];
    if (need > 0) {
      const add = Math.min(leftover, need);
      allocated[i] += add;
      leftover -= add;
    }
  }
  sorted.forEach((d, i) => result.set(d.id, allocated[i]));
  return result;
};

export const DocsProvider = ({ children }: { children: ReactNode }) => {
  const [docs, setDocs] = useState<DocItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as DocItem[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(docs));
    } catch {}
  }, [docs]);

  const add: DocsCtx["add"] = useCallback((doc) => {
    setDocs((p) => [
      ...p,
      { ...doc, id: crypto.randomUUID(), addedAt: new Date().toISOString() },
    ]);
  }, []);

  const remove = useCallback((id: string) => setDocs((p) => p.filter((d) => d.id !== id)), []);
  const clear = useCallback(
    (category?: DocCategory) => setDocs((p) => (category ? p.filter((d) => d.category !== category) : [])),
    [],
  );
  const byCategory = useCallback((c: DocCategory) => docs.filter((d) => d.category === c), [docs]);

  const buildContextWithUsage = useCallback<DocsCtx["buildContextWithUsage"]>(
    (categories, maxChars = 12000) => {
      const selected = docs.filter((d) => categories.includes(d.category));
      const alloc = allocateBudget(selected, maxChars);

      const parts: string[] = [];
      const entries: DocUsageEntry[] = [];
      let used = 0;

      for (const cat of categories) {
        const items = selected
          .filter((d) => d.category === cat)
          .sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1)); // newest first within category
        if (!items.length) continue;
        parts.push(`\n=== ${CATEGORY_LABELS[cat]} ===`);
        for (const it of items) {
          const quota = alloc.get(it.id) ?? 0;
          const slice = it.text.slice(0, quota);
          if (slice.length > 0) {
            const block = `\n--- ${it.name} ---\n${slice}${
              slice.length < it.text.length ? "\n…[truncated]" : ""
            }`;
            parts.push(block);
            used += slice.length;
          }
        }
      }

      for (const d of docs) {
        if (!categories.includes(d.category)) continue;
        const included = alloc.get(d.id) ?? 0;
        entries.push({
          id: d.id,
          name: d.name,
          category: d.category,
          includedChars: included,
          totalChars: d.text.length,
          truncated: included < d.text.length,
        });
      }

      return {
        text: parts.join("\n").trim(),
        used,
        limit: maxChars,
        docs: entries,
      };
    },
    [docs],
  );

  const buildContext = useCallback<DocsCtx["buildContext"]>(
    (categories, maxChars = 12000) => buildContextWithUsage(categories, maxChars).text,
    [buildContextWithUsage],
  );

  const value = useMemo(
    () => ({ docs, add, remove, clear, byCategory, buildContext, buildContextWithUsage }),
    [docs, add, remove, clear, byCategory, buildContext, buildContextWithUsage],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useDocs = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDocs must be used inside DocsProvider");
  return v;
};
