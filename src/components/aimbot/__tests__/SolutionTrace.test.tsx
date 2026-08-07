import { describe, it, expect, beforeEach, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor, within } from "@testing-library/react";
import { SolutionTrace } from "@/components/aimbot/SolutionTrace";
import type { SavedOkr } from "@/hooks/useSavedOkrs";

const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invokeMock(...a) } },
}));
vi.mock("@/contexts/DocsContext", () => ({ useDocs: () => ({ buildContext: () => "" }) }));
vi.mock("@/contexts/ModelContext", () => ({
  useAiModel: () => ({ model: "gpt-4o" }),
  notifyModelFallback: () => {},
}));

const mk = (id: string, objective: string, krs: string[]): SavedOkr => ({
  id,
  objective,
  savedAt: "2025-01-01T00:00:00.000Z",
  plan: {
    objective_refined: objective,
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

const seedAll = ({ pyramid, metrics }: { pyramid?: unknown; metrics?: unknown } = {}) => {
  localStorage.setItem(
    "aimbot.savedOkrs.v1",
    JSON.stringify([mk("dir", "Цель направления", ["KR направления"]), mk("bank", "Цель банка", ["KR банка"])]),
  );
  localStorage.setItem(
    "aimbot.solutionStudio.v2",
    JSON.stringify({
      objective: "Цель направления",
      activeKey: "kr-0",
      slices: {
        "kr-0": {
          krText: "KR направления",
          context: "",
          solutions: [
            {
              id: "S1",
              problem: "Клиенты долго ждут",
              bet: "Автоматическая маршрутизация заявок",
              result_image: "Заявки уходят сразу",
              leading_metric: "Время ответа",
              confidence: "Medium",
              effort: "M",
              validation: "",
            },
          ],
          audit: {},
          report: null,
          cardReports: {},
          selected: [0],
        },
      },
    }),
  );
  localStorage.setItem(
    "aimbot.metrics.v1",
    JSON.stringify(
      metrics ?? [
        { id: "m1", name: "Время ответа", createdAt: "" },
        { id: "m2", name: "NPS", createdAt: "" },
      ],
    ),
  );
  if (pyramid) localStorage.setItem("aimbot.pyramid.v1", JSON.stringify(pyramid));
};

const fullPyramid = {
  levels: { dir: "direction", bank: "bank" },
  krMetrics: { "dir:0": "m1", "bank:0": "m2" },
  contributions: [{ from: { okrId: "dir", krIndex: 0 }, to: { okrId: "bank", krIndex: 0 } }],
  solutionMetrics: [
    { solutionId: "kr-0:0", metricId: "m1" },
    { solutionId: "kr-0:0", metricId: "m2" },
  ],
};

describe("SolutionTrace", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
  });

  it("рендерит все параллельные цепочки Решения, а не только полную", async () => {
    seedAll({ pyramid: fullPyramid });
    render(<SolutionTrace />);
    await userEvent.click(screen.getByTestId("trace-solution-kr-0:0"));
    const chains = await screen.findAllByTestId(/^trace-chain-/);
    expect(chains).toHaveLength(2);
  });

  it("complete показана как связная, broken_at_direction — с точкой обрыва", async () => {
    seedAll({
      pyramid: {
        ...fullPyramid,
        contributions: [],
        solutionMetrics: [{ solutionId: "kr-0:0", metricId: "m1" }],
      },
    });
    render(<SolutionTrace />);
    await userEvent.click(screen.getByTestId("trace-solution-kr-0:0"));
    const chain = await screen.findByTestId("trace-chain-m1");
    expect(within(chain).getByTestId("trace-broken-point")).toHaveTextContent("KR направления");
  });

  it("при выборе Решения метрика KR-происхождения автоподставляется", async () => {
    seedAll({
      pyramid: {
        levels: { dir: "direction", bank: "bank" },
        krMetrics: { "dir:0": "m1" },
        contributions: [],
        solutionMetrics: [],
      },
    });
    render(<SolutionTrace />);
    await userEvent.click(screen.getByTestId("trace-solution-kr-0:0"));
    const suggestion = await screen.findByTestId("trace-suggested-metric");
    expect(suggestion).toHaveTextContent("Время ответа");
    await userEvent.click(within(suggestion).getByRole("button", { name: /подтвердить/i }));
    expect(await screen.findByTestId("trace-chain-m1")).toBeInTheDocument();
    // можно добавить другие метрики
    await userEvent.click(screen.getByRole("button", { name: /добавить метрику/i }));
    await userEvent.click(await screen.findByRole("button", { name: "NPS" }));
    expect(await screen.findByTestId("trace-chain-m2")).toBeInTheDocument();
  });

  it("кнопка «Проверить связанность» вызывает analyze-pyramid-link и группирует рекомендации", async () => {
    seedAll({ pyramid: fullPyramid });
    invokeMock.mockResolvedValue({
      data: {
        summary: "итог",
        recommendations: [
          { type: "bridge_gap", text: "Свяжи вверх", evidence: "KR банка", grounded: true },
          { type: "metric_mismatch", text: "Метрика о другом", evidence: "NPS", grounded: true },
        ],
      },
      error: null,
    });
    render(<SolutionTrace />);
    await userEvent.click(screen.getByTestId("trace-solution-kr-0:0"));
    await userEvent.click(screen.getByRole("button", { name: /проверить связанность/i }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("analyze-pyramid-link", expect.anything()));
    expect(await screen.findByTestId("rec-group-bridge_gap")).toBeInTheDocument();
    expect(screen.getByTestId("rec-group-metric_mismatch")).toBeInTheDocument();
  });

  it("рекомендация с grounded=false помечена «не подтверждено цитатой»", async () => {
    seedAll({ pyramid: fullPyramid });
    invokeMock.mockResolvedValue({
      data: {
        summary: "s",
        recommendations: [{ type: "weak_link", text: "Натянуто", evidence: "zzz", grounded: false }],
      },
      error: null,
    });
    render(<SolutionTrace />);
    await userEvent.click(screen.getByTestId("trace-solution-kr-0:0"));
    await userEvent.click(screen.getByRole("button", { name: /проверить связанность/i }));
    expect(await screen.findByTestId("rec-ungrounded-0")).toHaveTextContent(/не подтверждено цитатой/i);
  });

  it("работает на неполной пирамиде: показывает статусы, а не пустой экран", async () => {
    seedAll();
    render(<SolutionTrace />);
    await userEvent.click(screen.getByTestId("trace-solution-kr-0:0"));
    const chain = await screen.findByTestId("trace-chain-none");
    expect(chain).toHaveTextContent(/нет метрик/i);
  });
});

describe("SolutionTrace · только Решения «в проекте»", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
  });

  const seedTwo = (selected: number[]) => {
    seedAll({ pyramid: fullPyramid });
    const st = JSON.parse(localStorage.getItem("aimbot.solutionStudio.v2")!);
    st.slices["kr-0"].solutions.push({
      id: "S2",
      problem: "Черновик",
      bet: "Черновая ставка",
      result_image: "",
      leading_metric: "",
      confidence: "Low",
      effort: "S",
      validation: "",
    });
    st.slices["kr-0"].selected = selected;
    localStorage.setItem("aimbot.solutionStudio.v2", JSON.stringify(st));
  };

  it("в списке выбора отображаются только Решения «в проекте»", async () => {
    seedTwo([0]);
    render(<SolutionTrace />);
    expect(await screen.findByTestId("trace-solution-kr-0:0")).toBeInTheDocument();
    expect(screen.queryByTestId("trace-solution-kr-0:1")).not.toBeInTheDocument();
  });

  it("если таких Решений нет — подсказка про статус «в проекте»", async () => {
    seedTwo([]);
    render(<SolutionTrace />);
    expect(await screen.findByTestId("trace-empty")).toHaveTextContent(/в проекте.*Модуле 3/i);
    expect(screen.queryByTestId("trace-solution-kr-0:0")).not.toBeInTheDocument();
  });

  it("после снятия статуса Решение скрыто, но связи в PyramidState сохранены", async () => {
    seedTwo([]);
    render(<SolutionTrace />);
    await screen.findByTestId("trace-empty");
    const state = JSON.parse(localStorage.getItem("aimbot.pyramid.v1")!);
    expect(state.solutionMetrics).toHaveLength(2);
  });
});

