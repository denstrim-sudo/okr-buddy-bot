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

/** OKR-PI: цифра в Objective. Слова «первый», «один» цифрами не считаются. */
export function hasDigitsInObjective(objective: string): boolean {
  return /\d/.test(String(objective ?? ""));
}

const EXEC_INFINITIVES = new Set(["запустить", "внедрить", "перевести", "построить", "launch", "implement", "migrate", "build"]);
const EXEC_NOUNS_AT_START = new Set(["запуск", "внедрение", "перевод", "построение"]);

/**
 * Глагол исполнения в KR (совпадение по словам целиком, без учёта регистра):
 * инфинитивы — где угодно, отглагольные существительные — только первым словом.
 */
export function findExecutionVerb(krText: string): string | null {
  const words = String(krText ?? "").toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  if (words.length && EXEC_NOUNS_AT_START.has(words[0])) return words[0];
  return words.find((w) => EXEC_INFINITIVES.has(w)) ?? null;
}
