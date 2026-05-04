import { Sparkles } from "lucide-react";
import { SolutionCard } from "./SolutionCard";
import type { GeneratedSolution } from "@/types/okr";

interface SolutionRow extends GeneratedSolution {}

interface Props {
  objective: string;
  solutions: SolutionRow[];
}

export const SolutionsSection = ({ objective, solutions }: Props) => (
  <section>
    <div className="mb-4 flex items-end justify-between">
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-hypothesis" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-hypothesis">Модуль 3 · Фреймворк OKR-PI</p>
        </div>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground">Стратегические решения</h2>
        <p className="text-sm text-muted-foreground">
          Гипотезы для <span className="font-semibold text-foreground">{objective}</span>
        </p>
      </div>
    </div>
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {solutions.map((s) => (
        <SolutionCard
          key={s.id}
          id={s.id}
          problem={s.problem}
          bet={s.bet}
          resultImage={s.result_image}
          metric={s.leading_metric}
          confidence={s.confidence}
          effort={s.effort}
          validation={s.validation}
        />
      ))}
    </div>
  </section>
);
