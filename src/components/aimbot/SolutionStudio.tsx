import { useEffect, useState } from "react";
import { Sparkles, Loader2, ShieldCheck, Wand2, CheckCircle2, XCircle, AlertTriangle, Plus, Trash2, Star, RotateCcw } from "lucide-react";
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

export const SolutionStudio = ({ defaultObjective = "", defaultKeyResult = "" }: Props) => {
  const [objective, setObjective] = useState(defaultObjective);
  const [keyResult, setKeyResult] = useState(defaultKeyResult);
  const [context, setContext] = useState("");
  const [solutions, setSolutions] = useState<GeneratedSolution[]>([]);
  const [genLoading, setGenLoading] = useState(false);

  const [audit, setAudit] = useState<GeneratedSolution>(EMPTY_SOL);
  const [report, setReport] = useState<SolutionReport | null>(null);
  const [valLoading, setValLoading] = useState(false);

  const [cardReports, setCardReports] = useState<Record<number, SolutionReport>>({});
  const [cardLoading, setCardLoading] = useState<Record<number, boolean>>({});

  const validateCard = async (idx: number, s: GeneratedSolution) => {
    setCardLoading((p) => ({ ...p, [idx]: true }));
    setCardReports((p) => { const n = { ...p }; delete n[idx]; return n; });
    try {
      const { data, error } = await supabase.functions.invoke("validate-solution", {
        body: { objective, key_result: keyResult, solution: s },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setCardReports((p) => ({ ...p, [idx]: data as SolutionReport }));
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
    const r = cardReports[idx];
    if (!r?.rewritten_solution) return;
    const cur = solutions[idx];
    const next: GeneratedSolution = { ...cur, ...r.rewritten_solution, id: cur.id };
    setSolutions((p) => p.map((x, i) => (i === idx ? next : x)));
    toast.success("Применена AI-версия. Перепроверяю...");
    validateCard(idx, next);
  };

  const handleGenerate = async () => {
    if (objective.trim().length < 3) return toast.error("Введите Objective");
    if (keyResult.trim().length < 3) return toast.error("Введите Key Result");
    setGenLoading(true);
    setSolutions([]);
    try {
      const { data, error } = await supabase.functions.invoke("generate-solutions", {
        body: { objective, key_result: keyResult, context },
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
    const s = override ?? audit;
    if (!s.problem || !s.bet || !s.result_image || !s.leading_metric) {
      return toast.error("Заполните все основные поля решения");
    }
    setValLoading(true);
    setReport(null);
    try {
      const { data, error } = await supabase.functions.invoke("validate-solution", {
        body: { objective, key_result: keyResult, solution: s },
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
    if (!report?.rewritten_solution) return;
    const next = { ...audit, ...report.rewritten_solution, id: audit.id };
    setAudit(next);
    setReport(null);
    toast.success("Применена AI-версия. Запускаю повторный аудит...");
    validateSolution(next);
  };

  const updateAudit = (k: keyof GeneratedSolution, v: string) =>
    setAudit((p) => ({ ...p, [k]: v as any }));

  return (
    <div className="space-y-6">
      <Card className="border-2 border-hypothesis/30 bg-gradient-to-br from-hypothesis-soft/40 via-card to-card p-6 shadow-md">
        <header className="mb-4 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-hypothesis text-hypothesis-foreground shadow-sm">
            <Sparkles className="h-4.5 w-4.5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Генератор стратегических решений</h3>
            <p className="text-xs text-muted-foreground">Модуль 3 · OKR-PI · из Objective + KR</p>
          </div>
        </header>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Objective</label>
            <Input value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="напр. Стать самым любимым онбордингом" className="rounded-lg bg-secondary/40" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Key Result</label>
            <Input value={keyResult} onChange={(e) => setKeyResult(e.target.value)} placeholder="напр. Поднять активацию D1 с 22% до 45%" className="rounded-lg bg-secondary/40" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Контекст (опционально)</label>
            <Textarea value={context} onChange={(e) => setContext(e.target.value)} placeholder="Команда, аудитория, ограничения..." className="min-h-[60px] rounded-lg bg-secondary/40" />
          </div>
        </div>

        <Button onClick={handleGenerate} disabled={genLoading} className="mt-4 w-full bg-gradient-hypothesis text-hypothesis-foreground shadow-md hover:opacity-95">
          {genLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> AI ищет гипотезы...</>) : (<><Sparkles className="mr-2 h-4 w-4" /> Сгенерировать решения</>)}
        </Button>

        {solutions.length > 0 && (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {solutions.map((s, i) => {
              const rep = cardReports[i];
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
                  <div className="grid grid-cols-2 gap-2">
                    <Button onClick={() => validateCard(i, s)} disabled={loading} variant="outline" size="sm" className="border-navy/30 text-navy hover:bg-secondary">
                      {loading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="mr-2 h-3.5 w-3.5" />}
                      Проверить здесь
                    </Button>
                    <Button onClick={() => sendToAudit(s)} variant="outline" size="sm" className="border-hypothesis/30 text-hypothesis hover:bg-hypothesis-soft">
                      <Wand2 className="mr-2 h-3.5 w-3.5" /> В детальный аудит
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
          {report && (
            <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold",
              report.score >= 80 ? "bg-success-soft text-success" : report.score >= 50 ? "bg-warning-soft text-warning" : "bg-destructive/10 text-destructive")}>
              {report.score}/100
            </span>
          )}
        </header>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Проблема / JTBD"><Textarea value={audit.problem} onChange={(e) => updateAudit("problem", e.target.value)} className="min-h-[60px] rounded-lg bg-secondary/40" placeholder="Чья боль и какая?" /></Field>
          <Field label="Ставка (bet)"><Textarea value={audit.bet} onChange={(e) => updateAudit("bet", e.target.value)} className="min-h-[60px] rounded-lg bg-secondary/40" placeholder="Мы верим, что..." /></Field>
          <Field label="Result image"><Textarea value={audit.result_image} onChange={(e) => updateAudit("result_image", e.target.value)} className="min-h-[60px] rounded-lg bg-secondary/40" placeholder="Что увидим извне" /></Field>
          <Field label="Опережающая метрика"><Input value={audit.leading_metric} onChange={(e) => updateAudit("leading_metric", e.target.value)} className="rounded-lg bg-secondary/40" /></Field>
          <Field label="Уверенность">
            <select value={audit.confidence} onChange={(e) => updateAudit("confidence", e.target.value)} className="h-10 w-full rounded-lg border border-input bg-secondary/40 px-3 text-sm">
              <option value="Low">Низкая</option><option value="Medium">Средняя</option><option value="High">Высокая</option>
            </select>
          </Field>
          <Field label="Затраты">
            <select value={audit.effort} onChange={(e) => updateAudit("effort", e.target.value)} className="h-10 w-full rounded-lg border border-input bg-secondary/40 px-3 text-sm">
              <option value="S">S</option><option value="M">M</option><option value="L">L</option><option value="XL">XL</option>
            </select>
          </Field>
          <Field label="Подход к валидации" className="md:col-span-2"><Input value={audit.validation} onChange={(e) => updateAudit("validation", e.target.value)} className="rounded-lg bg-secondary/40" placeholder="Прототип, A/B-тест, discovery..." /></Field>
        </div>

        <Button onClick={() => validateSolution()} disabled={valLoading} className="mt-4 w-full bg-navy text-navy-foreground hover:opacity-95">
          {valLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> AI проверяет...</>) : (<><ShieldCheck className="mr-2 h-4 w-4" /> Запустить аудит решения</>)}
        </Button>

        {report && (
          <div className="mt-4 rounded-xl border border-border bg-secondary/30 p-4">
            {report.summary && <p className="mb-3 text-sm text-foreground">{report.summary}</p>}
            <ul className="space-y-2">
              {report.rules.map((r) => (
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
            {report.rewritten_solution && (
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
