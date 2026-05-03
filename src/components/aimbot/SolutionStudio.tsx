import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Loader2, ShieldCheck, Wand2, CheckCircle2, XCircle, AlertTriangle, Star, RotateCcw, Target, Download, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SolutionCard } from "./SolutionCard";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { GeneratedSolution, SolutionReport } from "@/types/okr";

interface Props {
  defaultObjective?: string;
  defaultKeyResult?: string;
  keyResults?: string[];
}

const EMPTY_SOL: GeneratedSolution = {
  id: "S1",
  problem: "",
  bet: "",
  result_image: "",
  leading_metric: "",
  confidence: "Medium",
  effort: "M",
  validation: "",
};

const STORAGE_KEY = "aimbot.solutionStudio.v2";
const CUSTOM_KEY = "__custom__";

interface KrSlice {
  krText: string;
  context: string;
  solutions: GeneratedSolution[];
  audit: GeneratedSolution;
  report: SolutionReport | null;
  cardReports: Record<number, SolutionReport>;
  selected: number[];
}

interface PersistedState {
  objective: string;
  activeKey: string;
  slices: Record<string, KrSlice>;
}

const emptySlice = (krText = ""): KrSlice => ({
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

export const SolutionStudio = ({ defaultObjective = "", defaultKeyResult = "", keyResults = [] }: Props) => {
  const initial = loadInitial();

  const [objective, setObjective] = useState(initial?.objective ?? defaultObjective);
  const [state, setState] = useState<Record<string, KrSlice>>(() => {
    if (initial?.slices && Object.keys(initial.slices).length) return initial.slices;
    return { [CUSTOM_KEY]: emptySlice(defaultKeyResult) };
  });
  const [activeKey, setActiveKey] = useState<string>(initial?.activeKey ?? CUSTOM_KEY);

  // sync incoming KR list from plan: ensure each KR has a slice
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
    // if user is on custom and a plan just arrived, switch to first KR
    setActiveKey((cur) => (cur === CUSTOM_KEY && keyResults.length ? "kr-0" : cur));
  }, [keyResults]);

  // sync default objective once if empty
  useEffect(() => {
    if (!objective && defaultObjective) setObjective(defaultObjective);
  }, [defaultObjective]); // eslint-disable-line

  const slice = state[activeKey] ?? emptySlice();

  // persist
  useEffect(() => {
    try {
      const data: PersistedState = { objective, activeKey, slices: state };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }, [objective, activeKey, state]);

  const patchSlice = (patch: Partial<KrSlice>) =>
    setState((p) => ({ ...p, [activeKey]: { ...(p[activeKey] ?? emptySlice()), ...patch } }));

  const setKrText = (v: string) => patchSlice({ krText: v });
  const setContext = (v: string) => patchSlice({ context: v });
  const setSolutions = (s: GeneratedSolution[]) => patchSlice({ solutions: s });
  const setAudit = (a: GeneratedSolution) => patchSlice({ audit: a });
  const setReport = (r: SolutionReport | null) => patchSlice({ report: r });
  const setCardReports = (cr: Record<number, SolutionReport>) => patchSlice({ cardReports: cr });
  const setSelected = (sel: number[]) => patchSlice({ selected: sel });

  const [genLoading, setGenLoading] = useState(false);
  const [valLoading, setValLoading] = useState(false);
  const [cardLoading, setCardLoading] = useState<Record<number, boolean>>({});

  const krOptions = useMemo(() => {
    const opts: { key: string; label: string }[] = [];
    Object.keys(state).forEach((k) => {
      if (k === CUSTOM_KEY) return;
      const s = state[k];
      opts.push({ key: k, label: s.krText || k });
    });
    opts.push({ key: CUSTOM_KEY, label: "Свой KR (без плана)" });
    return opts;
  }, [state]);

  const selectedSet = useMemo(() => new Set(slice.selected), [slice.selected]);

  const toggleSelected = (idx: number) => {
    const next = new Set(selectedSet);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    setSelected(Array.from(next));
  };

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

  const validateCard = async (idx: number, s: GeneratedSolution) => {
    setCardLoading((p) => ({ ...p, [idx]: true }));
    const cr = { ...slice.cardReports }; delete cr[idx]; setCardReports(cr);
    try {
      const { data, error } = await supabase.functions.invoke("validate-solution", {
        body: { objective, key_result: slice.krText, solution: s },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setCardReports({ ...cr, [idx]: data as SolutionReport });
      toast.success(`Аудит ${s.id || `S${idx + 1}`} · ${(data as SolutionReport).score}/100`);
    } catch (e: any) {
      const msg = e?.message || "Ошибка валидации";
      if (msg.includes("Rate")) toast.error("Слишком много запросов.");
      else if (msg.includes("credits")) toast.error("Закончились AI-кредиты.");
      else toast.error(msg);
    } finally {
      setCardLoading((p) => ({ ...p, [idx]: false }));
    }
  };

  const applyCardRewrite = (idx: number) => {
    const r = slice.cardReports[idx];
    if (!r?.rewritten_solution) return;
    const cur = slice.solutions[idx];
    const next: GeneratedSolution = { ...cur, ...r.rewritten_solution, id: cur.id };
    setSolutions(slice.solutions.map((x, i) => (i === idx ? next : x)));
    toast.success("Применена AI-версия. Перепроверяю...");
    validateCard(idx, next);
  };

  const handleGenerate = async () => {
    if (objective.trim().length < 3) return toast.error("Введите Objective");
    if (slice.krText.trim().length < 3) return toast.error("Введите Key Result");
    setGenLoading(true);
    setSolutions([]);
    try {
      const { data, error } = await supabase.functions.invoke("generate-solutions", {
        body: { objective, key_result: slice.krText, context: slice.context },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const list: GeneratedSolution[] = (data as any).solutions ?? [];
      setSolutions(list);
      toast.success(`Сгенерировано ${list.length} решений`);
    } catch (e: any) {
      const msg = e?.message || "Ошибка генерации";
      if (msg.includes("Rate")) toast.error("Слишком много запросов. Подождите немного.");
      else if (msg.includes("credits")) toast.error("Закончились AI-кредиты.");
      else toast.error(msg);
    } finally {
      setGenLoading(false);
    }
  };

  const sendToAudit = (s: GeneratedSolution) => {
    setAudit(s);
    setReport(null);
    toast.success("Решение передано в аудит ниже");
  };

  const validateSolution = async (override?: GeneratedSolution) => {
    const s = override ?? slice.audit;
    if (!s.problem || !s.bet || !s.result_image || !s.leading_metric) {
      return toast.error("Заполните все основные поля решения");
    }
    setValLoading(true);
    setReport(null);
    try {
      const { data, error } = await supabase.functions.invoke("validate-solution", {
        body: { objective, key_result: slice.krText, solution: s },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setReport(data as SolutionReport);
      toast.success(`Аудит готов · ${(data as SolutionReport).score}/100`);
    } catch (e: any) {
      const msg = e?.message || "Ошибка валидации";
      if (msg.includes("Rate")) toast.error("Слишком много запросов.");
      else if (msg.includes("credits")) toast.error("Закончились AI-кредиты.");
      else toast.error(msg);
    } finally {
      setValLoading(false);
    }
  };

  const applyRewrite = () => {
    if (!slice.report?.rewritten_solution) return;
    const next = { ...slice.audit, ...slice.report.rewritten_solution, id: slice.audit.id };
    setAudit(next);
    setReport(null);
    toast.success("Применена AI-версия. Запускаю повторный аудит...");
    validateSolution(next);
  };

  const updateAudit = (k: keyof GeneratedSolution, v: string) =>
    setAudit({ ...slice.audit, [k]: v as any });

  return (
    <div className="space-y-6">
      <Card className="border-2 border-hypothesis/30 bg-gradient-to-br from-hypothesis-soft/40 via-card to-card p-6 shadow-md">
        <header className="mb-4 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-hypothesis text-hypothesis-foreground shadow-sm">
              <Sparkles className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Генератор стратегических решений</h3>
              <p className="text-xs text-muted-foreground">Модуль 3 · OKR-PI · сохраняется автоматически</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button onClick={resetActive} variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Сброс KR
            </Button>
            <Button onClick={resetAll} variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
              Сброс всего
            </Button>
          </div>
        </header>

        {/* KR tabs */}
        <div className="mb-4 flex flex-wrap gap-2">
          {krOptions.map((opt) => {
            const s = state[opt.key];
            const count = s?.solutions.length ?? 0;
            const sel = s?.selected.length ?? 0;
            const isActive = opt.key === activeKey;
            return (
              <button
                key={opt.key}
                onClick={() => setActiveKey(opt.key)}
                className={cn(
                  "group flex max-w-[260px] items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                  isActive
                    ? "border-hypothesis bg-hypothesis-soft text-foreground shadow-sm"
                    : "border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                <Target className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-hypothesis" : "text-muted-foreground")} />
                <span className="truncate font-medium">{opt.label}</span>
                {(count > 0 || sel > 0) && (
                  <span className="ml-1 shrink-0 rounded bg-background/70 px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                    {sel}/{count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {selectedSet.size > 0 && (
          <div className="mb-4 rounded-lg border border-primary/30 bg-accent/40 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">В проекте · {selectedSet.size}</p>
            <ul className="space-y-1 text-sm text-foreground">
              {Array.from(selectedSet).sort((a, b) => a - b).map((idx) => {
                const s = slice.solutions[idx]; if (!s) return null;
                const rep = slice.cardReports[idx];
                return (
                  <li key={idx} className="flex items-start gap-2">
                    <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-primary text-primary" />
                    <span className="flex-1"><span className="font-mono text-xs text-muted-foreground">{s.id || `S${idx + 1}`}</span> · {s.bet}</span>
                    {rep && <span className="text-xs font-bold text-primary">{rep.score}/100</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}


        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Objective</label>
            <Input value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="напр. Стать самым любимым онбордингом" className="rounded-lg bg-secondary/40" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Key Result {activeKey !== CUSTOM_KEY && <span className="ml-1 text-[10px] text-muted-foreground/70">(из плана)</span>}
            </label>
            <Input
              value={slice.krText}
              onChange={(e) => setKrText(e.target.value)}
              placeholder="напр. Поднять активацию D1 с 22% до 45%"
              className="rounded-lg bg-secondary/40"
              readOnly={activeKey !== CUSTOM_KEY}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Контекст (опционально)</label>
            <Textarea value={slice.context} onChange={(e) => setContext(e.target.value)} placeholder="Команда, аудитория, ограничения..." className="min-h-[60px] rounded-lg bg-secondary/40" />
          </div>
        </div>

        <Button onClick={handleGenerate} disabled={genLoading} className="mt-4 w-full bg-gradient-hypothesis text-hypothesis-foreground shadow-md hover:opacity-95">
          {genLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> AI ищет гипотезы...</>) : (<><Sparkles className="mr-2 h-4 w-4" /> Сгенерировать решения</>)}
        </Button>

        {slice.solutions.length > 0 && (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {slice.solutions.map((s, i) => {
              const rep = slice.cardReports[i];
              const loading = cardLoading[i];
              return (
                <div key={i} className="space-y-2">
                  <SolutionCard
                    id={s.id || `S${i + 1}`}
                    problem={s.problem}
                    bet={s.bet}
                    resultImage={s.result_image}
                    metric={s.leading_metric}
                    confidence={s.confidence}
                    effort={s.effort}
                    validation={s.validation}
                    badge={rep ? `${rep.score}/100` : undefined}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <Button onClick={() => validateCard(i, s)} disabled={loading} variant="outline" size="sm" className="border-navy/30 text-navy hover:bg-secondary">
                      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><ShieldCheck className="mr-1.5 h-3.5 w-3.5" />Проверить</>}
                    </Button>
                    <Button onClick={() => sendToAudit(s)} variant="outline" size="sm" className="border-hypothesis/30 text-hypothesis hover:bg-hypothesis-soft">
                      <Wand2 className="mr-1.5 h-3.5 w-3.5" /> В аудит
                    </Button>
                    <Button onClick={() => toggleSelected(i)} variant={selectedSet.has(i) ? "default" : "outline"} size="sm" className={selectedSet.has(i) ? "bg-primary text-primary-foreground" : "border-primary/30 text-primary hover:bg-accent"}>
                      <Star className={cn("mr-1.5 h-3.5 w-3.5", selectedSet.has(i) && "fill-current")} />
                      {selectedSet.has(i) ? "В проекте" : "Выбрать"}
                    </Button>
                  </div>

                  {rep && (
                    <div className="rounded-lg border border-border bg-secondary/30 p-3">
                      {rep.summary && <p className="mb-2 text-xs text-foreground">{rep.summary}</p>}
                      <ul className="space-y-1.5">
                        {rep.rules.map((r) => (
                          <li key={r.id} className="flex items-start gap-2 text-xs">
                            {r.pass ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />}
                            <div className="flex-1">
                              <div className="flex items-baseline gap-1.5">
                                <span className="font-mono text-[10px] font-bold text-muted-foreground">[{r.id}]</span>
                                <span>{r.label}</span>
                              </div>
                              {!r.pass && r.hint && (
                                <p className="mt-0.5 flex items-start gap-1 text-[11px] text-muted-foreground">
                                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />{r.hint}
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                      {rep.rewritten_solution && (
                        <Button onClick={() => applyCardRewrite(i)} disabled={loading} variant="outline" size="sm" className="mt-3 w-full border-primary/30 text-primary hover:bg-accent">
                          <Wand2 className="mr-2 h-3.5 w-3.5" /> Применить AI-версию и перепроверить
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="border-border/60 bg-card p-6 shadow-md">
        <header className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy text-navy-foreground shadow-sm">
              <ShieldCheck className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Аудит решения</h3>
              <p className="text-xs text-muted-foreground">Проверка на стратегическую гипотезу (а не задачу)</p>
            </div>
          </div>
          {slice.report && (
            <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold",
              slice.report.score >= 80 ? "bg-success-soft text-success" : slice.report.score >= 50 ? "bg-warning-soft text-warning" : "bg-destructive/10 text-destructive")}>
              {slice.report.score}/100
            </span>
          )}
        </header>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Проблема / JTBD"><Textarea value={slice.audit.problem} onChange={(e) => updateAudit("problem", e.target.value)} className="min-h-[60px] rounded-lg bg-secondary/40" placeholder="Чья боль и какая?" /></Field>
          <Field label="Ставка (bet)"><Textarea value={slice.audit.bet} onChange={(e) => updateAudit("bet", e.target.value)} className="min-h-[60px] rounded-lg bg-secondary/40" placeholder="Мы верим, что..." /></Field>
          <Field label="Result image"><Textarea value={slice.audit.result_image} onChange={(e) => updateAudit("result_image", e.target.value)} className="min-h-[60px] rounded-lg bg-secondary/40" placeholder="Что увидим извне" /></Field>
          <Field label="Опережающая метрика"><Input value={slice.audit.leading_metric} onChange={(e) => updateAudit("leading_metric", e.target.value)} className="rounded-lg bg-secondary/40" /></Field>
          <Field label="Уверенность">
            <select value={slice.audit.confidence} onChange={(e) => updateAudit("confidence", e.target.value)} className="h-10 w-full rounded-lg border border-input bg-secondary/40 px-3 text-sm">
              <option value="Low">Низкая</option><option value="Medium">Средняя</option><option value="High">Высокая</option>
            </select>
          </Field>
          <Field label="Затраты">
            <select value={slice.audit.effort} onChange={(e) => updateAudit("effort", e.target.value)} className="h-10 w-full rounded-lg border border-input bg-secondary/40 px-3 text-sm">
              <option value="S">S</option><option value="M">M</option><option value="L">L</option><option value="XL">XL</option>
            </select>
          </Field>
          <Field label="Подход к валидации" className="md:col-span-2"><Input value={slice.audit.validation} onChange={(e) => updateAudit("validation", e.target.value)} className="rounded-lg bg-secondary/40" placeholder="Прототип, A/B-тест, discovery..." /></Field>
        </div>

        <Button onClick={() => validateSolution()} disabled={valLoading} className="mt-4 w-full bg-navy text-navy-foreground hover:opacity-95">
          {valLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> AI проверяет...</>) : (<><ShieldCheck className="mr-2 h-4 w-4" /> Запустить аудит решения</>)}
        </Button>

        {slice.report && (
          <div className="mt-4 rounded-xl border border-border bg-secondary/30 p-4">
            {slice.report.summary && <p className="mb-3 text-sm text-foreground">{slice.report.summary}</p>}
            <ul className="space-y-2">
              {slice.report.rules.map((r) => (
                <li key={r.id} className="flex items-start gap-2.5 text-sm">
                  {r.pass ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[10px] font-bold text-muted-foreground">[{r.id}]</span>
                      <span>{r.label}</span>
                    </div>
                    {!r.pass && r.hint && (
                      <p className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />{r.hint}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {slice.report.rewritten_solution && (
              <Button onClick={applyRewrite} disabled={valLoading} variant="outline" className="mt-4 w-full border-primary/30 text-primary hover:bg-accent">
                <Wand2 className="mr-2 h-4 w-4" /> Применить AI-версию и перепроверить
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

const Field = ({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) => (
  <div className={cn("space-y-1.5", className)}>
    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
    {children}
  </div>
);
