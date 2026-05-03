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

interface DocsCtx {
  docs: DocItem[];
  add: (doc: Omit<DocItem, "id" | "addedAt">) => void;
  remove: (id: string) => void;
  clear: (category?: DocCategory) => void;
  byCategory: (category: DocCategory) => DocItem[];
  buildContext: (categories: DocCategory[], maxChars?: number) => string;
}

const Ctx = createContext<DocsCtx | null>(null);
const SESSION_KEY = "aimbot.docs.session.v1";

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

  const buildContext = useCallback(
    (categories: DocCategory[], maxChars = 12000) => {
      const labels: Record<DocCategory, string> = {
        okr_context: "КОНТЕКСТ КОМАНДЫ/ПРОДУКТА",
        methodology: "МЕТОДОЛОГИЯ И ПРАВИЛА",
        solutions_kb: "БАЗА ЗНАНИЙ ДЛЯ РЕШЕНИЙ",
      };
      const parts: string[] = [];
      let used = 0;
      for (const cat of categories) {
        const items = docs.filter((d) => d.category === cat);
        if (!items.length) continue;
        parts.push(`\n=== ${labels[cat]} ===`);
        for (const it of items) {
          const remaining = maxChars - used;
          if (remaining < 200) break;
          const slice = it.text.slice(0, Math.max(200, Math.floor(remaining / items.length)));
          const block = `\n--- ${it.name} ---\n${slice}${it.text.length > slice.length ? "\n…[truncated]" : ""}`;
          parts.push(block);
          used += block.length;
        }
      }
      return parts.join("\n").trim();
    },
    [docs],
  );

  const value = useMemo(
    () => ({ docs, add, remove, clear, byCategory, buildContext }),
    [docs, add, remove, clear, byCategory, buildContext],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useDocs = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDocs must be used inside DocsProvider");
  return v;
};
