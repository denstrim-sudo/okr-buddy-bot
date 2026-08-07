import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowRight, Gauge, Link2, Loader2, Route, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { describeInvokeError } from "@/lib/invokeError";
import { useDocs } from "@/contexts/DocsContext";
import { useAiModel, notifyModelFallback } from "@/contexts/ModelContext";
import { useSavedOkrs } from "@/hooks/useSavedOkrs";
import { useMetricsCatalog } from "@/hooks/useMetricsCatalog";
import { usePyramid } from "@/hooks/usePyramid";
import { readModule3Solutions } from "@/lib/module3Solutions";
import { traceSolution, TRACE_STATUS_LABELS, type TraceChain } from "@/lib/pyramid";

interface Recommendation {
  type: "bridge_gap" | "weak_link" | "metric_mismatch";
  text: string;
  evidence?: string;
  grounded?: boolean;
}

const REC_TITLES: Record<Recommendation["type"], string> = {
  bridge_gap: "Как достроить обрыв",
  weak_link: "Осмысленность связи Решение → метрика",
  metric_mismatch: "Соответствие метрики и KR",
};

const STATUS_TONE: Record<TraceChain["status"], string> = {
  complete: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  broken_at_direction: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  orphan_metric: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  no_metrics: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

export const SolutionTrace = () => {
  const { items } = useSavedOkrs();
  const { metrics, getMetric } = useMetricsCatalog();
  const pyramid = usePyramid();
  const { buildContext } = useDocs();
  const { model } = useAiModel();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [summary, setSummary] = useState("");

  const solutions = useMemo(() => readModule3Solutions(items), [items]);
  const solution = solutions.find((s) => s.id === selectedId) ?? null;

  const linked = solution ? pyramid.getSolutionMetrics(solution.id) : [];
  const suggestedId = solution ? pyramid.suggestedMetricForSolution(solution) : null;
  const suggested = suggestedId ? metrics.find((m) => m.id === suggestedId) : undefined;
  const showSuggestion = Boolean(suggested && !linked.includes(suggested.id));

  const chains = useMemo(
    () => (solution ? traceSolution(solution, pyramid.state, items, metrics) : []),
    [solution, pyramid.state, items, metrics],
  );

  const select = (id: string) => {
    setSelectedId(id);
    setRecs(null);
    setSummary("");
  };

  const analyze = async () => {
    if (!solution) return;
    setLoading(true);
    setRecs(null);
    try {
      const okr_nodes = items
        .filter((i) => pyramid.state.levels[i.id])
        .map((i) => ({
          okrId: i.id,
          level: pyramid.state.levels[i.id],
          objective: i.objective,
          key_results: (i.plan?.key_results ?? []).map((k) => k.text),
        }));
      const { data, error } = await supabase.functions.invoke("analyze-pyramid-link", {
        body: {
          solution,
          chains,
          okr_nodes,
          metrics,
          kr_metrics: pyramid.state.krMetrics,
          extra_context: buildContext?.(),
          model,
        },
      });
      const payload = data as { error?: string; summary?: string; recommendations?: Recommendation[] } | null;
      if (error || payload?.error) throw new Error(describeInvokeError(error, payload));
      notifyModelFallback?.(payload);
      setRecs(payload?.recommendations ?? []);
      setSummary(payload?.summary ?? "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка проверки связанности");
    } finally {
      setLoading(false);
    }
  };

  const grouped = (recs ?? []).reduce<Record<string, Array<{ rec: Recommendation; i: number }>>>(
    (acc, rec, i) => {
      (acc[rec.type] ??= []).push({ rec, i });
      return acc;
    },
    {},
  );

  return (
    <Card className="p-4 sm:p-6" data-testid="solution-trace">
      <div className="flex items-center gap-2">
        <Route className="h-5 w-5 text-primary" />
        <div>
          <h3 className="text-sm font-semibold sm:text-base">Связь Решений со стратегией</h3>
          <p className="text-xs text-muted-foreground">
            Решения берутся из Модуля 3 — трассировка идёт через метрики вверх по пирамиде
          </p>
        </div>
      </div>

      {solutions.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          Сгенерируйте Решения в Модуле 3 — они появятся здесь для проверки связанности
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {solutions.map((s) => (
            <Button
              key={s.id}
              size="sm"
              variant={s.id === selectedId ? "default" : "outline"}
              data-testid={`trace-solution-${s.id}`}
              className="h-auto max-w-full whitespace-normal px-2 py-1 text-left text-[11px]"
              onClick={() => select(s.id)}
            >
              {s.title}
            </Button>
          ))}
        </div>
      )}

      {solution && (
        <div className="mt-4 space-y-3">
          {showSuggestion && suggested && (
            <div
              data-testid="trace-suggested-metric"
              className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-2 text-xs"
            >
              <Gauge className="h-3.5 w-3.5 text-primary" />
              <span>
                Метрика KR, под которым родилось Решение: <strong>{suggested.name}</strong>
              </span>
              <Button
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={() => pyramid.linkSolutionToMetric(solution.id, suggested.id)}
              >
                Подтвердить
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            {linked.map((id) => {
              const m = getMetric(id);
              return (
                <Badge key={id} variant="secondary" className="gap-1 text-[10px]">
                  <Gauge className="h-3 w-3" />
                  {m?.name ?? id}
                  <button
                    type="button"
                    aria-label={`Убрать метрику ${m?.name ?? id}`}
                    onClick={() => pyramid.unlinkSolutionFromMetric(solution.id, id)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
            <Button
              size="sm"
              variant="outline"
              className="h-6 gap-1 px-2 text-[11px]"
              onClick={() => setPickerOpen(true)}
            >
              <Link2 className="h-3 w-3" />
              Добавить метрику
            </Button>
          </div>

          <ul className="space-y-2">
            {chains.map((c) => (
              <li
                key={c.metricId || "none"}
                data-testid={`trace-chain-${c.metricId || "none"}`}
                className="rounded-md border border-border/60 p-2"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-medium">{c.metricName || "Без метрики"}</span>
                  <Badge variant="outline" className={cn("text-[10px]", STATUS_TONE[c.status])}>
                    {TRACE_STATUS_LABELS[c.status]}
                  </Badge>
                </div>
                {c.path.length > 0 && (
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                    {c.path.map((p, i) => (
                      <span key={`${p.okrId}:${p.krIndex}`} className="flex items-center gap-1">
                        {i > 0 && <ArrowRight className="h-3 w-3" />}
                        <span title={p.okrObjective}>
                          {p.level === "bank" ? "Банк" : "Направление"} · KR{p.krIndex + 1}: {p.krText}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
                {c.brokenAt && (
                  <p
                    data-testid="trace-broken-point"
                    className="mt-1 flex items-start gap-1 text-[11px] text-amber-700 dark:text-amber-300"
                  >
                    <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>
                      Обрыв: KR{c.brokenAt.krIndex + 1} «{c.brokenAt.krText}» не связан вверх
                    </span>
                  </p>
                )}
                {c.status === "orphan_metric" && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Эта метрика пока не привязана ни к одному KR в пирамиде
                  </p>
                )}
                {c.status === "no_metrics" && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Добавьте метрику, на которую влияет это Решение
                  </p>
                )}
              </li>
            ))}
          </ul>

          <Button size="sm" variant="outline" className="gap-1" disabled={loading} onClick={analyze}>
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Route className="h-3.5 w-3.5" />
            )}
            Проверить связанность
          </Button>

          {summary && <p className="text-xs text-muted-foreground">{summary}</p>}

          {recs !== null && recs.length === 0 && (
            <p className="text-xs text-muted-foreground">Замечаний нет</p>
          )}

          {Object.entries(grouped).map(([type, list]) => (
            <div key={type} data-testid={`rec-group-${type}`} className="space-y-1.5">
              <h4 className="text-xs font-semibold">
                {REC_TITLES[type as Recommendation["type"]] ?? type}
              </h4>
              {list.map(({ rec, i }) => (
                <div
                  key={i}
                  className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[11px]"
                >
                  <p>{rec.text}</p>
                  {rec.evidence && (
                    <p className="mt-1 italic text-muted-foreground">«{rec.evidence}»</p>
                  )}
                  {rec.grounded === false && (
                    <span
                      data-testid={`rec-ungrounded-${i}`}
                      className="mt-1 inline-block rounded border border-amber-500/40 px-1 text-[10px] text-amber-700 dark:text-amber-300"
                    >
                      не подтверждено цитатой
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>На какие метрики влияет Решение</DialogTitle>
            <DialogDescription>
              Решение может влиять на несколько метрик — выберите из справочника
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-1.5">
            {metrics.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Справочник метрик пуст — заведите метрику в пирамиде выше
              </p>
            )}
            {metrics.map((m) => (
              <Button
                key={m.id}
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px]"
                onClick={() => {
                  pyramid.linkSolutionToMetric(solution!.id, m.id);
                  setPickerOpen(false);
                }}
              >
                {m.name}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default SolutionTrace;
