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

const savedState = vi.hoisted(() => ({
  items: [] as any[],
  save: vi.fn(),
}));
vi.mock("@/hooks/useSavedOkrs", () => ({
  useSavedOkrs: () => ({
    items: savedState.items,
    save: savedState.save,
    remove: vi.fn(),
    clear: vi.fn(),
    getChildren: () => [],
    getRoots: () => savedState.items,
    removeWithDescendants: vi.fn(),
  }),
}));

import { OkrGenerator } from "@/components/aimbot/OkrGenerator";

const interp = {
  detected_horizon: "block_12m",
  detected_mode: "from_scratch",
  topic_summary: "Удвоить активацию.",
  has_existing_okr: false,
  missing_info: [],
  clarifying_questions: [],
  assumptions: [],
  warnings: [],
};

const draft = {
  horizon: "block_12m",
  mode: "from_scratch",
  objective: "Удвоить активацию",
  key_results: [
    { text: "Активация с 30% до 50%", baseline: "30%", target: "50%", metric: "%", kr_type: "lagging", is_outcome: true, assumptions: [], warnings: [] },
  ],
  global_assumptions: [],
  global_warnings: [],
  score_hint: 78,
  horizon_fit: {
    horizon: "block_12m",
    overall_verdict: "fits",
    overall_score: 85,
    objective: { verdict: "fits", reason: "ок" },
    key_results: [{ index: 0, verdict: "fits", reason: "ок" }],
    notes: [],
  },
};

describe("OkrGenerator (Module 1)", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    savedState.items = [];
    savedState.save.mockReset();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("interprets → drafts → передаёт в аудит", async () => {
    invokeMock
      .mockResolvedValueOnce({ data: interp, error: null })   // interpret-okr-input
      .mockResolvedValueOnce({ data: draft, error: null });    // draft-okr (no clarifying questions)

    const onGenerated = vi.fn();
    renderWithProviders(<OkrGenerator onGenerated={onGenerated} />);

    const ta = screen.getByPlaceholderText(/Хотим стать самым любимым онбордингом/i);
    await userEvent.type(ta, "Хотим удвоить активацию пользователей за год");
    await userEvent.click(screen.getByRole("button", { name: /Интерпретировать ввод/i }));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    expect(invokeMock.mock.calls[0][0]).toBe("interpret-okr-input");
    expect(invokeMock.mock.calls[1][0]).toBe("draft-okr");

    await screen.findByText(/Соответствие горизонту/i);
    await screen.findByText(/Активация с 30% до 50%/);

    await userEvent.click(screen.getByRole("button", { name: /Передать в аудит/i }));
    expect(onGenerated).toHaveBeenCalledTimes(1);
    const [plan, obj] = onGenerated.mock.calls[0];
    expect(obj).toBe("Удвоить активацию");
    expect(plan.objective_refined).toBe("Удвоить активацию");
    expect(plan.key_results).toHaveLength(1);
  });

  it("рендерит ParentKrPicker, когда horizon !== 'strategic_3y' (default block_12m)", () => {
    renderWithProviders(<OkrGenerator onGenerated={vi.fn()} />);
    // нет сохранённых strategic_3y → подсказка вместо select
    expect(screen.getByText(/Нет сохранённых/i)).toBeInTheDocument();
  });

  it("передаёт parent_kr_context в draft-okr при выбранном parentLink", async () => {
    savedState.items = [{
      id: "parent_1",
      objective: "Block OKR родитель",
      savedAt: new Date().toISOString(),
      plan: {
        objective_refined: "Block OKR родитель",
        score: 80,
        horizon: "strategic_3y",
        key_results: [
          { text: "Стать №1 на рынке", baseline: "", target: "", metric: "", kr_type: "lagging", solutions: [] },
        ],
      },
    }];

    invokeMock
      .mockResolvedValueOnce({ data: interp, error: null })
      .mockResolvedValueOnce({ data: draft, error: null });

    renderWithProviders(<OkrGenerator onGenerated={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText(/Родительский OKR/i), "parent_1");

    await userEvent.type(
      screen.getByPlaceholderText(/Хотим стать самым любимым онбордингом/i),
      "Удвоить активацию",
    );
    await userEvent.click(screen.getByRole("button", { name: /Интерпретировать ввод/i }));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    const draftBody = invokeMock.mock.calls[1][1].body;
    expect(draftBody.parent_kr_context).toBe("Block OKR родитель → KR: Стать №1 на рынке");
  });

  it("saveOkr вызывается с третьим аргументом — выбранным parentLink", async () => {
    savedState.items = [{
      id: "parent_2",
      objective: "P2",
      savedAt: new Date().toISOString(),
      plan: {
        objective_refined: "P2",
        score: 0,
        horizon: "strategic_3y",
        key_results: [
          { text: "KRX", baseline: "", target: "", metric: "", kr_type: "leading", solutions: [] },
        ],
      },
    }];
    invokeMock
      .mockResolvedValueOnce({ data: interp, error: null })
      .mockResolvedValueOnce({ data: draft, error: null });

    renderWithProviders(<OkrGenerator onGenerated={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText(/Родительский OKR/i), "parent_2");
    await userEvent.type(screen.getByPlaceholderText(/Хотим стать самым любимым онбордингом/i), "raw");
    await userEvent.click(screen.getByRole("button", { name: /Интерпретировать ввод/i }));
    await screen.findByRole("button", { name: /Сохранить/i });
    await userEvent.click(screen.getByRole("button", { name: /Сохранить/i }));

    expect(savedState.save).toHaveBeenCalledTimes(1);
    const call = savedState.save.mock.calls[0];
    expect(call[2]).toEqual({ parentOkrId: "parent_2", parentKrIndex: 0 });
  });

  it("saveOkr вызывается БЕЗ третьего аргумента, когда parentLink не задан", async () => {
    invokeMock
      .mockResolvedValueOnce({ data: interp, error: null })
      .mockResolvedValueOnce({ data: draft, error: null });

    renderWithProviders(<OkrGenerator onGenerated={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText(/Хотим стать самым любимым онбордингом/i), "raw");
    await userEvent.click(screen.getByRole("button", { name: /Интерпретировать ввод/i }));
    await screen.findByRole("button", { name: /Сохранить/i });
    await userEvent.click(screen.getByRole("button", { name: /Сохранить/i }));

    expect(savedState.save).toHaveBeenCalledTimes(1);
    expect(savedState.save.mock.calls[0]).toHaveLength(2);
  });
});