describe("SolutionTrace · автоподстановка опережающей метрики Решения", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
  });

  const LONG =
    "Конверсия в отказ от проведения операции на этапе прохождения контекстного опроса безопасности";

  const seedLeading = (leading: string) => {
    seedAll({
      pyramid: {
        levels: { dir: "direction", bank: "bank" },
        krMetrics: { "dir:0": "m1" },
        contributions: [],
        solutionMetrics: [],
      },
    });
    const st = JSON.parse(localStorage.getItem("aimbot.solutionStudio.v2")!);
    st.slices["kr-0"].solutions[0].leading_metric = leading;
    localStorage.setItem("aimbot.solutionStudio.v2", JSON.stringify(st));
  };

  it("метрики нет в справочнике → предложение «Завести метрику: <короткое имя>» с полным текстом под ним", async () => {
    seedLeading(LONG);
    render(<SolutionTrace />);
    await userEvent.click(screen.getByTestId("trace-solution-kr-0:0"));
    const block = await screen.findByTestId("trace-new-metric");
    const btn = within(block).getByRole("button", { name: /завести метрику/i });
    expect(btn.textContent!.length).toBeLessThanOrEqual(60);
    expect(btn).not.toHaveTextContent(LONG);
    expect(block).toHaveTextContent(`полностью: ${LONG}`);
  });

  it("клик создаёт метрику с коротким name и полным description и сразу связывает её", async () => {
    seedLeading(LONG);
    render(<SolutionTrace />);
    await userEvent.click(screen.getByTestId("trace-solution-kr-0:0"));
    const block = await screen.findByTestId("trace-new-metric");
    await userEvent.click(within(block).getByRole("button", { name: /завести метрику/i }));
    await waitFor(() => {
      const cat = JSON.parse(localStorage.getItem("aimbot.metrics.v1")!);
      const created = cat.find((m: { description?: string }) => m.description === LONG);
      expect(created).toBeTruthy();
      expect(created.name.length).toBeLessThanOrEqual(40);
      const state = JSON.parse(localStorage.getItem("aimbot.pyramid.v1")!);
      expect(state.solutionMetrics.some((l: { metricId: string }) => l.metricId === created.id)).toBe(true);
    });
  });

  it("пользователь может отредактировать предложенное название перед созданием", async () => {
    seedLeading(LONG);
    render(<SolutionTrace />);
    await userEvent.click(screen.getByTestId("trace-solution-kr-0:0"));
    const block = await screen.findByTestId("trace-new-metric");
    const input = within(block).getByLabelText(/название метрики/i);
    await userEvent.clear(input);
    await userEvent.type(input, "Отказ на опросе");
    await userEvent.click(within(block).getByRole("button", { name: /завести метрику/i }));
    await waitFor(() => {
      const cat = JSON.parse(localStorage.getItem("aimbot.metrics.v1")!);
      expect(cat.some((m: { name: string }) => m.name === "Отказ на опросе")).toBe(true);
    });
  });

  it("метрика уже есть в справочнике → предлагается она, без кнопки заведения", async () => {
    seedLeading("  время   ОТВЕТА ");
    render(<SolutionTrace />);
    await userEvent.click(screen.getByTestId("trace-solution-kr-0:0"));
    const s = await screen.findByTestId("trace-suggested-metric");
    expect(s).toHaveTextContent("Время ответа");
    expect(screen.queryByTestId("trace-new-metric")).not.toBeInTheDocument();
  });

  it("автоподстановка не блокирует ручной выбор другой метрики", async () => {
    seedLeading(LONG);
    render(<SolutionTrace />);
    await userEvent.click(screen.getByTestId("trace-solution-kr-0:0"));
    await screen.findByTestId("trace-new-metric");
    await userEvent.click(screen.getByRole("button", { name: /добавить метрику/i }));
    await userEvent.click(await screen.findByRole("button", { name: "NPS" }));
    expect(await screen.findByTestId("trace-chain-m2")).toBeInTheDocument();
  });

  it("чип метрики показывает короткое имя, полное — в title", async () => {
    seedAll({
      pyramid: {
        levels: { dir: "direction", bank: "bank" },
        krMetrics: { "dir:0": "m1" },
        contributions: [],
        solutionMetrics: [{ solutionId: "kr-0:0", metricId: "m1" }],
      },
      metrics: [{ id: "m1", name: "Конверсия в отказ", description: LONG, createdAt: "" }],
    });
    render(<SolutionTrace />);
    await userEvent.click(screen.getByTestId("trace-solution-kr-0:0"));
    const chip = await screen.findByTestId("metric-chip-m1");
    expect(chip).toHaveTextContent("Конверсия в отказ");
    expect(chip).toHaveAttribute("title", LONG);
  });
});

