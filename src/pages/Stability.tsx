import { useMemo, useState } from "react";
import { ArrowLeft, Download, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModelSelector } from "@/components/aimbot/ModelSelector";
import { useAiModel } from "@/contexts/ModelContext";
import { GOLDEN_SET } from "@/lib/goldenSet";
import { useStabilityRun } from "@/hooks/useStabilityRun";
import {
  allRuleIds, caseAccuracy, caseStability, estimateMinutes, ruleState, scoreSpread, summarize, type RuleState,
} from "@/lib/stability";
import { cn } from "@/lib/utils";

const pct = (x: number) => `${Math.round(x * 100)}%`;

const STATE_CLS: Record<RuleState, string> = {
  pass: "bg-success/15 text-success",
  fail: "bg-destructive/15 text-destructive",
  "n/a": "bg-muted text-muted-foreground",
  unconfirmed: "bg-warning-soft text-warning",
  unreliable: "bg-warning-soft text-warning",
};

const Stability = () => {
  const { model } = useAiModel();
  const { state, running, run, stop } = useStabilityRun();
  const [selected, setSelected] = useState<string[]>(GOLDEN_SET.map((c) => c.id));
  const [repeats, setRepeats] = useState(3);
  const [concurrency, setConcurrency] = useState(2);
  const [openCase, setOpenCase] = useState<string | null>(null);

  const calls = selected.length * repeats;
  const results = useMemo(
    () => (state ? state.caseIds.map((id) => ({
      caseId: id,
      runs: state.runs[id] ?? [],
      expect: GOLDEN_SET.find((c) => c.id === id)?.expect ?? {},
    })) : []),
    [state],
  );
  const summary = useMemo(() => summarize(results), [results]);
  const hasData = results.some((r) => r.runs.length > 0);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const download = () => {
    if (!state) return;
    const blob = new Blob([JSON.stringify({
      model: state.model, date: state.startedAt,
      params: { repeats: state.repeats, concurrency: state.concurrency, caseIds: state.caseIds },
      runs: state.runs, errors: state.errors, summary,
    }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `stability-${state.startedAt.slice(0, 19).replace(/:/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <a href="/" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> В приложение
          </a>
          <h1 className="text-xl font-bold sm:text-2xl">Проверка стабильности аудита</h1>
          <p className="text-sm text-muted-foreground">Эталонный набор OKR-PI прогоняется несколько раз.</p>
        </div>
        <ModelSelector />
      </header>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setSelected(GOLDEN_SET.map((c) => c.id))}>Все</Button>
          <Button size="sm" variant="outline" onClick={() => setSelected(GOLDEN_SET.filter((c) => c.id.startsWith("P")).map((c) => c.id))}>Только эталоны P</Button>
          <Button size="sm" variant="outline" onClick={() => setSelected(GOLDEN_SET.filter((c) => c.id.startsWith("N")).map((c) => c.id))}>Только испорченные N</Button>
        </div>
        <div className="grid gap-1 sm:grid-cols-2">
          {GOLDEN_SET.map((c) => (
            <label key={c.id} className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} />
              <span><span className="font-mono text-xs font-bold">{c.id}</span> {c.title}</span>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm">Повторы
            <select className="ml-2 rounded border border-border bg-background px-2 py-1" value={repeats} onChange={(e) => setRepeats(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="text-sm">Одновременно
            <select className="ml-2 rounded border border-border bg-background px-2 py-1" value={concurrency} onChange={(e) => setConcurrency(Number(e.target.value))}>
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <p className="text-sm text-muted-foreground">Будет {calls} вызовов, примерно {estimateMinutes(calls, concurrency)} мин</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {running ? (
            <Button variant="destructive" onClick={stop}><Square className="mr-1 h-4 w-4" />Остановить</Button>
          ) : (
            <Button disabled={selected.length === 0} onClick={() => run({ caseIds: selected, repeats, model, concurrency })}>
              <Play className="mr-1 h-4 w-4" />Запустить
            </Button>
          )}
          {state && <span className="text-sm text-muted-foreground">Выполнено {state.done} из {state.total}</span>}
          {state && hasData && (
            <Button variant="outline" onClick={download}><Download className="mr-1 h-4 w-4" />Скачать результаты (JSON)</Button>
          )}
        </div>
      </section>

      {hasData && (
        <>
          <section className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Стабильность</p>
              <p data-testid="sum-stability" className="text-3xl font-bold">{pct(summary.stableShare)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Точность</p>
              <p data-testid="sum-accuracy" className="text-3xl font-bold">{pct(summary.accuracy)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Правила-«прыгуны»</p>
              {summary.flappingTop.length === 0 ? <p className="text-sm">нет</p> : (
                <ul className="text-sm">{summary.flappingTop.map((f) => <li key={f.ruleId}><span className="font-mono text-xs">{f.ruleId}</span> · {f.count}</li>)}</ul>
              )}
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Ненадёжный аудит</p>
              <p className="text-sm">{summary.unreliableCases.length ? summary.unreliableCases.join(", ") : "нет"}</p>
            </div>
          </section>

          {state && state.errors.length > 0 && (
            <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <p className="mb-1 font-semibold">Ошибки вызова (не входят в замеры): {state.errors.length}</p>
              <ul className="space-y-0.5 text-xs">{state.errors.map((e, i) => <li key={i}>{e.caseId} · прогон {e.repeat + 1}: {e.message}</li>)}</ul>
            </section>
          )}

          <section className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm" data-testid="cases-table">
              <thead className="text-left text-xs text-muted-foreground">
                <tr><th className="p-2">ID</th><th className="p-2">Название</th><th className="p-2">Стабильность</th><th className="p-2">Точность</th><th className="p-2">Разброс оценки</th></tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const c = GOLDEN_SET.find((g) => g.id === r.caseId)!;
                  const st = caseStability(r.runs);
                  const acc = caseAccuracy(r.runs, r.expect);
                  const isOpen = openCase === r.caseId;
                  const expected = new Set([...(r.expect.pass ?? []), ...(r.expect.fail ?? []), ...(r.expect.notApplicable ?? [])]);
                  const missIds = new Set(acc.misses.map((m) => m.ruleId));
                  return [
                    <tr key={r.caseId} className="cursor-pointer border-t border-border hover:bg-muted/50" onClick={() => setOpenCase(isOpen ? null : r.caseId)}>
                      <td className="p-2 font-mono text-xs font-bold">{r.caseId}</td>
                      <td className="p-2">{c.title}</td>
                      <td className="p-2">{r.runs.length ? pct(st.stableShare) : "—"}</td>
                      <td className="p-2">{acc.total ? pct(acc.matched / acc.total) : "—"}</td>
                      <td className="p-2">{scoreSpread(r.runs)}</td>
                    </tr>,
                    isOpen && (
                      <tr key={`${r.caseId}-d`} className="border-t border-border">
                        <td colSpan={5} className="p-2">
                          <div className="overflow-x-auto">
                            <table className="text-xs">
                              <thead><tr><th className="p-1 text-left">Правило</th>{r.runs.map((x, i) => <th key={i} className="p-1">#{i + 1} · {x.score ?? "—"}</th>)}</tr></thead>
                              <tbody>
                                {allRuleIds(r.runs).map((id) => (
                                  <tr key={id} className={cn(missIds.has(id) && "bg-destructive/10")}>
                                    <td className={cn("p-1 font-mono", expected.has(id) && "rounded border border-primary")}>{id}</td>
                                    {r.runs.map((x, i) => {
                                      const s = ruleState((x.rules ?? []).find((q) => q.id === id));
                                      return <td key={i} className="p-1"><span className={cn("rounded px-1.5 py-0.5", s ? STATE_CLS[s] : "text-muted-foreground")}>{s ?? "нет"}</span></td>;
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
};

export default Stability;
