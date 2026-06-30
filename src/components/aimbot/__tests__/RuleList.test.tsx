import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "@/test/utils";
import { RuleList } from "@/components/aimbot/RuleList";
import type { ValidationRule } from "@/types/okr";

const baseRule = (over: Partial<ValidationRule>): ValidationRule => ({
  id: "X1",
  label: "Тестовое правило",
  pass: false,
  hint: "подсказка",
  severity: "important",
  why: "почему важно",
  ...over,
});

describe("RuleList — индикатор grounded", () => {
  it("показывает пометку для pass=false правила с grounded=false", () => {
    renderWithProviders(<RuleList rules={[baseRule({ id: "U1", grounded: false })]} />);
    expect(screen.getByTestId("rule-ungrounded-U1")).toBeInTheDocument();
    expect(screen.getByText(/не подтверждено цитатой/i)).toBeInTheDocument();
  });

  it("НЕ показывает пометку, когда pass=false и grounded=true", () => {
    renderWithProviders(<RuleList rules={[baseRule({ id: "G1", grounded: true })]} />);
    expect(screen.queryByTestId("rule-ungrounded-G1")).not.toBeInTheDocument();
    expect(screen.queryByText(/не подтверждено цитатой/i)).not.toBeInTheDocument();
  });

  it("никогда не показывает пометку для pass=true, даже если grounded=true", () => {
    renderWithProviders(
      <RuleList rules={[baseRule({ id: "P1", pass: true, hint: "", grounded: true })]} />,
    );
    expect(screen.queryByTestId("rule-ungrounded-P1")).not.toBeInTheDocument();
  });
});
