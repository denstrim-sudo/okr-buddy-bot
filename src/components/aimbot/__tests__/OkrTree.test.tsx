import { describe, it, expect } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, within } from "@testing-library/react";
import { OkrTree } from "@/components/aimbot/OkrTree";
import type { SavedOkr } from "@/hooks/useSavedOkrs";
import type { OkrHorizon } from "@/types/okr";

const mk = (
  id: string,
  objective: string,
  horizon?: OkrHorizon,
  savedAt = "2025-01-01T00:00:00.000Z",
  link?: { parentOkrId: string; parentKrIndex: number },
  krs: string[] = [],
): SavedOkr => ({
  id,
  objective,
  plan: {
    objective_refined: objective,
    score: 75,
    key_results: krs.map((t) => ({
      text: t,
      baseline: "",
      target: "",
      metric: "",
      kr_type: "leading",
      solutions: [],
    })),
    ...(horizon ? { horizon } : {}),
  },
  savedAt,
  ...(link ? { parentOkrId: link.parentOkrId, parentKrIndex: link.parentKrIndex } : {}),
});

describe("OkrTree", () => {
  it("рендерит корневой узел с objective и горизонт-бейджем", () => {
    render(<OkrTree items={[mk("a", "Корневая цель", "strategic_3y")]} />);
    expect(screen.getByText("Корневая цель")).toBeInTheDocument();
    expect(screen.getByText("Стратегия")).toBeInTheDocument();
  });

  it("рендерит дочерний узел внутри родителя со строкой '↳ декомпозирует KR{n}: <текст>'", () => {
    const items = [
      mk("p", "Родитель", "block_12m", "2025-01-01T00:00:00.000Z", undefined, ["KR-альфа"]),
      mk("c", "Дитя", "quarter_3m", "2025-01-02T00:00:00.000Z", { parentOkrId: "p", parentKrIndex: 0 }),
    ];
    render(<OkrTree items={items} />);
    expect(screen.getByText("Дитя")).toBeInTheDocument();
    expect(screen.getByText(/декомпозирует KR1: KR-альфа/)).toBeInTheDocument();
  });

  it("клик по шеврону сворачивает/разворачивает поддерево", async () => {
    const user = userEvent.setup();
    const items = [
      mk("p", "Родитель", "block_12m", "2025-01-01T00:00:00.000Z", undefined, ["k"]),
      mk("c", "СкрытоеДитя", "quarter_3m", "2025-01-02T00:00:00.000Z", { parentOkrId: "p", parentKrIndex: 0 }),
    ];
    render(<OkrTree items={items} />);
    expect(screen.getByText("СкрытоеДитя")).toBeInTheDocument();
    const collapseBtns = screen.getAllByRole("button", { name: "Свернуть" });
    await user.click(collapseBtns[0]);
    expect(screen.queryByText("СкрытоеДитя")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Развернуть" }));
    expect(screen.getByText("СкрытоеДитя")).toBeInTheDocument();
  });

  it("узел с orphaned: true показывает пометку 'родитель удалён'", () => {
    const items = [
      mk("c", "Сирота", "quarter_3m", "2025-01-01T00:00:00.000Z", { parentOkrId: "ghost", parentKrIndex: 0 }),
    ];
    render(<OkrTree items={items} />);
    expect(screen.getByText(/родитель удалён/)).toBeInTheDocument();
  });

  it("пустой items не падает и ничего не рендерит", () => {
    const { container } = render(<OkrTree items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("не рендерит draggable атрибутов", () => {
    const items = [
      mk("p", "P", "block_12m", "2025-01-01T00:00:00.000Z", undefined, ["k"]),
      mk("c", "C", "quarter_3m", "2025-01-02T00:00:00.000Z", { parentOkrId: "p", parentKrIndex: 0 }),
    ];
    const { container } = render(<OkrTree items={items} />);
    expect(container.querySelectorAll("[draggable]").length).toBe(0);
    expect(within(container).queryByRole("button", { name: /drag/i })).toBeNull();
  });
});
