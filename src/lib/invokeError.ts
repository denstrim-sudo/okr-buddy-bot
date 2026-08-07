/**
 * Единый разбор ошибки supabase.functions.invoke.
 * Возвращает понятное пользователю сообщение на русском.
 */
export function describeInvokeError(error: unknown, data?: unknown): string {
  const bodyError = (data as { error?: unknown } | null | undefined)?.error;
  if (typeof bodyError === "string" && bodyError.trim()) return bodyError;

  const raw = (error as { message?: string } | null | undefined)?.message ?? "";

  if (/failed to send|failed to fetch|network|load failed/i.test(raw)) {
    return "Превышено время ожидания ответа AI. Попробуйте ещё раз или выберите стабильную модель GPT-4o.";
  }
  if (/rate/i.test(raw)) return "Слишком много запросов. Подождите немного и повторите.";
  if (/credits|402/i.test(raw)) return "Закончились AI-кредиты. Пополните баланс.";
  return raw || "Не удалось выполнить запрос к AI";
}
