/**
 * Курируемый каталог моделей AIAI.BY (сверен с /models 08.11.2026).
 * slow = reasoning-модель: отвечает дольше, получает больший бюджет первой попытки.
 */
export interface CuratedModel { id: string; label: string; hint: string; slow?: boolean }

const SLOW = " · медленная, думает дольше";

export const CURATED_MODELS: CuratedModel[] = [
  { id: "gpt-4o", label: "GPT-4o", hint: "Стабильный режим (по умолчанию)" },
  { id: "gpt-6.1-sol", label: "GPT-6.1 Sol", hint: "OpenAI, новейшее поколение" + SLOW, slow: true },
  { id: "gpt-5.5", label: "GPT-5.5", hint: "OpenAI, сильная модель" + SLOW, slow: true },
  { id: "gpt-5.4-mini", label: "GPT-5.4 mini", hint: "OpenAI, баланс цены и качества" },
  { id: "gpt-4.1", label: "GPT-4.1", hint: "OpenAI, без рассуждений, быстро" },
  { id: "claude-opus-5.5", label: "Claude Opus 5.5", hint: "Anthropic, премиум-качество" + SLOW, slow: true },
  { id: "claude-sonnet-5.5", label: "Claude Sonnet 5.5", hint: "Anthropic, силён в аудите текста" },
  { id: "claude-sonnet-4.6", label: "Claude Sonnet 4.6", hint: "Anthropic, проверенный" },
  { id: "claude-haiku-5.5", label: "Claude Haiku 5.5", hint: "Anthropic, быстрый и дешёвый" },
  { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro", hint: "Google, топ-модель" + SLOW, slow: true },
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", hint: "Google, новейший быстрый" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", hint: "Google, быстрый и точный" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", hint: "Google, проверенная" + SLOW, slow: true },
  { id: "deepseek-v4-pro", label: "DeepSeek v4 Pro", hint: "Сильный open-weight" + SLOW, slow: true },
  { id: "deepseek-v4.1-flash", label: "DeepSeek v4.1 Flash", hint: "Очень дешёвый и быстрый" },
  { id: "grok-4.7", label: "Grok 4.7", hint: "xAI, новое поколение" + SLOW, slow: true },
  { id: "qwen3.8-max", label: "Qwen 3.8 Max", hint: "Alibaba, сильная модель" + SLOW, slow: true },
  { id: "kimi-k3.1-pro", label: "Kimi K3.1 Pro", hint: "Moonshot, длинный контекст" + SLOW, slow: true },
  { id: "glm-5.3", label: "GLM-5.3", hint: "Zhipu, сильный open-weight" },
  { id: "minimax-m3", label: "MiniMax M3", hint: "Дешёвая альтернатива" },
];

/** Для моделей вне каталога — эвристика по имени. */
const SLOW_PATTERN = /(^o\d|^gpt-[56]|opus|-pro$|-pro-|thinking|reasoning|^grok-|-max$|deepseek-r)/;

export const isSlowModel = (id?: string): boolean => {
  if (!id) return false;
  const m = CURATED_MODELS.find((c) => c.id === id);
  if (m) return !!m.slow;
  return SLOW_PATTERN.test(id) && !/mini|flash|nano/.test(id);
};

export const FAST_PRIMARY_ATTEMPT_MS = 100_000;
/** 140с общего бюджета − 120с = 20с на GPT-4o (≥ MIN_ATTEMPT_MS). */
export const SLOW_PRIMARY_ATTEMPT_MS = 120_000;

export const primaryAttemptMsFor = (id?: string) =>
  isSlowModel(id) ? SLOW_PRIMARY_ATTEMPT_MS : FAST_PRIMARY_ATTEMPT_MS;
