import type { SavedOkr } from "@/hooks/useSavedOkrs";
import type { PyramidSolution } from "@/lib/pyramid";
import { STORAGE_KEY, CUSTOM_KEY, type PersistedState } from "@/hooks/useSolutionStudio";

/**
 * Читает Решения Модуля 3 (без дублирования данных: пирамида только читает).
 * Происхождение KR восстанавливается по тексту KR сохранённого OKR — оно нужно
 * для автоподстановки метрики.
 */
export function readModule3Solutions(items: SavedOkr[]): PyramidSolution[] {
  let persisted: PersistedState | null = null;
  try {
    const raw = typeof window === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
    persisted = raw ? (JSON.parse(raw) as PersistedState) : null;
  } catch {
    persisted = null;
  }
  if (!persisted?.slices) return [];

  const out: PyramidSolution[] = [];
  for (const [sliceKey, slice] of Object.entries(persisted.slices)) {
    const krText = (slice?.krText ?? "").trim();
    let originOkrId: string | undefined;
    let originKrIndex: number | undefined;
    if (sliceKey !== CUSTOM_KEY && krText) {
      for (const okr of items) {
        const idx = (okr.plan?.key_results ?? []).findIndex((k) => k.text.trim() === krText);
        if (idx >= 0) {
          originOkrId = okr.id;
          originKrIndex = idx;
          break;
        }
      }
    }
    (slice?.solutions ?? []).forEach((s, i) => {
      const title = (s.bet || s.problem || s.id || `Решение ${i + 1}`).trim();
      out.push({
        id: `${sliceKey}:${i}`,
        title,
        description: [s.problem, s.bet, s.result_image, s.leading_metric].filter(Boolean).join(". "),
        ...(s.leading_metric?.trim() ? { leadingMetric: s.leading_metric.trim() } : {}),
        ...(originOkrId !== undefined ? { originOkrId, originKrIndex } : {}),
      });
    });
  }
  return out;
}
