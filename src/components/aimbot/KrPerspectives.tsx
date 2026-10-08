import React from "react";
import { cn } from "@/lib/utils";
import type { KrPerspective, KrPerspectiveAxis } from "@/types/okr";

export const AXIS_META: Record<KrPerspectiveAxis, { label: string; short: string; className: string; hint: string }> = {
  "К": {
    label: "Клиент и бизнес",
    short: "К · клиент и бизнес",
    className: "bg-primary/10 text-primary",
    hint: "Изменение у клиента или в результате банка.",
  },
  "О": {
    label: "Осуществимость и риски",
    short: "О · осуществимость и риски",
    className: "bg-warning-soft text-warning",
    hint: "Удержание порога критичного: «остаётся выше / ниже» по мере роста основного.",
  },
  "У": {
    label: "Обучение",
    short: "У · обучение",
    className: "bg-success/10 text-success",
    hint: "«К дате известно, что…, с порогом…» — что банк узнает и проверит.",
  },
};

/** Старые сохранённые отчёты могли содержать прежние значения осей. */
const LEGACY_AXIS: Record<string, KrPerspectiveAxis> = {
  customer_business: "К",
  feasibility_risk: "О",
  learning: "У",
};

export const normalizeAxis = (v: string): KrPerspectiveAxis | undefined =>
  v in AXIS_META ? (v as KrPerspectiveAxis) : LEGACY_AXIS[v];

const AXIS_ORDER: KrPerspectiveAxis[] = ["К", "О", "У"];

const EXAMPLES: Record<KrPerspectiveAxis, string> = {
  "К": "напр. «Доля кредитов, оформленных полностью в приложении, с X% до Y%»",
  "О": "напр. «Доля ложных блокировок остаётся ниже X%»",
  "У": "напр. «К концу PI известно, какие два сегмента откликаются на предложение, с порогом конверсии X%»",
};

interface Props {
  keyResults: string[];
  perspectives: KrPerspective[];
}

/**
 * Показывает ракурс каждого KR (OKR-PI 3.3) и каких ракурсов в наборе нет.
 */
export const KrPerspectives: React.FC<Props> = ({ keyResults, perspectives }) => {
  if (!perspectives?.length) return null;

  const byIndex = new Map<number, KrPerspective>();
  for (const p of perspectives) {
    const axis = normalizeAxis(p.perspective);
    if (axis && !byIndex.has(p.index)) byIndex.set(p.index, { ...p, perspective: axis });
  }
  if (byIndex.size === 0) return null;

  const present = new Set([...byIndex.values()].map((p) => p.perspective));
  const missing = AXIS_ORDER.filter((a) => !present.has(a));

  return (
    <div data-testid="kr-perspectives" className="mt-4 rounded-lg border border-border bg-background/50 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Ракурсы KR (К / О / У)
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
          . Какие ракурсы обязательны, зависит от типа OKR.
        </p>
      )}
    </div>
  );
};
