import { useCallback, useEffect, useRef, useState } from "react";
import {
  emptyPyramid,
  findGaps as findGapsPure,
  krKey,
  sameRef,
  type Contribution,
  type Gap,
  type KrRef,
  type PyramidLevel,
  suggestedMetricForSolution as suggestedMetricPure,
  metricsForSolution,
  type PyramidSolution,
  type PyramidState,
} from "@/lib/pyramid";
import type { SavedOkr } from "@/hooks/useSavedOkrs";

export const PYRAMID_KEY = "aimbot.pyramid.v1";

export interface PyramidExport {
  version: string;
  state: PyramidState;
}

export type PyramidImportResult = { ok: true } | { ok: false; error: string };

const load = (): PyramidState => {
  if (typeof window === "undefined") return emptyPyramid();
  try {
    const raw = localStorage.getItem(PYRAMID_KEY);
    if (!raw) return emptyPyramid();
    const parsed = JSON.parse(raw) as PyramidState;
    return {
      levels: parsed?.levels ?? {},
      krMetrics: parsed?.krMetrics ?? {},
      contributions: Array.isArray(parsed?.contributions) ? parsed.contributions : [],
      solutionMetrics: Array.isArray(parsed?.solutionMetrics) ? parsed.solutionMetrics : [],
    };
  } catch {
    return emptyPyramid();
  }
};

const isValidState = (s: unknown): s is PyramidState => {
  const v = s as PyramidState;
  return Boolean(
    v &&
      typeof v === "object" &&
      v.levels &&
      typeof v.levels === "object" &&
      v.krMetrics &&
      typeof v.krMetrics === "object" &&
      Array.isArray(v.contributions),
  );
};

