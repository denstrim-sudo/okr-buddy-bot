import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchModelCatalog, resolveInitialModel, notifyModelFallback, FALLBACK_CATALOG, DEFAULT_MODEL } from "@/contexts/ModelContext";

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), warning: vi.fn(), success: vi.fn(), error: vi.fn() },
}));
import { toast } from "sonner";

describe("fetchModelCatalog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("заполняет models из ответа invoke('list-ai-models')", async () => {
    const models = [
      { id: "gpt-4o", label: "GPT-4o", hint: "" },
      { id: "claude-haiku-4.5", label: "Claude Haiku", hint: "" },
    ];
    const invoke = vi.fn().mockResolvedValue({ data: { models, degraded: false }, error: null });
    const res = await fetchModelCatalog(invoke);
    expect(invoke).toHaveBeenCalledWith("list-ai-models");
    expect(res.models).toEqual(models);
    expect(res.degraded).toBe(false);
  });

  it("если list-ai-models упал — использует FALLBACK_CATALOG, не падает", async () => {
    const invoke = vi.fn().mockResolvedValue({ data: null, error: new Error("boom") });
    const res = await fetchModelCatalog(invoke);
    expect(res.models).toBe(FALLBACK_CATALOG);
    expect(res.degraded).toBe(true);
  });

  it("если invoke бросает — возвращает FALLBACK_CATALOG", async () => {
    const invoke = vi.fn().mockRejectedValue(new Error("network"));
    const res = await fetchModelCatalog(invoke);
    expect(res.models).toBe(FALLBACK_CATALOG);
    expect(res.degraded).toBe(true);
  });

  it("если ответ пустой — fallback", async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { models: [] }, error: null });
    const res = await fetchModelCatalog(invoke);
    expect(res.models).toBe(FALLBACK_CATALOG);
  });
});

describe("resolveInitialModel", () => {
  const catalog = [
    { id: "gpt-4o", label: "", hint: "" },
    { id: "claude-haiku-4.5", label: "", hint: "" },
  ];

  it("сохранённая модель присутствует → не переключает", () => {
    const r = resolveInitialModel("claude-haiku-4.5", catalog);
    expect(r).toEqual({ model: "claude-haiku-4.5", switched: false });
  });

  it("сохранённая модель отсутствует → переключает на DEFAULT_MODEL", () => {
    const r = resolveInitialModel("phantom-model-9000", catalog);
    expect(r.switched).toBe(true);
    expect(r.model).toBe(DEFAULT_MODEL);
  });

  it("DEFAULT_MODEL тоже отсутствует → fallback на первый из каталога", () => {
    const small = [{ id: "only-one", label: "", hint: "" }];
    const r = resolveInitialModel("phantom", small);
    expect(r).toEqual({ model: "only-one", switched: true });
  });
});

describe("notifyModelFallback", () => {
  beforeEach(() => vi.clearAllMocks());

  it("показывает toast.warning только когда requested_model !== used_model И есть fallback_reason", () => {
    notifyModelFallback({
      _meta: { requested_model: "claude-haiku-4.5", used_model: "gpt-4o", fallback_reason: "model_unavailable" },
    });
    expect(toast.warning).toHaveBeenCalledTimes(1);
  });

  it("НЕ показывает toast, если _meta отсутствует", () => {
    notifyModelFallback({});
    notifyModelFallback(null);
    notifyModelFallback(undefined);
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("НЕ показывает toast, если requested_model === used_model", () => {
    notifyModelFallback({
      _meta: { requested_model: "gpt-4o", used_model: "gpt-4o", fallback_reason: "model_unavailable" },
    });
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("НЕ показывает toast, если fallback_reason отсутствует", () => {
    notifyModelFallback({
      _meta: { requested_model: "claude-haiku-4.5", used_model: "gpt-4o" },
    });
    expect(toast.warning).not.toHaveBeenCalled();
  });
});
