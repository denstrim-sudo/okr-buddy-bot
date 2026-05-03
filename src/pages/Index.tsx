import { useMemo, useState } from "react";
import { Bell, Plus, Search, Sparkles } from "lucide-react";
import { Sidebar } from "@/components/aimbot/Sidebar";
import { OkrGenerator } from "@/components/aimbot/OkrGenerator";
import { OkrValidator } from "@/components/aimbot/OkrValidator";
import { SolutionCard } from "@/components/aimbot/SolutionCard";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/aimbot/Logo";
import type { GeneratedPlan, ValidationDraft } from "@/types/okr";

const fallbackSolutions = [
  {
    id: "S1",
    problem: "Новые пользователи бросают пустой воркспейс в первый день",
    bet: "проведём новичка через 3-минутный интерактивный сетап",
    result_image: "пользователь совершит первое ценное действие до выхода из первой сессии",
    leading_metric: "Активация на 1-й день",
    confidence: "High" as const,
    effort: "M" as const,
    validation: "Прототип + 5 пользовательских тестов",
  },
  {
    id: "S2",
    problem: "На 3–7 день пользователям не за чем возвращаться",
    bet: "запустим персонализированный недельный дайджест незавершённой ценности",
    result_image: "сессии на 7-й день станут привычкой, а не прерыванием",
    leading_metric: "Кривая удержания D7",
    confidence: "Medium" as const,
    effort: "S" as const,
    validation: "A/B-тест email, 2 недели",
  },
  {
    id: "S3",
    problem: "Опытные пользователи испытывают трение при шеринге результатов с командой",
    bet: "уберём барьер активации при приглашении коллег",
    result_image: "каждый активный пользователь приведёт в среднем 1.4 коллеги",
    leading_metric: "Виральный коэффициент (k-factor)",
    confidence: "Medium" as const,
    effort: "L" as const,
    validation: "Discovery-спринт",
  },
];

const Index = () => {
  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [objective, setObjective] = useState<string>("Стать самым любимым онбордингом");
  const [validatorDraft, setValidatorDraft] = useState<ValidationDraft | null>(null);

  const allSolutions = useMemo(() => {
    if (!plan) return fallbackSolutions;
    return plan.key_results.flatMap((kr, krIdx) =>
      kr.solutions.map((s, sIdx) => ({
        ...s,
        id: `KR${krIdx + 1}·${s.id || `S${sIdx + 1}`}`,
      })),
    );
  }, [plan]);

  return (
    <div className="flex min-h-screen bg-gradient-surface">
      <Sidebar />

      <main className="flex-1 overflow-x-hidden">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border/60 bg-background/80 px-6 py-4 backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <div className="lg:hidden">
              <Logo />
            </div>
            <div className="hidden md:block">
              <h1 className="text-xl font-bold tracking-tight text-foreground">Управление OKR</h1>
              <p className="text-xs text-muted-foreground">Q3 2026 · Retention-команда</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative hidden md:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                placeholder="Поиск OKR, решений..."
                className="h-9 w-64 rounded-lg border border-border bg-secondary/40 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary focus:bg-background"
              />
            </div>
            <button className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground">
              <Bell className="h-4 w-4" />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
            </button>
            <Button className="h-9 bg-gradient-primary text-primary-foreground shadow-md">
              <Plus className="mr-1.5 h-4 w-4" /> Новый OKR
            </Button>
          </div>
        </header>

        <div className="space-y-8 p-6">
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Активные OKR", value: plan ? "1" : "12", trend: plan ? "текущий черновик" : "+3 за квартал", color: "text-primary" },
              { label: "Оценка валидации", value: plan ? String(plan.score) : "78", trend: plan ? "оценка AI" : "+14 к Q2", color: "text-success" },
              { label: "Решений в PI", value: String(allSolutions.length), trend: plan ? "сгенерировано AI" : "9 принято", color: "text-hypothesis" },
              { label: "Опережающие KR", value: plan ? String(plan.key_results.filter(k => k.kr_type === "leading").length) : "4", trend: "прогнозные", color: "text-foreground" },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.label}</p>
                <p className={`mt-2 text-3xl font-bold tracking-tight ${s.color}`}>{s.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.trend}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <OkrGenerator
              onGenerated={(p, obj) => {
                setPlan(p);
                setObjective(p.objective_refined || obj);
                setValidatorDraft({
                  objective: p.objective_refined || obj,
                  key_results: p.key_results.map((k) => k.text),
                });
              }}
            />
            <OkrValidator draft={validatorDraft} />
          </section>

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
              {allSolutions.map((s) => (
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
        </div>
      </main>
    </div>
  );
};

export default Index;
