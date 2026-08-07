import { useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Layers, Gauge, ArrowUpRight, Download, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSavedOkrs, type SavedOkr } from "@/hooks/useSavedOkrs";
import { useMetricsCatalog } from "@/hooks/useMetricsCatalog";
import { usePyramid } from "@/hooks/usePyramid";
import {
  describeContribution,
  findGaps,
  GAP_LABELS,
  type Gap,
  type PyramidLevel,
} from "@/lib/pyramid";


interface MetricDialogState {
  okrId: string;
  krIndex: number;
  suggested: string;
}

interface LinkDialogState {
  okrId: string;
  krIndex: number;
}

const LEVEL_TITLE: Record<PyramidLevel, string> = {
  bank: "Банк",
  direction: "Направления",
};

export const MetricsPyramid = () => {
  const { items } = useSavedOkrs();
  const { metrics, addMetric, getMetric } = useMetricsCatalog();
  const pyramid = usePyramid();
  const [metricDialog, setMetricDialog] = useState<MetricDialogState | null>(null);
  const [metricName, setMetricName] = useState("");
  const [metricUnit, setMetricUnit] = useState("");
  const [linkDialog, setLinkDialog] = useState<LinkDialogState | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const gaps = useMemo(() => findGaps(items, pyramid.state), [items, pyramid.state]);
  const gapsFor = (okrId: string, krIndex: number): Gap[] =>
    gaps.filter((g) => g.okrId === okrId && g.krIndex === krIndex);

  const byLevel = (level: PyramidLevel) => items.filter((i) => pyramid.state.levels[i.id] === level);
  const unplaced = items.filter((i) => !pyramid.state.levels[i.id]);
  const bankOkrs = byLevel("bank");

  const openMetricDialog = (okr: SavedOkr, krIndex: number) => {
    const suggested = okr.plan.key_results?.[krIndex]?.metric?.trim() || "";
    setMetricDialog({ okrId: okr.id, krIndex, suggested });
    setMetricName(suggested);
    setMetricUnit("");
  };

  const confirmMetric = () => {
    if (!metricDialog) return;
    const name = metricName.trim();
    if (!name) {
      toast.error("Укажите название метрики");
      return;
    }
    const { metric } = addMetric(name, metricUnit);
    pyramid.linkKrToMetric(metricDialog.okrId, metricDialog.krIndex, metric.id);
    setMetricDialog(null);
  };

  const chooseExisting = (metricId: string) => {
    if (!metricDialog) return;
    pyramid.linkKrToMetric(metricDialog.okrId, metricDialog.krIndex, metricId);
    setMetricDialog(null);
  };

  const handleExport = () => {
    try {
      const blob = new Blob([pyramid.exportPyramid()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aimbot-pyramid-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Экспорт готов");
    } catch {
      toast.error("Не удалось экспортировать");
    }
  };

  const handleImportFile = async (file: File) => {
    const text = await file.text();
    const res = pyramid.importPyramid(text);
    if (res.ok === false) {
      toast.error(res.error);
      return;
    }
    toast.success("Пирамида импортирована");
  };



  const renderKr = (okr: SavedOkr, krIndex: number, level: PyramidLevel) => {
    const kr = okr.plan.key_results[krIndex];
    const metricId = pyramid.state.krMetrics[`${okr.id}:${krIndex}`];
    const metric = getMetric(metricId);
    const krGaps = gapsFor(okr.id, krIndex);
    const links = pyramid.state.contributions.filter(
      (c) => c.from.okrId === okr.id && c.from.krIndex === krIndex,
    );

    return (
      <li key={krIndex} className="rounded-md border border-border/60 bg-background/40 p-2">
        <p className="text-xs font-medium leading-snug">
          KR{krIndex + 1}: {kr.text}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {metric ? (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <Gauge className="h-3 w-3" />
              {metric.name}
              {metric.unit ? `, ${metric.unit}` : ""}
            </Badge>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              onClick={() => openMetricDialog(okr, krIndex)}
            >
              Привязать метрику
            </Button>
          )}
          {metric && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              onClick={() => openMetricDialog(okr, krIndex)}
            >
              Изменить метрику
            </Button>
          )}
          {level === "direction" && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 gap-1 px-2 text-[11px]"
              onClick={() => setLinkDialog({ okrId: okr.id, krIndex })}
            >
              <ArrowUpRight className="h-3 w-3" />
              Связь вверх
            </Button>
          )}
          {krGaps.map((g) => (
            <Badge
              key={g.type}
              variant="outline"
              className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300"
            >
              {GAP_LABELS[g.type]}
            </Badge>
          ))}
        </div>
        {links.length > 0 && (
          <ul className="mt-1.5 space-y-1">
            {links.map((c) => {
              const d = describeContribution(c, items, pyramid.state);
              const full = d.orphaned
                ? "Связь оборвана: родительский KR удалён"
                : `${d.levelLabel} · ${d.krLabel}: ${d.krText} — ${d.okrObjective}`;
              return (
                <li
                  key={`${c.to.okrId}:${c.to.krIndex}`}
                  data-testid="contribution-link"
                  className="text-[11px] text-muted-foreground"
                  title={full}
                >
                  <div className="flex items-center gap-1">
                    <ArrowUpRight
                      className={cn("h-3 w-3 shrink-0", d.orphaned && "text-amber-600")}
                    />
                    {d.orphaned ? (
                      <span className="truncate text-amber-700 dark:text-amber-300">
                        связь оборвана
                      </span>
                    ) : (
                      <span className="truncate">
                        {d.levelLabel} · {d.krLabel}: {d.krText}
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label="Удалить связь"
                      className="ml-auto text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        pyramid.unlinkKrContribution(okr.id, krIndex, c.to.okrId, c.to.krIndex)
                      }
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  {!d.orphaned && d.okrObjective && (
                    <p className="truncate pl-4 text-[10px] text-muted-foreground/70">
                      {d.okrObjective}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

      </li>
    );
  };

  const renderOkrCard = (okr: SavedOkr, level: PyramidLevel) => (
    <Card key={okr.id} className="border-border/70 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-snug">{okr.objective}</p>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 shrink-0 px-2 text-[11px]"
          onClick={() => pyramid.setNodeLevel(okr.id, null)}
        >
          Убрать с яруса
        </Button>
      </div>
      {okr.plan.key_results?.length ? (
        <ul className="mt-2 space-y-2">
          {okr.plan.key_results.map((_, i) => renderKr(okr, i, level))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">У этого OKR нет ключевых результатов</p>
      )}
    </Card>
  );

  return (
    <Card className="p-4 sm:p-6" data-testid="metrics-pyramid">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-base font-semibold sm:text-lg">Пирамида метрик · Модуль 4</h2>
            <p className="text-xs text-muted-foreground">
              Связность OKR разных уровней через метрики
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" className="gap-1" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" />
            Экспорт
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            Импорт
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            aria-label="Импорт пирамиды"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportFile(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {items.length === 0 ? (
        <p className="mt-6 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Сначала сгенерируйте и сохраните OKR в Модуле 1
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {(["bank", "direction"] as PyramidLevel[]).map((level) => (
            <section key={level} aria-label={LEVEL_TITLE[level]}>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
                {LEVEL_TITLE[level]}
              </h3>
              {byLevel(level).length ? (
                <div className="grid gap-2 lg:grid-cols-2">
                  {byLevel(level).map((okr) => renderOkrCard(okr, level))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Пока пусто</p>
              )}
            </section>
          ))}

          {unplaced.length > 0 && (
            <section aria-label="Не размещено">
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Не размещено</h3>
              <div className="space-y-2">
                {unplaced.map((okr) => (
                  <div
                    key={okr.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 p-2"
                  >
                    <span className="text-sm">{okr.objective}</span>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => pyramid.setNodeLevel(okr.id, "bank")}
                      >
                        В ярус «Банк»
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => pyramid.setNodeLevel(okr.id, "direction")}
                      >
                        В ярус «Направление»
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <Dialog open={Boolean(metricDialog)} onOpenChange={(o) => !o && setMetricDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Привязка метрики</DialogTitle>
            <DialogDescription>
              Подтвердите предложенную метрику или выберите из справочника
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground" htmlFor="metric-name">
                Название метрики
              </label>
              <Input
                id="metric-name"
                value={metricName}
                onChange={(e) => setMetricName(e.target.value)}
                placeholder="Например, NPS"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground" htmlFor="metric-unit">
                Единица измерения
              </label>
              <Input
                id="metric-unit"
                value={metricUnit}
                onChange={(e) => setMetricUnit(e.target.value)}
                placeholder="%, шт., балл"
              />
            </div>
            <Button size="sm" onClick={confirmMetric}>
              Подтвердить
            </Button>
            {metrics.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">Из справочника:</p>
                <div className="flex flex-wrap gap-1.5">
                  {metrics.map((m) => (
                    <Button
                      key={m.id}
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => chooseExisting(m.id)}
                    >
                      {m.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(linkDialog)} onOpenChange={(o) => !o && setLinkDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Связь вверх</DialogTitle>
            <DialogDescription>
              Выберите ключевой результат банка, в который контрибьютит этот KR
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {bankOkrs.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Сначала разместите хотя бы один OKR в ярусе «Банк»
              </p>
            )}
            {bankOkrs.map((b) => (
              <div key={b.id}>
                <p className="text-xs font-medium">{b.objective}</p>
                <div className="mt-1 space-y-1">
                  {b.plan.key_results.map((kr, i) => (
                    <Button
                      key={i}
                      size="sm"
                      variant="outline"
                      className="h-auto w-full justify-start whitespace-normal px-2 py-1 text-left text-[11px]"
                      onClick={() => {
                        if (!linkDialog) return;
                        pyramid.linkKrContribution(linkDialog.okrId, linkDialog.krIndex, b.id, i);
                        setLinkDialog(null);
                      }}
                    >
                      KR{i + 1}: {kr.text}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default MetricsPyramid;
