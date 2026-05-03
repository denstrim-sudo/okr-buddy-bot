import { useState } from "react";
import { Sparkles, Wand2, CheckCircle2, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const draftOkrs = [
  {
    id: "o1",
    title: "Become the most loved onboarding experience in our segment",
    krs: ["Increase D7 retention from 32% → 48%", "Lift activation rate from 41% → 60%", "NPS from 28 → 42"],
    score: 86,
  },
  {
    id: "o2",
    title: "Make Beta the team's launchpad for product-market fit signals",
    krs: ["Collect 50+ qualitative interviews", "Reach 1,200 weekly active beta users", "Convert 25% beta → paid"],
    score: 74,
  },
];

export const OkrGenerator = () => {
  const [selected, setSelected] = useState("o1");

  return (
    <Card className="flex flex-col gap-5 border-border/60 bg-card p-6 shadow-md">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-primary text-primary-foreground shadow-sm">
            <Sparkles className="h-4.5 w-4.5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">AI OKR Generator</h3>
            <p className="text-xs text-muted-foreground">Module 1 · Doerr methodology</p>
          </div>
        </div>
        <button className="text-xs font-medium text-primary hover:underline">Generate OKRs with AI</button>
      </header>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          Context <span className="font-normal text-muted-foreground">— describe your team's goals, strategy, or challenge</span>
        </label>
        <Textarea
          placeholder="e.g. Our retention team needs to reduce first-week churn while preparing for Q3 expansion to enterprise..."
          className="min-h-[110px] resize-none rounded-xl border-border bg-secondary/40 text-sm focus-visible:ring-primary"
        />
      </div>

      <Button className="w-full bg-gradient-primary text-primary-foreground shadow-md hover:opacity-95">
        <Wand2 className="mr-2 h-4 w-4" /> Generate OKRs
      </Button>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground">Generated Draft OKRs</h4>
          <span className="text-xs text-muted-foreground">2 candidates</span>
        </div>

        {draftOkrs.map((okr) => {
          const active = selected === okr.id;
          return (
            <button
              key={okr.id}
              onClick={() => setSelected(okr.id)}
              className={cn(
                "group w-full rounded-xl border p-4 text-left transition-all",
                active
                  ? "border-primary/40 bg-accent/40 shadow-sm"
                  : "border-border bg-background hover:border-primary/30 hover:bg-accent/20",
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    active ? "border-primary bg-primary" : "border-border",
                  )}
                >
                  {active && <CheckCircle2 className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={3} />}
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-foreground">{okr.title}</p>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                        okr.score >= 80
                          ? "bg-success-soft text-success"
                          : okr.score >= 50
                            ? "bg-warning-soft text-warning"
                            : "bg-destructive/10 text-destructive",
                      )}
                    >
                      {okr.score}/100
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {okr.krs.map((kr, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-primary/60" />
                        <span>{kr}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
};
