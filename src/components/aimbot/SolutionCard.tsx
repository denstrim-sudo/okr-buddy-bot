import { memo, useState } from "react";
import { Lightbulb, Target as TargetIcon, TrendingUp, FlaskConical, Sparkles, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

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

const confLabel = {
  Low: "Низкая",
  Medium: "Средняя",
  High: "Высокая",
} as const;

export const SolutionCard = memo(function SolutionCard(props: Props) {
  const { id, problem, bet, resultImage, metric, confidence, effort, validation, badge } = props;
  const [open, setOpen] = useState(false);

  return (
    <>
      <article
        aria-label={`Решение ${id}`}
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); } }}
        className="group relative cursor-pointer overflow-hidden rounded-2xl border-2 border-hypothesis/30 bg-gradient-to-br from-hypothesis-soft via-card to-card p-5 shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:border-hypothesis/60 hover:shadow-elegant focus-within:border-hypothesis/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-hypothesis"
      >
        <div className="absolute right-0 top-0 h-24 w-24 -translate-y-12 translate-x-12 rounded-full bg-hypothesis/10 blur-2xl" />

        <header className="relative mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-hypothesis text-hypothesis-foreground shadow-sm">
              <Lightbulb className="h-4 w-4" strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-hypothesis">Решение · {id}</p>
              <p className="text-xs font-medium text-muted-foreground">Стратегическая гипотеза</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {badge && (
              <span className="rounded-full bg-hypothesis px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-hypothesis-foreground">
                {badge}
              </span>
            )}
            <Maximize2 className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        </header>

        <div className="relative space-y-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Проблема / JTBD</p>
            <p className="mt-0.5 line-clamp-2 text-sm font-semibold text-foreground">{problem}</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/60 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Гипотеза</p>
            <p className="mt-1 line-clamp-4 text-sm leading-relaxed text-foreground">{bet}</p>
          </div>
        </div>

        <footer className="relative mt-4 grid grid-cols-2 gap-2 border-t border-border/60 pt-3 text-xs">
          <Stat icon={<TrendingUp className="h-3.5 w-3.5" />} label="Опережающая метрика" value={metric} />
          <Stat icon={<Sparkles className="h-3.5 w-3.5" />} label="Уверенность" valueClass={cn("font-bold", confColor[confidence])} value={confLabel[confidence]} />
          <Stat icon={<TargetIcon className="h-3.5 w-3.5" />} label="Затраты" value={effort} />
          <Stat icon={<FlaskConical className="h-3.5 w-3.5" />} label="Валидация" value={validation} />
        </footer>
      </article>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-hypothesis text-hypothesis-foreground shadow-sm">
                <Lightbulb className="h-4.5 w-4.5" strokeWidth={2.5} />
              </div>
              <div className="text-left">
                <p className="text-[10px] font-bold uppercase tracking-wider text-hypothesis">Решение · {id}</p>
                <DialogTitle className="text-base">Стратегическая гипотеза</DialogTitle>
              </div>
              {badge && (
                <span className="ml-auto rounded-full bg-hypothesis px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-hypothesis-foreground">
                  {badge}
                </span>
              )}
            </div>
            <DialogDescription className="sr-only">Полная информация о решении</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Block label="Проблема / JTBD" text={problem} />
            <div className="rounded-lg border border-border/60 bg-secondary/30 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Гипотеза (bet)</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{bet}</p>
            </div>
            <Block label="Result image (что увидим извне)" text={resultImage} />
            <Block label="Опережающая метрика" text={metric} />
            <div className="grid grid-cols-2 gap-3">
              <Block label="Уверенность" text={confLabel[confidence]} />
              <Block label="Затраты" text={effort} />
            </div>
            <Block label="Подход к валидации" text={validation} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});

const Block = ({ label, text }: { label: string; text: string }) => (
  <div>
    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{text}</p>
  </div>
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
