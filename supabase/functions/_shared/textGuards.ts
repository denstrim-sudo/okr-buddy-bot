// Small text-guard utilities shared by edge-functions.
// Kept dependency-free so they can be unit-tested without spinning up Deno.serve.

/** Returns true if the string contains at least one ASCII or Unicode digit. */
export function containsDigits(text: string): boolean {
  if (typeof text !== "string") return false;
  return /\d/.test(text);
}

const normalize = (s: string) => String(s ?? "").toLowerCase().replace(/\s+/g, " ");

/**
 * Обоснована ли цитата: непустая (>=3 символов) дословная подстрока
 * объединённого исходного текста, без учёта регистра и повторяющихся пробелов.
 */
export function isEvidenceGrounded(evidence: string | undefined, sources: string[]): boolean {
  const ev = normalize(evidence ?? "").trim();
  if (ev.length < 3) return false;
  return normalize(sources.join(" \n ")).includes(ev);
}

/**
 * Проверяет, обоснован ли вердикт fail дословной цитатой из текста.
 * pass=true → всегда true (обоснование не требуется).
 * pass=false → evidence должна быть непустой подстрокой объединённого текста
 * objective + krTexts (без учёта регистра/повторяющихся пробелов).
 */
export function isGrounded(
  rule: { pass: boolean; evidence?: string },
  objective: string,
  krTexts: string[],
): boolean {
  if (rule.pass) return true;
  return isEvidenceGrounded(rule.evidence, [objective, ...krTexts]);
}
