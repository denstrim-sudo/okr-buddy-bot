import { useEffect, useState } from "react";
import { ShieldCheck, Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ValidationDraft, ValidationReport } from "@/types/okr";
import { useDocs } from "@/contexts/DocsContext";
import { RuleList, scoreBadgeClass } from "./RuleList";

interface Props {
  draft?: ValidationDraft | null;
}

const DEFAULT_DRAFT: ValidationDraft = {
  objective: "Увеличить количество активных пользователей",
  key_results: ["Поднять удержание пользователей на 15%", "Провести 10 интервью с клиентами"],
};

export const OkrValidator = ({ draft }: Props) => {
  const [objective, setObjective] = useState(DEFAULT_DRAFT.objective);
  const [krs, setKrs] = useState<string[]>(DEFAULT_DRAFT.key_results);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const { buildContext } = useDocs();

  useEffect(() => {
    if (!draft) return;
    setObjective(draft.objective);
    setKrs(draft.key_results.length ? draft.key_results : [""]);
    setReport(null);
  }, [draft]);

  const updateKr = (i: number, v: string) => setKrs((p) => p.map((x, idx) => (idx === i ? v : x)));
  const addKr = () => setKrs((p) => [...p, ""]);
  const removeKr = (i: number) => setKrs((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p));

  const validate = async (overrideObjective?: string, overrideKrs?: string[]) => {
    const obj = overrideObjective ?? objective;
    const sourceKrs = overrideKrs ?? krs;
    const cleaned = sourceKrs.map((k) => k.trim()).filter(Boolean);
    if (obj.trim().length < 3) return toast.error("Введите Objective (мин. 3 символа)");
    if (cleaned.length === 0) return toast.error("Добавьте хотя бы один Key Result");

    setLoading(true);
    setReport(null);
    try {
      const extra_context = buildContext(["methodology", "okr_context"]);
      const { data, error } = await supabase.functions.invoke("validate-okr", {
        body: { objective: obj, key_results: cleaned, extra_context },
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
              <ul className="space-y-2">
                {report.rules.map((rule) => (
                  <li key={rule.id} className="flex items-start gap-2.5 text-sm">
                    {rule.pass ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    )}
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-[10px] font-bold text-muted-foreground">[{rule.id}]</span>
                        <span className="text-sm text-foreground">{rule.label}</span>
                      </div>
                      {!rule.pass && rule.hint && (
                        <p className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
                          {rule.hint}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {report && (report.rewritten_objective || report.rewritten_key_results?.length > 0) && (
        <Button
          onClick={applyAndRevalidate}
          disabled={loading}
          variant="outline"
          className="border-primary/30 text-primary hover:bg-accent"
        >
          <Wand2 className="mr-2 h-4 w-4" /> Применить AI-версию и перепроверить
        </Button>
      )}
    </Card>
  );
};
