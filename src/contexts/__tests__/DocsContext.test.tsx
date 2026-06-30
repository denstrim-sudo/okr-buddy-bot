import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { ReactNode } from "react";
import { DocsProvider, useDocs } from "@/contexts/DocsContext";

const wrapper = ({ children }: { children: ReactNode }) => <DocsProvider>{children}</DocsProvider>;

const addDoc = (
  result: ReturnType<typeof renderHook<ReturnType<typeof useDocs>, unknown>>["result"],
  name: string,
  text: string,
) => {
  act(() => {
    result.current.add({ name, category: "okr_context", text, size: text.length });
  });
};

describe("DocsContext.buildContextWithUsage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("returns usage report with used/limit/docs[]", () => {
    const { result } = renderHook(() => useDocs(), { wrapper });
    addDoc(result, "a.txt", "A".repeat(80));
    addDoc(result, "b.txt", "B".repeat(80));

    const report = result.current.buildContextWithUsage(["okr_context"], 100);
    expect(typeof report.text).toBe("string");
    expect(report.limit).toBe(100);
    expect(report.used).toBeGreaterThan(0);
    expect(report.used).toBeLessThanOrEqual(100);
    expect(Array.isArray(report.docs)).toBe(true);
    expect(report.docs).toHaveLength(2);
    for (const d of report.docs) {
      expect(d).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          name: expect.any(String),
          includedChars: expect.any(Number),
          totalChars: expect.any(Number),
          truncated: expect.any(Boolean),
        }),
      );
    }
  });

  it("gives newer documents a larger share when budget is tight", () => {
    const { result } = renderHook(() => useDocs(), { wrapper });
    addDoc(result, "oldest.txt", "O".repeat(300));
    addDoc(result, "middle.txt", "M".repeat(300));
    addDoc(result, "newest.txt", "N".repeat(300));

    const report = result.current.buildContextWithUsage(["okr_context"], 300);
    const oldest = report.docs.find((d) => d.name === "oldest.txt")!;
    const newest = report.docs.find((d) => d.name === "newest.txt")!;

    const ratioOld = oldest.includedChars / oldest.totalChars;
    const ratioNew = newest.includedChars / newest.totalChars;

    expect(ratioNew).toBeGreaterThanOrEqual(ratioOld);
    expect(ratioNew).toBeGreaterThan(0);
  });

  it("marks fully-fitting doc as truncated:false with includedChars === totalChars", () => {
    const { result } = renderHook(() => useDocs(), { wrapper });
    addDoc(result, "small.txt", "hello world");

    const report = result.current.buildContextWithUsage(["okr_context"], 10_000);
    expect(report.docs).toHaveLength(1);
    expect(report.docs[0].truncated).toBe(false);
    expect(report.docs[0].includedChars).toBe(report.docs[0].totalChars);
  });

  it("buildContext stays backward-compatible and returns just text", () => {
    const { result } = renderHook(() => useDocs(), { wrapper });
    addDoc(result, "a.txt", "hello");
    const text = result.current.buildContext(["okr_context"]);
    expect(typeof text).toBe("string");
    expect(text).toContain("hello");
  });
});
