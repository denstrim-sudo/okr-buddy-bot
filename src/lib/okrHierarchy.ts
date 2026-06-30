import type { OkrHorizon } from "@/types/okr";
import type { SavedOkr } from "@/hooks/useSavedOkrs";

export function parentHorizonFor(h: OkrHorizon): OkrHorizon | null {
  if (h === "quarter_3m") return "block_12m";
  if (h === "block_12m") return "strategic_3y";
  return null;
}

export function eligibleParents(items: SavedOkr[], horizon: OkrHorizon): SavedOkr[] {
  const target = parentHorizonFor(horizon);
  if (!target) return [];
  return items.filter((i) => i.plan.horizon === target);
}

export interface OkrTreeNode {
  okr: SavedOkr;
  children: OkrTreeNode[];
  parentKrText?: string;
  orphaned?: boolean;
}

export function buildForest(items: SavedOkr[]): OkrTreeNode[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const sortAsc = <T extends { savedAt: string }>(arr: T[]) =>
    arr.slice().sort((a, b) => (a.savedAt < b.savedAt ? -1 : 1));
  const childrenOf = (id: string) => sortAsc(items.filter((i) => i.parentOkrId === id));

  const buildNode = (okr: SavedOkr): OkrTreeNode => {
    const parent = okr.parentOkrId ? byId.get(okr.parentOkrId) : undefined;
    const parentKrText =
      parent && okr.parentKrIndex != null
        ? parent.plan.key_results?.[okr.parentKrIndex]?.text
        : undefined;
    return {
      okr,
      parentKrText,
      orphaned: Boolean(okr.parentOkrId && !parent),
      children: childrenOf(okr.id).map(buildNode),
    };
  };

  const roots = items.filter((i) => !i.parentOkrId || !byId.has(i.parentOkrId));
  return sortAsc(roots).map(buildNode);
}
