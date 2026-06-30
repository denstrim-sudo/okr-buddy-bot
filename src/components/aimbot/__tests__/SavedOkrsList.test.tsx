import { describe, it, expect, beforeEach, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { SavedOkrsList } from "@/components/aimbot/SavedOkrsList";
import type { SavedOkr } from "@/hooks/useSavedOkrs";

const seed = (items: SavedOkr[]) => {
  localStorage.setItem("aimbot.savedOkrs.v1", JSON.stringify(items));
};

describe("SavedOkrsList view mode toggle", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("переключатель Список/Дерево меняет отображение без потери items", async () => {
    const user = userEvent.setup();
    seed([
      {
        id: "child",
        objective: "Дочерний OKR",
        savedAt: "2025-01-02T00:00:00.000Z",
        parentOkrId: "parent",
        parentKrIndex: 0,
        plan: {
          objective_refined: "Дочерний OKR",
          score: 80,
          horizon: "quarter_3m",
          key_results: [],
        },
      },
      {
        id: "parent",
        objective: "Родительский OKR",
        savedAt: "2025-01-01T00:00:00.000Z",
        plan: {
          objective_refined: "Родительский OKR",
          score: 80,
          horizon: "block_12m",
          key_results: [
            { text: "KR-parent-1", baseline: "0", target: "1", metric: "%", kr_type: "leading", solutions: [] },
          ],
        },
      },
    ]);

    render(<SavedOkrsList />);

    expect(screen.getByText("Родительский OKR")).toBeInTheDocument();
    expect(screen.getByText("Дочерний OKR")).toBeInTheDocument();
    expect(screen.queryByText(/декомпозирует KR1/)).toBeNull();

    await user.click(screen.getByRole("button", { name: /Дерево/i }));

    expect(screen.getByText("Родительский OKR")).toBeInTheDocument();
    expect(screen.getByText("Дочерний OKR")).toBeInTheDocument();
    expect(screen.getByText(/декомпозирует KR1/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Список/i }));
    expect(screen.getByText("Родительский OKR")).toBeInTheDocument();
    expect(screen.getByText("Дочерний OKR")).toBeInTheDocument();
  });
});
