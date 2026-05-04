import { cn } from "@/lib/utils";
import type { ValidationRule } from "@/types/okr";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

interface Props {
  rules: ValidationRule[];
  size?: "sm" | "md";
}

export const RuleList = ({ rules, size = "md" }: Props) => {
  const isSm = size === "sm";
  return (
    <ul className={cn("space-y-1.5", !isSm && "space-y-2")}>
      {rules.map((r) => (
        <li key={r.id} className={cn("flex items-start", isSm ? "gap-2 text-xs" : "gap-2.5 text-sm")}>
          {r.pass ? (
            <CheckCircle2 className={cn("mt-0.5 shrink-0 text-success", isSm ? "h-3.5 w-3.5" : "h-4 w-4")} />
          ) : (
            <XCircle className={cn("mt-0.5 shrink-0 text-destructive", isSm ? "h-3.5 w-3.5" : "h-4 w-4")} />
          )}
          <div className="flex-1">
            <div className={cn("flex items-baseline", isSm ? "gap-1.5" : "gap-2")}>
              <span className="font-mono text-[10px] font-bold text-muted-foreground">[{r.id}]</span>
              <span>{r.label}</span>
            </div>
            {!r.pass && r.hint && (
              <p className={cn("mt-0.5 flex items-start gap-1 text-muted-foreground", isSm ? "text-[11px]" : "text-xs")}>
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />{r.hint}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
};

export const scoreBadgeClass = (score: number) =>
  score >= 80 ? "bg-success-soft text-success" : score >= 50 ? "bg-warning-soft text-warning" : "bg-destructive/10 text-destructive";
