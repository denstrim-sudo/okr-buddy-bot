import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/utils";
import { KrPerspectives } from "../KrPerspectives";
import type { KrPerspective } from "@/types/okr";

const KRS = ["Поднять NPS с 32 до 50", "Удерживать долю сбоев ниже 1%"];

describe("KrPerspectives", () => {
  it("рендерит ось для каждого KR", () => {
    const p: KrPerspective[] = [
      { index: 0, perspective: "customer_business", rationale: "польза клиенту" },
      { index: 1, perspective: "feasibility_risk", rationale: "контр-метрика" },
    ];
    render(<KrPerspectives keyResults={KRS} perspectives={p} />);
    expect(screen.getByTestId("kr-axis-0")).toHaveTextContent("Клиент/бизнес");
    expect(screen.getByTestId("kr-axis-1")).toHaveTextContent("Осуществимость/риски");
  });

  it("подсказывает недостающую ось как рекомендацию, а не требование", () => {
    const p: KrPerspective[] = [
      { index: 0, perspective: "customer_business", rationale: "r" },
      { index: 1, perspective: "customer_business", rationale: "r" },
    ];
    render(<KrPerspectives keyResults={KRS} perspectives={p} />);
    const note = screen.getByTestId("kr-perspectives-missing");
    expect(note).toHaveTextContent("Осуществимость и риски");
    expect(note).toHaveTextContent("Обучение и развитие");
    expect(note).toHaveTextContent(/подсказка, а не требование/i);
  });

  it("не показывает блок 'не покрыто', когда все три оси представлены", () => {
    const p: KrPerspective[] = [
      { index: 0, perspective: "customer_business", rationale: "r" },
      { index: 1, perspective: "feasibility_risk", rationale: "r" },
      { index: 2, perspective: "learning", rationale: "r" },
    ];
    render(<KrPerspectives keyResults={[...KRS, "Подтвердить три типа заказов"]} perspectives={p} />);
    expect(screen.queryByTestId("kr-perspectives-missing")).toBeNull();
  });

  it("ничего не рендерит без данных", () => {
    const { container } = render(<KrPerspectives keyResults={KRS} perspectives={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