describe("SolutionTrace · связь метрика→метрика", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
  });

  const orphanPyramid = {
    levels: { dir: "direction", bank: "bank" },
    krMetrics: { "dir:0": "m2" },
    contributions: [{ from: { okrId: "dir", krIndex: 0 }, to: { okrId: "bank", krIndex: 0 } }],
    solutionMetrics: [{ solutionId: "kr-0:0", metricId: "m1" }],
    metricInfluences: [],
  };

  it("у непривязанной метрики есть кнопка «Связать с метрикой выше», выбор приоритезирует метрики в KR", async () => {
    seedAll({ pyramid: orphanPyramid });
    render(<SolutionTrace />);
    await userEvent.click(screen.getByTestId("trace-solution-kr-0:0"));
    await userEvent.click(await screen.findByTestId("link-influence-m1"));
    const targets = await screen.findAllByTestId(/^influence-target-/);
    expect(targets[0]).toHaveAttribute("data-testid", "influence-target-m2");
  });

  it("после связывания цепочка достраивается и в пути видны промежуточные метрики", async () => {
    seedAll({ pyramid: orphanPyramid });
    render(<SolutionTrace />);
    await userEvent.click(screen.getByTestId("trace-solution-kr-0:0"));
    await userEvent.click(await screen.findByTestId("link-influence-m1"));
    await userEvent.click(await screen.findByTestId("influence-target-m2"));
    const chain = await screen.findByTestId("trace-chain-m1");
    expect(chain).toHaveTextContent(/цепочка связная/i);
    expect(within(chain).getByTestId("path-metric-m1")).toBeInTheDocument();
    expect(within(chain).getByTestId("path-metric-m2")).toBeInTheDocument();
    expect(chain).toHaveTextContent(/Банк · KR1/);
  });

  it("попытка создать цикл не создаёт связь", async () => {
    seedAll({
      pyramid: {
        ...orphanPyramid,
        krMetrics: {},
        metricInfluences: [{ from: "m2", to: "m1" }],
      },
    });
    render(<SolutionTrace />);
    await userEvent.click(screen.getByTestId("trace-solution-kr-0:0"));
    await userEvent.click(await screen.findByTestId("link-influence-m1"));
    await userEvent.click(await screen.findByTestId("influence-target-m2"));
    const saved = JSON.parse(localStorage.getItem("aimbot.pyramid.v1")!);
    expect(saved.metricInfluences).toHaveLength(1);
  });

  it("рекомендации metric_influence_weak рендерятся отдельным блоком, пустой блок не показывается", async () => {
    seedAll({ pyramid: fullPyramid });
    invokeMock.mockResolvedValue({
      data: {
        summary: "s",
        recommendations: [
          { type: "metric_influence_weak", text: "Механизм неочевиден", evidence: "NPS", grounded: true },
        ],
      },
      error: null,
    });
    render(<SolutionTrace />);
    await userEvent.click(screen.getByTestId("trace-solution-kr-0:0"));
    await userEvent.click(screen.getByRole("button", { name: /проверить связанность/i }));
    const block = await screen.findByTestId("rec-group-metric_influence_weak");
    expect(block).toHaveTextContent(/Осмысленность влияния метрик/i);
    expect(screen.queryByTestId("rec-group-weak_link")).not.toBeInTheDocument();
  });
});
