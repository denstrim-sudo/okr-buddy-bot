import { createContext, useContext, useEffect, useState, ReactNode } from "react";

// ВАЖНО: показываем только модели, которые не ломают пользовательский сценарий.
// Claude/Gemini у текущего шлюза могут быть временно недоступны; backend подстрахует fallback на GPT-4o mini.
export const AI_MODELS = [
  { id: "gpt-4o", label: "GPT-4o", hint: "Стабильный режим (по умолчанию)" },
  { id: "gpt-4o-mini", label: "GPT-4o mini", hint: "Дешевле, может отвечать медленнее" },
  { id: "claude-3.5-haiku", label: "Claude 3.5 Haiku", hint: "Быстрый Claude" },
  { id: "deepseek-chat", label: "DeepSeek Chat", hint: "Очень дешёвый" },
  { id: "llama-3.3-70b", label: "Llama 3.3 70B", hint: "Open-source" },
] as const;

export type AiModelId = (typeof AI_MODELS)[number]["id"];
const DEFAULT_MODEL: AiModelId = "gpt-4o";
const STORAGE_KEY = "aimbot.aiModel";

interface Ctx {
  model: AiModelId;
  setModel: (m: AiModelId) => void;
}

const ModelContext = createContext<Ctx>({ model: DEFAULT_MODEL, setModel: () => {} });

export const ModelProvider = ({ children }: { children: ReactNode }) => {
  const [model, setModelState] = useState<AiModelId>(() => {
    if (typeof window === "undefined") return DEFAULT_MODEL;
    const v = localStorage.getItem(STORAGE_KEY) as AiModelId | null;
    return v && AI_MODELS.some((m) => m.id === v) ? v : DEFAULT_MODEL;
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, model); } catch {}
  }, [model]);

  return <ModelContext.Provider value={{ model, setModel: setModelState }}>{children}</ModelContext.Provider>;
};

export const useAiModel = () => useContext(ModelContext);
