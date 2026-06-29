import { createContext, useContext, useEffect, useState, ReactNode } from "react";

// ВАЖНО: список собран живыми пробами через AIAI.BY (https://vedai.by/api/v1).
// Если выбранная модель временно ляжет — backend в _shared/ai.ts автоматически переключит на GPT-4o.
export const AI_MODELS = [
  { id: "gpt-4o", label: "GPT-4o", hint: "Стабильный режим (по умолчанию)" },
  { id: "gpt-4o-mini", label: "GPT-4o mini", hint: "Дешевле, чуть медленнее" },
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", hint: "Сильный Claude, хорош для текста и аудита" },
  { id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet", hint: "Проверенный Claude" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", hint: "Быстрый Claude" },
  { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", hint: "Большой контекст, сильная модель" },
  { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash", hint: "Быстрый Gemini" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", hint: "Самый дешёвый Gemini" },
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
