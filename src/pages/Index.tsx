import { Bell, Plus, Search, Sparkles } from "lucide-react";
import { Sidebar } from "@/components/aimbot/Sidebar";
import { OkrGenerator } from "@/components/aimbot/OkrGenerator";
import { OkrValidator } from "@/components/aimbot/OkrValidator";
import { SolutionCard } from "@/components/aimbot/SolutionCard";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/aimbot/Logo";

const solutions = [
  {
    id: "S1",
    problem: "New users abandon during the empty workspace state on Day 1",
    bet: "guiding new users through a 3-minute interactive setup",
    resultImage: "users complete first valuable action before leaving session 1",
    metric: "Day-1 activation rate",
    confidence: "High" as const,
    effort: "M" as const,
    validation: "Prototype + 5 user tests",
    badge: "Top bet",
  },
  {
    id: "S2",
    problem: "Returning users on Day 3-7 lack a reason to come back",
    bet: "triggering a personalized weekly digest of unfinished value",
    resultImage: "Day-7 returning sessions become a habit, not an interruption",
    metric: "D7 retention curve",
    confidence: "Medium" as const,
    effort: "S" as const,
    validation: "Email A/B test, 2 weeks",
  },
  {
    id: "S3",
    problem: "Power users feel friction when sharing results with their team",
    bet: "removing the activation barrier of inviting teammates",
    resultImage: "every active user pulls in 1.4 collaborators on average",
    metric: "Viral coefficient (k-factor)",
    confidence: "Medium" as const,
    effort: "L" as const,
    validation: "Discovery sprint",
  },
];

const Index = () => (
  <div className="flex min-h-screen bg-gradient-surface">
    <Sidebar />

    <main className="flex-1 overflow-x-hidden">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border/60 bg-background/80 px-6 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="hidden md:block">
            <h1 className="text-xl font-bold tracking-tight text-foreground">OKRs Management</h1>
            <p className="text-xs text-muted-foreground">Q3 2026 · Retention Squad</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative hidden md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Search OKRs, solutions..."
              className="h-9 w-64 rounded-lg border border-border bg-secondary/40 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary focus:bg-background"
            />
          </div>
          <button className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground">
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
          </button>
          <Button className="h-9 bg-gradient-primary text-primary-foreground shadow-md">
            <Plus className="mr-1.5 h-4 w-4" /> New OKR
          </Button>
        </div>
      </header>

      <div className="space-y-8 p-6">
        {/* Stats */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Active OKRs", value: "12", trend: "+3 this quarter", color: "text-primary" },
            { label: "Avg Validation Score", value: "78", trend: "+14 vs Q2", color: "text-success" },
            { label: "Solutions in PI", value: "27", trend: "9 accepted", color: "text-hypothesis" },
            { label: "Teams onboarded", value: "8", trend: "2 pending", color: "text-foreground" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.label}</p>
              <p className={`mt-2 text-3xl font-bold tracking-tight ${s.color}`}>{s.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.trend}</p>
            </div>
          ))}
        </section>

        {/* Two columns: Generator + Validator */}
        <section className="grid gap-6 lg:grid-cols-2">
          <OkrGenerator />
          <OkrValidator />
        </section>

        {/* Solutions */}
        <section>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-hypothesis" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-hypothesis">Module 3 · OKR-PI Framework</p>
              </div>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground">Strategic Solutions</h2>
              <p className="text-sm text-muted-foreground">
                Hypotheses for <span className="font-semibold text-foreground">O1 · Become the most loved onboarding experience</span>
              </p>
            </div>
            <Button variant="outline" className="border-hypothesis/30 text-hypothesis hover:bg-hypothesis-soft">
              <Sparkles className="mr-1.5 h-4 w-4" /> Generate Solutions
            </Button>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {solutions.map((s) => (
              <SolutionCard key={s.id} {...s} />
            ))}
          </div>
        </section>
      </div>
    </main>
  </div>
);

export default Index;
