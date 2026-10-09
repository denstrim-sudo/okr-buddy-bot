import type { OkrOrigin, OkrStatus } from "@/types/okr";

export const ORIGIN_LABELS: Record<OkrOrigin, string> = {
  regular: "Обычный OKR",
  growth_direction: "Из направления роста",
  protection_direction: "Из защитного направления",
};

export const isDirectionOrigin = (o: OkrOrigin) => o === "growth_direction" || o === "protection_direction";

/**
 * Происхождение OKR с учётом старых записей (до 09.10.2026 был только статус).
 * needsCheck=true — старый статус «направление» переведён в «рост» автоматически,
 * пользователю стоит проверить, не защитное ли это направление.
 */
export function originFromLegacy(rec: { okrOrigin?: OkrOrigin; okrStatus?: OkrStatus }): { origin: OkrOrigin; needsCheck: boolean } {
  if (rec.okrOrigin) return { origin: rec.okrOrigin, needsCheck: false };
  if (rec.okrStatus === "direction") return { origin: "growth_direction", needsCheck: true };
  return { origin: "regular", needsCheck: false };
}
