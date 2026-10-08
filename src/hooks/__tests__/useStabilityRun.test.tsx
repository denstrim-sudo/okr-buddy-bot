import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { GOLDEN_SET } from "@/lib/goldenSet";

const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invokeMock(...a) } },
}));

import { useStabilityRun, STABILITY_STORAGE_KEY } from "@/hooks/useStabilityRun";

describe("useStabilityRun", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    sessionStorage.clear();
  });

  it("2 случая × 2 повтора → 4 вызова; ошибка одного не роняет прогон", async () => {
    let n = 0;
    invokeMock.mockImplementation(() => {
      n++;
      return Promise.resolve(n === 2 ? { data: null, error: { message: "boom" } } : { data: { score: 80, rules: [] }, error: null });
    });
    const [a, b] = GOLDEN_SET;
    const { result } = renderHook(() => useStabilityRun());
    await act(async () => {
      await result.current.run({ caseIds: [a.id, b.id], repeats: 2, model: "m1", concurrency: 2 });
    });
    expect(invokeMock).toHaveBeenCalledTimes(4);
    const [name, opts] = invokeMock.mock.calls[0];
    expect(name).toBe("validate-okr");
    expect(opts.body).toMatchObject({ mode: "audit", objective: a.objective, key_results: a.key_results, horizon: a.horizon, okr_status: a.okr_status, model: "m1" });
    const s = result.current.state!;
    expect(s.done).toBe(4);
    expect(s.errors).toHaveLength(1);
    expect(s.runs[a.id].length + s.runs[b.id].length).toBe(3);
    expect(s.finished).toBe(true);
    expect(sessionStorage.getItem(STABILITY_STORAGE_KEY)).toBeTruthy();
  });
});
