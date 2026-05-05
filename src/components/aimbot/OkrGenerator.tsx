import { useState } from "react";
import { Sparkles, Wand2, Loader2, ChevronRight, TrendingUp, Target, BookmarkPlus } from "lucide-react";
import { useSavedOkrs } from "@/hooks/useSavedOkrs";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { GeneratedPlan } from "@/types/okr";
import { cn } from "@/lib/utils";
import { useDocs } from "@/contexts/DocsContext";
import { useAiModel } from "@/contexts/ModelContext";

interface Props {
  onGenerated: (plan: GeneratedPlan, objective: string) => void;
}

export const OkrGenerator = ({ onGenerated }: Props) => {
  const [objective, setObjective] = useState("");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const { buildContext, byCategory } = useDocs();
  const { save: saveOkr } = useSavedOkrs();
  const { model } = useAiModel();
  const docCount = byCategory("okr_context").length + byCategory("methodology").length;

  const generate = async () => {
    if (objective.trim().length < 3) {
      toast.error("Введите Objective (мин. 3 символа)");
      return;
    }
    setLoading(true);
    setPlan(null);
    try {
      const extra_context = buildContext(["okr_context", "methodology"]);
      const { data, error } = await supabase.functions.invoke("generate-okr", {
        body: { objective, context, extra_context, model },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const result = data as GeneratedPlan;
      setPlan(result);
      onGenerated(result, objective);
      toast.success(`Сгенерировано ${result.key_results.length} KR · оценка ${result.score}`);
    } catch (e: any) {
      const msg = e?.message || "Ошибка генерации";
      if (msg.includes("Rate")) toast.error("Слишком много запросов. Подождите немного.");
      else if (msg.includes("credits")) toast.error("Закончились AI-кредиты. Пополните в Настройках → Использование.");
      else toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="flex flex-col gap-5 border-border/60 bg-card p-6 shadow-md">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-primary text-primary-foreground shadow-sm">
            <Sparkles className="h-4.5 w-4.5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">AI-генератор OKR</h3>
            <p className="text-xs text-muted-foreground">Модуль 1 · Методология Дорра</p>
          </div>
        </div>
        {plan && (
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-bold",
              plan.score >= 80 ? "bg-success-soft text-success" : plan.score >= 50 ? "bg-warning-soft text-warning" : "bg-destructive/10 text-destructive",
            )}
          >
            Оценка {plan.score}/100
          </span>
        )}
      </header>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Objective (Цель)</label>
          <Input
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder="напр. Стать самым любимым онбордингом в нашем сегменте"
            className="rounded-lg bg-secondary/40"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Контекст <span className="font-normal normal-case text-muted-foreground/70">— команда, сегмент, известные боли</span>
          </label>
          <Textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="напр. Retention-команда, B2B SaaS, отток 45% на первой неделе, готовимся к Q3 enterprise expansion..."
            className="min-h-[90px] resize-none rounded-xl border-border bg-secondary/40 text-sm focus-visible:ring-primary"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          onClick={generate}
          disabled={loading}
          className="flex-1 bg-gradient-primary text-primary-foreground shadow-md hover:opacity-95"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> AI генерирует KR и решения...
            </>
          ) : (
            <>
              <Wand2 className="mr-2 h-4 w-4" /> Сгенерировать OKR и решения
            </>
          )}
        </Button>
        {plan && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              saveOkr(objective, plan);
              toast.success("OKR сохранён");
            }}
            className="sm:w-auto"
            aria-label="Сохранить сгенерированный OKR"
          >
            <BookmarkPlus className="mr-2 h-4 w-4" /> Сохранить
          </Button>
        )}
      </div>

      {(plan || loading) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">Ключевые результаты (KR)</h4>
            {plan && <span className="text-xs text-muted-foreground">{plan.key_results.length} KR</span>}
          </div>

          {loading && (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-secondary/60" />
              ))}
            </div>
          )}

          {plan?.key_results.map((kr, idx) => (
            <div key={idx} className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex h-5 min-w-[2rem] items-center justify-center rounded-md bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
                    KR{idx + 1}
                  </span>
                  <p className="text-sm font-semibold text-foreground">{kr.text}</p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                    kr.kr_type === "leading" ? "bg-success-soft text-success" : "bg-muted text-muted-foreground",
                  )}
                >
                  {kr.kr_type === "leading" ? "опережающий" : "запаздывающий"}
                </span>
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-2 text-xs">
                <Stat icon={<Target className="h-3 w-3" />} label="Базовое значение" value={kr.baseline} />
                <Stat icon={<TrendingUp className="h-3 w-3" />} label="Целевое значение" value={kr.target} />
                <Stat icon={<ChevronRight className="h-3 w-3" />} label="Метрика" value={kr.metric} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

const Stat = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="rounded-md border border-border/60 bg-secondary/30 px-2 py-1.5">
    <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
      {icon} {label}
    </div>
    <p className="mt-0.5 truncate text-xs font-semibold text-foreground">{value}</p>
  </div>
);
