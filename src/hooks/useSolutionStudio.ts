import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useDocs } from "@/contexts/DocsContext";
import { useAiModel, notifyModelFallback } from "@/contexts/ModelContext";
import type { GeneratedSolution, SolutionReport } from "@/types/okr";

export const EMPTY_SOL: GeneratedSolution = {
  id: "S1",
  problem: "",
  bet: "",
  result_image: "",
  leading_metric: "",
  confidence: "Medium",
  effort: "M",
  validation: "",
};

export const STORAGE_KEY = "aimbot.solutionStudio.v2";
export const CUSTOM_KEY = "__custom__";

export interface KrSlice {
  krText: string;
  context: string;
  solutions: GeneratedSolution[];
  audit: GeneratedSolution;
  report: SolutionReport | null;
  cardReports: Record<number, SolutionReport>;
  selected: number[];
}

export interface PersistedState {
  objective: string;
  activeKey: string;
  slices: Record<string, KrSlice>;
}

export const emptySlice = (krText = ""): KrSlice => ({
  krText,
  context: "",
  solutions: [],
  audit: EMPTY_SOL,
  report: null,
  cardReports: {},
  selected: [],
});

const loadInitial = (): PersistedState | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedState) : null;
  } catch {
    return null;
  }
};

const handleAIError = (e: any, fallback = "Ошибка") => {
  const msg = e?.message || fallback;
  if (msg.includes("Rate")) toast.error("Слишком много запросов.");
  else if (msg.includes("credits")) toast.error("Закончились AI-кредиты.");
  else toast.error(msg);
};

