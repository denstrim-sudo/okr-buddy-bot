import { useEffect, useState } from "react";
import { ShieldCheck, Loader2, Plus, Trash2, Wand2, Check, X, ArrowRight, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ValidationDraft, ValidationKR, ValidationReport } from "@/types/okr";
import { useDocs } from "@/contexts/DocsContext";
import { useAiModel } from "@/contexts/ModelContext";
import { RuleList, scoreBadgeClass } from "./RuleList";

interface Props {
  draft?: ValidationDraft | null;
  onSendToSolutions?: (objective: string, keyResults: string[]) => void;
}

const DEFAULT_DRAFT: ValidationDraft = {
  objective: "Увеличить количество активных пользователей",
  key_results: ["Поднять удержание пользователей на 15%", "Провести 10 интервью с клиентами"],
};

export const OkrValidator = ({ draft, onSendToSolutions }: Props) => {
  const [objective, setObjective] = useState(DEFAULT_DRAFT.objective);
  const [krs, setKrs] = useState<string[]>(DEFAULT_DRAFT.key_results);
  const [krsFull, setKrsFull] = useState<ValidationKR[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const { buildContext } = useDocs();
  const { model } = useAiModel();

  useEffect(() => {
    if (!draft) return;
    setObjective(draft.objective);
    setKrs(draft.key_results.length ? draft.key_results : [""]);
    setKrsFull(draft.key_results_full ?? null);
    setReport(null);
  }, [draft]);

  const updateKr = (i: number, v: string) => {
    setKrs((p) => p.map((x, idx) => (idx === i ? v : x)));
    // если пользователь отредактировал текст KR — отвязываем расширенные данные для этой строки
    setKrsFull((p) => (p ? p.map((x, idx) => (idx === i ? { ...x, text: v } : x)) : p));
  };
  const addKr = () => {
    setKrs((p) => [...p, ""]);
    setKrsFull((p) => (p ? [...p, { text: "" }] : p));
  };
  const removeKr = (i: number) => {
    setKrs((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p));
    setKrsFull((p) => (p && p.length > 1 ? p.filter((_, idx) => idx !== i) : p));
  };

  const validate = async (overrideObjective?: string, overrideKrs?: string[]) => {
    const obj = overrideObjective ?? objective;
    const sourceKrs = overrideKrs ?? krs;
    const cleaned = sourceKrs.map((k) => k.trim()).filter(Boolean);
    if (obj.trim().length < 3) return toast.error("Введите Objective (мин. 3 символа)");
    if (cleaned.length === 0) return toast.error("Добавьте хотя бы один Key Result");

    // Собираем расширенные KR (с baseline/target/metric) — только для тех строк, что не менялись
    const fullCleaned: ValidationKR[] | undefined = krsFull
      ? sourceKrs
          .map((text, i) => {
            const t = text.trim();
            if (!t) return null;
            const f = krsFull[i];
            return f && f.text.trim() === t ? { ...f, text: t } : { text: t };
          })
          .filter(Boolean) as ValidationKR[]
      : undefined;

    setLoading(true);
    setReport(null);
    try {
      const extra_context = buildContext(["methodology", "okr_context"]);
      const { data, error } = await supabase.functions.invoke("validate-okr", {
        body: { objective: obj, key_results: cleaned, key_results_full: fullCleaned, extra_context, model },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setReport(data as ValidationReport);
      toast.success(`Аудит готов · оценка ${(data as ValidationReport).score}/100`);
    } catch (e: any) {
      const msg = e?.message || "Ошибка валидации";
      if (msg.includes("Rate")) toast.error("Слишком много запросов. Подождите немного.");
      else if (msg.includes("credits")) toast.error("Закончились AI-кредиты. Пополните в Настройках → Использование.");
      else toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const applyRewrite = () => {
    if (!report) return;
    const newObjective = report.rewritten_objective || objective;
    const newKrs = report.rewritten_key_results?.length ? report.rewritten_key_results : krs;
    setObjective(newObjective);
    setKrs(newKrs);
    setReport(null);
    toast.success("Применена AI-версия. Запускаю повторный аудит...");
    validate(newObjective, newKrs);
  };

  const acceptObjective = () => {
    if (!report?.rewritten_objective) return;
    setObjective(report.rewritten_objective);
    setReport((p) => (p ? { ...p, rewritten_objective: "" } : p));
    toast.success("Новая формулировка Objective принята");
  };

  const rejectObjective = () => {
    setReport((p) => (p ? { ...p, rewritten_objective: "" } : p));
    toast.message("Оставлена исходная формулировка Objective");
  };

  const acceptKr = (idx: number) => {
    if (!report?.rewritten_key_results?.[idx]) return;
    const newText = report.rewritten_key_results[idx];
    setKrs((p) => p.map((x, i) => (i === idx ? newText : x)));
    setKrsFull((p) => (p ? p.map((x, i) => (i === idx ? { ...x, text: newText } : x)) : p));
    setReport((p) =>
      p ? { ...p, rewritten_key_results: p.rewritten_key_results.map((x, i) => (i === idx ? "" : x)) } : p,
    );
    toast.success(`KR${idx + 1}: новая формулировка принята`);
  };

  const rejectKr = (idx: number) => {
    setReport((p) =>
      p ? { ...p, rewritten_key_results: p.rewritten_key_results.map((x, i) => (i === idx ? "" : x)) } : p,
    );
  };

  const applyAndRevalidate = applyRewrite;

  const score = report?.score;
  const statusLabel =
    report?.status === "pass" ? "Соответствует" : report?.status === "warn" ? "Требует доработки" : report?.status === "fail" ? "Не соответствует" : null;

  return (
    <Card className="flex flex-col gap-5 border-border/60 bg-card p-6 shadow-md">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy text-navy-foreground shadow-sm">
            <ShieldCheck className="h-4.5 w-4.5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Проверка существующего OKR</h3>
            <p className="text-xs text-muted-foreground">Модуль 2 · Аудит по правилам</p>
          </div>
        </div>
        {score !== undefined && (
          <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", scoreBadgeClass(score))}>
            Оценка {score}/100
          </span>
        )}
      </header>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Objective</label>
          <Input
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder="напр. Увеличить количество активных пользователей"
            className="rounded-lg bg-secondary/40"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ключевые результаты</label>
            <button
              type="button"
              onClick={addKr}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <Plus className="h-3 w-3" /> Добавить KR
            </button>
          </div>
          <div className="space-y-2">
            {krs.map((kr, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="mt-2.5 inline-flex h-5 min-w-[2.25rem] items-center justify-center rounded-md bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
                  KR{i + 1}
                </span>
                <Textarea
                  value={kr}
                  onChange={(e) => updateKr(i, e.target.value)}
                  placeholder="напр. Поднять NPS с 32 до 50 к концу Q3"
                  className="min-h-[44px] resize-none rounded-lg bg-secondary/40 text-sm"
                />
                {krs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeKr(i)}
                    className="mt-2 text-muted-foreground hover:text-destructive"
                    aria-label="Удалить KR"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <Button
        onClick={() => validate()}
        disabled={loading}
        className="w-full bg-navy text-navy-foreground shadow-md hover:opacity-95"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> AI проверяет OKR...
          </>
        ) : (
          <>
            <ShieldCheck className="mr-2 h-4 w-4" /> Запустить аудит
          </>
        )}
      </Button>

      {(report || loading) && (
        <div className="rounded-xl border border-border bg-secondary/30 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Отчёт валидации</p>
            {statusLabel && (
              <span
                className={cn(
                  "text-xs font-medium",
                  report?.status === "pass" ? "text-success" : report?.status === "warn" ? "text-warning" : "text-destructive",
                )}
              >
                {statusLabel}
              </span>
            )}
          </div>

          {loading && (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-8 animate-pulse rounded-md bg-background/60" />
              ))}
            </div>
          )}

          {report && (
            <>
              {report.summary && <p className="mb-3 text-sm text-foreground">{report.summary}</p>}
              {(() => {
                const failed = report.rules.filter((r) => !r.pass);
                const counts = {
                  critical: failed.filter((r) => (r.severity ?? "important") === "critical").length,
                  important: failed.filter((r) => (r.severity ?? "important") === "important").length,
                  improve: failed.filter((r) => (r.severity ?? "important") === "improve").length,
                };
                if (failed.length === 0) return null;
                return (
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
                    {counts.critical > 0 && (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-semibold text-destructive">
                        Критичных: {counts.critical}
                      </span>
                    )}
                    {counts.important > 0 && (
                      <span className="rounded-full bg-warning-soft px-2 py-0.5 font-semibold text-warning">
                        Важных: {counts.important}
                      </span>
                    )}
                    {counts.improve > 0 && (
                      <span className="rounded-full bg-muted px-2 py-0.5 font-semibold text-muted-foreground">
                        Улучшений: {counts.improve}
                      </span>
                    )}
                  </div>
                );
              })()}
              <RuleList rules={report.rules} />
            </>
          )}
        </div>
      )}

      {report && onSendToSolutions && (() => {
        const ready = report.score >= 70;
        const cleanedKrs = krs.map((k) => k.trim()).filter(Boolean);
        const handleSend = () => {
          if (!ready) {
            toast.error(`Оценка ${report.score}/100 ниже порога 70. Доработайте OKR перед генерацией решений.`);
            return;
          }
          onSendToSolutions(objective.trim(), cleanedKrs);
          toast.success("OKR передан в Генератор решений");
          requestAnimationFrame(() => {
            document.getElementById("solution-studio")?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        };
        return (
          <div className={cn(
            "flex items-center justify-between gap-3 rounded-xl border p-3",
            ready ? "border-hypothesis/30 bg-hypothesis-soft/30" : "border-border bg-secondary/30",
          )}>
            <div className="flex-1 text-xs">
              {ready ? (
                <p className="text-foreground"><span className="font-semibold text-hypothesis">Готово к генерации решений.</span> Оценка {report.score}/100 ≥ 70.</p>
              ) : (
                <p className="text-muted-foreground">Передача в Решения доступна при оценке ≥ 70/100. Сейчас: <span className="font-semibold text-warning">{report.score}/100</span>.</p>
              )}
            </div>
            <Button
              onClick={handleSend}
              disabled={!ready}
              size="sm"
              className="shrink-0 bg-gradient-hypothesis text-hypothesis-foreground shadow-md hover:opacity-95 disabled:opacity-50"
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Передать в Решения
            </Button>
          </div>
        );
      })()}

      {report && (report.rewritten_objective || report.rewritten_key_results?.some((x) => x && x.trim())) && (
        <div className="space-y-3 rounded-xl border border-primary/20 bg-accent/30 p-4">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" />
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">AI-предложения по улучшению</p>
          </div>

          {report.rewritten_objective && report.rewritten_objective.trim() && report.rewritten_objective.trim() !== objective.trim() && (
            <div className="space-y-2 rounded-lg border border-border bg-background/70 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Objective</p>
              <div className="space-y-1 text-sm">
                <p className="text-muted-foreground line-through">{objective}</p>
                <div className="flex items-start gap-1.5">
                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <p className="font-medium text-foreground">{report.rewritten_objective}</p>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={acceptObjective} className="h-8 bg-success text-success-foreground hover:bg-success/90">
                  <Check className="mr-1 h-3.5 w-3.5" /> Принять новую
                </Button>
                <Button size="sm" variant="outline" onClick={rejectObjective} className="h-8">
                  <X className="mr-1 h-3.5 w-3.5" /> Оставить старую
                </Button>
              </div>
            </div>
          )}

          {report.rewritten_key_results?.map((newKr, i) => {
            const oldKr = krs[i] ?? "";
            if (!newKr || !newKr.trim() || newKr.trim() === oldKr.trim()) return null;
            return (
              <div key={i} className="space-y-2 rounded-lg border border-border bg-background/70 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">KR{i + 1}</p>
                <div className="space-y-1 text-sm">
                  {oldKr && <p className="text-muted-foreground line-through">{oldKr}</p>}
                  <div className="flex items-start gap-1.5">
                    <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <p className="font-medium text-foreground">{newKr}</p>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={() => acceptKr(i)} className="h-8 bg-success text-success-foreground hover:bg-success/90">
                    <Check className="mr-1 h-3.5 w-3.5" /> Принять новую
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => rejectKr(i)} className="h-8">
                    <X className="mr-1 h-3.5 w-3.5" /> Оставить старую
                  </Button>
                </div>
              </div>
            );
          })}

          <Button
            onClick={applyAndRevalidate}
            disabled={loading}
            variant="outline"
            size="sm"
            className="w-full border-primary/30 text-primary hover:bg-accent"
          >
            <Wand2 className="mr-2 h-3.5 w-3.5" /> Принять все и перепроверить
          </Button>
        </div>
      )}
    </Card>
  );
};
