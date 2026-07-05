import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/react";
import { AppHeader } from "../AppHeader";
import { renderWithProviders } from "@/test/utils";

describe("AppHeader — Reset all", () => {
  it("не показывает кнопку сброса без onResetAll", () => {
    renderWithProviders(<AppHeader />);
    expect(screen.queryByRole("button", { name: /Сбросить все данные/i })).toBeNull();
  });

  it("открывает подтверждающий диалог и вызывает onResetAll только после подтверждения", async () => {
    const onResetAll = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<AppHeader onResetAll={onResetAll} />);

    await user.click(screen.getByRole("button", { name: /Сбросить все данные/i }));

    // Диалог перечисляет 4 категории удаляемых данных
    expect(screen.getByText(/Сохранённые OKR/i)).toBeInTheDocument();
    expect(screen.getByText(/Solution Studio/i)).toBeInTheDocument();
    expect(screen.getByText(/документы/i)).toBeInTheDocument();
    expect(screen.getByText(/черновик/i)).toBeInTheDocument();

    expect(onResetAll).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /^Сбросить всё$/i }));
    expect(onResetAll).toHaveBeenCalledTimes(1);
  });

  it("отмена не вызывает onResetAll", async () => {
    const onResetAll = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<AppHeader onResetAll={onResetAll} />);

    await user.click(screen.getByRole("button", { name: /Сбросить все данные/i }));
    await user.click(screen.getByRole("button", { name: /Отмена/i }));

    expect(onResetAll).not.toHaveBeenCalled();
  });
});
