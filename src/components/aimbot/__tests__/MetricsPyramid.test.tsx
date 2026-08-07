import { describe, it, expect, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, within } from "@testing-library/react";
import { MetricsPyramid } from "@/components/aimbot/MetricsPyramid";
import type { SavedOkr } from "@/hooks/useSavedOkrs";

const mk = (id: string, objective: string, krs: Array<{ text: string; metric?: string }>): SavedOkr => ({
  id,
  objective,
  savedAt: "2025-01-01T00:00:00.000Z",
  plan: {
    objective_refined: objective,
    score: 80,
    key_results: krs.map((k) => ({
      text: k.text,
      baseline: "",
      target: "",
      metric: k.metric ?? "",
      kr_type: "leading" as const,
      solutions: [],
    })),
  },
});

const seedOkrs = (items: SavedOkr[]) =>
  localStorage.setItem("aimbot.savedOkrs.v1", JSON.stringify(items));

const seedPyramid = (state: unknown) =>
  localStorage.setItem("aimbot.pyramid.v1", JSON.stringify(state));

describe("MetricsPyramid", () => {
  beforeEach(() => localStorage.clear());

  it("рендерит два яруса: Банк и Направления, с OKR соответствующего уровня", () => {
    seedOkrs([
      mk("b1", "Цель банка", [{ text: "KR банка" }]),
      mk("d1", "Цель направления", [{ text: "KR направления" }]),
    ]);
    seedPyramid({ levels: { b1: "bank", d1: "direction" }, krMetrics: {}, contributions: [] });
    render(<MetricsPyramid />);

    const bank = screen.getByRole("region", { name: "Банк" });
    const dirs = screen.getByRole("region", { name: "Направления" });
    expect(within(bank).getByText("Цель банка")).toBeInTheDocument();
    expect(within(dirs).getByText("Цель направления")).toBeInTheDocument();
  });

  it("OKR без уровня показан в блоке «Не размещено» с выбором уровня", async () => {
    const user = userEvent.setup();
    seedOkrs([mk("x", "Бесхозная цель", [{ text: "KR" }])]);
    render(<MetricsPyramid />);

    const unplaced = screen.getByRole("region", { name: "Не размещено" });
    expect(within(unplaced).getByText("Бесхозная цель")).toBeInTheDocument();
    await user.click(within(unplaced).getByRole("button", { name: /В ярус «Банк»/ }));

    const bank = screen.getByRole("region", { name: "Банк" });
    expect(within(bank).getByText("Бесхозная цель")).toBeInTheDocument();
  });

  it("у каждого KR показана привязанная метрика или кнопка привязки", () => {
    seedOkrs([mk("b1", "Цель банка", [{ text: "KR один" }, { text: "KR два" }])]);
    localStorage.setItem(
      "aimbot.metrics.v1",
      JSON.stringify([{ id: "m1", name: "NPS", unit: "балл", createdAt: "2025-01-01" }]),
    );
    seedPyramid({ levels: { b1: "bank" }, krMetrics: { "b1:0": "m1" }, contributions: [] });
    render(<MetricsPyramid />);

    expect(screen.getByText(/NPS/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Привязать метрику" })).toHaveLength(1);
  });

  it("при привязке метрики предлагается значение из kr.metric, пользователь подтверждает", async () => {
    const user = userEvent.setup();
    seedOkrs([mk("b1", "Цель банка", [{ text: "KR один", metric: "Доля активных клиентов" }])]);
    seedPyramid({ levels: { b1: "bank" }, krMetrics: {}, contributions: [] });
    render(<MetricsPyramid />);

    await user.click(screen.getByRole("button", { name: "Привязать метрику" }));
    const input = screen.getByLabelText("Название метрики") as HTMLInputElement;
    expect(input.value).toBe("Доля активных клиентов");

    await user.click(screen.getByRole("button", { name: "Подтвердить" }));
    expect(screen.getByText(/Доля активных клиентов/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Привязать метрику" })).not.toBeInTheDocument();
  });

  it("разрывы из findGaps подсвечены", () => {
    seedOkrs([
      mk("b1", "Цель банка", [{ text: "KR банка" }]),
      mk("d1", "Цель направления", [{ text: "KR направления" }]),
    ]);
    seedPyramid({ levels: { b1: "bank", d1: "direction" }, krMetrics: {}, contributions: [] });
    render(<MetricsPyramid />);

    expect(screen.getAllByText("нет метрики")).toHaveLength(2);
    expect(screen.getByText("нет связи вверх")).toBeInTheDocument();
    expect(screen.getByText("нет контрибьюторов")).toBeInTheDocument();
  });

  it("пустое состояние без сохранённых OKR", () => {
    render(<MetricsPyramid />);
    expect(
      screen.getByText("Сначала сгенерируйте и сохраните OKR в Модуле 1"),
    ).toBeInTheDocument();
  });

  it("создаёт связь вверх между KR направления и KR банка (many-to-many)", async () => {
    const user = userEvent.setup();
    seedOkrs([
      mk("b1", "Цель банка", [{ text: "KR банка A" }, { text: "KR банка B" }]),
      mk("d1", "Цель направления", [{ text: "KR направления" }]),
    ]);
    seedPyramid({ levels: { b1: "bank", d1: "direction" }, krMetrics: {}, contributions: [] });
    render(<MetricsPyramid />);

    await user.click(screen.getByRole("button", { name: /Связь вверх/ }));
    await user.click(screen.getByRole("button", { name: /KR1: KR банка A/ }));
    expect(screen.getByText(/→ Цель банка · KR1: KR банка A/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Связь вверх/ }));
    await user.click(screen.getByRole("button", { name: /KR2: KR банка B/ }));
    expect(screen.getByText(/→ Цель банка · KR2: KR банка B/)).toBeInTheDocument();
    expect(screen.getByText(/→ Цель банка · KR1: KR банка A/)).toBeInTheDocument();
  });
});
