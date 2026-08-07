import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMetricsCatalog, type Metric } from "@/hooks/useMetricsCatalog";

describe("useMetricsCatalog", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("addMetric создаёт метрику с id, name, unit и возвращает её", () => {
    const { result } = renderHook(() => useMetricsCatalog());
    let m!: Metric;
    act(() => {
      m = result.current.addMetric("NPS", "балл").metric;
    });
    expect(m.id).toBeTruthy();
    expect(m.name).toBe("NPS");
    expect(m.unit).toBe("балл");
    expect(result.current.metrics).toHaveLength(1);
  });

  it("addMetric не создаёт дубль по нормализованному имени, возвращает существующую", () => {
    const { result } = renderHook(() => useMetricsCatalog());
    let first!: Metric;
    let second!: Metric;
    act(() => {
      first = result.current.addMetric("NPS").metric;
    });
    act(() => {
      second = result.current.addMetric("  nps  ").metric;
    });
    expect(second.id).toBe(first.id);
    expect(result.current.metrics).toHaveLength(1);
  });

  it("removeMetric удаляет метрику", () => {
    const { result } = renderHook(() => useMetricsCatalog());
    let m!: Metric;
    act(() => {
      m = result.current.addMetric("CSAT").metric;
    });
    act(() => {
      result.current.removeMetric(m.id);
    });
    expect(result.current.metrics).toHaveLength(0);
  });

  it("метрики персистятся в localStorage под ключом aimbot.metrics.v1", () => {
    const { result } = renderHook(() => useMetricsCatalog());
    act(() => {
      result.current.addMetric("Отток", "%");
    });
    const raw = localStorage.getItem("aimbot.metrics.v1");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as Metric[];
    expect(parsed[0].name).toBe("Отток");
    expect(parsed[0].unit).toBe("%");
  });

  it("при недоступном localStorage хук не падает, возвращает ok:false", () => {
    const { result } = renderHook(() => useMetricsCatalog());
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    let ok = true;
    act(() => {
      ok = result.current.addMetric("X").ok;
    });
    expect(ok).toBe(false);
    expect(result.current.persistError).toBe(true);
  });
});
