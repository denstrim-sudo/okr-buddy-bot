import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";

const useAiModelMock = vi.fn();
vi.mock("@/contexts/ModelContext", () => ({
  useAiModel: () => useAiModelMock(),
}));

import { ModelSelector } from "@/components/aimbot/ModelSelector";

const catalog = [
  { id: "gpt-4o", label: "GPT-4o", hint: "Стабильный" },
  { id: "claude-haiku-4.5", label: "Claude Haiku", hint: "Быстрый" },
];

describe("ModelSelector", () => {
  beforeEach(() => useAiModelMock.mockReset());

  it("рендерит список моделей из useAiModel().models", async () => {
    const setModel = vi.fn();
    useAiModelMock.mockReturnValue({ model: "gpt-4o", setModel, models: catalog, loading: false, refresh: vi.fn() });
    render(<ModelSelector />);
    const trigger = screen.getByRole("combobox", { name: /Модель AI/i });
    await userEvent.click(trigger);
    expect(await screen.findByText("Claude Haiku")).toBeInTheDocument();
    expect(screen.getAllByText("GPT-4o").length).toBeGreaterThan(0);
  });

  it("disabled, пока loading=true", () => {
    useAiModelMock.mockReturnValue({ model: "gpt-4o", setModel: vi.fn(), models: catalog, loading: true, refresh: vi.fn() });
    render(<ModelSelector />);
    const trigger = screen.getByRole("combobox", { name: /Модель AI/i });
    expect(trigger).toBeDisabled();
  });

  it("выбор модели вызывает setModel", async () => {
    const setModel = vi.fn();
    useAiModelMock.mockReturnValue({ model: "gpt-4o", setModel, models: catalog, loading: false, refresh: vi.fn() });
    render(<ModelSelector />);
    await userEvent.click(screen.getByRole("combobox", { name: /Модель AI/i }));
    await userEvent.click(await screen.findByText("Claude Haiku"));
    expect(setModel).toHaveBeenCalledWith("claude-haiku-4.5");
  });

  it("клик по кнопке «Обновить список моделей» вызывает refresh из контекста", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    useAiModelMock.mockReturnValue({ model: "gpt-4o", setModel: vi.fn(), models: catalog, loading: false, refresh });
    render(<ModelSelector />);
    await userEvent.click(screen.getByRole("button", { name: /Обновить список моделей/i }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
