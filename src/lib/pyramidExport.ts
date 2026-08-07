import type { SavedOkr } from "@/hooks/useSavedOkrs";
import {
  krKey,
  liveContributions,
  metricsForSolution,
  solutionsForPyramid,
  traceSolution,
  type MetricLike,
  type PyramidLevel,
  type PyramidSolution,
  type PyramidState,
  type SolutionStudioLike,
  type TraceChain,
} from "@/lib/pyramid";

export const PYRAMID_DOC_VERSION = "aimbot.pyramid.doc.v1";

export interface DocContribution {
  toOkrId: string;
  toObjective: string;
  toKrIndex: number;
  toKrText: string;
  toLevel?: PyramidLevel;
}

export interface DocKr {
  krIndex: number;
  text: string;
  metricId?: string;
  metricName?: string;
  contributions: DocContribution[];
}

export interface DocOkr {
  okrId: string;
  objective: string;
  level: PyramidLevel;
  key_results: DocKr[];
}

export interface DocSolution {
  id: string;
  title: string;
  description?: string;
  metrics: MetricLike[];
  chains: TraceChain[];
}

export interface PyramidDoc {
  version: typeof PYRAMID_DOC_VERSION;
  generatedAt: string;
  solutions: DocSolution[];
  metrics: MetricLike[];
  okrs: DocOkr[];
}

export interface BuildPyramidDocInput {
  items: SavedOkr[];
  state: PyramidState;
  metrics: MetricLike[];
  solutions: PyramidSolution[];
  studioState: SolutionStudioLike | null | undefined;
  generatedAt?: string;
}

/**
 * Документ пирамиды: строится ТОЛЬКО из Решений со статусом «в проекте».
 * Включает связи и трассировки лишь для показанных (привязанных к этим Решениям) метрик.
 */
export function buildPyramidDoc({
  items,
  state,
  metrics,
  solutions,
  studioState,
  generatedAt = new Date().toISOString(),
}: BuildPyramidDocInput): PyramidDoc {
  const allowed = new Set(solutionsForPyramid(studioState));
  const committed = solutions.filter((s) => allowed.has(s.id));

  const shownMetricIds = new Set<string>();
  const docSolutions: DocSolution[] = committed.map((s) => {
    const ids = metricsForSolution(s.id, state);
    ids.forEach((id) => shownMetricIds.add(id));
    return {
      id: s.id,
      title: s.title,
      ...(s.description ? { description: s.description } : {}),
      metrics: ids
        .map((id) => metrics.find((m) => m.id === id))
        .filter((m): m is MetricLike => Boolean(m)),
      chains: traceSolution(s, state, items, metrics),
    };
  });

  const links = liveContributions(items, state);
  const byId = new Map(items.map((i) => [i.id, i]));

  // KR, измеряемые показанными метриками, плюс их родители по связям вверх
  const included = new Set<string>();
  for (const [key, metricId] of Object.entries(state.krMetrics ?? {})) {
    if (!shownMetricIds.has(metricId)) continue;
    const sep = key.lastIndexOf(":");
    const okrId = key.slice(0, sep);
    const krIndex = Number(key.slice(sep + 1));
    if (!byId.get(okrId)?.plan?.key_results?.[krIndex]) continue;
    included.add(key);
    for (const c of links) {
      if (c.from.okrId === okrId && c.from.krIndex === krIndex) {
        included.add(krKey(c.to.okrId, c.to.krIndex));
      }
    }
  }

  const okrs: DocOkr[] = [];
  for (const okr of items) {
    const level = state.levels?.[okr.id];
    if (!level) continue;
    const krs: DocKr[] = (okr.plan?.key_results ?? []).flatMap((kr, krIndex) => {
      if (!included.has(krKey(okr.id, krIndex))) return [];
      const metricId = state.krMetrics?.[krKey(okr.id, krIndex)];
      const metric = metricId ? metrics.find((m) => m.id === metricId) : undefined;
      const contributions: DocContribution[] = links
        .filter((c) => c.from.okrId === okr.id && c.from.krIndex === krIndex)
        .map((c) => {
          const parent = byId.get(c.to.okrId);
          return {
            toOkrId: c.to.okrId,
            toObjective: parent?.objective ?? "",
            toKrIndex: c.to.krIndex,
            toKrText: parent?.plan?.key_results?.[c.to.krIndex]?.text ?? "",
            ...(state.levels?.[c.to.okrId] ? { toLevel: state.levels[c.to.okrId] } : {}),
          };
        });
      return [
        {
          krIndex,
          text: kr.text,
          ...(metricId ? { metricId } : {}),
          ...(metric ? { metricName: metric.name } : {}),
          contributions,
        },
      ];
    });
    if (krs.length) okrs.push({ okrId: okr.id, objective: okr.objective, level, key_results: krs });
  }

  return {
    version: PYRAMID_DOC_VERSION,
    generatedAt,
    solutions: docSolutions,
    metrics: metrics.filter((m) => shownMetricIds.has(m.id)),
    okrs,
  };
}
