import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen, waitFor } from "@/test/utils";

const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invokeMock(...a) } },
}));

import Stability from "@/pages/Stability";

describe("Страница проверки стабильности", () => {
  it("после мок-прогона видны итоговые проценты и таблица случаев", async () => {
    sessionStorage.clear();
    invokeMock.mockImplementation((name: string) =>
      Promise.resolve(name === "validate-okr"
        ? { data: { score: 80, rules: [{ id: "KR-MEASURABLE", pass: true }] }, error: null }
        : { data: null, error: { message: "no" } }),
    );
    renderWithProviders(<Stability />);
    await userEvent.click(screen.getByRole("button", { name: /Только эталоны P/ }));
    await userEvent.selectOptions(screen.getByLabelText(/Повторы/), "1");
    await userEvent.click(screen.getByRole("button", { name: /Запустить/ }));
    await waitFor(() => expect(screen.getByTestId("sum-stability")).toHaveTextContent("100%"));
    expect(screen.getByTestId("sum-accuracy")).toHaveTextContent(/%/);
    expect(screen.getByTestId("cases-table")).toBeInTheDocument();
  });
});
