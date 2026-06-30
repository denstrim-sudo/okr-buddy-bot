import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Trash2, Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buildForest, type OkrTreeNode } from "@/lib/okrHierarchy";
import type { SavedOkr } from "@/hooks/useSavedOkrs";
import type { GeneratedPlan, OkrHorizon } from "@/types/okr";

interface Props {
  items: SavedOkr[];
  onRemove?: (id: string) => void;
  onSendToSolutions?: (plan: GeneratedPlan, objective: string) => void;
}

const horizonShortLabel = (h?: OkrHorizon): string => {
  switch (h) {
    case "strategic_3y":
      return "Стратегия";
    case "block_12m":
      return "Блок";
    case "quarter_3m":
      return "Квартал";
    default:
      return "—";
  }
};

const scoreClass = (score: number) =>
  score >= 80
    ? "bg-success-soft text-success"
    : score >= 50
      ? "bg-warning-soft text-warning"
      : "bg-destructive/10 text-destructive";

const TreeNode = ({
  node,
  depth,
  onRemove,
  onSendToSolutions,
}: {
  node: OkrTreeNode;
  depth: number;
  onRemove?: (id: string) => void;
  onSendToSolutions?: (plan: GeneratedPlan, objective: string) => void;
}) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  return (
    <li style={{ paddingLeft: depth * 16 }}>
      <div className="rounded-xl border border-border bg-background p-3 transition-all hover:border-primary/40">
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Свернуть" : "Развернуть"}
            aria-expanded={expanded}
            className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-secondary",
              !hasChildren && "invisible",
            )}
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", scoreClass(node.okr.plan.score))}>
                {node.okr.plan.score}/100
              </span>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-secondary-foreground">
                {horizonShortLabel(node.okr.plan.horizon)}
              </span>
              {node.orphaned && (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-semibold text-warning">
                  <AlertTriangle className="h-2.5 w-2.5" /> родитель удалён — показан как корень
                </span>
              )}
            </div>
            <p className="mt-1 text-sm font-semibold text-foreground">{node.okr.objective}</p>
            {node.parentKrText && node.okr.parentKrIndex != null && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                ↳ декомпозирует KR{node.okr.parentKrIndex + 1}: {node.parentKrText}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {onSendToSolutions && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSendToSolutions(node.okr.plan, node.okr.objective)}
                className="h-7 border-hypothesis/30 text-hypothesis hover:bg-hypothesis-soft"
                aria-label="Передать OKR в генератор решений"
              >
                <Sparkles className="mr-1 h-3 w-3" /> В Решения
              </Button>
            )}
            {onRemove && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onRemove(node.okr.id)}
                aria-label="Удалить OKR"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {hasChildren && expanded && (
        <ul className="mt-2 space-y-2">
          {node.children.map((child) => (
            <TreeNode
              key={child.okr.id}
              node={child}
              depth={depth + 1}
              onRemove={onRemove}
              onSendToSolutions={onSendToSolutions}
            />
          ))}
        </ul>
      )}
    </li>
  );
};

export const OkrTree = ({ items, onRemove, onSendToSolutions }: Props) => {
  const forest = useMemo(() => buildForest(items), [items]);
  if (!items.length) return null;
  return (
    <ul className="space-y-2">
      {forest.map((node) => (
        <TreeNode
          key={node.okr.id}
          node={node}
          depth={0}
          onRemove={onRemove}
          onSendToSolutions={onSendToSolutions}
        />
      ))}
    </ul>
  );
};
