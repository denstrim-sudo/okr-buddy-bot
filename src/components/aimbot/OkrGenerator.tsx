import { useState } from "react";
import { Sparkles, Wand2, Loader2, ChevronRight, TrendingUp, Target, BookmarkPlus, AlertTriangle, Info, RotateCcw, ShieldCheck, MessageCircleQuestion, CalendarClock, RefreshCw, Check } from "lucide-react";
import { useSavedOkrs } from "@/hooks/useSavedOkrs";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { GeneratedPlan, HorizonFit, HorizonFitItem, HorizonFitVerdict, OkrDraft, OkrHorizon, OkrInputInterpretation } from "@/types/okr";
import { cn } from "@/lib/utils";
import { useDocs } from "@/contexts/DocsContext";
import { useAiModel } from "@/contexts/ModelContext";

interface Props {
  onGenerated: (plan: GeneratedPlan, objective: string) => void;
}

type Phase = "input" | "interpreting" | "clarify" | "drafting" | "draft_ready";

const draftToGeneratedPlan = (d: OkrDraft): GeneratedPlan => ({
  objective_refined: d.objective,
  score: d.score_hint ?? 0,
  key_results: d.key_results.map((k) => ({
    text: k.text,
    baseline: k.baseline ?? "",
    target: k.target ?? "",
    metric: k.metric ?? "",
    kr_type: k.kr_type,
    solutions: [],
  })),
});

