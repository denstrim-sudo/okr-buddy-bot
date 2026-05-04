import { Bell, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "./Logo";

export const AppHeader = () => (
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
);
