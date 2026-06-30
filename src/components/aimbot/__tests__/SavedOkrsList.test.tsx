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

  it("в режиме Дерево действия «В Решения» и «Удалить» работают как в списке", async () => {
    const user = userEvent.setup();
    seed([
      {
        id: "n1",
        objective: "Single OKR",
        savedAt: "2025-01-01T00:00:00.000Z",
        plan: {
          objective_refined: "Single OKR",
          score: 80,
          horizon: "block_12m",
          key_results: [
            { text: "KR-1", baseline: "0", target: "1", metric: "%", kr_type: "leading", solutions: [] },
          ],
        },
      },
    ]);

    const onSend = vi.fn();
    render(<SavedOkrsList onSendToSolutions={onSend} />);
    await user.click(screen.getByRole("button", { name: /Дерево/i }));

    await user.click(screen.getByRole("button", { name: /Передать OKR в генератор решений/i }));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0][1]).toBe("Single OKR");

    await user.click(screen.getByRole("button", { name: /Удалить OKR/i }));
    expect(screen.queryByText("Single OKR")).toBeNull();
  });
});
