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
