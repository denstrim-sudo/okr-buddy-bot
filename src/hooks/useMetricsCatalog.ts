import { useCallback, useEffect, useRef, useState } from "react";

export interface Metric {
  id: string;
  name: string;
  unit?: string;
  createdAt: string;
}

export const METRICS_KEY = "aimbot.metrics.v1";

export const normalizeMetricName = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

const load = (): Metric[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(METRICS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Metric[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export function useMetricsCatalog() {
  const [metrics, setMetrics] = useState<Metric[]>(() => load());
  const [persistError, setPersistError] = useState(false);
  const ref = useRef(metrics);
  ref.current = metrics;

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === METRICS_KEY) {
        const fresh = load();
        ref.current = fresh;
        setMetrics(fresh);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const commit = useCallback((next: Metric[]): boolean => {
    let ok = true;
    try {
      localStorage.setItem(METRICS_KEY, JSON.stringify(next));
      setPersistError(false);
    } catch {
      ok = false;
      setPersistError(true);
    }
    ref.current = next;
    setMetrics(next);
    return ok;
  }, []);

  const addMetric = useCallback(
    (name: string, unit?: string): { metric: Metric; ok: boolean; existed: boolean } => {
      const clean = name.trim().replace(/\s+/g, " ");
      const norm = normalizeMetricName(clean);
      const existing = ref.current.find((m) => normalizeMetricName(m.name) === norm);
      if (existing) return { metric: existing, ok: true, existed: true };
      const metric: Metric = {
        id: `met_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: clean,
        ...(unit && unit.trim() ? { unit: unit.trim() } : {}),
        createdAt: new Date().toISOString(),
      };
      const ok = commit([...ref.current, metric]);
      return { metric, ok, existed: false };
    },
    [commit],
  );

  const removeMetric = useCallback(
    (id: string) => commit(ref.current.filter((m) => m.id !== id)),
    [commit],
  );

  const getMetric = useCallback((id?: string) => ref.current.find((m) => m.id === id), []);

  return { metrics, persistError, addMetric, removeMetric, getMetric };
}
