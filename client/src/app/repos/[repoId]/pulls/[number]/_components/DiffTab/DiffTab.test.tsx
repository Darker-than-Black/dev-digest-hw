import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/shell.json";
import type { PrFile } from "@devdigest/shared";

const usePrComments = vi.fn();
const useCreatePrComment = vi.fn();
const useSmartDiff = vi.fn();
const usePrReviews = vi.fn();

vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: (...args: unknown[]) => usePrComments(...args),
  useCreatePrComment: (...args: unknown[]) => useCreatePrComment(...args),
  useSmartDiff: (...args: unknown[]) => useSmartDiff(...args),
  usePrReviews: (...args: unknown[]) => usePrReviews(...args),
}));

import { DiffTab } from "./DiffTab";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const files: PrFile[] = [
  { path: "server/src/service.ts", additions: 2, deletions: 0, patch: "@@ -1,1 +1,1 @@\n-a\n+b" },
];

const smartDiffData = {
  groups: [
    {
      role: "core" as const,
      files: [
        {
          path: "server/src/service.ts",
          pseudocode_summary: null,
          additions: 2,
          deletions: 0,
          finding_lines: [],
        },
      ],
    },
    { role: "wiring" as const, files: [] },
    { role: "boilerplate" as const, files: [] },
  ],
  split_suggestion: { too_big: false, total_lines: 2, proposed_splits: [] },
};

function stubCommonHooks() {
  usePrComments.mockReturnValue({ data: [] });
  useCreatePrComment.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  usePrReviews.mockReturnValue({ data: [] });
}

describe("DiffTab", () => {
  it("renders Smart order by default (with header totals) and switches to the flat viewer via the Original order chip", () => {
    stubCommonHooks();
    useSmartDiff.mockReturnValue({ data: smartDiffData, isLoading: false, isError: false });

    renderWithIntl(<DiffTab prId="pr-1" filesCount={1} files={files} />);

    expect(screen.getByText("Files changed · 1 file · +2 −0")).toBeInTheDocument();
    // Smart Diff renders its role-group header ("Core logic") — the flat DiffViewer never does.
    expect(screen.getByText("Core logic")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Original order" }));

    expect(screen.queryByText("Core logic")).not.toBeInTheDocument();
    expect(screen.getByText("server/src/service.ts")).toBeInTheDocument();
  });

  it("falls back to the flat viewer (never a blank tab) when the smart-diff query fails, and disables the Smart order chip", () => {
    stubCommonHooks();
    useSmartDiff.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    renderWithIntl(<DiffTab prId="pr-1" filesCount={1} files={files} />);

    expect(screen.queryByText("Core logic")).not.toBeInTheDocument();
    expect(screen.getByText("server/src/service.ts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Smart order" })).toBeDisabled();
  });
});