export const OkrGenerator = ({ onGenerated }: Props) => {
  const [phase, setPhase] = useState<Phase>("input");
  const [horizon, setHorizon] = useState<OkrHorizon>("block_12m");
  const [rawInput, setRawInput] = useState("");
  const [interpretation, setInterpretation] = useState<OkrInputInterpretation | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [draft, setDraft] = useState<OkrDraft | null>(null);

  const { buildContext } = useDocs();
  const { save: saveOkr } = useSavedOkrs();
  const { model } = useAiModel();

  const loading = phase === "interpreting" || phase === "drafting";

  const handleError = (e: any, fallback: string) => {
    const msg = e?.message || fallback;
    if (msg.includes("Rate")) toast.error("Слишком много запросов. Подождите немного.");
    else if (msg.includes("credits") || msg.includes("payment")) toast.error("Закончились AI-кредиты. Пополните баланс.");
    else toast.error(msg);
  };

  const reset = () => {
    setPhase("input");
    setInterpretation(null);
    setAnswers([]);
    setDraft(null);
  };

  const interpret = async () => {
    if (rawInput.trim().length < 3) {
      toast.error("Опишите цель или вставьте OKR (мин. 3 символа)");
      return;
    }
    setPhase("interpreting");
    setInterpretation(null);
    setDraft(null);
    try {
      const extra_context = buildContext(["okr_context", "methodology"]);
      const { data, error } = await supabase.functions.invoke("interpret-okr-input", {
        body: { raw_input: rawInput, horizon, extra_context, model },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const interp = data as OkrInputInterpretation;
      setInterpretation(interp);
      setAnswers(new Array(interp.clarifying_questions?.length ?? 0).fill(""));
      if (!interp.clarifying_questions?.length) {
        await runDraft(interp, []);
      } else {
        setPhase("clarify");
      }
    } catch (e: any) {
      setPhase("input");
      handleError(e, "Ошибка интерпретации");
    }
  };

  const runDraft = async (
    interp: OkrInputInterpretation,
    clarifying_answers: string[],
    opts?: { focus_horizon_fit?: boolean; prior_horizon_fit?: HorizonFit | null },
  ) => {
    setPhase("drafting");
    try {
      const extra_context = buildContext(["okr_context", "methodology"]);
      const { data, error } = await supabase.functions.invoke("draft-okr", {
        body: {
          raw_input: rawInput,
          horizon: interp.detected_horizon || horizon,
          mode: interp.detected_mode || "from_scratch",
          interpretation: interp,
          clarifying_answers,
          extra_context,
          model,
          focus_horizon_fit: opts?.focus_horizon_fit ?? false,
          prior_horizon_fit: opts?.prior_horizon_fit ?? undefined,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const d = data as OkrDraft;
      setDraft(d);
      setPhase("draft_ready");
      toast.success(`Черновик OKR готов · ${d.key_results.length} KR`);
    } catch (e: any) {
      setPhase(interp.clarifying_questions?.length ? "clarify" : "input");
      handleError(e, "Ошибка генерации черновика");
    }
  };

  const regenerateWithHorizonFocus = () => {
    if (!interpretation || !draft) return;
    runDraft(interpretation, answers, { focus_horizon_fit: true, prior_horizon_fit: draft.horizon_fit ?? null });
  };

  const applyObjectiveSuggestion = (suggestion: string) => {
    setDraft((d) => d ? { ...d, objective: suggestion } : d);
    toast.success("Objective обновлён");
  };

  const applyKrSuggestion = (idx: number, suggestion: string) => {
    setDraft((d) => {
      if (!d) return d;
      const krs = d.key_results.map((k, i) => i === idx ? { ...k, text: suggestion } : k);
      return { ...d, key_results: krs };
    });
    toast.success(`KR${idx + 1} обновлён`);
  };

  const submitClarifications = () => {
    if (!interpretation) return;
    runDraft(interpretation, answers);
  };

  const skipClarifications = () => {
    if (!interpretation) return;
    runDraft(interpretation, []);
  };

  const sendToAudit = () => {
    if (!draft) return;
    onGenerated(draftToGeneratedPlan(draft), draft.objective);
    toast.success("Черновик передан в аудит (Модуль 2)");
  };

  const horizonLabel = horizon === "strategic_3y" ? "Strategic · 3 года" : "Block · 12 мес";

  return (
    <Card className="flex flex-col gap-5 border-border/60 bg-card p-6 shadow-md">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-primary text-primary-foreground shadow-sm">
            <Sparkles className="h-4.5 w-4.5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">AI-генератор OKR</h3>
            <p className="text-xs text-muted-foreground">Модуль 1 · Интерпретация → черновик</p>
          </div>
        </div>
        {phase !== "input" && (
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> Заново
          </button>
        )}
      </header>

      {/* Phase: input */}
      {phase === "input" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Горизонт</label>
            <div className="grid grid-cols-2 gap-2">
              {(["strategic_3y", "block_12m"] as OkrHorizon[]).map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHorizon(h)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-xs font-medium transition",
                    horizon === h ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/60",
                  )}
                >
                  {h === "strategic_3y" ? "Strategic · 3 года" : "Block · 12 мес"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Свободный ввод <span className="font-normal normal-case text-muted-foreground/70">— цель, контекст, или уже написанный OKR для переписывания</span>
            </label>
            <Textarea
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder="напр. Хотим стать самым любимым онбордингом в B2B SaaS. Команда retention, отток 45% на первой неделе...
ИЛИ вставьте готовый OKR (Objective + KR1, KR2…)"
              className="min-h-[140px] resize-none rounded-xl border-border bg-secondary/40 text-sm focus-visible:ring-primary"
            />
          </div>

          <Button
            onClick={interpret}
            disabled={loading}
            className="w-full bg-gradient-primary text-primary-foreground shadow-md hover:opacity-95"
          >
            <Wand2 className="mr-2 h-4 w-4" /> Интерпретировать ввод
          </Button>
        </div>
      )}

      {/* Phase: interpreting / drafting (loader) */}
      {(phase === "interpreting" || phase === "drafting") && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-secondary/30 p-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm font-medium text-foreground">
            {phase === "interpreting" ? "AI анализирует ваш ввод..." : "AI собирает черновик OKR..."}
          </p>
          <p className="text-xs text-muted-foreground">{horizonLabel}</p>
        </div>
      )}

      {/* Phase: clarify */}
      {phase === "clarify" && interpretation && (
        <div className="space-y-4">
          <InterpretationSummary interp={interpretation} />

          <div className="space-y-3 rounded-xl border border-primary/30 bg-accent/30 p-4">
            <div className="flex items-center gap-2">
              <MessageCircleQuestion className="h-4 w-4 text-primary" />
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Уточняющие вопросы</p>
            </div>
            {interpretation.clarifying_questions.map((q, i) => (
              <div key={i} className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">{i + 1}. {q}</label>
                <Textarea
                  value={answers[i] ?? ""}
                  onChange={(e) => setAnswers((p) => p.map((x, idx) => (idx === i ? e.target.value : x)))}
                  placeholder="Короткий ответ или оставьте пустым"
                  className="min-h-[56px] resize-none rounded-lg bg-background/70 text-sm"
                />
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <Button onClick={submitClarifications} className="flex-1 bg-gradient-primary text-primary-foreground">
                <Sparkles className="mr-2 h-4 w-4" /> Сгенерировать черновик
              </Button>
              <Button onClick={skipClarifications} variant="outline" className="shrink-0">
                Пропустить
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Phase: draft_ready */}
      {phase === "draft_ready" && draft && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
              {draft.horizon === "strategic_3y" ? "Strategic · 3 года" : "Block · 12 мес"}
            </span>
            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              {draft.mode === "rewrite_existing" ? "Режим: переписывание" : "Режим: с нуля"}
            </span>
            <span className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-bold",
              draft.score_hint >= 70 ? "bg-success-soft text-success" : draft.score_hint >= 40 ? "bg-warning-soft text-warning" : "bg-destructive/10 text-destructive",
            )}>
              Самооценка {draft.score_hint}/100
            </span>
            {draft.horizon_fit && (
              <span className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold",
                horizonFitTone(draft.horizon_fit.overall_score, draft.horizon_fit.overall_verdict),
              )}>
                <CalendarClock className="h-3 w-3" />
                Соответствие горизонту {draft.horizon_fit.overall_score}/100
              </span>
            )}
          </div>

          <div className="rounded-xl border border-border bg-background p-4 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Objective</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{draft.objective}</p>
            {draft.horizon_fit?.objective && (
              <HorizonNote
                item={draft.horizon_fit.objective}
                horizon={draft.horizon}
                onApply={(s) => applyObjectiveSuggestion(s)}
              />
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">Ключевые результаты</h4>
              <span className="text-xs text-muted-foreground">{draft.key_results.length} / 3 KR</span>
            </div>
            {draft.key_results.map((kr, idx) => (
              <div key={idx} className="space-y-2 rounded-xl border border-border bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 inline-flex h-5 min-w-[2rem] items-center justify-center rounded-md bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
                      KR{idx + 1}
                    </span>
                    <p className="text-sm font-semibold text-foreground">{kr.text}</p>
                  </div>
                  <span className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                    kr.kr_type === "leading" ? "bg-success-soft text-success" : "bg-muted text-muted-foreground",
                  )}>
                    {kr.kr_type === "leading" ? "опережающий" : "запаздывающий"}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <Stat icon={<Target className="h-3 w-3" />} label="Базовое значение" value={kr.baseline || "—"} muted={!kr.baseline} />
                  <Stat icon={<TrendingUp className="h-3 w-3" />} label="Целевое значение" value={kr.target || "—"} muted={!kr.target} />
                  <Stat icon={<ChevronRight className="h-3 w-3" />} label="Метрика" value={kr.metric || "—"} muted={!kr.metric} />
                </div>
                {kr.warnings?.length > 0 && (
                  <NoteList icon={<AlertTriangle className="h-3 w-3" />} items={kr.warnings} tone="warning" />
                )}
                {kr.assumptions?.length > 0 && (
                  <NoteList icon={<Info className="h-3 w-3" />} items={kr.assumptions} tone="info" />
                )}
                {!kr.is_outcome && (
                  <p className="rounded-md bg-destructive/10 px-2 py-1 text-[11px] font-medium text-destructive">
                    Похоже на activity, а не outcome — требует доработки
                  </p>
                )}
              </div>
            ))}
          </div>

          {(draft.global_warnings?.length > 0 || draft.global_assumptions?.length > 0) && (
            <div className="space-y-2 rounded-xl border border-border bg-secondary/30 p-3">
              {draft.global_warnings?.length > 0 && (
                <NoteList icon={<AlertTriangle className="h-3 w-3" />} items={draft.global_warnings} tone="warning" label="Предупреждения" />
              )}
              {draft.global_assumptions?.length > 0 && (
                <NoteList icon={<Info className="h-3 w-3" />} items={draft.global_assumptions} tone="info" label="Допущения" />
              )}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={sendToAudit} className="flex-1 bg-gradient-primary text-primary-foreground shadow-md hover:opacity-95">
              <ShieldCheck className="mr-2 h-4 w-4" /> Передать в аудит
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                saveOkr(draft.objective, draftToGeneratedPlan(draft));
                toast.success("Черновик OKR сохранён");
              }}
              className="sm:w-auto"
            >
              <BookmarkPlus className="mr-2 h-4 w-4" /> Сохранить
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
};

const InterpretationSummary = ({ interp }: { interp: OkrInputInterpretation }) => (
  <div className="space-y-2 rounded-xl border border-border bg-secondary/30 p-4">
    <div className="flex flex-wrap gap-2">
      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
        {interp.detected_horizon === "strategic_3y" ? "Strategic · 3 года" : "Block · 12 мес"}
      </span>
      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        {interp.detected_mode === "rewrite_existing" ? "Распознан существующий OKR" : "С нуля"}
      </span>
    </div>
    <p className="text-sm text-foreground">{interp.topic_summary}</p>
    {interp.missing_info?.length > 0 && (
      <NoteList icon={<Info className="h-3 w-3" />} items={interp.missing_info} tone="info" label="Что ещё нужно" />
    )}
    {interp.warnings?.length > 0 && (
      <NoteList icon={<AlertTriangle className="h-3 w-3" />} items={interp.warnings} tone="warning" />
    )}
  </div>
);

const Stat = ({ icon, label, value, muted }: { icon: React.ReactNode; label: string; value: string; muted?: boolean }) => (
  <div className="rounded-md border border-border/60 bg-secondary/30 px-2 py-1.5">
    <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
      {icon} {label}
    </div>
    <p className={cn("mt-0.5 truncate text-xs font-semibold", muted ? "text-muted-foreground" : "text-foreground")}>{value}</p>
  </div>
);

const NoteList = ({
  icon, items, tone, label,
}: { icon: React.ReactNode; items: string[]; tone: "warning" | "info"; label?: string }) => (
  <div className={cn(
    "rounded-md px-2 py-1.5 text-[11px]",
    tone === "warning" ? "bg-warning-soft/60 text-warning" : "bg-accent/40 text-foreground",
  )}>
    {label && (
      <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide opacity-80">
        {icon} {label}
      </div>
    )}
    <ul className="space-y-0.5">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-1.5">
          {!label && <span className="mt-0.5">{icon}</span>}
          <span>{it}</span>
        </li>
      ))}
    </ul>
  </div>
);
