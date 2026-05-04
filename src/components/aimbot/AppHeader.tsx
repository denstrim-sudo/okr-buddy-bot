import { useState } from "react";
import { Bell, Plus, Search, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Logo } from "./Logo";
import { Sidebar } from "./Sidebar";

export const AppHeader = () => {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-xl sm:px-6 sm:py-4">
      <div className="flex min-w-0 items-center gap-3">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              aria-label="Открыть меню"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            >
              <Menu className="h-4 w-4" aria-hidden="true" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetTitle className="sr-only">Навигация</SheetTitle>
            <Sidebar variant="mobile" onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
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
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="header-search" className="sr-only">Поиск</label>
          <input
            id="header-search"
            placeholder="Поиск OKR, решений..."
            className="h-9 w-64 rounded-lg border border-border bg-secondary/40 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary focus:bg-background focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <button
          aria-label="Уведомления"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
        </button>
        <Button className="h-9 bg-gradient-primary text-primary-foreground shadow-md transition-transform hover:scale-[1.02]">
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Новый OKR</span>
          <span className="sr-only sm:hidden">Новый OKR</span>
        </Button>
      </div>
    </header>
  );
};
