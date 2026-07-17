import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/blast.json";
import type { BlastResponse } from "@devdigest/shared";

const useBlast = vi.fn();

vi.mock("@/lib/hooks/blast", () => ({
  useBlast: (...args: unknown[]) => useBlast(...args),
}));

import { BlastTab } from "./BlastTab";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const degradedData: BlastResponse = {
  index: {
    status: "degraded",
    degraded: true,
    reason: "Index build failed: timeout",
    files_indexed: 0,
    files_skipped: 12,
    last_indexed_sha: "abc123",
    updated_at: null,
  },
  changed_symbols: [],
  impacts: [],
  endpoints: [],
  crons: [],
  counts: { symbols: 0, callers: 0, endpoints: 0, crons: 0 },
  explanation: null,
};

const populatedData: BlastResponse = {
  index: {
    status: "full",
    degraded: false,
    reason: null,
    files_indexed: 42,
    files_skipped: 0,
    last_indexed_sha: "sha123",
    updated_at: "2026-07-01T00:00:00.000Z",
  },
  changed_symbols: [{ name: "processPayment", file: "server/src/payments.ts", kind: "function" }],
  impacts: [
    {
      symbol: { name: "processPayment", file: "server/src/payments.ts", kind: "function" },
      callers: [
        { symbol: "checkoutHandler", file: "server/src/routes/checkout.ts", line: 42, rank: 0.8 },
      ],
      endpoints: ["POST /checkout"],
      crons: [],
    },
  ],
  endpoints: ["POST /checkout"],
  crons: ["nightly-reconcile"],
  counts: { symbols: 1, callers: 1, endpoints: 1, crons: 1 },
  explanation: null,
};

describe("BlastTab", () => {
  it("renders the degraded index badge with its reason instead of a blank screen", () => {
    useBlast.mockReturnValue({ data: degradedData, isLoading: false, isFetching: false });

    renderWithIntl(<BlastTab prId="pr-1" repoFullName="acme/repo" headSha="sha1" />);

    expect(screen.getByText("Degraded index")).toBeInTheDocument();
    expect(screen.getByText("Index build failed: timeout")).toBeInTheDocument();
    expect(
      screen.getByText("0 changed symbol(s), no downstream callers found."),
    ).toBeInTheDocument();
  });

  it("renders a populated map: symbols with callers auto-expand to their GitHub-linked callers + endpoint chips, plus the stat counts", () => {
    useBlast.mockReturnValue({ data: populatedData, isLoading: false, isFetching: false });

    renderWithIntl(<BlastTab prId="pr-1" repoFullName="acme/repo" headSha="sha1" />);

    expect(screen.getByText("1 symbols")).toBeInTheDocument();
    // "1 callers" appears twice: the stat-chip total and the symbol row's own
    // caller-count label.
    expect(screen.getAllByText("1 callers")).toHaveLength(2);
    expect(screen.getByText("1 endpoints")).toBeInTheDocument();
    expect(screen.getByText("1 cron/jobs")).toBeInTheDocument();
    // Function/method symbols read as code: `name()`.
    expect(screen.getByText("processPayment()")).toBeInTheDocument();

    // A symbol WITH callers is expanded by default — the caller link and the
    // reachable endpoint chip render without any interaction.
    const callerLink = screen.getByRole("link", { name: "server/src/routes/checkout.ts:42" });
    expect(callerLink).toHaveAttribute(
      "href",
      "https://github.com/acme/repo/blob/sha1/server/src/routes/checkout.ts#L42",
    );
    expect(screen.getByText("POST /checkout")).toBeInTheDocument();

    // Chevron collapses the callers.
    fireEvent.click(screen.getByRole("button", { name: "Collapse callers" }));
    expect(
      screen.queryByRole("link", { name: "server/src/routes/checkout.ts:42" }),
    ).not.toBeInTheDocument();
  });
});
