import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export const AI_MODELS = [
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini", hint: "Баланс цены и качества (по умолчанию)" },
  { id: "gpt-4.1", label: "GPT-4.1", hint: "Сильнее, дороже" },
  { id: "gpt-4o", label: "GPT-4o", hint: "Топ OpenAI, мультимодал" },
  { id: "gpt-4o-mini", label: "GPT-4o mini", hint: "Дешёвый и быстрый" },
  { id: "gpt-5-mini", label: "GPT-5 mini", hint: "Новое поколение, быстрый" },
  { id: "claude-sonnet-4.5", label: "Claude Sonnet 4.5", hint: "Отлично для текста и аудита" },
  { id: "claude-haiku-4.5", label: "Claude Haiku 4.5", hint: "Быстрый и дешёвый" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", hint: "Большой контекст" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", hint: "Быстрый Gemini" },
  { id: "deepseek-v3.1", label: "DeepSeek V3.1", hint: "Очень дешёвый" },
] as const;

export type AiModelId = (typeof AI_MODELS)[number]["id"];
const DEFAULT_MODEL: AiModelId = "gpt-4.1-mini";
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
