import { describe, it, expect, beforeEach, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, act } from "@testing-library/react";
import { SavedOkrsList } from "@/components/aimbot/SavedOkrsList";
import { useSavedOkrs } from "@/hooks/useSavedOkrs";
import type { GeneratedPlan } from "@/types/okr";

const makePlan = (objective: string): GeneratedPlan => ({
  objective_refined: objective,
  score: 80,
  key_results: [
    { text: "KR-parent-1", baseline: "0", target: "1", metric: "%", kr_type: "leading", solutions: [] },
  ],
  horizon: "block_12m",
});

const Seed = () => {
  const { save } = useSavedOkrs();
  // hook seeding inside effect-equivalent setup
  if (!(globalThis as { __seeded?: boolean }).__seeded) {
    (globalThis as { __seeded?: boolean }).__seeded = true;
    const parent = save("Родительский OKR", makePlan("Родительский OKR"));
    save(
      "Дочерний OKR",
      { ...makePlan("Дочерний OKR"), horizon: "quarter_3m" },
      { parentOkrId: parent.id, parentKrIndex: 0 },
    );
  }
  return null;
};

describe("SavedOkrsList view mode toggle", () => {
  beforeEach(() => {
    localStorage.clear();
    (globalThis as { __seeded?: boolean }).__seeded = false;
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("переключатель Список/Дерево меняет отображение без потери items", async () => {
    const user = userEvent.setup();
    await act(async () => {
      render(
        <>
          <Seed />
          <SavedOkrsList />
        </>,
      );
    });

    // Список: оба объекта видны
    expect(screen.getByText("Родительский OKR")).toBeInTheDocument();
    expect(screen.getByText("Дочерний OKR")).toBeInTheDocument();
    expect(screen.queryByText(/декомпозирует KR1/)).toBeNull();

    await user.click(screen.getByRole("button", { name: /Дерево/i }));

    // Дерево: оба объекта по-прежнему есть, плюс отсылка к родительскому KR
    expect(screen.getByText("Родительский OKR")).toBeInTheDocument();
    expect(screen.getByText("Дочерний OKR")).toBeInTheDocument();
    expect(screen.getByText(/декомпозирует KR1/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Список/i }));
    expect(screen.getByText("Родительский OKR")).toBeInTheDocument();
    expect(screen.getByText("Дочерний OKR")).toBeInTheDocument();
  });
});
