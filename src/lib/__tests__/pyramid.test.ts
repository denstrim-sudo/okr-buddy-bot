import { describe, it, expect } from "vitest";
import { findGaps, liveContributions, krKey, emptyPyramid } from "@/lib/pyramid";
import type { SavedOkr } from "@/hooks/useSavedOkrs";

const mk = (id: string, krs: string[]): SavedOkr => ({
  id,
  objective: `Цель ${id}`,
  savedAt: "2025-01-01T00:00:00.000Z",
  plan: {
    objective_refined: `Цель ${id}`,
    score: 80,
    key_results: krs.map((t) => ({
      text: t,
      baseline: "",
      target: "",
      metric: "",
      kr_type: "leading" as const,
      solutions: [],
    })),
  },
});

describe("pyramid lib", () => {
  it("krKey формирует ключ okrId:krIndex", () => {
    expect(krKey("a", 2)).toBe("a:2");
  });

  it("liveContributions отбрасывает связи на несуществующие OKR/KR", () => {
    const items = [mk("a", ["KR"]), mk("b", ["KR"])];
    const state = {
      ...emptyPyramid(),
      contributions: [
        { from: { okrId: "a", krIndex: 0 }, to: { okrId: "b", krIndex: 0 } },
        { from: { okrId: "ghost", krIndex: 0 }, to: { okrId: "b", krIndex: 0 } },
        { from: { okrId: "a", krIndex: 5 }, to: { okrId: "b", krIndex: 0 } },
      ],
    };
    expect(liveContributions(items, state)).toHaveLength(1);
  });

  it("findGaps игнорирует OKR без назначенного уровня", () => {
    expect(findGaps([mk("a", ["KR"])], emptyPyramid())).toHaveLength(0);
  });

  it("findGaps сообщает objective и текст KR в разрыве", () => {
    const gaps = findGaps([mk("a", ["Мой KR"])], { ...emptyPyramid(), levels: { a: "bank" } });
    expect(gaps[0].objective).toBe("Цель a");
    expect(gaps[0].krText).toBe("Мой KR");
  });
});
