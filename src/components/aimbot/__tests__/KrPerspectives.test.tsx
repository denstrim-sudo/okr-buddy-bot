import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/utils";
import { KrPerspectives } from "../KrPerspectives";
import type { KrPerspective } from "@/types/okr";

const KRS = ["Поднять NPS с 32 до 50", "Доля сбоев остаётся ниже 1%"];

// Переписано под ракурсы К/О/У (OKR-PI 3.3): значения осей переименованы.
describe("KrPerspectives", () => {
  it("рендерит ракурс К/О/У для каждого KR на русском", () => {
    const p: KrPerspective[] = [
      { index: 0, perspective: "К", rationale: "клиент" },
      { index: 1, perspective: "О", rationale: "порог" },
    ];
    render(<KrPerspectives keyResults={KRS} perspectives={p} />);
    expect(screen.getByTestId("kr-axis-0")).toHaveTextContent("клиент и бизнес");
    expect(screen.getByTestId("kr-axis-1")).toHaveTextContent("осуществимость и риски");
  });

  it("показывает форму и опережающий/запаздывающий рядом с ракурсом", () => {
    const p: KrPerspective[] = [
      { index: 0, perspective: "К", form: "range", timing: "leading", rationale: "r" },
      { index: 1, perspective: "О", rationale: "старый отчёт без формы" },
    ];
    render(<KrPerspectives keyResults={KRS} perspectives={p} />);
    expect(screen.getByTestId("kr-form-0")).toHaveTextContent("с X до Y · опережающий");
    expect(screen.queryByTestId("kr-form-1")).toBeNull();
  });

  it("понимает старые значения осей из сохранённых отчётов", () => {
    const p = [{ index: 0, perspective: "learning", rationale: "r" }] as unknown as KrPerspective[];
    render(<KrPerspectives keyResults={KRS} perspectives={p} />);
    expect(screen.getByTestId("kr-axis-0")).toHaveTextContent("обучение");
  });

  it("называет недостающие ракурсы", () => {
    const p: KrPerspective[] = [
      { index: 0, perspective: "К", rationale: "r" },
      { index: 1, perspective: "К", rationale: "r" },
    ];
    render(<KrPerspectives keyResults={KRS} perspectives={p} />);
    const note = screen.getByTestId("kr-perspectives-missing");
    expect(note).toHaveTextContent("Осуществимость и риски");
    expect(note).toHaveTextContent("Обучение");
  });

  it("не показывает блок 'не покрыто', когда все три ракурса есть", () => {
    const p: KrPerspective[] = [
      { index: 0, perspective: "К", rationale: "r" },
      { index: 1, perspective: "О", rationale: "r" },
      { index: 2, perspective: "У", rationale: "r" },
    ];
    render(<KrPerspectives keyResults={[...KRS, "К концу PI известно…"]} perspectives={p} />);
    expect(screen.queryByTestId("kr-perspectives-missing")).toBeNull();
  });

  it("ничего не рендерит без данных", () => {
    const { container } = render(<KrPerspectives keyResults={KRS} perspectives={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
