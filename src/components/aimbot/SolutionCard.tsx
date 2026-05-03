import { Lightbulb, Target as TargetIcon, TrendingUp, FlaskConical, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  id: string;
  problem: string;
  bet: string;
  resultImage: string;
  metric: string;
  confidence: "Low" | "Medium" | "High";
  effort: "S" | "M" | "L" | "XL";
  validation: string;
  badge?: string;
}

const confColor = {
  Low: "bg-destructive/10 text-destructive",
  Medium: "bg-warning-soft text-warning",
  High: "bg-success-soft text-success",
} as const;

export const SolutionCard = ({ id, problem, bet, resultImage, metric, confidence, effort, validation, badge }: Props) => (
  <article className="group relative overflow-hidden rounded-2xl border-2 border-hypothesis/30 bg-gradient-to-br from-hypothesis-soft via-card to-card p-5 shadow-md transition-all hover:border-hypothesis/60 hover:shadow-elegant">
    <div className="absolute right-0 top-0 h-24 w-24 -translate-y-12 translate-x-12 rounded-full bg-hypothesis/10 blur-2xl" />

    <header className="relative mb-3 flex items-start justify-between gap-3">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-hypothesis text-hypothesis-foreground shadow-sm">
          <Lightbulb className="h-4 w-4" strokeWidth={2.5} />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-hypothesis">Solution · {id}</p>
          <p className="text-xs font-medium text-muted-foreground">Strategic hypothesis</p>
        </div>
      </div>
      {badge && (
        <span className="rounded-full bg-hypothesis px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-hypothesis-foreground">
          {badge}
        </span>
      )}
    </header>

    <div className="relative space-y-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Problem / JTBD</p>
        <p className="mt-0.5 text-sm font-semibold text-foreground">{problem}</p>
      </div>
      <div className="rounded-lg border border-border/60 bg-background/60 p-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Hypothesis</p>
        <p className="mt-1 text-sm leading-relaxed text-foreground">
          <span className="font-medium">We believe that</span> {bet}, <span className="font-medium">which will lead to</span> {resultImage}.
        </p>
      </div>
    </div>

    <footer className="relative mt-4 grid grid-cols-2 gap-2 border-t border-border/60 pt-3 text-xs">
      <Stat icon={<TrendingUp className="h-3.5 w-3.5" />} label="Leading metric" value={metric} />
      <Stat icon={<Sparkles className="h-3.5 w-3.5" />} label="Confidence" valueClass={cn("font-bold", confColor[confidence])} value={confidence} />
      <Stat icon={<TargetIcon className="h-3.5 w-3.5" />} label="Effort" value={effort} />
      <Stat icon={<FlaskConical className="h-3.5 w-3.5" />} label="Validation" value={validation} />
    </footer>
  </article>
);

const Stat = ({ icon, label, value, valueClass }: { icon: React.ReactNode; label: string; value: string; valueClass?: string }) => (
  <div className="flex items-start gap-1.5">
    <span className="mt-0.5 text-muted-foreground">{icon}</span>
    <div className="min-w-0 flex-1">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("truncate text-xs font-semibold text-foreground", valueClass)}>{value}</p>
    </div>
  </div>
);
