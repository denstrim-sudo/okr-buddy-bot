import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen, waitFor } from "@/test/utils";

const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: any[]) => invokeMock(...a) } },
}));
import { toast } from "sonner";
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

import { OkrValidator } from "@/components/aimbot/OkrValidator";

const validReport = {
  score: 85,
  status: "pass" as const,
  summary: "Хороший OKR",
  rules: [
    { id: "OBJ-QUALITATIVE", label: "Качественный Objective", pass: true, hint: "" },
    { id: "OBJ-NO-NUMBERS", label: "Без цифр в Objective", pass: false, hint: "Уберите проценты", severity: "critical" as const, why: "Цифры подменяют качественную цель." },
    { id: "KR-MEASURABLE", label: "KR измеримы", pass: true, hint: "" },
    { id: "KR-BASELINE-TARGET", label: "Baseline и target", pass: false, hint: "Добавьте baseline ко второму KR", severity: "important" as const, why: "Без baseline нельзя посчитать прогресс." },
    { id: "KR-OUTCOME", label: "Outcomes, не tasks", pass: true, hint: "" },
    { id: "KR-LEADING", label: "Есть leading", pass: false, hint: "Добавьте предсказательный KR", severity: "improve" as const, why: "Leading даёт ранний сигнал." },
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
    // Переписано (OKR-PI 3.4): Q-FOCUS и Q-THEME удалены, остаётся Q-REACH.
    expect(screen.queryByText(/Q-FOCUS/)).toBeNull();
    expect(screen.getByText(/Q-REACH/)).toBeInTheDocument();
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

  it("рендерит бейдж с реально использованной моделью (report.model_used)", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ...validReport, model_used: "claude-haiku-4.5" },
      error: null,
    });
    renderWithProviders(<OkrValidator draft={{ objective: "Test Objective", key_results: ["KR1"] }} />);
    await userEvent.click(screen.getByRole("button", { name: /Запустить аудит/i }));
    const badge = await screen.findByTestId("model-used-badge");
    expect(badge).toHaveTextContent(/claude-haiku-4\.5/);
  });

  it("НЕ рендерит бейдж модели, если report.model_used отсутствует", async () => {
    invokeMock.mockResolvedValueOnce({ data: validReport, error: null });
    renderWithProviders(<OkrValidator draft={{ objective: "Test Objective", key_results: ["KR1"] }} />);
    await userEvent.click(screen.getByRole("button", { name: /Запустить аудит/i }));
    await screen.findByText(/Оценка 85\/100/);
    expect(screen.queryByTestId("model-used-badge")).not.toBeInTheDocument();
  });

  it("рендерит warning-баннер при audit_unreliable=true", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ...validReport, audit_unreliable: true },
      error: null,
    });
    renderWithProviders(<OkrValidator draft={{ objective: "Test Objective", key_results: ["KR1"] }} />);
    await userEvent.click(screen.getByRole("button", { name: /Запустить аудит/i }));
    const warn = await screen.findByTestId("audit-unreliable-warning");
    expect(warn).toHaveTextContent(/ненадёжным/i);
    expect(warn).toHaveTextContent(/GPT-4o/);
  });

  it("НЕ рендерит warning-баннер при audit_unreliable=false/undefined", async () => {
    invokeMock.mockResolvedValueOnce({ data: validReport, error: null });
    renderWithProviders(<OkrValidator draft={{ objective: "Test Objective", key_results: ["KR1"] }} />);
    await userEvent.click(screen.getByRole("button", { name: /Запустить аудит/i }));
    await screen.findByText(/Оценка 85\/100/);
    expect(screen.queryByTestId("audit-unreliable-warning")).not.toBeInTheDocument();
  });
});

