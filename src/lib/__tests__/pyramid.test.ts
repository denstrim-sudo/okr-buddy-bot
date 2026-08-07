import { describe, it, expect } from "vitest";
import { findGaps, liveContributions, krKey, emptyPyramid, describeContribution } from "@/lib/pyramid";
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

describe("describeContribution", () => {
  const items = [mk("bank", ["KR банка A", "KR банка B"])];
  const state = { ...emptyPyramid(), levels: { bank: "bank" as const } };

  it("возвращает уровень родителя, номер KR и текст KR", () => {
    const d = describeContribution(
      { from: { okrId: "dir", krIndex: 0 }, to: { okrId: "bank", krIndex: 1 } },
      items,
      state,
    );
    expect(d.orphaned).toBe(false);
    expect(d.level).toBe("bank");
    expect(d.levelLabel).toBe("Банк");
    expect(d.krLabel).toBe("KR2");
    expect(d.krText).toBe("KR банка B");
    expect(d.okrObjective).toBe("Цель bank");
  });

  it("для связи на удалённый OKR возвращает orphaned и не падает", () => {
    const d = describeContribution(
      { from: { okrId: "dir", krIndex: 0 }, to: { okrId: "ghost", krIndex: 3 } },
      items,
      state,
    );
    expect(d.orphaned).toBe(true);
    expect(d.krLabel).toBe("KR4");
    expect(d.krText).toBe("");
    expect(d.okrObjective).toBe("");
  });
});
