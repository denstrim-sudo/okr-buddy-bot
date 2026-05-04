import { memo } from "react";
import type { GeneratedPlan } from "@/types/okr";

interface Props {
  plan: GeneratedPlan | null;
  solutionsCount: number;
}

export const StatsGrid = memo(function StatsGrid({ plan, solutionsCount }: Props) {
  const stats = [
    { label: "Активные OKR", value: plan ? "1" : "12", trend: plan ? "текущий черновик" : "+3 за квартал", color: "text-primary" },
    { label: "Оценка валидации", value: plan ? String(plan.score) : "78", trend: plan ? "оценка AI" : "+14 к Q2", color: "text-success" },
    { label: "Решений в PI", value: String(solutionsCount), trend: plan ? "сгенерировано AI" : "9 принято", color: "text-hypothesis" },
    { label: "Опережающие KR", value: plan ? String(plan.key_results.filter((k) => k.kr_type === "leading").length) : "4", trend: "прогнозные", color: "text-foreground" },
  ];
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.label}</p>
          <p className={`mt-2 text-3xl font-bold tracking-tight ${s.color}`}>{s.value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{s.trend}</p>
        </div>
      ))}
    </section>
  );
});
