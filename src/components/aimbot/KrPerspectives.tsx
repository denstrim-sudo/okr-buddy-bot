import React from "react";
import { cn } from "@/lib/utils";
import type { KrPerspective, KrPerspectiveAxis } from "@/types/okr";

export const AXIS_META: Record<KrPerspectiveAxis, { label: string; short: string; className: string; hint: string }> = {
  customer_business: {
    label: "Клиент и бизнес",
    short: "Клиент/бизнес",
    className: "bg-primary/10 text-primary",
    hint: "Польза клиенту, который получает результат, и бизнесу, который от него зависит.",
  },
  feasibility_risk: {
    label: "Осуществимость и риски",
    short: "Осуществимость/риски",
    className: "bg-warning-soft text-warning",
    hint: "Ранние доказательства, что подход жизнеспособен, и защита критичного («не сломать»).",
  },
  learning: {
    label: "Обучение и развитие",
    short: "Обучение",
    className: "bg-success/10 text-success",
    hint: "Чему организация научится, добиваясь результата: что подтвердил прототип, эксперимент, тест на рынке.",
  },
};

const AXIS_ORDER: KrPerspectiveAxis[] = ["customer_business", "feasibility_risk", "learning"];

const EXAMPLES: Record<KrPerspectiveAxis, string> = {
  customer_business: "напр. «Увеличить долю заказов, выполняемых автономно, с 40% до 70%»",
  feasibility_risk: "напр. «Удерживать долю сбоев ниже 1% по мере удвоения объёма»",
  learning: "напр. «Подтвердить три типа заказов, которые клиенты больше всего хотят автоматизировать»",
};

interface Props {
  keyResults: string[];
  perspectives: KrPerspective[];
}

/**
 * Показывает типологию набора KR (AI-Native SAFe): по какой оси работает каждый KR
 * и каких осей в наборе нет. Это подсказка для расширения мышления, не требование.
 */
export const KrPerspectives: React.FC<Props> = ({ keyResults, perspectives }) => {
  if (!perspectives?.length) return null;

  const byIndex = new Map<number, KrPerspective>();
  for (const p of perspectives) {
    if (AXIS_META[p.perspective] && !byIndex.has(p.index)) byIndex.set(p.index, p);
  }
  if (byIndex.size === 0) return null;

  const present = new Set([...byIndex.values()].map((p) => p.perspective));
  const missing = AXIS_ORDER.filter((a) => !present.has(a));

  return (
    <div data-testid="kr-perspectives" className="mt-4 rounded-lg border border-border bg-background/50 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Точки зрения на набор KR
      </p>
      <ul className="space-y-2">
        {keyResults.map((kr, i) => {
          const p = byIndex.get(i);
          if (!p) return null;
          const meta = AXIS_META[p.perspective];
          return (
            <li key={i} className="flex flex-wrap items-start gap-2 text-sm">
              <span className="mt-0.5 inline-flex h-5 min-w-[2.25rem] items-center justify-center rounded-md bg-secondary px-1.5 text-[10px] font-bold text-muted-foreground">
                KR{i + 1}
              </span>
              <span
                data-testid={`kr-axis-${i}`}
                title={`${meta.hint} ${p.rationale}`}
                className={cn("mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold", meta.className)}
              >
                {meta.short}
              </span>
              <span className="flex-1 text-xs text-muted-foreground">{kr}</span>
            </li>
          );
        })}
      </ul>
      {missing.length > 0 && (
        <p data-testid="kr-perspectives-missing" className="mt-3 text-xs text-muted-foreground">
          Не покрыто:{" "}
          {missing.map((a, i) => (
            <span key={a}>
              {i > 0 ? ", " : ""}
              <span className="font-medium text-foreground">{AXIS_META[a].label}</span> ({EXAMPLES[a]})
            </span>
          ))}
          . Это подсказка, а не требование — не все оси уместны для каждой цели.
        </p>
      )}
    </div>
  );
};
