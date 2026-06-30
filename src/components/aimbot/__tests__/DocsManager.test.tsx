import { describe, it, expect, beforeEach } from "vitest";
import { renderWithProviders, screen } from "@/test/utils";
import { DocsManager } from "@/components/aimbot/DocsManager";

const SESSION_KEY = "aimbot.docs.session.v1";

const seed = (items: { id: string; name: string; text: string; addedAt: string }[]) => {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify(
      items.map((i) => ({
        id: i.id,
        name: i.name,
        category: "okr_context" as const,
        text: i.text,
        size: i.text.length,
        addedAt: i.addedAt,
      })),
    ),
  );
};

describe("DocsManager — budget usage UI", () => {
  beforeEach(() => sessionStorage.clear());

  it("shows usage summary line", () => {
    seed([{ id: "1", name: "small.txt", text: "hello", addedAt: "2026-01-01T00:00:00Z" }]);
    renderWithProviders(<DocsManager />);
    // "Использовано N из 12 000 символов" (mind hard-space / spaces)
    expect(screen.getByTestId("docs-usage-summary").textContent).toMatch(/Использовано/);
    expect(screen.getByTestId("docs-usage-summary").textContent).toMatch(/12/);
  });

  it("renders truncated badge for the oldest doc when budget overflows", () => {
    // 2 docs × 8000 chars = 16000 > 12000 limit. Weights [2,1] → newest=8000 (fits),
    // oldest=4000 (truncated).
    seed([
      { id: "old", name: "oldest.txt", text: "O".repeat(8000), addedAt: "2026-01-01T00:00:00Z" },
      { id: "new", name: "newest.txt", text: "N".repeat(8000), addedAt: "2026-06-01T00:00:00Z" },
    ]);
    renderWithProviders(<DocsManager />);

    expect(screen.getByTestId("doc-truncated-old")).toBeInTheDocument();
    expect(screen.getByTestId("doc-truncated-old").textContent).toMatch(/учтено/);
    expect(screen.queryByTestId("doc-truncated-new")).not.toBeInTheDocument();
  });
});
