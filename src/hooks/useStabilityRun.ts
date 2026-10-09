import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GOLDEN_SET, type GoldenCase } from "@/lib/goldenSet";
import type { AuditRun } from "@/lib/stability";

export const STABILITY_STORAGE_KEY = "aimbot.stability.lastRun";

export interface StabilityRunState {
  model: string;
  startedAt: string;
  repeats: number;
  concurrency: number;
  caseIds: string[];
  runs: Record<string, AuditRun[]>;
  errors: Array<{ caseId: string; repeat: number; message: string }>;
  done: number;
  total: number;
  finished: boolean;
}

export interface RunOptions {
  caseIds: string[];
  repeats?: number;
  model: string;
  concurrency?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

function readStored(): StabilityRunState | null {
  try {
    const raw = sessionStorage.getItem(STABILITY_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StabilityRunState) : null;
  } catch {
    return null;
  }
}
function store(s: StabilityRunState) {
  try {
    sessionStorage.setItem(STABILITY_STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* переполнение хранилища — результат остаётся в памяти */
  }
}

export function useStabilityRun(cases: GoldenCase[] = GOLDEN_SET) {
  const [state, setState] = useState<StabilityRunState | null>(() => readStored());
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);

  const update = useCallback((fn: (s: StabilityRunState) => StabilityRunState) => {
    setState((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      store(next);
      return next;
    });
  }, []);

  const run = useCallback(async (opts: RunOptions) => {
    const repeats = clamp(opts.repeats ?? 3, 1, 5);
    const concurrency = clamp(opts.concurrency ?? 2, 1, 3);
    const selected = cases.filter((c) => opts.caseIds.includes(c.id));
    const tasks = selected.flatMap((c) => Array.from({ length: repeats }, (_, i) => ({ c, repeat: i })));
    const initial: StabilityRunState = {
      model: opts.model,
      startedAt: new Date().toISOString(),
      repeats,
      concurrency,
      caseIds: selected.map((c) => c.id),
      runs: Object.fromEntries(selected.map((c) => [c.id, []])),
      errors: [],
      done: 0,
      total: tasks.length,
      finished: false,
    };
    stopRef.current = false;
    setState(initial);
    store(initial);
    setRunning(true);

    let next = 0;
    const worker = async () => {
      while (!stopRef.current && next < tasks.length) {
        const { c, repeat } = tasks[next++];
        try {
          const { data, error } = await supabase.functions.invoke("validate-okr", {
            body: {
              mode: "audit",
              objective: c.objective,
              key_results: c.key_results,
              horizon: c.horizon,
              okr_type: c.okr_type,
              okr_origin: c.okr_origin,
              owner: c.owner,
              way_known: c.way_known,
              model: opts.model,
            },
          });
          if (error || (data as { error?: string })?.error) {
            throw new Error(error?.message || (data as { error?: string })?.error || "Ошибка вызова");
          }
          update((s) => ({ ...s, done: s.done + 1, runs: { ...s.runs, [c.id]: [...(s.runs[c.id] ?? []), data as AuditRun] } }));
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          // Отказ AI-провайдера касается всех вызовов — не тратим остальные.
          if (/AI-провайдер|non-2xx|502/i.test(message)) stopRef.current = true;
          update((s) => ({ ...s, done: s.done + 1, errors: [...s.errors, { caseId: c.id, repeat, message }] }));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
    update((s) => ({ ...s, finished: true }));
    setRunning(false);
  }, [cases, update]);

  const stop = useCallback(() => {
    stopRef.current = true;
  }, []);

  return { state, running, run, stop };
}
