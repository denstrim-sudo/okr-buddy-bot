import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import Index from "@/pages/Index";

describe("Index page", () => {
  beforeEach(() => localStorage.clear());

  it("рендерит секцию «Пирамида метрик · Модуль 4»", () => {
    renderWithProviders(<Index />);
    expect(screen.getByText("Пирамида метрик · Модуль 4")).toBeInTheDocument();
  });
});