describe("OkrValidator: fix-button + save/replace", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("кнопка 'Предложить исправления' видна при наличии pass=false правил", async () => {
    invokeMock.mockResolvedValueOnce({ data: validReport, error: null });
    renderWithProviders(<OkrValidator draft={{ objective: "Тест", key_results: ["KR1"] }} />);
    await userEvent.click(screen.getByRole("button", { name: /Запустить аудит/i }));
    const btn = await screen.findByTestId("request-fix-button");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent(/Предложить исправления/i);
  });

  it("кнопка 'Предложить исправления' скрыта, если все правила pass=true", async () => {
    const allPass = {
      ...validReport,
      rules: validReport.rules.map((r) => ({ ...r, pass: true })),
    };
    invokeMock.mockResolvedValueOnce({ data: allPass, error: null });
    renderWithProviders(<OkrValidator draft={{ objective: "Тест", key_results: ["KR1"] }} />);
    await userEvent.click(screen.getByRole("button", { name: /Запустить аудит/i }));
    await screen.findByText(/Оценка 85\/100/);
    expect(screen.queryByTestId("request-fix-button")).not.toBeInTheDocument();
  });

  it("клик по 'Предложить исправления' вызывает invoke с mode='fix' и failed_rules", async () => {
    invokeMock.mockResolvedValueOnce({ data: validReport, error: null });
    invokeMock.mockResolvedValueOnce({
      data: {
        rewritten_objective: "Стать лидером рынка",
        rewritten_key_results: ["Обновлённый KR1"],
      },
      error: null,
    });
    renderWithProviders(<OkrValidator draft={{ objective: "Старый Objective", key_results: ["KR один"] }} />);
    await userEvent.click(screen.getByRole("button", { name: /Запустить аудит/i }));
    const btn = await screen.findByTestId("request-fix-button");
    await userEvent.click(btn);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    expect(invokeMock.mock.calls[1][0]).toBe("validate-okr");
    expect(invokeMock.mock.calls[1][1].body.mode).toBe("fix");
    expect(Array.isArray(invokeMock.mock.calls[1][1].body.failed_rules)).toBe(true);
    const failedIds = invokeMock.mock.calls[1][1].body.failed_rules.map((r: any) => r.id);
    expect(failedIds).toContain("OBJ-NO-NUMBERS");
    // После фикса — блок с rewritten появляется
    await screen.findByText(/Стать лидером рынка/);
  });

  it("аудит вызывает validate-okr с mode='audit'", async () => {
    invokeMock.mockResolvedValueOnce({ data: validReport, error: null });
    renderWithProviders(<OkrValidator draft={{ objective: "Тест", key_results: ["KR1"] }} />);
    await userEvent.click(screen.getByRole("button", { name: /Запустить аудит/i }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    expect(invokeMock.mock.calls[0][1].body.mode).toBe("audit");
  });

  it("если sourceOkrId задан → показывается кнопка 'Сохранить исправленную версию'", async () => {
    invokeMock.mockResolvedValueOnce({ data: validReport, error: null });
    // Предварительно кладём запись в localStorage
    const item = {
      id: "okr_src_1",
      objective: "Original",
      plan: { objective_refined: "Original", score: 50, key_results: [{ text: "KR1", baseline: "", target: "", metric: "", kr_type: "leading", solutions: [] }] },
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem("aimbot.savedOkrs.v1", JSON.stringify([item]));
    renderWithProviders(
      <OkrValidator draft={{ objective: "Original", key_results: ["KR1"], sourceOkrId: "okr_src_1" }} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Запустить аудит/i }));
    const btn = await screen.findByTestId("save-replace-button");
    expect(btn).toBeInTheDocument();
    expect(screen.queryByTestId("save-as-new-button")).not.toBeInTheDocument();
    await userEvent.click(btn);
    // проверяем что запись обновилась
    const after = JSON.parse(localStorage.getItem("aimbot.savedOkrs.v1")!);
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe("okr_src_1");
    expect(after[0].updatedAt).toBeTruthy();
  });

  it("если sourceOkrId НЕ задан → показывается кнопка 'Сохранить как новый'", async () => {
    invokeMock.mockResolvedValueOnce({ data: validReport, error: null });
    renderWithProviders(<OkrValidator draft={{ objective: "Ручной", key_results: ["KR1"] }} />);
    await userEvent.click(screen.getByRole("button", { name: /Запустить аудит/i }));
    await screen.findByTestId("save-as-new-button");
    expect(screen.queryByTestId("save-replace-button")).not.toBeInTheDocument();
  });
});

// =====================================================================
// Coach-mode редактора (mode=fix): editor_note + подсветка X/Y
// =====================================================================
import { render } from "@testing-library/react";
import { renderWithPlaceholders } from "@/components/aimbot/OkrValidator";

describe("OkrValidator: coach-mode rendering (mode=fix)", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("editor_note из ответа fix рендерится под предложениями редактора", async () => {
    invokeMock.mockResolvedValueOnce({ data: validReport, error: null });
    invokeMock.mockResolvedValueOnce({
      data: {
        rewritten_objective: "Стать опорой роста для команды",
        rewritten_key_results: ["Поднять активацию с X% до Y%"],
        editor_note: "Заменил глагол на исход; baseline/target возьми из отчёта Amplitude.",
      },
      error: null,
    });
    renderWithProviders(<OkrValidator draft={{ objective: "Старый", key_results: ["Активация"] }} />);
    await userEvent.click(screen.getByRole("button", { name: /Запустить аудит/i }));
    const btn = await screen.findByTestId("request-fix-button");
    await userEvent.click(btn);
    const note = await screen.findByTestId("editor-note");
    expect(note).toHaveTextContent(/baseline\/target возьми из отчёта Amplitude/i);
    expect(note).toHaveTextContent(/Коуч:/);
  });

  it("плейсхолдеры X/Y в rewritten подсвечены визуальным маркером", async () => {
    invokeMock.mockResolvedValueOnce({ data: validReport, error: null });
    invokeMock.mockResolvedValueOnce({
      data: {
        rewritten_objective: "Стать опорой роста",
        rewritten_key_results: ["Поднять активацию с X% до Y%"],
        editor_note: "note",
      },
      error: null,
    });
    renderWithProviders(<OkrValidator draft={{ objective: "Old", key_results: ["Активация"] }} />);
    await userEvent.click(screen.getByRole("button", { name: /Запустить аудит/i }));
    const btn = await screen.findByTestId("request-fix-button");
    await userEvent.click(btn);
    await screen.findByText(/Поднять активацию/);
    const placeholders = screen.getAllByTestId("placeholder-xy");
    expect(placeholders.length).toBeGreaterThanOrEqual(2);
    expect(placeholders.map((el) => el.textContent)).toEqual(
      expect.arrayContaining(["X%", "Y%"]),
    );
  });
});

