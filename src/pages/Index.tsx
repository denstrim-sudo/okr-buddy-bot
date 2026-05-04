import { useCallback, useMemo, useState } from "react";
import { Sidebar } from "@/components/aimbot/Sidebar";
import { OkrGenerator } from "@/components/aimbot/OkrGenerator";
import { OkrValidator } from "@/components/aimbot/OkrValidator";
import { SolutionStudio } from "@/components/aimbot/SolutionStudio";
import { DocsManager } from "@/components/aimbot/DocsManager";
import { AppHeader } from "@/components/aimbot/AppHeader";
import { StatsGrid } from "@/components/aimbot/StatsGrid";
import { SolutionsSection } from "@/components/aimbot/SolutionsSection";
import { fallbackSolutions } from "@/lib/fallbackSolutions";
import type { GeneratedPlan, ValidationDraft } from "@/types/okr";

const Index = () => {
  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [objective, setObjective] = useState("Стать самым любимым онбордингом");
  const [validatorDraft, setValidatorDraft] = useState<ValidationDraft | null>(null);

  const allSolutions = useMemo(() => {
    if (!plan) return fallbackSolutions;
    return plan.key_results.flatMap((kr, krIdx) =>
      kr.solutions.map((s, sIdx) => ({ ...s, id: `KR${krIdx + 1}·${s.id || `S${sIdx + 1}`}` })),
    );
  }, [plan]);

  const krTexts = useMemo(() => plan?.key_results?.map((k) => k.text) ?? [], [plan]);

  const handleGenerated = useCallback((p: GeneratedPlan, obj: string) => {
    setPlan(p);
    setObjective(p.objective_refined || obj);
    setValidatorDraft({
      objective: p.objective_refined || obj,
      key_results: p.key_results.map((k) => k.text),
    });
  }, []);

  return (
    <div className="flex min-h-screen bg-gradient-surface">
      <Sidebar />
      <main className="flex-1 overflow-x-hidden">
        <AppHeader />
        <div className="space-y-6 p-4 sm:space-y-8 sm:p-6">
          <div className="animate-fade-in">
            <StatsGrid plan={plan} solutionsCount={allSolutions.length} />
          </div>

          <section className="animate-fade-in" style={{ animationDelay: "60ms" }}>
            <DocsManager />
          </section>

          <section className="grid animate-fade-in gap-4 sm:gap-6 lg:grid-cols-2" style={{ animationDelay: "120ms" }}>
            <OkrGenerator onGenerated={handleGenerated} />
            <OkrValidator draft={validatorDraft} />
          </section>

          <div className="animate-fade-in" style={{ animationDelay: "180ms" }}>
            <SolutionsSection objective={objective} solutions={allSolutions} />
          </div>

          <div className="mt-2 animate-fade-in sm:mt-8" style={{ animationDelay: "240ms" }}>
            <SolutionStudio
              defaultObjective={objective}
              defaultKeyResult={plan?.key_results?.[0]?.text || ""}
              keyResults={krTexts}
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
