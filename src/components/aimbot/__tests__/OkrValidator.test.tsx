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
    { id: "KR1", label: "KR измеримы", pass: true, hint: "" },
    { id: "KR2", label: "Baseline и target", pass: true, hint: "" },
    { id: "KR3", label: "Outcomes, не tasks", pass: true, hint: "" },
    { id: "KR10", label: "Есть leading", pass: true, hint: "" },
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

    await screen.findByText(/Качественный Objective/);
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
});