describe("renderWithPlaceholders (unit)", () => {
  it("оборачивает X и Y (в т.ч. с %) в mark с data-testid=placeholder-xy", () => {
    const { container } = render(<div>{renderWithPlaceholders("с X% до Y% за квартал")}</div>);
    const marks = container.querySelectorAll('[data-testid="placeholder-xy"]');
    expect(marks.length).toBe(2);
    expect(marks[0].textContent).toBe("X%");
    expect(marks[1].textContent).toBe("Y%");
  });

  it("не трогает обычный текст без X/Y-плейсхолдеров", () => {
    const { container } = render(<div>{renderWithPlaceholders("Просто текст без маркеров")}</div>);
    expect(container.querySelectorAll('[data-testid="placeholder-xy"]').length).toBe(0);
    expect(container.textContent).toBe("Просто текст без маркеров");
  });

  it("не подсвечивает X/Y внутри слов (только целые слова)", () => {
    const { container } = render(<div>{renderWithPlaceholders("XML и YAML не должны триггериться")}</div>);
    expect(container.querySelectorAll('[data-testid="placeholder-xy"]').length).toBe(0);
  });

  // Переписано (чек-лист О1–О17, 09.10.2026): «Статус» заменён на «Происхождение», добавлены владелец и способ.
  it("передаёт тип, происхождение, владельца и способ в validate-okr; без выбора тип не передаётся", async () => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({ data: validReport, error: null });
    renderWithProviders(<OkrValidator draft={{ objective: "Стать лидером", key_results: ["Поднять X с 30 до 50"] }} />);
    await userEvent.click(screen.getByRole("button", { name: /Запустить аудит/i }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    let body = invokeMock.mock.calls[0][1].body;
    expect(body.okr_type).toBeUndefined();
    expect(body.okr_origin).toBe("regular");
    expect(body.way_known).toBe(true);
    expect(body.okr_status).toBeUndefined();

    invokeMock.mockClear();
    await userEvent.selectOptions(screen.getByTestId("okr-type-select"), "committed");
    await userEvent.type(screen.getByTestId("okr-owner-input"), "Иванов");
    await userEvent.click(screen.getByTestId("okr-way-known"));
    await userEvent.click(screen.getByRole("button", { name: /Запустить аудит/i }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    body = invokeMock.mock.calls[0][1].body;
    expect(body).toMatchObject({ okr_type: "committed", okr_origin: "regular", owner: "Иванов", way_known: false });

    invokeMock.mockClear();
    await userEvent.selectOptions(screen.getByTestId("okr-origin-select"), "protection_direction");
    expect(screen.getByTestId("okr-type-select")).toBeDisabled();
    expect((screen.getByTestId("okr-type-select") as HTMLSelectElement).value).toBe("aspirational");
    expect(screen.getByText(/тип задан методикой/)).toBeInTheDocument();
    expect(screen.queryByTestId("okr-way-known")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Запустить аудит/i }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    expect(invokeMock.mock.calls[0][1].body).toMatchObject({ okr_type: "aspirational", okr_origin: "protection_direction" });
  });

  // Переписано: старая запись со статусом «направление» открывается как «из направления роста».
  it("draft со старым okrStatus=direction → происхождение «рост», тип амбициозный", () => {
    renderWithProviders(<OkrValidator draft={{ objective: "Тест", key_results: ["KR1"], okrType: "committed", okrStatus: "direction" }} />);
    expect((screen.getByTestId("okr-origin-select") as HTMLSelectElement).value).toBe("growth_direction");
    expect((screen.getByTestId("okr-type-select") as HTMLSelectElement).value).toBe("aspirational");
    expect(vi.mocked(toast.message)).toHaveBeenCalledWith("Проверьте происхождение OKR: рост или защита");
  });
});