export function usePyramid() {
  const [state, setState] = useState<PyramidState>(() => load());
  const [persistError, setPersistError] = useState(false);
  const ref = useRef(state);
  ref.current = state;

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === PYRAMID_KEY) {
        const fresh = load();
        ref.current = fresh;
        setState(fresh);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const commit = useCallback((next: PyramidState): boolean => {
    let ok = true;
    try {
      localStorage.setItem(PYRAMID_KEY, JSON.stringify(next));
      setPersistError(false);
    } catch {
      ok = false;
      setPersistError(true);
    }
    ref.current = next;
    setState(next);
    return ok;
  }, []);

  const setNodeLevel = useCallback(
    (okrId: string, level: PyramidLevel | null) => {
      const levels = { ...ref.current.levels };
      if (level) levels[okrId] = level;
      else delete levels[okrId];
      return commit({ ...ref.current, levels });
    },
    [commit],
  );

  const linkKrToMetric = useCallback(
    (okrId: string, krIndex: number, metricId: string) =>
      commit({
        ...ref.current,
        krMetrics: { ...ref.current.krMetrics, [krKey(okrId, krIndex)]: metricId },
      }),
    [commit],
  );

  const unlinkKrMetric = useCallback(
    (okrId: string, krIndex: number) => {
      const krMetrics = { ...ref.current.krMetrics };
      delete krMetrics[krKey(okrId, krIndex)];
      return commit({ ...ref.current, krMetrics });
    },
    [commit],
  );

  const linkKrContribution = useCallback(
    (
      childOkrId: string,
      childKrIndex: number,
      parentOkrId: string,
      parentKrIndex: number,
    ): { ok: boolean; duplicate?: boolean } => {
      const from: KrRef = { okrId: childOkrId, krIndex: childKrIndex };
      const to: KrRef = { okrId: parentOkrId, krIndex: parentKrIndex };
      const exists = ref.current.contributions.some(
        (c) => sameRef(c.from, from) && sameRef(c.to, to),
      );
      if (exists) return { ok: true, duplicate: true };
      return {
        ok: commit({ ...ref.current, contributions: [...ref.current.contributions, { from, to }] }),
      };
    },
    [commit],
  );


  const unlinkKrContribution = useCallback(
    (childOkrId: string, childKrIndex: number, parentOkrId: string, parentKrIndex: number) => {
      const from: KrRef = { okrId: childOkrId, krIndex: childKrIndex };
      const to: KrRef = { okrId: parentOkrId, krIndex: parentKrIndex };
      return commit({
        ...ref.current,
        contributions: ref.current.contributions.filter(
          (c) => !(sameRef(c.from, from) && sameRef(c.to, to)),
        ),
      });
    },
    [commit],
  );

  const linkSolutionToMetric = useCallback(
    (solutionId: string, metricId: string): { ok: boolean; duplicate?: boolean } => {
      const exists = (ref.current.solutionMetrics ?? []).some(
        (l) => l.solutionId === solutionId && l.metricId === metricId,
      );
      if (exists) return { ok: true, duplicate: true };
      return {
        ok: commit({
          ...ref.current,
          solutionMetrics: [...(ref.current.solutionMetrics ?? []), { solutionId, metricId }],
        }),
      };
    },
    [commit],
  );

  const unlinkSolutionFromMetric = useCallback(
    (solutionId: string, metricId: string) =>
      commit({
        ...ref.current,
        solutionMetrics: (ref.current.solutionMetrics ?? []).filter(
          (l) => !(l.solutionId === solutionId && l.metricId === metricId),
        ),
      }),
    [commit],
  );

  const getSolutionMetrics = useCallback(
    (solutionId: string): string[] => metricsForSolution(solutionId, state),
    [state],
  );

  const suggestedMetricForSolution = useCallback(
    (solution: PyramidSolution): string | null => suggestedMetricPure(solution, ref.current),
    [],
  );

  const getMetricId = useCallback(
    (okrId: string, krIndex: number): string | undefined => state.krMetrics[krKey(okrId, krIndex)],
    [state],
  );

  const getLevel = useCallback(
    (okrId: string): PyramidLevel | undefined => state.levels[okrId],
    [state],
  );

  const findGaps = useCallback((items: SavedOkr[]): Gap[] => findGapsPure(items, ref.current), []);

  const getContributionsFrom = useCallback(
    (okrId: string, krIndex: number): Contribution[] =>
      state.contributions.filter((c) => sameRef(c.from, { okrId, krIndex })),
    [state],
  );

  const clear = useCallback(() => commit(emptyPyramid()), [commit]);

  const exportPyramid = useCallback(
    () => JSON.stringify({ version: PYRAMID_KEY, state } satisfies PyramidExport, null, 2),
    [state],
  );

  const importPyramid = useCallback(
    (raw: string): PyramidImportResult => {
      let parsed: PyramidExport;
      try {
        parsed = JSON.parse(raw) as PyramidExport;
      } catch {
        return { ok: false, error: "Не удалось прочитать файл" };
      }
      if (!parsed || parsed.version !== PYRAMID_KEY || !isValidState(parsed.state)) {
        return { ok: false, error: "Несовместимый формат файла" };
      }
      const ok = commit({
        levels: parsed.state.levels,
        krMetrics: parsed.state.krMetrics,
        contributions: parsed.state.contributions,
        solutionMetrics: Array.isArray(parsed.state.solutionMetrics)
          ? parsed.state.solutionMetrics
          : [],
      });
      if (!ok) return { ok: false, error: "Хранилище недоступно" };
      return { ok: true };
    },
    [commit],
  );

  return {
    state,
    persistError,
    setNodeLevel,
    getLevel,
    linkKrToMetric,
    unlinkKrMetric,
    getMetricId,
    linkKrContribution,
    unlinkKrContribution,
    getContributionsFrom,
    linkSolutionToMetric,
    unlinkSolutionFromMetric,
    getSolutionMetrics,
    suggestedMetricForSolution,
    findGaps,
    clear,
    exportPyramid,
    importPyramid,
  };
}
