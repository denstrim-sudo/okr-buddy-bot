import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AiModelEntry {
  id: string;
  label: string;
  hint: string;
}

const DEFAULT_MODEL = "gpt-4o";
const STORAGE_KEY = "aimbot.aiModel";
const FALLBACK_CATALOG: AiModelEntry[] = [
  { id: "gpt-4o", label: "GPT-4o", hint: "Стабильный режим (по умолчанию)" },
  { id: "gpt-4o-mini", label: "GPT-4o mini", hint: "Дешевле" },
];

interface Ctx {
  model: string;
  setModel: (m: string) => void;
  models: AiModelEntry[];
  loading: boolean;
}

const ModelContext = createContext<Ctx>({
  model: DEFAULT_MODEL,
  setModel: () => {},
  models: FALLBACK_CATALOG,
  loading: false,
});

export const ModelProvider = ({ children }: { children: ReactNode }) => {
  const [model, setModelState] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_MODEL;
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_MODEL;
  });
  const [models, setModels] = useState<AiModelEntry[]>(FALLBACK_CATALOG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, model);
    } catch {}
  }, [model]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("list-ai-models");
        if (cancelled) return;
        if (error) throw error;
        const next: AiModelEntry[] = Array.isArray(data?.models) && data.models.length ? data.models : FALLBACK_CATALOG;
        setModels(next);
        // Если сохранённая модель больше недоступна — сбросить на дефолт.
        if (!next.some((m) => m.id === model)) {
          const fallback = next.find((m) => m.id === DEFAULT_MODEL)?.id ?? next[0].id;
          setModelState(fallback);
          toast.info(`Ранее выбранная модель «${model}» больше недоступна. Переключено на «${fallback}».`);
        }
      } catch (e) {
        console.warn("list-ai-models failed, using fallback catalog", e);
        if (!cancelled) setModels(FALLBACK_CATALOG);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ModelContext.Provider value={{ model, setModel: setModelState, models, loading }}>
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
