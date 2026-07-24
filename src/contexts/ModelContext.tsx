import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AiModelEntry {
  id: string;
  label: string;
  hint: string;
}

export const DEFAULT_MODEL = "gpt-4o";
const STORAGE_KEY = "aimbot.aiModel";
export const CATALOG_LKG_KEY = "aimbot.aiModelCatalog.v1";
export const CATALOG_LKG_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const FALLBACK_CATALOG: AiModelEntry[] = [
  { id: "gpt-4o", label: "GPT-4o", hint: "Стабильный режим (по умолчанию)" },
  { id: "gpt-4o-mini", label: "GPT-4o mini", hint: "Дешевле" },
];

interface Ctx {
  model: string;
  setModel: (m: string) => void;
  models: AiModelEntry[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const ModelContext = createContext<Ctx>({
  model: DEFAULT_MODEL,
  setModel: () => {},
  models: FALLBACK_CATALOG,
  loading: false,
  refresh: async () => {},
});

export type InvokeFn = (name: string) => Promise<{ data: any; error: any }>;

/**
 * Pure fetcher: returns curated catalog from list-ai-models, or FALLBACK_CATALOG
 * on any failure (network / non-200 / empty list). Never throws.
 * Retries up to `maxAttempts` times with exponential backoff while the response
 * is degraded, and returns the best (non-degraded) attempt if any.
 */
export async function fetchModelCatalog(
  invoke: InvokeFn,
  opts: { retry?: boolean; retryDelayMs?: number; maxAttempts?: number } = {},
): Promise<{ models: AiModelEntry[]; degraded: boolean; stale?: boolean }> {
  const retry = opts.retry ?? true;
  const baseDelay = opts.retryDelayMs ?? 1200;
  const maxAttempts = retry ? (opts.maxAttempts ?? 3) : 1;
  const attempt = async (): Promise<{ models: AiModelEntry[]; degraded: boolean; stale?: boolean }> => {
    try {
      const { data, error } = await invoke("list-ai-models");
      if (error) throw error;
      const next: AiModelEntry[] = Array.isArray(data?.models) && data.models.length
        ? data.models
        : FALLBACK_CATALOG;
      return {
        models: next,
        degraded: Boolean(data?.degraded) || next === FALLBACK_CATALOG,
        stale: Boolean(data?.stale),
      };
    } catch (e) {
      console.warn("list-ai-models failed", e);
      return { models: FALLBACK_CATALOG, degraded: true };
    }
  };
  let best = await attempt();
  for (let i = 1; i < maxAttempts && best.degraded; i++) {
    const delay = baseDelay * Math.pow(2, i - 1);
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    const next = await attempt();
    if (!next.degraded) return next;
    best = next;
  }
  return best;
}

/**
 * Pure: if stored model is missing from catalog, fall back to DEFAULT_MODEL (or first available).
 */
export function resolveInitialModel(
  stored: string,
  catalog: AiModelEntry[],
): { model: string; switched: boolean } {
  if (catalog.some((m) => m.id === stored)) return { model: stored, switched: false };
  const fallback =
    catalog.find((m) => m.id === DEFAULT_MODEL)?.id ?? catalog[0]?.id ?? DEFAULT_MODEL;
  return { model: fallback, switched: true };
}

/** Read Last-Known-Good catalog from localStorage (or null if missing/expired/invalid). */
export function readCatalogLkg(now: number = Date.now()): AiModelEntry[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CATALOG_LKG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: number; models?: AiModelEntry[] };
    if (!parsed?.at || !Array.isArray(parsed.models) || !parsed.models.length) return null;
    if (now - parsed.at > CATALOG_LKG_TTL_MS) return null;
    return parsed.models.filter((m) => m && typeof m.id === "string");
  } catch {
    return null;
  }
}

export function writeCatalogLkg(models: AiModelEntry[], now: number = Date.now()): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CATALOG_LKG_KEY, JSON.stringify({ at: now, models }));
  } catch {}
}

export const ModelProvider = ({ children }: { children: ReactNode }) => {
  const [model, setModelState] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_MODEL;
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_MODEL;
  });
  const [models, setModels] = useState<AiModelEntry[]>(() => {
    const lkg = readCatalogLkg();
    return lkg && lkg.length ? lkg : FALLBACK_CATALOG;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, model);
    } catch {}
  }, [model]);

  const loadCatalog = async (manual = false) => {
    setLoading(true);
    const { models: next, degraded, stale } = await fetchModelCatalog((name) =>
      supabase.functions.invoke(name),
    );

    // If new response is degraded and we already have a richer catalog in memory
    // (from LKG or previous success), keep the richer one.
    let effective = next;
    setModels((prev) => {
      if (degraded && prev.length > next.length) {
        effective = prev;
        return prev;
      }
      return next;
    });

    if (!degraded) {
      writeCatalogLkg(next);
    }

    const { model: resolved, switched } = resolveInitialModel(model, effective);
    if (switched) {
      setModelState(resolved);
      toast.info(`Ранее выбранная модель «${model}» больше недоступна. Переключено на «${resolved}».`);
    }
    setLoading(false);
    if (manual) {
      if (degraded && stale) {
        toast.warning("Каталог показан из кэша — провайдер временно недоступен.");
      } else if (degraded) {
        toast.warning("Каталог моделей временно недоступен — показан сокращённый список.");
      } else {
        toast.success(`Загружено моделей: ${next.length}`);
      }
    }
  };

  useEffect(() => {
    if (import.meta.env.MODE === "test") {
      setLoading(false);
      return;
    }
    void loadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => {
    await loadCatalog(true);
  };

  return (
    <ModelContext.Provider value={{ model, setModel: setModelState, models, loading, refresh }}>
      {children}
    </ModelContext.Provider>
  );
};

export const useAiModel = () => useContext(ModelContext);

/**
 * Helper for invoke() result: shows a toast if the backend reports the model
 * was substituted at the AIAI.BY layer, returns the data unchanged.
 */
export function notifyModelFallback(data: unknown): void {
  if (!data || typeof data !== "object") return;
  const meta = (data as { _meta?: { requested_model?: string; used_model?: string; fallback_reason?: string } })._meta;
  if (!meta) return;
  if (meta.fallback_reason && meta.requested_model && meta.used_model && meta.requested_model !== meta.used_model) {
    toast.warning(
      `Модель «${meta.requested_model}» сейчас недоступна у провайдера. Запрос выполнен через «${meta.used_model}».`,
    );
  }
}
