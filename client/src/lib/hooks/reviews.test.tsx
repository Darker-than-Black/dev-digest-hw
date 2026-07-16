import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { SmartDiffResponse, ReviewRunResponse } from "@devdigest/shared";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockDel = vi.fn();

vi.mock("../api", () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    del: (...args: unknown[]) => mockDel(...args),
    put: vi.fn(),
    patch: vi.fn(),
  },
  API_BASE: "http://localhost:3001",
}));

import { useSmartDiff, useRunReview, useDeleteReview, useDeleteRun } from "./reviews";

afterEach(() => {
  vi.clearAllMocks();
});

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const emptySmartDiff: SmartDiffResponse = {
  groups: [
    { role: "core", files: [] },
    { role: "wiring", files: [] },
    { role: "boilerplate", files: [] },
  ],
  split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
};

describe("useSmartDiff", () => {
  it("fetches the smart-diff response for a PR and skips the fetch when prId is null", async () => {
    mockGet.mockResolvedValueOnce(emptySmartDiff);
    const qc = new QueryClient();
    const { result } = renderHook(() => useSmartDiff("pr-1"), { wrapper: wrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(emptySmartDiff);
    expect(mockGet).toHaveBeenCalledWith("/pulls/pr-1/smart-diff");

    mockGet.mockClear();
    const { result: skipped } = renderHook(() => useSmartDiff(null), { wrapper: wrapper(qc) });
    expect(skipped.current.fetchStatus).toBe("idle");
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe("smart-diff cache invalidation", () => {
  it("useRunReview invalidates the smart-diff cache alongside reviews once a run completes", async () => {
    const runResponse: ReviewRunResponse = { pr_id: "pr-1", runs: [], reviews: [] };
    mockPost.mockResolvedValueOnce(runResponse);
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useRunReview(), { wrapper: wrapper(qc) });

    await act(async () => {
      await result.current.mutateAsync({ prId: "pr-1", all: true });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["reviews", "pr-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["smart-diff", "pr-1"] });
  });

  it("useDeleteReview and useDeleteRun also invalidate the smart-diff cache", async () => {
    mockDel.mockResolvedValue({ ok: true });
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const { result: del1 } = renderHook(() => useDeleteReview("pr-1"), { wrapper: wrapper(qc) });
    await act(async () => {
      await del1.current.mutateAsync("review-1");
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["smart-diff", "pr-1"] });

    invalidateSpy.mockClear();
    const { result: del2 } = renderHook(() => useDeleteRun("pr-1"), { wrapper: wrapper(qc) });
    await act(async () => {
      await del2.current.mutateAsync("run-1");
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["smart-diff", "pr-1"] });
  });
});
