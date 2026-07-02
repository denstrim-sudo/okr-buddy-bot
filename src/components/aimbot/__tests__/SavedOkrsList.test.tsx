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

describe("SavedOkrsList empty state & export/import", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("при пустом items рендерит подсказку и не возвращает null", () => {
    const { container } = render(<SavedOkrsList />);
    expect(container.firstChild).not.toBeNull();
    expect(screen.getByText(/Здесь появятся сохранённые OKR/i)).toBeInTheDocument();
    expect(screen.getByText(/Сохранённые OKR/i)).toBeInTheDocument();
    // Переключатель Список/Дерево скрыт
    expect(screen.queryByRole("button", { name: /Список/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Дерево/i })).toBeNull();
  });

  it("кнопка Экспорт вызывает скачивание файла (createObjectURL)", async () => {
    const user = userEvent.setup();
    seed([
      {
        id: "e1",
        objective: "Export me",
        savedAt: "2025-01-01T00:00:00.000Z",
        plan: { objective_refined: "Export me", score: 0, horizon: "block_12m", key_results: [] },
      },
    ]);
    const createUrl = vi.fn(() => "blob:test");
    const revokeUrl = vi.fn();
    // @ts-expect-error jsdom
    URL.createObjectURL = createUrl;
    // @ts-expect-error jsdom
    URL.revokeObjectURL = revokeUrl;
    render(<SavedOkrsList />);
    await user.click(screen.getByRole("button", { name: /Экспорт/i }));
    expect(createUrl).toHaveBeenCalled();
    expect(revokeUrl).toHaveBeenCalled();
  });

  it("Импорт: выбор файла вызывает importJson и добавляет OKR", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false); // merge
    render(<SavedOkrsList />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const payload = JSON.stringify({
      version: "aimbot.savedOkrs.v1",
      items: [
        {
          id: "imp_1",
          objective: "Imported",
          savedAt: "2025-01-01T00:00:00.000Z",
          plan: { objective_refined: "Imported", score: 0, horizon: "block_12m", key_results: [] },
        },
      ],
    });
    const file = new File([payload], "backup.json", { type: "application/json" });
    await userEvent.upload(fileInput, file);
    await screen.findByText(/Imported/);
  });
});
