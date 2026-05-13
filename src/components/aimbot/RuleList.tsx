import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { RuleSeverity, ValidationRule } from "@/types/okr";
import { CheckCircle2, XCircle, AlertTriangle, Sparkles, Info, ChevronDown, ChevronRight } from "lucide-react";

interface Props {
  rules: ValidationRule[];
  size?: "sm" | "md";
}

const SEVERITY_ORDER: Record<RuleSeverity, number> = { critical: 0, important: 1, improve: 2 };

const severityMeta = (s: RuleSeverity) => {
  if (s === "critical") return { label: "Критично", cls: "bg-destructive/10 text-destructive", Icon: XCircle, dot: "bg-destructive" };
  if (s === "important") return { label: "Важно", cls: "bg-warning-soft text-warning", Icon: AlertTriangle, dot: "bg-warning" };
  return { label: "Улучшение", cls: "bg-muted text-muted-foreground", Icon: Sparkles, dot: "bg-muted-foreground/60" };
};

const renderRule = (r: ValidationRule, isSm: boolean) => {
  const sev: RuleSeverity | undefined = r.pass ? undefined : (r.severity ?? "important");
  const meta = sev ? severityMeta(sev) : null;
  return (
    <li key={r.id} className={cn("flex items-start", isSm ? "gap-2 text-xs" : "gap-2.5 text-sm")}>
      {r.pass ? (
        <CheckCircle2 className={cn("mt-0.5 shrink-0 text-success", isSm ? "h-3.5 w-3.5" : "h-4 w-4")} />
      ) : isSm && meta ? (
        <span className={cn("mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full", meta.dot)} aria-label={meta.label} />
      ) : meta ? (
        <meta.Icon className={cn("mt-0.5 h-4 w-4 shrink-0", sev === "critical" ? "text-destructive" : sev === "important" ? "text-warning" : "text-muted-foreground")} />
      ) : (
        <XCircle className={cn("mt-0.5 shrink-0 text-destructive", isSm ? "h-3.5 w-3.5" : "h-4 w-4")} />
      )}
      <div className="flex-1">
        <div className={cn("flex flex-wrap items-baseline", isSm ? "gap-1.5" : "gap-2")}>
          {!isSm && meta && (
            <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", meta.cls)}>
              {meta.label}
            </span>
          )}
          <span className="font-mono text-[10px] font-bold text-muted-foreground">[{r.id}]</span>
          <span>{r.label}</span>
        </div>
        {!r.pass && r.hint && (
          <p className={cn("mt-0.5 flex items-start gap-1 text-muted-foreground", isSm ? "text-[11px]" : "text-xs")}>
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />{r.hint}
          </p>
        )}
        {!isSm && !r.pass && r.why && (
          <p className="mt-0.5 flex items-start gap-1 text-[11px] italic text-muted-foreground/80">
            <Info className="mt-0.5 h-3 w-3 shrink-0 text-primary/70" />
            <span><span className="font-medium not-italic">Почему важно:</span> {r.why}</span>
          </p>
        )}
      </div>
    </li>
  );
};

export const RuleList = ({ rules, size = "md" }: Props) => {
  const isSm = size === "sm";
  const [showPassed, setShowPassed] = useState(false);

  const { failed, passed } = useMemo(() => {
    const failed = rules
      .filter((r) => !r.pass)
      .slice()
      .sort((a, b) => (SEVERITY_ORDER[a.severity ?? "important"] ?? 1) - (SEVERITY_ORDER[b.severity ?? "important"] ?? 1));
    const passed = rules.filter((r) => r.pass);
    return { failed, passed };
  }, [rules]);

  // sm-режим (карточки решений) — оставляем как было: всё одним списком, сортированным
  if (isSm) {
    const all = [...failed, ...passed];
    return (
      <ul className="space-y-1.5">
        {all.map((r) => renderRule(r, true))}
      </ul>
    );
  }

  return (
    <div className="space-y-3">
      {failed.length > 0 && (
        <ul className="space-y-2">
          {failed.map((r) => renderRule(r, false))}
        </ul>
      )}
      {passed.length > 0 && (
        <div className="rounded-lg border border-border/60 bg-background/40">
          <button
            type="button"
            onClick={() => setShowPassed((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              Что уже хорошо · {passed.length}
            </span>
            {showPassed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {showPassed && (
            <ul className="space-y-2 border-t border-border/60 px-3 py-2">
              {passed.map((r) => renderRule(r, false))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export const scoreBadgeClass = (score: number) =>
  score >= 80 ? "bg-success-soft text-success" : score >= 50 ? "bg-warning-soft text-warning" : "bg-destructive/10 text-destructive";
