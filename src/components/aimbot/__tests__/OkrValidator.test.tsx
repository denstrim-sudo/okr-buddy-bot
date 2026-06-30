import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen, waitFor } from "@/test/utils";

const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: any[]) => invokeMock(...a) } },
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

import { OkrValidator } from "@/components/aimbot/OkrValidator";

const validReport = {
  score: 85,
  status: "pass" as const,
  summary: "Хороший OKR",
  rules: [
    { id: "O1", label: "Качественный Objective", pass: true, hint: "" },
    { id: "O3", label: "Без цифр в Objective", pass: false, hint: "Уберите проценты", severity: "critical" as const, why: "Цифры подменяют качественную цель." },
    { id: "KR1", label: "KR измеримы", pass: true, hint: "" },
    { id: "KR2", label: "Baseline и target", pass: false, hint: "Добавьте baseline для KR2", severity: "important" as const, why: "Без baseline нельзя посчитать прогресс." },
    { id: "KR3", label: "Outcomes, не tasks", pass: true, hint: "" },
    { id: "KR10", label: "Есть leading", pass: false, hint: "Добавьте предсказательный KR", severity: "improve" as const, why: "Leading даёт ранний сигнал." },
  ],
  rewritten_objective: "",
  rewritten_key_results: ["", ""],
};

describe("OkrValidator (Module 2)", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("autopopulates from draft prop", () => {
    renderWithProviders(
      <OkrValidator
        draft={{ objective: "Тест Objective", key_results: ["KR один", "KR два"] }}
      />,
    );
    expect(screen.getByDisplayValue("Тест Objective")).toBeInTheDocument();
    expect(screen.getByDisplayValue("KR один")).toBeInTheDocument();
    expect(screen.getByDisplayValue("KR два")).toBeInTheDocument();
  });

  it("calls validate-okr and renders rules + 'Передать в Решения' on pass", async () => {
    invokeMock.mockResolvedValueOnce({ data: validReport, error: null });
    const onSend = vi.fn();
    renderWithProviders(
      <OkrValidator
        draft={{ objective: "Стать лидером", key_results: ["Поднять X с 30 до 50", "NPS 32→50"] }}
        onSendToSolutions={onSend}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /Запустить аудит/i }));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    expect(invokeMock.mock.calls[0][0]).toBe("validate-okr");
    expect(invokeMock.mock.calls[0][1].body.objective).toBe("Стать лидером");

    await screen.findByText(/Без цифр в Objective/);
    // severity-бейджи и summary-сводка
    expect(screen.getAllByText(/Критично/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Критичных:\s*1/i)).toBeInTheDocument();
    expect(screen.getByText(/Важных:\s*1/i)).toBeInTheDocument();
    // строка «Почему важно»
    expect(screen.getByText(/Цифры подменяют качественную цель/)).toBeInTheDocument();

    const sendBtn = await screen.findByRole("button", { name: /Передать в Решения/i });
    await userEvent.click(sendBtn);
    expect(onSend).toHaveBeenCalledWith("Стать лидером", ["Поднять X с 30 до 50", "NPS 32→50"]);
  });

  it("disables 'Передать в Решения' when score < 70", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ...validReport, score: 55, status: "warn" },
      error: null,
    });
    renderWithProviders(
      <OkrValidator
        draft={{ objective: "Слабый objective", key_results: ["Запустить лендинг"] }}
        onSendToSolutions={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Запустить аудит/i }));
    const sendBtn = await screen.findByRole("button", { name: /Передать в Решения/i });
    expect(sendBtn).toBeDisabled();
  });

  it("renders rewritten_objective_warning notice when flag is true", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        ...validReport,
        rewritten_objective: "Удвоить выручку к 2026 году",
        rewritten_key_results: ["", ""],
        rewritten_objective_warning: true,
      },
      error: null,
    });
    renderWithProviders(
      <OkrValidator
        draft={{ objective: "Старый objective", key_results: ["KR1", "KR2"] }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Запустить аудит/i }));
    const warn = await screen.findByTestId("rewritten-objective-warning");
    expect(warn).toHaveTextContent(/всё ещё может содержать цифру/i);
  });

  it("does NOT render warning notice when flag is false/undefined", async () => {
    invokeMock.mockResolvedValueOnce({ data: { ...validReport, rewritten_objective_warning: false }, error: null });
    renderWithProviders(<OkrValidator draft={{ objective: "Test Objective", key_results: ["KR1"] }} />);
    await userEvent.click(screen.getByRole("button", { name: /Запустить аудит/i }));
    await screen.findByText(/Оценка 85\/100/);
    expect(screen.queryByTestId("rewritten-objective-warning")).not.toBeInTheDocument();
  });

  it("рендерит 3 кнопки выбора горизонта, дефолт block_12m активен", () => {
    renderWithProviders(<OkrValidator draft={{ objective: "Тест Objective", key_results: ["KR1"] }} />);
    const strategic = screen.getByRole("button", { name: /Стратегия · 3 года/ });
    const block = screen.getByRole("button", { name: /Блок · 12 мес/ });
    const quarter = screen.getByRole("button", { name: /Квартал · 3 мес/ });
    expect(strategic).toBeInTheDocument();
    expect(quarter).toBeInTheDocument();
    expect(block.className).toMatch(/border-primary/);
    expect(strategic.className).not.toMatch(/border-primary/);
    expect(quarter.className).not.toMatch(/border-primary/);
  });

  it("клик на 'Квартал · 3 мес' переключает активную кнопку и показывает пояснение", async () => {
    renderWithProviders(<OkrValidator draft={{ objective: "Тест Objective", key_results: ["KR1"] }} />);
    const quarter = screen.getByRole("button", { name: /Квартал · 3 мес/ });
    await userEvent.click(quarter);
    expect(quarter.className).toMatch(/border-primary/);
    expect(screen.getByText(/квартальный набор правил/i)).toBeInTheDocument();
    expect(screen.getByText(/Q-Focus/)).toBeInTheDocument();
    expect(screen.getByText(/Q-Theme/)).toBeInTheDocument();
    expect(screen.getByText(/Q-Reach/)).toBeInTheDocument();
  });

  it("draft с horizon='quarter_3m' автоматически активирует квартальную кнопку", () => {
    renderWithProviders(
      <OkrValidator
        draft={{ objective: "Тест Objective", key_results: ["KR1"], horizon: "quarter_3m" }}
      />,
    );
    const quarter = screen.getByRole("button", { name: /Квартал · 3 мес/ });
    const block = screen.getByRole("button", { name: /Блок · 12 мес/ });
    expect(quarter.className).toMatch(/border-primary/);
    expect(block.className).not.toMatch(/border-primary/);
  });

  it("передаёт выбранный horizon в payload validate-okr при запуске аудита", async () => {
    invokeMock.mockResolvedValueOnce({ data: validReport, error: null });
    renderWithProviders(<OkrValidator draft={{ objective: "Тест Objective", key_results: ["KR1"] }} />);
    await userEvent.click(screen.getByRole("button", { name: /Квартал · 3 мес/ }));
    await userEvent.click(screen.getByRole("button", { name: /Запустить аудит/i }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    expect(invokeMock.mock.calls[0][1].body.horizon).toBe("quarter_3m");
  });
});
