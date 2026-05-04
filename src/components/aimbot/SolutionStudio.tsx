import { Sparkles, Loader2, ShieldCheck, Wand2, Star, RotateCcw, Target, Download, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SolutionCard } from "./SolutionCard";
import { RuleList, scoreBadgeClass } from "./RuleList";
import { cn } from "@/lib/utils";
import type { GeneratedSolution } from "@/types/okr";
import { useSolutionStudio, CUSTOM_KEY } from "@/hooks/useSolutionStudio";

interface Props {
  defaultObjective?: string;
  defaultKeyResult?: string;
  keyResults?: string[];
}

export const SolutionStudio = ({ defaultObjective = "", defaultKeyResult = "", keyResults = [] }: Props) => {
  const s = useSolutionStudio(defaultObjective, defaultKeyResult, keyResults);
  const { slice, state, activeKey, setActiveKey, krOptions, selectedSet } = s;

  return (
    <div className="space-y-6">
      <Card className="border-2 border-hypothesis/30 bg-gradient-to-br from-hypothesis-soft/40 via-card to-card p-6 shadow-md">
        <header className="mb-4 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-hypothesis text-hypothesis-foreground shadow-sm">
              <Sparkles className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Генератор стратегических решений</h3>
              <p className="text-xs text-muted-foreground">Модуль 3 · OKR-PI · сохраняется автоматически</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Button onClick={s.exportJson} variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              <Download className="mr-1.5 h-3.5 w-3.5" /> Экспорт
            </Button>
            <Button onClick={() => s.fileInputRef.current?.click()} variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              <Upload className="mr-1.5 h-3.5 w-3.5" /> Импорт
            </Button>
            <input
              ref={s.fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) s.importJson(f); }}
            />
            <Button onClick={s.resetActive} variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Сброс KR
            </Button>
            <Button onClick={s.resetAll} variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
              Сброс всего
            </Button>
          </div>
        </header>

        <div className="mb-4 flex flex-wrap gap-2">
          {krOptions.map((opt) => {
            const sl = state[opt.key];
            const count = sl?.solutions.length ?? 0;
            const sel = sl?.selected.length ?? 0;
            const isActive = opt.key === activeKey;
            return (
              <button
                key={opt.key}
                onClick={() => setActiveKey(opt.key)}
                className={cn(
                  "group flex max-w-[260px] items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                  isActive
                    ? "border-hypothesis bg-hypothesis-soft text-foreground shadow-sm"
                    : "border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                <Target className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-hypothesis" : "text-muted-foreground")} />
                <span className="truncate font-medium">{opt.label}</span>
                {(count > 0 || sel > 0) && (
                  <span className="ml-1 shrink-0 rounded bg-background/70 px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                    {sel}/{count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {selectedSet.size > 0 && (
          <div className="mb-4 rounded-lg border border-primary/30 bg-accent/40 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">В проекте · {selectedSet.size}</p>
            <ul className="space-y-1 text-sm text-foreground">
              {Array.from(selectedSet).sort((a, b) => a - b).map((idx) => {
                const sol = slice.solutions[idx]; if (!sol) return null;
                const rep = slice.cardReports[idx];
                return (
                  <li key={idx} className="flex items-start gap-2">
                    <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-primary text-primary" />
                    <span className="flex-1"><span className="font-mono text-xs text-muted-foreground">{sol.id || `S${idx + 1}`}</span> · {sol.bet}</span>
                    {rep && <span className="text-xs font-bold text-primary">{rep.score}/100</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Objective</label>
            <Input value={s.objective} onChange={(e) => s.setObjective(e.target.value)} placeholder="напр. Стать самым любимым онбордингом" className="rounded-lg bg-secondary/40" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Key Result {activeKey !== CUSTOM_KEY && <span className="ml-1 text-[10px] text-muted-foreground/70">(из плана)</span>}
            </label>
            <Input
              value={slice.krText}
              onChange={(e) => s.setKrText(e.target.value)}
              placeholder="напр. Поднять активацию D1 с 22% до 45%"
              className="rounded-lg bg-secondary/40"
              readOnly={activeKey !== CUSTOM_KEY}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Контекст (опционально)</label>
            <Textarea value={slice.context} onChange={(e) => s.setContext(e.target.value)} placeholder="Команда, аудитория, ограничения..." className="min-h-[60px] rounded-lg bg-secondary/40" />
          </div>
        </div>

        <Button onClick={s.handleGenerate} disabled={s.genLoading} className="mt-4 w-full bg-gradient-hypothesis text-hypothesis-foreground shadow-md hover:opacity-95">
          {s.genLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> AI ищет гипотезы...</>) : (<><Sparkles className="mr-2 h-4 w-4" /> Сгенерировать решения</>)}
        </Button>

        {slice.solutions.length > 0 && (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {slice.solutions.map((sol, i) => {
              const rep = slice.cardReports[i];
              const loading = s.cardLoading[i];
              return (
                <div key={i} className="space-y-2">
                  <SolutionCard
                    id={sol.id || `S${i + 1}`}
                    problem={sol.problem}
                    bet={sol.bet}
                    resultImage={sol.result_image}
                    metric={sol.leading_metric}
                    confidence={sol.confidence}
                    effort={sol.effort}
                    validation={sol.validation}
                    badge={rep ? `${rep.score}/100` : undefined}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <Button onClick={() => s.validateCard(i, sol)} disabled={loading} variant="outline" size="sm" className="border-navy/30 text-navy hover:bg-secondary">
                      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><ShieldCheck className="mr-1.5 h-3.5 w-3.5" />Проверить</>}
                    </Button>
                    <Button onClick={() => s.sendToAudit(sol)} variant="outline" size="sm" className="border-hypothesis/30 text-hypothesis hover:bg-hypothesis-soft">
                      <Wand2 className="mr-1.5 h-3.5 w-3.5" /> В аудит
                    </Button>
                    <Button onClick={() => s.toggleSelected(i)} variant={selectedSet.has(i) ? "default" : "outline"} size="sm" className={selectedSet.has(i) ? "bg-primary text-primary-foreground" : "border-primary/30 text-primary hover:bg-accent"}>
                      <Star className={cn("mr-1.5 h-3.5 w-3.5", selectedSet.has(i) && "fill-current")} />
                      {selectedSet.has(i) ? "В проекте" : "Выбрать"}
                    </Button>
                  </div>

                  {rep && (
                    <div className="rounded-lg border border-border bg-secondary/30 p-3">
                      {rep.summary && <p className="mb-2 text-xs text-foreground">{rep.summary}</p>}
                      <RuleList rules={rep.rules} size="sm" />
                      {rep.rewritten_solution && (
                        <Button onClick={() => s.applyCardRewrite(i)} disabled={loading} variant="outline" size="sm" className="mt-3 w-full border-primary/30 text-primary hover:bg-accent">
                          <Wand2 className="mr-2 h-3.5 w-3.5" /> Применить AI-версию и перепроверить
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="border-border/60 bg-card p-6 shadow-md">
        <header className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy text-navy-foreground shadow-sm">
              <ShieldCheck className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Аудит решения</h3>
              <p className="text-xs text-muted-foreground">Проверка на стратегическую гипотезу (а не задачу)</p>
            </div>
          </div>
          {slice.report && (
            <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", scoreBadgeClass(slice.report.score))}>
              {slice.report.score}/100
            </span>
          )}
        </header>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Проблема / JTBD"><Textarea value={slice.audit.problem} onChange={(e) => s.updateAudit("problem", e.target.value)} className="min-h-[60px] rounded-lg bg-secondary/40" placeholder="Чья боль и какая?" /></Field>
          <Field label="Ставка (bet)"><Textarea value={slice.audit.bet} onChange={(e) => s.updateAudit("bet", e.target.value)} className="min-h-[60px] rounded-lg bg-secondary/40" placeholder="Мы верим, что..." /></Field>
          <Field label="Result image"><Textarea value={slice.audit.result_image} onChange={(e) => s.updateAudit("result_image", e.target.value)} className="min-h-[60px] rounded-lg bg-secondary/40" placeholder="Что увидим извне" /></Field>
          <Field label="Опережающая метрика"><Input value={slice.audit.leading_metric} onChange={(e) => s.updateAudit("leading_metric", e.target.value)} className="rounded-lg bg-secondary/40" /></Field>
          <Field label="Уверенность">
            <select value={slice.audit.confidence} onChange={(e) => s.updateAudit("confidence", e.target.value as GeneratedSolution["confidence"])} className="h-10 w-full rounded-lg border border-input bg-secondary/40 px-3 text-sm">
              <option value="Low">Низкая</option><option value="Medium">Средняя</option><option value="High">Высокая</option>
            </select>
          </Field>
          <Field label="Затраты">
            <select value={slice.audit.effort} onChange={(e) => s.updateAudit("effort", e.target.value as GeneratedSolution["effort"])} className="h-10 w-full rounded-lg border border-input bg-secondary/40 px-3 text-sm">
              <option value="S">S</option><option value="M">M</option><option value="L">L</option><option value="XL">XL</option>
            </select>
          </Field>
          <Field label="Подход к валидации" className="md:col-span-2"><Input value={slice.audit.validation} onChange={(e) => s.updateAudit("validation", e.target.value)} className="rounded-lg bg-secondary/40" placeholder="Прототип, A/B-тест, discovery..." /></Field>
        </div>

        <Button onClick={() => s.validateSolution()} disabled={s.valLoading} className="mt-4 w-full bg-navy text-navy-foreground hover:opacity-95">
          {s.valLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> AI проверяет...</>) : (<><ShieldCheck className="mr-2 h-4 w-4" /> Запустить аудит решения</>)}
        </Button>

        {slice.report && (
          <div className="mt-4 rounded-xl border border-border bg-secondary/30 p-4">
            {slice.report.summary && <p className="mb-3 text-sm text-foreground">{slice.report.summary}</p>}
            <RuleList rules={slice.report.rules} />
            {slice.report.rewritten_solution && (
              <Button onClick={s.applyRewrite} disabled={s.valLoading} variant="outline" className="mt-4 w-full border-primary/30 text-primary hover:bg-accent">
                <Wand2 className="mr-2 h-4 w-4" /> Применить AI-версию и перепроверить
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

const Field = ({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) => (
  <div className={cn("space-y-1.5", className)}>
    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
    {children}
  </div>
);
