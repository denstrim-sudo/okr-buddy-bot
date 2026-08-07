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
          selected: [],
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
