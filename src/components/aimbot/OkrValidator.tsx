import { ShieldCheck, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const rules = [
  { id: "O1", label: "Objective is qualitative & inspirational", pass: true },
  { id: "O3", label: "Contains no KPIs or percentages", pass: false, hint: '"Grow active users" lacks aspiration' },
  { id: "KR1", label: "Each KR is measurable", pass: false, hint: "Missing baseline & target" },
  { id: "KR2", label: "Baselines specified (FROM → TO)", pass: false },
  { id: "KR10", label: "At least one leading indicator", pass: true },
];

const score = 42;

export const OkrValidator = () => (
  <Card className="flex flex-col gap-5 border-border/60 bg-card p-6 shadow-md">
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy text-navy-foreground shadow-sm">
          <ShieldCheck className="h-4.5 w-4.5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">Validate Existing OKR</h3>
          <p className="text-xs text-muted-foreground">Module 2 · Rule-by-rule audit</p>
        </div>
      </div>
      <span
        className={cn(
          "rounded-full px-2.5 py-1 text-[11px] font-bold",
          score >= 80 ? "bg-success-soft text-success" : score >= 50 ? "bg-warning-soft text-warning" : "bg-destructive/10 text-destructive",
        )}
      >
        Score {score}/100
      </span>
    </header>

    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Objective</label>
        <Input defaultValue="Grow active users" className="rounded-lg bg-secondary/40" />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Key Results</label>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-foreground flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <span className="flex-1">Increase user retention by 15%</span>
        </div>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-foreground flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <span className="flex-1">Conduct 10 customer interviews</span>
        </div>
      </div>
    </div>

    <div className="rounded-xl border border-border bg-secondary/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Validation Report</p>
        <span className="text-xs font-medium text-warning">Requires Improvement</span>
      </div>
      <ul className="space-y-2">
        {rules.map((rule) => (
          <li key={rule.id} className="flex items-start gap-2.5 text-sm">
            {rule.pass ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            )}
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[10px] font-bold text-muted-foreground">[{rule.id}]</span>
                <span className={cn("text-sm", rule.pass ? "text-foreground" : "text-foreground")}>{rule.label}</span>
              </div>
              {rule.hint && <p className="mt-0.5 text-xs text-muted-foreground">{rule.hint}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>

    <Button variant="outline" className="border-primary/30 text-primary hover:bg-accent">
      Rewrite with AI
    </Button>
  </Card>
);
