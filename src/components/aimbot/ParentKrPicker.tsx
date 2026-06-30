import type { OkrHorizon } from "@/types/okr";
import type { SavedOkr } from "@/hooks/useSavedOkrs";
import { eligibleParents, parentHorizonFor } from "@/lib/okrHierarchy";
import { cn } from "@/lib/utils";

interface Props {
  items: SavedOkr[];
  horizon: OkrHorizon;
  value: { parentOkrId: string; parentKrIndex: number } | null;
  onChange: (link: { parentOkrId: string; parentKrIndex: number } | null) => void;
}

const NONE = "__none__";

export const ParentKrPicker = ({ items, horizon, value, onChange }: Props) => {
  const parentH = parentHorizonFor(horizon);

  if (!parentH) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
        Strategic OKR — корень иерархии, родителя нет.
      </div>
    );
  }

  const parents = eligibleParents(items, horizon);
  const parentLabel = parentH === "strategic_3y" ? "стратегических" : "годовых (block)";

  if (parents.length === 0) {
    return (
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Родительский OKR
        </label>
        <div className="rounded-lg border border-dashed border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
          Нет сохранённых {parentLabel} OKR — сначала создайте родительский на уровень выше.
        </div>
      </div>
    );
  }

  const selectedParent = value ? parents.find((p) => p.id === value.parentOkrId) ?? null : null;
  const krs = selectedParent?.plan.key_results ?? [];

  const handleParentChange = (id: string) => {
    if (id === NONE) {
      onChange(null);
      return;
    }
    const p = parents.find((x) => x.id === id);
    if (!p) return;
    onChange({ parentOkrId: id, parentKrIndex: 0 });
  };

  const handleKrChange = (idxStr: string) => {
    if (!value) return;
    onChange({ parentOkrId: value.parentOkrId, parentKrIndex: Number(idxStr) });
  };

  const selectCls = cn(
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground",
    "focus:outline-none focus:ring-2 focus:ring-primary",
  );

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Родительский OKR ({parentLabel})
        </label>
        <select
          aria-label="Родительский OKR"
          className={selectCls}
          value={value?.parentOkrId ?? NONE}
          onChange={(e) => handleParentChange(e.target.value)}
        >
          <option value={NONE}>Без родителя</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>{p.objective}</option>
          ))}
        </select>
      </div>

      {selectedParent && krs.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Родительский KR (что декомпозируем)
          </label>
          <select
            aria-label="Родительский KR"
            className={selectCls}
            value={String(value?.parentKrIndex ?? 0)}
            onChange={(e) => handleKrChange(e.target.value)}
          >
            {krs.map((kr, i) => (
              <option key={i} value={i}>KR{i + 1}: {kr.text}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};
