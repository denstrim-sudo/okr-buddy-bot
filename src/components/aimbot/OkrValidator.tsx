import { ShieldCheck, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const rules = [
  { id: "O1", label: "Objective качественный и вдохновляющий", pass: true },
  { id: "O3", label: "Не содержит KPI и процентов", pass: false, hint: '«Увеличить активных пользователей» — без амбиции' },
  { id: "KR1", label: "Каждый KR измерим", pass: false, hint: "Нет базы и целевого значения" },
  { id: "KR2", label: "Указаны базовые значения (FROM → TO)", pass: false },
  { id: "KR10", label: "Есть хотя бы один опережающий индикатор", pass: true },
];

const score = 42;

export const OkrValidator = () => (
  <Card className="flex flex-col gap-5 border-border/60 bg-card p-6 shadow-md">
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy text-navy-foreground shadow-sm">
          <ShieldCheck className="h-4.5 w-4.5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">Проверка существующего OKR</h3>
          <p className="text-xs text-muted-foreground">Модуль 2 · Аудит по правилам</p>
        </div>
      </div>
      <span
        className={cn(
          "rounded-full px-2.5 py-1 text-[11px] font-bold",
          score >= 80 ? "bg-success-soft text-success" : score >= 50 ? "bg-warning-soft text-warning" : "bg-destructive/10 text-destructive",
        )}
      >
        Оценка {score}/100
      </span>
    </header>

    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Objective</label>
        <Input defaultValue="Увеличить количество активных пользователей" className="rounded-lg bg-secondary/40" />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ключевые результаты</label>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-foreground flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <span className="flex-1">Поднять удержание пользователей на 15%</span>
        </div>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-foreground flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <span className="flex-1">Провести 10 интервью с клиентами</span>
        </div>
      </div>
    </div>

    <div className="rounded-xl border border-border bg-secondary/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Отчёт валидации</p>
        <span className="text-xs font-medium text-warning">Требует доработки</span>
      </div>
      <ul className="space-y-2">
        {rules.map((rule) => (
          <li key={rule.id} className="flex items-start gap-2.5 text-sm">
            {rule.pass ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            )}
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[10px] font-bold text-muted-foreground">[{rule.id}]</span>
                <span className={cn("text-sm", rule.pass ? "text-foreground" : "text-foreground")}>{rule.label}</span>
              </div>
              {rule.hint && <p className="mt-0.5 text-xs text-muted-foreground">{rule.hint}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>

    <Button variant="outline" className="border-primary/30 text-primary hover:bg-accent">
      Переписать с помощью AI
    </Button>
  </Card>
);
