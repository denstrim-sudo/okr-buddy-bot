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

import userEvent from "@testing-library/user-event";

describe("RuleList — reasoning (chain-of-thought)", () => {
  it("скрыт по умолчанию, показывает toggle-кнопку", () => {
    renderWithProviders(
      <RuleList rules={[baseRule({ id: "R1", reasoning: "Это activity, а не outcome — глагол 'провести'" })]} />,
    );
    expect(screen.queryByTestId("rule-reasoning-R1")).not.toBeInTheDocument();
    expect(screen.getByTestId("rule-reasoning-toggle-R1")).toBeInTheDocument();
  });

  it("раскрывается по клику", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <RuleList rules={[baseRule({ id: "R2", reasoning: "Развёрнутое рассуждение модели" })]} />,
    );
    await user.click(screen.getByTestId("rule-reasoning-toggle-R2"));
    expect(screen.getByTestId("rule-reasoning-R2")).toHaveTextContent("Развёрнутое рассуждение");
  });

  it("не рендерит toggle, если reasoning отсутствует", () => {
    renderWithProviders(<RuleList rules={[baseRule({ id: "R3" })]} />);
    expect(screen.queryByTestId("rule-reasoning-toggle-R3")).not.toBeInTheDocument();
  });
});

describe("RuleList — неприменимые правила (OKR-PI)", () => {
  it("показывает правило с applicable=false серым с пометкой, без иконки провала", async () => {
    const rules: ValidationRule[] = [
      { id: "KR-OUTCOME", label: "Исходы", pass: true, hint: "", applicable: false },
      { id: "KR-COUNT", label: "Число KR", pass: false, hint: "мало", severity: "important" },
    ];
    renderWithProviders(<RuleList rules={rules} />);
    await userEvent.click(screen.getByText(/Что уже хорошо/));
    const na = screen.getByTestId("rule-na-KR-OUTCOME");
    expect(na).toHaveTextContent("не применимо для этого типа");
  });
});

describe("RuleList — провал без цитаты (unconfirmed)", () => {
  it("показывает пометку «не влияет на оценку» без иконки провала", () => {
    renderWithProviders(<RuleList rules={[baseRule({ id: "UC1", grounded: false, unconfirmed: true })]} />);
    expect(screen.getByTestId("rule-unconfirmed-UC1")).toBeInTheDocument();
    expect(screen.getByText(/не подтверждено цитатой — не влияет на оценку/i)).toBeInTheDocument();
    expect(screen.queryByText("Важно")).not.toBeInTheDocument();
  });
});
