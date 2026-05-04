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
        <div className="space-y-8 p-6">
          <StatsGrid plan={plan} solutionsCount={allSolutions.length} />

          <section>
            <DocsManager />
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <OkrGenerator onGenerated={handleGenerated} />
            <OkrValidator draft={validatorDraft} />
          </section>

          <SolutionsSection objective={objective} solutions={allSolutions} />

          <div className="mt-8">
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
