import { LayoutDashboard, Target, Lightbulb, BarChart3, History, Settings, Sparkles } from "lucide-react";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";

const nav = [
  { icon: LayoutDashboard, label: "Дашборд", key: "dashboard" },
  { icon: Target, label: "Цели OKR", key: "okrs", active: true },
  { icon: Lightbulb, label: "Решения", key: "solutions" },
  { icon: BarChart3, label: "Аналитика", key: "analytics" },
  { icon: History, label: "История", key: "history" },
  { icon: Settings, label: "Настройки", key: "settings" },
];

export const Sidebar = () => (
  <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 lg:flex">
    <div className="px-2 py-3">
      <Logo />
    </div>
    <nav className="mt-6 flex flex-1 flex-col gap-1">
      {nav.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
              item.active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="h-4.5 w-4.5" strokeWidth={2} />
            <span>{item.label}</span>
            {item.active && (
              <span className="absolute right-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-l-full bg-primary" />
            )}
          </button>
        );
      })}
    </nav>
    <div className="mt-4 rounded-xl border border-primary/20 bg-gradient-to-br from-accent to-background p-4">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold text-foreground">AIMBOT Pro</span>
      </div>
      <p className="text-xs text-muted-foreground">Безлимитные генерации и режим PI Day</p>
      <button className="mt-3 w-full rounded-lg bg-gradient-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-transform hover:scale-[1.02]">
        Улучшить тариф
      </button>
    </div>
  </aside>
);
