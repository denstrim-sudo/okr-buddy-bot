import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, BookmarkCheck, Target, TrendingUp, Sparkles, List, Network } from "lucide-react";
import { useSavedOkrs } from "@/hooks/useSavedOkrs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { GeneratedPlan } from "@/types/okr";
import { OkrTree } from "./OkrTree";

interface Props {
  onSendToSolutions?: (plan: GeneratedPlan, objective: string) => void;
}

type ViewMode = "list" | "tree";

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

export const SavedOkrsList = ({ onSendToSolutions }: Props) => {
  const { items, remove, clear } = useSavedOkrs();
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  if (!items.length) return null;

  const handleRemove = (id: string) => {
    if (!confirm("Удалить сохранённый OKR?")) return;
    remove(id);
    toast.success("OKR удалён");
  };

  const handleClear = () => {
    if (!confirm(`Удалить все сохранённые OKR (${items.length})?`)) return;
    clear();
    toast.success("Все OKR удалены");
  };

  return (
    <Card className="flex flex-col gap-4 border-border/60 bg-card p-6 shadow-md">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success-soft text-success shadow-sm">
            <BookmarkCheck className="h-4.5 w-4.5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Сохранённые OKR</h3>
            <p className="text-xs text-muted-foreground">{items.length} записей · хранятся локально</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={handleClear} className="text-xs text-muted-foreground hover:text-destructive">
          Очистить все
        </Button>
      </header>

      <ul className="space-y-3">
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-xl border border-border bg-background p-4 transition-all duration-200 hover:border-primary/40 hover:shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold",
                      item.plan.score >= 80
                        ? "bg-success-soft text-success"
                        : item.plan.score >= 50
                          ? "bg-warning-soft text-warning"
                          : "bg-destructive/10 text-destructive",
                    )}
                  >
                    {item.plan.score}/100
                  </span>
                  <span className="text-[11px] text-muted-foreground">{formatDate(item.savedAt)}</span>
                </div>
                <p className="mt-1.5 text-sm font-semibold text-foreground">{item.objective}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {onSendToSolutions && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onSendToSolutions(item.plan, item.objective);
                      toast.success("OKR передан в Генератор решений");
                    }}
                    className="h-8 border-hypothesis/30 text-hypothesis hover:bg-hypothesis-soft"
                    aria-label="Передать OKR в генератор решений"
                  >
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" /> В Решения
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemove(item.id)}
                  aria-label="Удалить OKR"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {item.plan.key_results.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {item.plan.key_results.map((kr, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-md border border-border/60 bg-secondary/30 px-2.5 py-1.5">
                    <span className="mt-0.5 inline-flex h-4 min-w-[1.75rem] items-center justify-center rounded bg-primary/10 px-1 text-[9px] font-bold text-primary">
                      KR{i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">{kr.text}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Target className="h-2.5 w-2.5" /> {kr.baseline || "—"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <TrendingUp className="h-2.5 w-2.5" /> {kr.target || "—"}
                        </span>
                        {kr.metric && <span className="truncate">· {kr.metric}</span>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
};
