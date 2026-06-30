// Small text-guard utilities shared by edge-functions.
// Kept dependency-free so they can be unit-tested without spinning up Deno.serve.

/** Returns true if the string contains at least one ASCII or Unicode digit. */
export function containsDigits(text: string): boolean {
  if (typeof text !== "string") return false;
  return /\d/.test(text);
}
