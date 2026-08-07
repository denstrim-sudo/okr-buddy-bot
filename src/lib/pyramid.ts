import type { SavedOkr } from "@/hooks/useSavedOkrs";

export type PyramidLevel = "bank" | "direction";

export interface KrRef {
  okrId: string;
  krIndex: number;
}

export interface Contribution {
  from: KrRef;
  to: KrRef;
}

export interface PyramidState {
  levels: Record<string, PyramidLevel>;
  krMetrics: Record<string, string>;
  contributions: Contribution[];
}

export const emptyPyramid = (): PyramidState => ({ levels: {}, krMetrics: {}, contributions: [] });

export const krKey = (okrId: string, krIndex: number) => `${okrId}:${krIndex}`;

export const sameRef = (a: KrRef, b: KrRef) => a.okrId === b.okrId && a.krIndex === b.krIndex;

export type GapType = "kr_no_metric" | "direction_kr_no_parent" | "bank_kr_no_contributors";

export interface Gap {
  type: GapType;
  okrId: string;
  krIndex: number;
  objective: string;
  krText: string;
}

/** Валидные (не оборванные) связи: обе стороны ссылаются на существующие OKR/KR. */
export function liveContributions(items: SavedOkr[], state: PyramidState): Contribution[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const exists = (r: KrRef) => {
    const okr = byId.get(r.okrId);
    return Boolean(okr && okr.plan?.key_results?.[r.krIndex]);
  };
  return (state.contributions ?? []).filter((c) => c && exists(c.from) && exists(c.to));
}

export function findGaps(items: SavedOkr[], state: PyramidState): Gap[] {
  const links = liveContributions(items, state);
  const gaps: Gap[] = [];

  for (const okr of items) {
    const level = state.levels?.[okr.id];
    if (!level) continue;
    const krs = okr.plan?.key_results ?? [];
    krs.forEach((kr, krIndex) => {
      const base = { okrId: okr.id, krIndex, objective: okr.objective, krText: kr.text };
      if (!state.krMetrics?.[krKey(okr.id, krIndex)]) {
        gaps.push({ type: "kr_no_metric", ...base });
      }
      if (level === "direction") {
        const hasUp = links.some((c) => sameRef(c.from, { okrId: okr.id, krIndex }));
        if (!hasUp) gaps.push({ type: "direction_kr_no_parent", ...base });
      } else {
        const hasDown = links.some((c) => sameRef(c.to, { okrId: okr.id, krIndex }));
        if (!hasDown) gaps.push({ type: "bank_kr_no_contributors", ...base });
      }
    });
  }

  return gaps;
}

export const GAP_LABELS: Record<GapType, string> = {
  kr_no_metric: "нет метрики",
  direction_kr_no_parent: "нет связи вверх",
  bank_kr_no_contributors: "нет контрибьюторов",
};