export function useSolutionStudio(defaultObjective: string, defaultKeyResult: string, keyResults: string[]) {
  const initial = loadInitial();
  const { buildContext } = useDocs();
  const { model } = useAiModel();

  const [objective, setObjective] = useState(initial?.objective ?? defaultObjective);
  const [state, setState] = useState<Record<string, KrSlice>>(() =>
    initial?.slices && Object.keys(initial.slices).length ? initial.slices : { [CUSTOM_KEY]: emptySlice(defaultKeyResult) },
  );
  const [activeKey, setActiveKey] = useState<string>(initial?.activeKey ?? CUSTOM_KEY);

  const [genLoading, setGenLoading] = useState(false);
  const [valLoading, setValLoading] = useState(false);
  const [cardLoading, setCardLoading] = useState<Record<number, boolean>>({});

  // sync KR list from plan
  useEffect(() => {
    if (!keyResults.length) return;
    setState((prev) => {
      const next = { ...prev };
      let changed = false;
      keyResults.forEach((kr, i) => {
        const key = `kr-${i}`;
        if (!next[key]) { next[key] = emptySlice(kr); changed = true; }
        else if (next[key].krText !== kr) { next[key] = { ...next[key], krText: kr }; changed = true; }
      });
      return changed ? next : prev;
    });
    setActiveKey((cur) => (cur === CUSTOM_KEY && keyResults.length ? "kr-0" : cur));
  }, [keyResults]);

  useEffect(() => {
    if (defaultObjective && defaultObjective !== objective) setObjective(defaultObjective);
  }, [defaultObjective]); // eslint-disable-line

  // persist
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ objective, activeKey, slices: state }));
    } catch {}
  }, [objective, activeKey, state]);

  const slice = state[activeKey] ?? emptySlice();

  const patchSlice = useCallback(
    (patch: Partial<KrSlice>) =>
      setState((p) => ({ ...p, [activeKey]: { ...(p[activeKey] ?? emptySlice()), ...patch } })),
    [activeKey],
  );

  const krOptions = useMemo(() => {
    const opts: { key: string; label: string }[] = [];
    Object.keys(state).forEach((k) => {
      if (k === CUSTOM_KEY) return;
      opts.push({ key: k, label: state[k].krText || k });
    });
    opts.push({ key: CUSTOM_KEY, label: "Свой KR (без плана)" });
    return opts;
  }, [state]);

  const selectedSet = useMemo(() => new Set(slice.selected), [slice.selected]);

  const toggleSelected = useCallback((idx: number) => {
    const next = new Set(selectedSet);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    patchSlice({ selected: Array.from(next) });
  }, [selectedSet, patchSlice]);

  const resetActive = () => {
    if (!confirm("Очистить сохранённые данные для этого KR?")) return;
    patchSlice({ ...emptySlice(slice.krText) });
    toast.success("Данные KR очищены");
  };

  const resetAll = () => {
    if (!confirm("Полностью очистить модуль 3 (все KR)?")) return;
    localStorage.removeItem(STORAGE_KEY);
    setState({ [CUSTOM_KEY]: emptySlice(defaultKeyResult) });
    setActiveKey(CUSTOM_KEY);
    toast.success("Сохранённые данные очищены");
  };

  const validateCard = useCallback(async (idx: number, s: GeneratedSolution) => {
    setCardLoading((p) => ({ ...p, [idx]: true }));
    const cr = { ...slice.cardReports }; delete cr[idx]; patchSlice({ cardReports: cr });
    try {
      const extra_context = buildContext(["methodology", "solutions_kb", "okr_context"]);
      const { data, error } = await supabase.functions.invoke("validate-solution", {
        body: { objective, key_result: slice.krText, solution: s, extra_context, model },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      notifyModelFallback(data);
      patchSlice({ cardReports: { ...cr, [idx]: data as SolutionReport } });
      toast.success(`Аудит ${s.id || `S${idx + 1}`} · ${(data as SolutionReport).score}/100`);
    } catch (e) {
      handleAIError(e, "Ошибка валидации");
    } finally {
      setCardLoading((p) => ({ ...p, [idx]: false }));
    }
  }, [objective, slice.cardReports, slice.krText, patchSlice, buildContext, model]);

  const applyCardRewrite = useCallback((idx: number) => {
    const r = slice.cardReports[idx];
    if (!r?.rewritten_solution) return;
    const cur = slice.solutions[idx];
    const next: GeneratedSolution = { ...cur, ...r.rewritten_solution, id: cur.id };
    patchSlice({ solutions: slice.solutions.map((x, i) => (i === idx ? next : x)) });
    toast.success("Применена AI-версия. Перепроверяю...");
    validateCard(idx, next);
  }, [slice.cardReports, slice.solutions, patchSlice, validateCard]);

  const handleGenerate = async () => {
    if (objective.trim().length < 3) return toast.error("Введите Objective");
    if (slice.krText.trim().length < 3) return toast.error("Введите Key Result");
    setGenLoading(true);
    patchSlice({ solutions: [] });
    try {
      const extra_context = buildContext(["solutions_kb", "okr_context", "methodology"]);
      const { data, error } = await supabase.functions.invoke("generate-solutions", {
        body: { objective, key_result: slice.krText, context: slice.context, extra_context, model },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const list: GeneratedSolution[] = (data as any).solutions ?? [];
      patchSlice({ solutions: list });
      toast.success(`Сгенерировано ${list.length} решений`);
    } catch (e) {
      handleAIError(e, "Ошибка генерации");
    } finally {
      setGenLoading(false);
    }
  };

  const sendToAudit = useCallback((s: GeneratedSolution) => {
    patchSlice({ audit: s, report: null });
    toast.success("Решение передано в аудит ниже");
  }, [patchSlice]);

  const validateSolution = async (override?: GeneratedSolution) => {
    const s = override ?? slice.audit;
    if (!s.problem || !s.bet || !s.result_image || !s.leading_metric) {
      return toast.error("Заполните все основные поля решения");
    }
    setValLoading(true);
    patchSlice({ report: null });
    try {
      const extra_context = buildContext(["methodology", "solutions_kb", "okr_context"]);
      const { data, error } = await supabase.functions.invoke("validate-solution", {
        body: { objective, key_result: slice.krText, solution: s, extra_context, model },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      patchSlice({ report: data as SolutionReport });
      toast.success(`Аудит готов · ${(data as SolutionReport).score}/100`);
    } catch (e) {
      handleAIError(e, "Ошибка валидации");
    } finally {
      setValLoading(false);
    }
  };

  const applyRewrite = () => {
    if (!slice.report?.rewritten_solution) return;
    const next = { ...slice.audit, ...slice.report.rewritten_solution, id: slice.audit.id };
    patchSlice({ audit: next, report: null });
    toast.success("Применена AI-версия. Запускаю повторный аудит...");
    validateSolution(next);
  };

  const updateAudit = (k: keyof GeneratedSolution, v: string) =>
    patchSlice({ audit: { ...slice.audit, [k]: v as any } });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const exportJson = () => {
    try {
      const payload = { app: "aimbot.solutionStudio", version: 2, exported_at: new Date().toISOString(), objective, activeKey, slices: state };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      a.href = url; a.download = `aimbot-module3-${stamp}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success("Экспорт готов");
    } catch (e: any) {
      toast.error(e?.message || "Не удалось экспортировать");
    }
  };

  const importJson = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      if (!data?.slices || typeof data.slices !== "object") throw new Error("Неверный формат файла");
      const replace = confirm("OK — заменить все данные модуля 3.\nОтмена — объединить с текущими.");
      const incoming = data.slices as Record<string, KrSlice>;
      const nextState = replace ? incoming : { ...state, ...incoming };
      setState(nextState);
      if (typeof data.objective === "string") setObjective(data.objective);
      if (typeof data.activeKey === "string" && nextState[data.activeKey]) setActiveKey(data.activeKey);
      toast.success(replace ? "Данные импортированы (заменено)" : "Данные импортированы (объединено)");
    } catch (e: any) {
      toast.error(e?.message || "Не удалось импортировать");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return {
    objective, setObjective,
    activeKey, setActiveKey,
    state, slice, krOptions, selectedSet,
    genLoading, valLoading, cardLoading,
    setKrText: (v: string) => patchSlice({ krText: v }),
    setContext: (v: string) => patchSlice({ context: v }),
    toggleSelected, resetActive, resetAll,
    validateCard, applyCardRewrite, handleGenerate,
    sendToAudit, validateSolution, applyRewrite, updateAudit,
    exportJson, importJson, fileInputRef,
  };
}
