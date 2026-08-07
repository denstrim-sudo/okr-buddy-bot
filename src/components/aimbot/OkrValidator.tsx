import React, { useEffect, useState } from "react";
import { ShieldCheck, Loader2, Plus, Trash2, Wand2, Check, X, ArrowRight, Sparkles, BookmarkPlus, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { GeneratedPlan, OkrHorizon, ValidationDraft, ValidationKR, ValidationReport, ValidationRule } from "@/types/okr";
import { useDocs } from "@/contexts/DocsContext";
import { useAiModel, notifyModelFallback } from "@/contexts/ModelContext";
import { useSavedOkrs } from "@/hooks/useSavedOkrs";
import { RuleList, scoreBadgeClass } from "./RuleList";
import { ParentKrPicker } from "./ParentKrPicker";

const HORIZON_LABELS: Record<OkrHorizon, string> = {
  strategic_3y: "Стратегия · 3 года",
  block_12m: "Блок · 12 мес",
  quarter_3m: "Квартал · 3 мес",
};

interface Props {
  draft?: ValidationDraft | null;
  onSendToSolutions?: (objective: string, keyResults: string[]) => void;
}

const DEFAULT_DRAFT: ValidationDraft = {
  objective: "Увеличить количество активных пользователей",
  key_results: ["Поднять удержание пользователей на 15%", "Провести 10 интервью с клиентами"],
};

/**
 * Рендерит текст, подсвечивая плейсхолдеры X/Y (в т.ч. X% / Y%) как визуальные
 * маркеры «сюда нужно вписать реальное число». Используется в rewritten-блоках
 * коуча-редактора.
 */
export const renderWithPlaceholders = (text: string): React.ReactNode => {
  const parts: React.ReactNode[] = [];
  const re = /\b([XY])(%?)(?![A-Za-zА-Яа-я0-9])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <mark
        key={`ph-${key++}`}
        data-testid="placeholder-xy"
        className="mx-0.5 inline-flex items-center rounded bg-warning-soft px-1 py-0 text-[0.95em] font-semibold text-warning"
        title="Плейсхолдер: подставь реальное значение (см. пояснение коуча)"
      >
        {m[1]}{m[2]}
      </mark>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
};

export const OkrValidator = ({ draft, onSendToSolutions }: Props) => {
  const [objective, setObjective] = useState(DEFAULT_DRAFT.objective);
  const [krs, setKrs] = useState<string[]>(DEFAULT_DRAFT.key_results);
  const [krsFull, setKrsFull] = useState<ValidationKR[] | null>(null);
  const [horizon, setHorizon] = useState<OkrHorizon>("block_12m");
  const [loading, setLoading] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [sourceOkrId, setSourceOkrId] = useState<string | undefined>(undefined);
  const [saveParentLink, setSaveParentLink] = useState<{ parentOkrId: string; parentKrIndex: number } | null>(null);
  const { buildContext } = useDocs();
  const { model } = useAiModel();
  const { items: savedItems, save: saveOkr, replace: replaceOkr } = useSavedOkrs();

  useEffect(() => {
    if (!draft) return;
    setObjective(draft.objective);
    setKrs(draft.key_results.length ? draft.key_results : [""]);
    setKrsFull(draft.key_results_full ?? null);
    if (draft.horizon) setHorizon(draft.horizon);
    setReport(null);
    setSourceOkrId(draft.sourceOkrId);
    setSaveParentLink(null);
  }, [draft]);

  const updateKr = (i: number, v: string) => {
    setKrs((p) => p.map((x, idx) => (idx === i ? v : x)));
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
        body: { mode: "audit", objective: obj, key_results: cleaned, key_results_full: fullCleaned, horizon, extra_context, model },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      notifyModelFallback(data);
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

  const failedRules: ValidationRule[] = report?.rules?.filter((r) => !r.pass) ?? [];

  const requestFix = async () => {
    if (!report || failedRules.length === 0) return;
    const cleaned = krs.map((k) => k.trim()).filter(Boolean);
    if (cleaned.length === 0) return toast.error("Добавьте хотя бы один Key Result");
    setFixing(true);
    try {
      const extra_context = buildContext(["methodology", "okr_context"]);
      const { data, error } = await supabase.functions.invoke("validate-okr", {
        body: {
          mode: "fix",
          objective: objective.trim(),
          key_results: cleaned,
          horizon,
          failed_rules: failedRules.map((r) => ({ id: r.id, label: r.label, hint: r.hint, why: r.why })),
          extra_context,
          model,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      notifyModelFallback(data);
      const d = data as { rewritten_objective?: string; rewritten_key_results?: string[]; rewritten_objective_warning?: boolean; editor_note?: string; model_used?: string };
      setReport((p) => p ? {
        ...p,
        rewritten_objective: d.rewritten_objective ?? "",
        rewritten_key_results: d.rewritten_key_results ?? [],
        rewritten_objective_warning: d.rewritten_objective_warning,
        editor_note: d.editor_note,
      } : p);
      toast.success("AI-предложения по улучшению готовы");
    } catch (e: any) {
      const msg = e?.message || "Не удалось получить исправления";
      toast.error(msg);
    } finally {
      setFixing(false);
    }
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

  const applyAllAndRevalidate = () => {
    if (!report) return;
    const newObjective = report.rewritten_objective || objective;
    const newKrs = report.rewritten_key_results?.map((k, i) => (k && k.trim() ? k : (krs[i] ?? ""))) ?? krs;
    setObjective(newObjective);
    setKrs(newKrs);
    setReport(null);
    toast.success("Все предложения приняты. Запускаю повторный аудит...");
    validate(newObjective, newKrs);
  };

  const buildPlanFromCurrent = (): GeneratedPlan => ({
    objective_refined: objective.trim(),
    score: report?.score ?? 0,
    horizon,
    key_results: krs.map((text, i) => {
      const f = krsFull?.[i];
      return {
        text: text.trim(),
        baseline: f?.baseline ?? "",
        target: f?.target ?? "",
        metric: f?.metric ?? "",
        kr_type: f?.kr_type ?? "leading",
        solutions: [],
      };
    }).filter((k) => k.text.length > 0),
  });

  const saveReplaceExisting = () => {
    if (!sourceOkrId) return;
    const plan = buildPlanFromCurrent();
    const res = replaceOkr(sourceOkrId, objective.trim(), plan);
    if (res.ok) {
      toast.success("Исправленная версия сохранена (связи с родителем и детьми сохранены)");
    } else {
      toast.error("Не удалось сохранить — запись не найдена или хранилище недоступно");
    }
  };

  const saveAsNew = () => {
    const plan = buildPlanFromCurrent();
    if (plan.key_results.length === 0) {
      toast.error("Добавьте хотя бы один Key Result перед сохранением");
      return;
    }
    const res = saveParentLink
      ? saveOkr(objective.trim(), plan, saveParentLink)
      : saveOkr(objective.trim(), plan);
    if (res.ok) {
      toast.success("OKR сохранён как новый");
      setSourceOkrId(res.item.id);
    } else {
      toast.error("Не удалось сохранить — хранилище недоступно");
    }
  };

  const score = report?.score;
  const statusLabel =
    report?.status === "pass" ? "Соответствует" : report?.status === "warn" ? "Требует доработки" : report?.status === "fail" ? "Не соответствует" : null;

  const hasRewrites = report && (
    (report.rewritten_objective && report.rewritten_objective.trim()) ||
    report.rewritten_key_results?.some((x) => x && x.trim())
  );

  return (
    <Card data-testid="okr-validator" className="flex flex-col gap-5 border-border/60 bg-card p-6 shadow-md">
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
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Горизонт OKR</label>
          <div className="grid grid-cols-3 gap-2">
            {(["strategic_3y", "block_12m", "quarter_3m"] as OkrHorizon[]).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHorizon(h)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs font-medium transition",
                  horizon === h ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/60",
                )}
              >
                {HORIZON_LABELS[h]}
              </button>
            ))}
          </div>
          {horizon === "quarter_3m" && (
            <p className="text-[11px] text-muted-foreground">
              Применяю квартальный набор правил: KR-LEADING повышен до critical, плюс Q-FOCUS (2–4 KR), Q-THEME (одна тема), Q-REACH (достижимость за 90 дней).
            </p>
          )}
        </div>
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
              {report.audit_unreliable && (
                <div
                  role="alert"
                  data-testid="audit-unreliable-warning"
                  className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
                >
                  ⚠ Аудит может быть ненадёжным — модель не справилась с форматом дважды. Попробуйте GPT-4o.
                </div>
              )}
              {report.model_used && (
                <p
                  data-testid="model-used-badge"
                  className="mb-2 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                >
                  Модель: {report.model_used}
                </p>
              )}
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
              {report.kr_perspectives && report.kr_perspectives.length > 0 && (
                <KrPerspectives keyResults={krs} perspectives={report.kr_perspectives} />
              )}
            </>
          )}
        </div>
      )}

      {/* Кнопка "Предложить исправления" — только если есть провалы и мы ещё не запросили fix */}
      {report && failedRules.length > 0 && !hasRewrites && (
        <Button
          type="button"
          onClick={requestFix}
          disabled={fixing}
          variant="outline"
          className="w-full border-primary/40 text-primary hover:bg-accent"
          data-testid="request-fix-button"
        >
          {fixing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Редактор пишет исправления...
            </>
          ) : (
            <>
              <Wand2 className="mr-2 h-4 w-4" /> Предложить исправления ({failedRules.length})
            </>
          )}
        </Button>
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

      {/* Сохранение в дерево */}
      {report && (
        <div className="space-y-2 rounded-xl border border-border bg-secondary/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Сохранение в дерево</p>
          {sourceOkrId ? (
            <>
              <p className="text-[11px] text-muted-foreground">
                OKR открыт из сохранённой записи. Замена сохранит id, связь с родителем и всех детей.
              </p>
              <Button
                type="button"
                onClick={saveReplaceExisting}
                variant="outline"
                size="sm"
                className="w-full border-success/40 text-success hover:bg-success-soft/50"
                data-testid="save-replace-button"
              >
                <RefreshCw className="mr-2 h-3.5 w-3.5" /> Сохранить исправленную версию
              </Button>
            </>
          ) : (
            <>
              <p className="text-[11px] text-muted-foreground">
                OKR введён вручную. Можно сохранить как новую запись (опционально — под родительским KR).
              </p>
              <ParentKrPicker
                items={savedItems}
                horizon={horizon}
                value={saveParentLink}
                onChange={setSaveParentLink}
              />
              <Button
                type="button"
                onClick={saveAsNew}
                variant="outline"
                size="sm"
                className="w-full"
                data-testid="save-as-new-button"
              >
                <BookmarkPlus className="mr-2 h-3.5 w-3.5" /> Сохранить как новый
              </Button>
            </>
          )}
        </div>
      )}

      {hasRewrites && (
        <div className="space-y-3 rounded-xl border border-primary/20 bg-accent/30 p-4">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" />
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">AI-предложения по улучшению</p>
          </div>

          {report?.editor_note && (
            <p
              data-testid="editor-note"
              className="rounded-md border border-primary/20 bg-background/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground"
            >
              <span className="font-semibold text-primary">Коуч: </span>
              {report.editor_note}
            </p>
          )}


          {report?.rewritten_objective && report.rewritten_objective.trim() && report.rewritten_objective.trim() !== objective.trim() && (
            <div className="space-y-2 rounded-lg border border-border bg-background/70 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Objective</p>
              <div className="space-y-1 text-sm">
                <p className="text-muted-foreground line-through">{objective}</p>
                <div className="flex items-start gap-1.5">
                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <p className="font-medium text-foreground">{renderWithPlaceholders(report.rewritten_objective)}</p>
                </div>
              </div>
              {report.rewritten_objective_warning && (
                <p
                  role="status"
                  data-testid="rewritten-objective-warning"
                  className="rounded-md border border-warning/40 bg-warning-soft px-2 py-1 text-[11px] font-medium text-warning"
                >
                  ⚠ Переписанная версия всё ещё может содержать цифру — проверьте вручную.
                </p>
              )}
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

          {report?.rewritten_key_results?.map((newKr, i) => {
            const oldKr = krs[i] ?? "";
            if (!newKr || !newKr.trim() || newKr.trim() === oldKr.trim()) return null;
            return (
              <div key={i} className="space-y-2 rounded-lg border border-border bg-background/70 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">KR{i + 1}</p>
                <div className="space-y-1 text-sm">
                  {oldKr && <p className="text-muted-foreground line-through">{oldKr}</p>}
                  <div className="flex items-start gap-1.5">
                    <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <p className="font-medium text-foreground">{renderWithPlaceholders(newKr)}</p>
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
            onClick={applyAllAndRevalidate}
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
