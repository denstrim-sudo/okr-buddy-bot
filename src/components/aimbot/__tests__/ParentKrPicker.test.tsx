import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ParentKrPicker } from "@/components/aimbot/ParentKrPicker";
import type { SavedOkr } from "@/hooks/useSavedOkrs";
import type { OkrHorizon } from "@/types/okr";

const mk = (id: string, objective: string, horizon: OkrHorizon, krTexts: string[] = ["KR-A", "KR-B"]): SavedOkr => ({
  id,
  objective,
  savedAt: new Date().toISOString(),
  plan: {
    objective_refined: objective,
    score: 0,
    horizon,
    key_results: krTexts.map((t) => ({
      text: t, baseline: "", target: "", metric: "", kr_type: "leading", solutions: [],
    })),
  },
});

describe("ParentKrPicker", () => {
  it("strategic_3y: пояснение про корень, без select", () => {
    render(<ParentKrPicker items={[]} horizon="strategic_3y" value={null} onChange={vi.fn()} />);
    expect(screen.getByText(/корень иерархии/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("block_12m с пустым items: подсказка, не select", () => {
    render(<ParentKrPicker items={[]} horizon="block_12m" value={null} onChange={vi.fn()} />);
    expect(screen.getByText(/Нет сохранённых/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("quarter_3m с 2 block_12m OKR: select с 2 опциями", () => {
    const items = [mk("p1", "Block OKR 1", "block_12m"), mk("p2", "Block OKR 2", "block_12m")];
    render(<ParentKrPicker items={items} horizon="quarter_3m" value={null} onChange={vi.fn()} />);
    const select = screen.getByLabelText(/Родительский OKR/i) as HTMLSelectElement;
    const opts = Array.from(select.options).map((o) => o.textContent);
    expect(opts).toContain("Без родителя");
    expect(opts).toContain("Block OKR 1");
    expect(opts).toContain("Block OKR 2");
  });

  it("после выбора родителя появляется второй select с его KR", async () => {
    const items = [mk("p1", "Block OKR 1", "block_12m", ["Активация 30→50", "Retention W1"])];
    const onChange = vi.fn();
    const { rerender } = render(
      <ParentKrPicker items={items} horizon="quarter_3m" value={null} onChange={onChange} />,
    );
    await userEvent.selectOptions(screen.getByLabelText(/Родительский OKR/i), "p1");
    expect(onChange).toHaveBeenCalledWith({ parentOkrId: "p1", parentKrIndex: 0 });

    rerender(<ParentKrPicker items={items} horizon="quarter_3m" value={{ parentOkrId: "p1", parentKrIndex: 0 }} onChange={onChange} />);
    const krSelect = screen.getByLabelText(/Родительский KR/i) as HTMLSelectElement;
    expect(krSelect).toBeInTheDocument();
    expect(Array.from(krSelect.options).map((o) => o.textContent)).toEqual([
      "KR1: Активация 30→50",
      "KR2: Retention W1",
    ]);
  });

  it("выбор KR вызывает onChange({parentOkrId, parentKrIndex})", async () => {
    const items = [mk("p1", "P1", "block_12m", ["A", "B"])];
    const onChange = vi.fn();
    render(
      <ParentKrPicker
        items={items}
        horizon="quarter_3m"
        value={{ parentOkrId: "p1", parentKrIndex: 0 }}
        onChange={onChange}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText(/Родительский KR/i), "1");
    expect(onChange).toHaveBeenCalledWith({ parentOkrId: "p1", parentKrIndex: 1 });
  });

  it("'Без родителя' вызывает onChange(null)", async () => {
    const items = [mk("p1", "P1", "block_12m")];
    const onChange = vi.fn();
    render(
      <ParentKrPicker
        items={items}
        horizon="quarter_3m"
        value={{ parentOkrId: "p1", parentKrIndex: 0 }}
        onChange={onChange}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText(/Родительский OKR/i), "__none__");
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("value предзаполняет оба select (контролируемый)", () => {
    const items = [mk("p1", "P1", "block_12m", ["A", "B", "C"])];
    render(
      <ParentKrPicker
        items={items}
        horizon="quarter_3m"
        value={{ parentOkrId: "p1", parentKrIndex: 2 }}
        onChange={vi.fn()}
      />,
    );
    expect((screen.getByLabelText(/Родительский OKR/i) as HTMLSelectElement).value).toBe("p1");
    expect((screen.getByLabelText(/Родительский KR/i) as HTMLSelectElement).value).toBe("2");
  });
});
