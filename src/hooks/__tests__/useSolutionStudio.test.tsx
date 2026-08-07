import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { ReactNode } from "react";
import { DocsProvider } from "@/contexts/DocsContext";
import { ModelProvider } from "@/contexts/ModelContext";

const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: any[]) => invokeMock(...a) } },
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

import { useSolutionStudio, STORAGE_KEY } from "@/hooks/useSolutionStudio";

const Wrap = ({ children }: { children: ReactNode }) => (
  <ModelProvider><DocsProvider>{children}</DocsProvider></ModelProvider>
);

describe("useSolutionStudio (Module 3)", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    localStorage.removeItem(STORAGE_KEY);
  });

  it("forwards objective into generate-solutions payload", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        solutions: [
          { id: "S1", problem: "p", bet: "b", result_image: "r", leading_metric: "m", confidence: "Medium", effort: "M", validation: "v" },
          { id: "S2", problem: "p", bet: "b", result_image: "r", leading_metric: "m", confidence: "Medium", effort: "M", validation: "v" },
          { id: "S3", problem: "p", bet: "b", result_image: "r", leading_metric: "m", confidence: "Medium", effort: "M", validation: "v" },
        ],
      },
      error: null,
    });

    const { result } = renderHook(
      () => useSolutionStudio("Стать лидером онбординга", "Поднять активацию", ["Поднять активацию"]),
      { wrapper: Wrap },
    );

    await act(async () => { await result.current.handleGenerate(); });

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    const [fn, opts] = invokeMock.mock.calls[0];
    expect(fn).toBe("generate-solutions");
    expect(opts.body.objective).toBe("Стать лидером онбординга");
    expect(opts.body.key_result).toBe("Поднять активацию");
    expect(result.current.slice.solutions).toHaveLength(3);
  });

  it("creates a slice per Key Result and switches active tab away from CUSTOM", () => {
    const { result } = renderHook(
      () => useSolutionStudio("obj", "kr-default", ["KR один", "KR два"]),
      { wrapper: Wrap },
    );
    expect(result.current.activeKey).toBe("kr-0");
    expect(result.current.state["kr-0"].krText).toBe("KR один");
    expect(result.current.state["kr-1"].krText).toBe("KR два");
  });
});

describe("addAuditToProject", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    localStorage.removeItem(STORAGE_KEY);
  });

  const fill = (r: any) => {
    act(() => { r.current.updateAudit("problem", "Боль"); });
    act(() => { r.current.updateAudit("bet", "Ставка"); });
    act(() => { r.current.updateAudit("result_image", "Картина"); });
    act(() => { r.current.updateAudit("leading_metric", "Метрика"); });
  };

  it("кейс 2: ручное Решение из аудита добавляется в список и получает статус «в проекте»", () => {
    const { result } = renderHook(() => useSolutionStudio("obj", "kr", []), { wrapper: Wrap });
    fill(result);
    act(() => { result.current.addAuditToProject(); });
    expect(result.current.slice.solutions).toHaveLength(1);
    expect(result.current.slice.solutions[0].bet).toBe("Ставка");
    expect(result.current.selectedSet.has(0)).toBe(true);
  });

  it("кейс 1: если Решение с таким id уже есть — оно обновляется, дубля нет", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { solutions: [{ id: "S1", problem: "p", bet: "старая ставка", result_image: "r", leading_metric: "m", confidence: "Medium", effort: "M", validation: "v" }] },
      error: null,
    });
    const { result } = renderHook(() => useSolutionStudio("obj", "kr", []), { wrapper: Wrap });
    await act(async () => { await result.current.handleGenerate(); });
    console.log("AFTERGEN", JSON.stringify(result.current.slice.solutions));
    act(() => { result.current.sendToAudit(result.current.slice.solutions[0]); });
    console.log("AFTERAUDIT", JSON.stringify(result.current.slice));
    act(() => { result.current.updateAudit("bet", "новая ставка"); });
    act(() => { result.current.addAuditToProject(); });
    expect(result.current.slice.solutions).toHaveLength(1);
    expect(result.current.slice.solutions[0].bet).toBe("новая ставка");
    expect(result.current.selectedSet.has(0)).toBe(true);
  });

  it("отчёт аудита переносится в карточку добавленного Решения", async () => {
    invokeMock.mockResolvedValueOnce({ data: { score: 82, summary: "ок", rules: [] }, error: null });
    const { result } = renderHook(() => useSolutionStudio("obj", "kr", []), { wrapper: Wrap });
    fill(result);
    await act(async () => { await result.current.validateSolution(); });
    act(() => { result.current.addAuditToProject(); });
    expect(result.current.slice.cardReports[0].score).toBe(82);
  });

  it("не добавляет незаполненное Решение", () => {
    const { result } = renderHook(() => useSolutionStudio("obj", "kr", []), { wrapper: Wrap });
    act(() => { result.current.addAuditToProject(); });
    expect(result.current.slice.solutions).toHaveLength(0);
  });
});
