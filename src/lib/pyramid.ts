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
  /** Фаза 2: связи Решений (Модуль 3) с метриками, many-to-many. */
  solutionMetrics: SolutionMetricLink[];
}

export const emptyPyramid = (): PyramidState => ({
  levels: {},
  krMetrics: {},
  contributions: [],
  solutionMetrics: [],
});

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

export const LEVEL_LABELS: Record<PyramidLevel, string> = {
  bank: "Банк",
  direction: "Направление",
};

export interface ContributionDescription {
  level?: PyramidLevel;
  levelLabel: string;
  krLabel: string;
  krText: string;
  okrObjective: string;
  orphaned: boolean;
}

/** Описание связи вверх для отображения: конкретный KR родителя, а не Objective. */
export function describeContribution(
  contribution: Contribution,
  items: SavedOkr[],
  state: PyramidState = emptyPyramid(),
): ContributionDescription {
  const { okrId, krIndex } = contribution.to;
  const parent = items.find((i) => i.id === okrId);
  const kr = parent?.plan?.key_results?.[krIndex];
  const level = parent ? state.levels?.[okrId] : undefined;
  return {
    level,
    levelLabel: level ? LEVEL_LABELS[level] : "",
    krLabel: `KR${krIndex + 1}`,
    krText: kr?.text ?? "",
    okrObjective: parent?.objective ?? "",
    orphaned: !parent || !kr,
  };
}

/* ------------------------------------------------------------------ *
 * Фаза 2: Решения (Модуль 3) → метрики → KR направления → KR банка
 * ------------------------------------------------------------------ */

export interface SolutionMetricLink {
  solutionId: string;
  metricId: string;
}

/** Решение, прочитанное из Модуля 3 (дубля данных не создаём). */
export interface PyramidSolution {
  id: string;
  title: string;
  description?: string;
  /** KR, под которым Решение родилось в Модуле 3 (для автоподстановки метрики). */
  originOkrId?: string;
  originKrIndex?: number;
}

export interface MetricLike {
  id: string;
  name: string;
  unit?: string;
}

/** Метрика KR-происхождения Решения — автоподстановка при первой привязке. */
export function suggestedMetricForSolution(
  solution: PyramidSolution,
  state: PyramidState,
): string | null {
  if (!solution?.originOkrId || solution.originKrIndex === undefined || solution.originKrIndex === null) {
    return null;
  }
  return state.krMetrics?.[krKey(solution.originOkrId, solution.originKrIndex)] ?? null;
}

export type TraceStatus = "complete" | "broken_at_direction" | "orphan_metric" | "no_metrics";

export interface TraceNode {
  level: PyramidLevel;
  okrId: string;
  okrObjective: string;
  krIndex: number;
  krText: string;
}

export interface TraceChain {
  metricId: string;
  metricName: string;
  status: TraceStatus;
  path: TraceNode[];
  brokenAt?: { okrId: string; krIndex: number; krText: string };
}

export const TRACE_STATUS_LABELS: Record<TraceStatus, string> = {
  complete: "цепочка связная",
  broken_at_direction: "обрыв на уровне направления",
  orphan_metric: "метрика ни к чему не привязана",
  no_metrics: "у Решения нет метрик",
};

/** Метрики, привязанные к Решению (в порядке добавления). */
export const metricsForSolution = (solutionId: string, state: PyramidState): string[] =>
  (state.solutionMetrics ?? []).filter((l) => l.solutionId === solutionId).map((l) => l.metricId);

/**
 * Трассировка Решения: ОТДЕЛЬНАЯ цепочка на каждую привязанную метрику.
 * Показываем все параллельные ветки, а не «лучшую».
 */
export function traceSolution(
  solution: PyramidSolution,
  state: PyramidState,
  items: SavedOkr[],
  metrics: MetricLike[],
): TraceChain[] {
  const metricIds = metricsForSolution(solution.id, state);
  const nameOf = (id: string) => metrics.find((m) => m.id === id)?.name ?? "";

  if (metricIds.length === 0) {
    return [{ metricId: "", metricName: "", status: "no_metrics", path: [] }];
  }

  const links = liveContributions(items, state);
  const byId = new Map(items.map((i) => [i.id, i]));

  const nodeFor = (okrId: string, krIndex: number): TraceNode | null => {
    const okr = byId.get(okrId);
    const kr = okr?.plan?.key_results?.[krIndex];
    const level = state.levels?.[okrId];
    if (!okr || !kr || !level) return null;
    return { level, okrId, okrObjective: okr.objective, krIndex, krText: kr.text };
  };

  return metricIds.map((metricId) => {
    // все KR, измеряемые этой метрикой (оборванные ссылки отбрасываем)
    const users: TraceNode[] = Object.entries(state.krMetrics ?? {})
      .filter(([, id]) => id === metricId)
      .map(([key]) => {
        const sep = key.lastIndexOf(":");
        return nodeFor(key.slice(0, sep), Number(key.slice(sep + 1)));
      })
      .filter((n): n is TraceNode => Boolean(n));

    if (users.length === 0) {
      return { metricId, metricName: nameOf(metricId), status: "orphan_metric" as const, path: [] };
    }

    let broken: TraceChain | null = null;

    for (const node of users) {
      if (node.level === "bank") {
        return { metricId, metricName: nameOf(metricId), status: "complete" as const, path: [node] };
      }
      const up = links.find(
        (c) => c.from.okrId === node.okrId && c.from.krIndex === node.krIndex,
      );
      const parent = up ? nodeFor(up.to.okrId, up.to.krIndex) : null;
      if (parent) {
        return {
          metricId,
          metricName: nameOf(metricId),
          status: "complete" as const,
          path: [node, parent],
        };
      }
      broken ??= {
        metricId,
        metricName: nameOf(metricId),
        status: "broken_at_direction",
        path: [node],
        brokenAt: { okrId: node.okrId, krIndex: node.krIndex, krText: node.krText },
      };
    }

    return broken!;
  });
}
