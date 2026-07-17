import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/blast.json";
import type { BlastResponse, BlastCallerRef } from "@devdigest/shared";

const useBlast = vi.fn();

vi.mock("@/lib/hooks/blast", () => ({
  useBlast: (...args: unknown[]) => useBlast(...args),
}));

// The real MermaidDiagram lazy-imports the `mermaid` package and renders
// async SVG — irrelevant to what BlastTab itself is responsible for (see
// mermaid.test.ts for the chart-string builder). Stub it out so Graph-view
// tests only exercise BlastGraph's own wrapper (role="img" + legend).
vi.mock("@/components/mermaid-diagram", () => ({
  MermaidDiagram: () => null,
}));

import { BlastTab } from "./BlastTab";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function wrap(ui: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      {ui}
    </NextIntlClientProvider>
  );
}

function renderWithIntl(ui: React.ReactElement) {
  return render(wrap(ui));
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
    missing_files: null,
  },
  change_detection_mode: "line-level",
  changed_symbols: [],
  impacts: [],
  endpoints: [],
  crons: [],
  prior_pulls: [],
  counts: { symbols: 0, callers: 0, endpoints: 0, crons: 0 },
  explanation: null,
};

const unavailableData: BlastResponse = {
  index: {
    status: "unavailable",
    degraded: true,
    reason: null,
    files_indexed: 0,
    files_skipped: 0,
    last_indexed_sha: "",
    updated_at: null,
    missing_files: null,
  },
  change_detection_mode: "file-level",
  changed_symbols: [],
  impacts: [],
  endpoints: [],
  crons: [],
  prior_pulls: [],
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
    missing_files: null,
  },
  change_detection_mode: "line-level",
  changed_symbols: [{ name: "processPayment", file: "server/src/payments.ts", kind: "function" }],
  impacts: [
    {
      symbol: { name: "processPayment", file: "server/src/payments.ts", kind: "function" },
      callers: [
        {
          symbol: "checkoutHandler",
          file: "server/src/routes/checkout.ts",
          line: 42,
          rank: 0.8,
          relation: "calls",
        },
      ],
      callers_total: 1,
      callers_truncated: false,
      endpoints: [
        {
          method: "POST",
          path: "/checkout",
          location: { repository_path: "server/src/routes/checkout.ts", line: null },
          source_symbols: ["processPayment"],
          depth: 1,
        },
      ],
      crons: [],
    },
  ],
  endpoints: [
    {
      method: "POST",
      path: "/checkout",
      location: { repository_path: "server/src/routes/checkout.ts", line: null },
      source_symbols: ["processPayment"],
      depth: 1,
    },
  ],
  crons: ["nightly-reconcile"],
  prior_pulls: [],
  counts: { symbols: 1, callers: 1, endpoints: 1, crons: 1 },
  explanation: null,
};

/** Second changed symbol, collapsed by default (only index 0 auto-expands). */
const secondImpact = {
  symbol: { name: "refundPayment", file: "server/src/payments.ts", kind: "function" },
  callers: [
    {
      symbol: "adminRefund",
      file: "server/src/routes/admin.ts",
      line: 10,
      rank: 0.6,
      relation: "calls" as const,
    },
  ],
  callers_total: 1,
  callers_truncated: false,
  endpoints: [],
  crons: [],
};

const twoImpactsData: BlastResponse = {
  ...populatedData,
  changed_symbols: [
    { name: "processPayment", file: "server/src/payments.ts", kind: "function" },
    { name: "refundPayment", file: "server/src/payments.ts", kind: "function" },
  ],
  impacts: [populatedData.impacts[0]!, secondImpact],
  counts: { symbols: 2, callers: 2, endpoints: 1, crons: 1 },
};

/** A high-fanout symbol whose caller list was capped at 20 out of 47. */
const truncatedCallers: BlastCallerRef[] = Array.from({ length: 20 }, (_, i) => ({
  symbol: `caller${i}`,
  file: `server/src/callers/${i}.ts`,
  line: i + 1,
  rank: 0.5,
  relation: "references" as const,
}));

const truncatedData: BlastResponse = {
  ...populatedData,
  impacts: [
    {
      symbol: { name: "processPayment", file: "server/src/payments.ts", kind: "function" },
      callers: truncatedCallers,
      callers_total: 47,
      callers_truncated: true,
      endpoints: [],
      crons: [],
    },
  ],
  counts: { symbols: 1, callers: 47, endpoints: 0, crons: 0 },
};

/** Three symbols spanning zero/low/high caller counts, for the default
   empty-rows-at-end ordering and the stat-chip sort tests. Given in an order
   that would NOT already look sorted either way. */
const sortFixtureData: BlastResponse = {
  ...populatedData,
  changed_symbols: [
    { name: "emptySym", file: "a.ts", kind: "function" },
    { name: "lowSym", file: "b.ts", kind: "function" },
    { name: "highSym", file: "c.ts", kind: "function" },
  ],
  impacts: [
    {
      symbol: { name: "emptySym", file: "a.ts", kind: "function" },
      callers: [],
      callers_total: 0,
      callers_truncated: false,
      endpoints: [],
      crons: [],
    },
    {
      symbol: { name: "lowSym", file: "b.ts", kind: "function" },
      callers: [{ symbol: "x", file: "b2.ts", line: 1, rank: 0.1, relation: "calls" }],
      callers_total: 2,
      callers_truncated: false,
      endpoints: [],
      crons: [],
    },
    {
      symbol: { name: "highSym", file: "c.ts", kind: "function" },
      callers: [{ symbol: "y", file: "c2.ts", line: 1, rank: 0.1, relation: "calls" }],
      callers_total: 10,
      callers_truncated: false,
      endpoints: [],
      crons: [],
    },
  ],
  endpoints: [],
  crons: [],
  counts: { symbols: 3, callers: 12, endpoints: 0, crons: 0 },
};

function symbolNamesInOrder(): string[] {
  return screen.getAllByText(/Sym\(\)/).map((el) => el.textContent ?? "");
}

describe("BlastTab", () => {
  it("renders the degraded index badge with its reason instead of a blank screen", () => {
    useBlast.mockReturnValue({ data: degradedData, isLoading: false, isFetching: false });

    renderWithIntl(<BlastTab prId="pr-1" repoFullName="acme/repo" headSha="sha1" diffFiles={[]} />);

    expect(screen.getByText("Degraded index")).toBeInTheDocument();
    expect(screen.getByText("Index build failed: timeout")).toBeInTheDocument();
    expect(
      screen.getByText("0 changed symbol(s), no downstream callers found."),
    ).toBeInTheDocument();
  });

  it("renders a dedicated unavailable state instead of zero counters when the index is missing", () => {
    useBlast.mockReturnValue({ data: unavailableData, isLoading: false, isFetching: false });

    renderWithIntl(<BlastTab prId="pr-1" repoFullName="acme/repo" headSha="sha1" diffFiles={[]} />);

    expect(screen.getByText("Index unavailable")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Blast Radius is unavailable — the repository index has not been generated or could not be read.",
      ),
    ).toBeInTheDocument();
    // Never a "0 symbols/callers/endpoints/crons" stat row for a missing index.
    expect(screen.queryByText(/0 symbols/)).not.toBeInTheDocument();
    expect(screen.queryByText(/0 callers/)).not.toBeInTheDocument();
    expect(screen.queryByText(/0 endpoints/)).not.toBeInTheDocument();
  });

  it("renders the file-level precision notice when change detection fell back from line ranges", () => {
    useBlast.mockReturnValue({
      data: { ...populatedData, change_detection_mode: "file-level" },
      isLoading: false,
      isFetching: false,
    });

    renderWithIntl(<BlastTab prId="pr-1" repoFullName="acme/repo" headSha="sha1" diffFiles={[]} />);

    expect(
      screen.getByText(
        "Impact is calculated at file level because symbol line ranges are unavailable.",
      ),
    ).toBeInTheDocument();
  });

  it("does not render the file-level notice for precise line-level detection", () => {
    useBlast.mockReturnValue({ data: populatedData, isLoading: false, isFetching: false });

    renderWithIntl(<BlastTab prId="pr-1" repoFullName="acme/repo" headSha="sha1" diffFiles={[]} />);

    expect(
      screen.queryByText(
        "Impact is calculated at file level because symbol line ranges are unavailable.",
      ),
    ).not.toBeInTheDocument();
  });

  it("Graph chip switches to a Mermaid graph view with its legend; Tree switches back", () => {
    useBlast.mockReturnValue({ data: populatedData, isLoading: false, isFetching: false });

    renderWithIntl(<BlastTab prId="pr-1" repoFullName="acme/repo" headSha="sha1" diffFiles={[]} />);

    // Tree view by default.
    expect(screen.getByText("processPayment()")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Blast radius graph" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "graph" }));

    expect(screen.getByRole("img", { name: "Blast radius graph" })).toBeInTheDocument();
    expect(screen.getByText("changed symbol")).toBeInTheDocument();
    expect(screen.getByText("callers")).toBeInTheDocument();
    expect(screen.getByText("endpoints affected")).toBeInTheDocument();
    // The symbol tree isn't rendered while in Graph view.
    expect(screen.queryByText("processPayment()")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "tree" }));
    expect(screen.getByText("processPayment()")).toBeInTheDocument();
  });

  it("shows 'Showing 20 of 47' when a symbol's caller list was truncated", () => {
    useBlast.mockReturnValue({ data: truncatedData, isLoading: false, isFetching: false });

    renderWithIntl(<BlastTab prId="pr-1" repoFullName="acme/repo" headSha="sha1" diffFiles={[]} />);

    expect(screen.getByText("Showing 20 of 47 callers")).toBeInTheDocument();
    // "47 callers" appears twice: the stat-chip total and the symbol row's
    // own header count — both reflect the true total, not the capped list
    // length (and this impact has 0 endpoints/crons, so the header shows
    // the bare caller count, no " · N endpoints" suffix).
    expect(screen.getAllByText("47 callers")).toHaveLength(2);
  });

  it("renders a populated map: symbols with callers auto-expand to their GitHub-linked callers + endpoint chips, plus the stat counts", () => {
    useBlast.mockReturnValue({ data: populatedData, isLoading: false, isFetching: false });

    renderWithIntl(<BlastTab prId="pr-1" repoFullName="acme/repo" headSha="sha1" diffFiles={[]} />);

    expect(screen.getByText("1 symbols")).toBeInTheDocument();
    // The stat chip alone reads "1 callers"; the symbol row's own header
    // joins in its endpoint count too (see the per-symbol-counts test below).
    expect(screen.getByText("1 callers")).toBeInTheDocument();
    expect(screen.getByText("1 endpoints")).toBeInTheDocument();
    expect(screen.getByText("1 cron/jobs")).toBeInTheDocument();
    // Function/method symbols read as code: `name()`.
    expect(screen.getByText("processPayment()")).toBeInTheDocument();

    // The first symbol WITH callers is expanded by default — the caller link
    // and the reachable endpoint chip render without any interaction.
    const callerLink = screen.getByRole("link", { name: "server/src/routes/checkout.ts:42" });
    expect(callerLink).toHaveAttribute(
      "href",
      "https://github.com/acme/repo/blob/sha1/server/src/routes/checkout.ts#L42",
    );

    // Endpoints are objects now — rendered as `METHOD path` and clickable to
    // the endpoint's own file at the PR's head sha (no line: not indexed).
    // (This impact's endpoint chip renders twice: once per-symbol, once in
    // the "Affected endpoints" full list — see the dedicated test below.)
    const endpointLinks = screen.getAllByRole("link", { name: "Open POST /checkout on GitHub" });
    expect(endpointLinks[0]).toHaveTextContent("POST /checkout");
    expect(endpointLinks[0]).toHaveAttribute(
      "href",
      "https://github.com/acme/repo/blob/sha1/server/src/routes/checkout.ts",
    );

    // Chevron collapses the callers.
    fireEvent.click(screen.getByRole("button", { name: "Collapse callers" }));
    expect(
      screen.queryByRole("link", { name: "server/src/routes/checkout.ts:42" }),
    ).not.toBeInTheDocument();
  });

  it("expands only the first symbol by default, not every symbol with callers", () => {
    useBlast.mockReturnValue({ data: twoImpactsData, isLoading: false, isFetching: false });

    renderWithIntl(<BlastTab prId="pr-1" repoFullName="acme/repo" headSha="sha1" diffFiles={[]} />);

    // First symbol's caller is visible without interaction…
    expect(
      screen.getByRole("link", { name: "server/src/routes/checkout.ts:42" }),
    ).toBeInTheDocument();
    // …the second symbol's is not, until its own chevron is clicked.
    expect(
      screen.queryByRole("link", { name: "server/src/routes/admin.ts:10" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand callers" }));
    expect(screen.getByRole("link", { name: "server/src/routes/admin.ts:10" })).toBeInTheDocument();
  });

  it("shows per-symbol endpoint + cron counts alongside the caller count, only when > 0", () => {
    const data: BlastResponse = {
      ...populatedData,
      impacts: [
        {
          ...populatedData.impacts[0]!,
          crons: ["nightly-reconcile"],
        },
      ],
    };
    useBlast.mockReturnValue({ data, isLoading: false, isFetching: false });

    renderWithIntl(<BlastTab prId="pr-1" repoFullName="acme/repo" headSha="sha1" diffFiles={[]} />);

    // 1 caller, 1 endpoint, 1 cron on this impact.
    expect(screen.getByText("1 callers · 1 endpoints · 1 crons")).toBeInTheDocument();
  });

  it("renders the full flat endpoints list even when an endpoint isn't attributed to any symbol (count fix)", () => {
    const unattributed = {
      method: "POST",
      path: "/refund",
      location: { repository_path: "server/src/routes/refund.ts", line: null },
      source_symbols: [],
      depth: 2,
    };
    const data: BlastResponse = {
      ...populatedData,
      endpoints: [...populatedData.endpoints, unattributed],
      counts: { ...populatedData.counts, endpoints: 2 },
    };
    useBlast.mockReturnValue({ data, isLoading: false, isFetching: false });

    renderWithIntl(<BlastTab prId="pr-1" repoFullName="acme/repo" headSha="sha1" diffFiles={[]} />);

    // The stat chip reflects the true flat count…
    expect(screen.getByText("2 endpoints")).toBeInTheDocument();
    expect(screen.getByText("Affected endpoints (2)")).toBeInTheDocument();
    // …the attributed endpoint renders twice (per-symbol chip + full list);
    // the unattributed one ONLY shows up in the full list — without this
    // section it would never render anywhere at all.
    expect(screen.getAllByRole("link", { name: "Open POST /checkout on GitHub" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Open POST /refund on GitHub" })).toHaveLength(1);
  });

  it("sinks zero-caller symbols to the end of the tree by default", () => {
    useBlast.mockReturnValue({ data: sortFixtureData, isLoading: false, isFetching: false });

    renderWithIntl(<BlastTab prId="pr-1" repoFullName="acme/repo" headSha="sha1" diffFiles={[]} />);

    expect(symbolNamesInOrder()).toEqual(["lowSym()", "highSym()", "emptySym()"]);
  });

  it("clicking a stat chip sorts the symbol tree by that metric, toggling direction on repeat clicks", () => {
    useBlast.mockReturnValue({ data: sortFixtureData, isLoading: false, isFetching: false });

    renderWithIntl(<BlastTab prId="pr-1" repoFullName="acme/repo" headSha="sha1" diffFiles={[]} />);

    const callersChip = screen.getByRole("button", { name: "12 callers" });
    fireEvent.click(callersChip);
    expect(callersChip).toHaveAttribute("aria-pressed", "true");
    expect(symbolNamesInOrder()).toEqual(["highSym()", "lowSym()", "emptySym()"]);

    fireEvent.click(callersChip);
    expect(symbolNamesInOrder()).toEqual(["emptySym()", "lowSym()", "highSym()"]);
  });

  it("expand/collapse-all checkbox overrides every row's own expanded state", () => {
    useBlast.mockReturnValue({ data: twoImpactsData, isLoading: false, isFetching: false });

    renderWithIntl(<BlastTab prId="pr-1" repoFullName="acme/repo" headSha="sha1" diffFiles={[]} />);

    // Second symbol starts collapsed (only index 0 auto-expands).
    expect(
      screen.queryByRole("link", { name: "server/src/routes/admin.ts:10" }),
    ).not.toBeInTheDocument();

    const expandAll = screen.getByRole("checkbox", { name: "Expand all" });
    fireEvent.click(expandAll);
    expect(screen.getByRole("link", { name: "server/src/routes/admin.ts:10" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "server/src/routes/checkout.ts:42" })).toBeInTheDocument();

    fireEvent.click(expandAll);
    expect(
      screen.queryByRole("link", { name: "server/src/routes/admin.ts:10" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "server/src/routes/checkout.ts:42" }),
    ).not.toBeInTheDocument();
  });

  it("renders the Prior PRs block from prior_pulls and hides it when there is no history", () => {
    const withHistory: BlastResponse = {
      ...populatedData,
      prior_pulls: [
        {
          number: 482,
          title: "Add rate limiting to checkout",
          author: "alice",
          opened_at: "2026-06-01T12:00:00.000Z",
          url: "https://github.com/acme/repo/pull/482",
        },
      ],
    };
    useBlast.mockReturnValue({ data: withHistory, isLoading: false, isFetching: false });
    const { rerender } = renderWithIntl(<BlastTab prId="pr-1" repoFullName="acme/repo" headSha="sha1" diffFiles={[]} />);

    expect(screen.getByText("Prior PRs touching these files 1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add rate limiting to checkout" })).toHaveAttribute(
      "href",
      "https://github.com/acme/repo/pull/482",
    );

    useBlast.mockReturnValue({
      data: { ...withHistory, prior_pulls: [] },
      isLoading: false,
      isFetching: false,
    });
    rerender(wrap(<BlastTab prId="pr-1" repoFullName="acme/repo" headSha="sha1" diffFiles={[]} />));
    expect(screen.queryByText(/Prior PRs touching these files/)).not.toBeInTheDocument();
  });

  it("enables Explain on a degraded/partial index (the server now allows it there too), with a visible label — not just an icon", () => {
    const degradedWithImpact: BlastResponse = {
      ...populatedData,
      index: { ...populatedData.index, status: "degraded", degraded: true, reason: "stale index" },
    };
    useBlast.mockReturnValue({ data: degradedWithImpact, isLoading: false, isFetching: false });

    renderWithIntl(<BlastTab prId="pr-1" repoFullName="acme/repo" headSha="sha1" diffFiles={[]} />);

    const explainBtn = screen.getByRole("button", { name: "Explain" });
    expect(explainBtn).not.toBeDisabled();
    // Visible text, not just an aria-label/title tooltip on a bare icon.
    expect(screen.getByText("Explain")).toBeInTheDocument();
  });

  it("shows the AI summary once the explain-variant query resolves after clicking Explain", () => {
    useBlast.mockImplementation((_prId: unknown, options?: { explain?: boolean }) =>
      options?.explain
        ? {
            data: { ...populatedData, explanation: "Refund retries may double-charge customers." },
            isLoading: false,
            isFetching: false,
          }
        : { data: populatedData, isLoading: false, isFetching: false },
    );

    renderWithIntl(<BlastTab prId="pr-1" repoFullName="acme/repo" headSha="sha1" diffFiles={[]} />);

    expect(
      screen.queryByText("Refund retries may double-charge customers."),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Explain" }));

    expect(screen.getByText("Refund retries may double-charge customers.")).toBeInTheDocument();
  });

  it("shows explicit feedback (not a silent no-op) when Explain resolves with a null explanation", () => {
    useBlast.mockImplementation((_prId: unknown, options?: { explain?: boolean }) =>
      options?.explain
        ? { data: { ...populatedData, explanation: null }, isLoading: false, isFetching: false }
        : { data: populatedData, isLoading: false, isFetching: false },
    );

    renderWithIntl(<BlastTab prId="pr-1" repoFullName="acme/repo" headSha="sha1" diffFiles={[]} />);

    expect(screen.queryByText("Couldn't generate a summary for this PR.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Explain" }));

    expect(screen.getByText("Couldn't generate a summary for this PR.")).toBeInTheDocument();
  });

  it("shows nothing while the explain-variant query is still in flight (no premature 'unavailable' flash)", () => {
    useBlast.mockImplementation((_prId: unknown, options?: { explain?: boolean }) =>
      options?.explain
        ? { data: populatedData, isLoading: false, isFetching: true }
        : { data: populatedData, isLoading: false, isFetching: false },
    );

    renderWithIntl(<BlastTab prId="pr-1" repoFullName="acme/repo" headSha="sha1" diffFiles={[]} />);
    // Pre-click: `explain` is still false, so the label is "Explain" — the
    // "Explaining…" swap only happens once `explain` flips true post-click.
    fireEvent.click(screen.getByRole("button", { name: "Explain" }));

    expect(screen.getByRole("button", { name: "Explaining…" })).toBeInTheDocument();
    expect(screen.queryByText("Couldn't generate a summary for this PR.")).not.toBeInTheDocument();
    expect(screen.queryByText("AI summary")).not.toBeInTheDocument();
  });

  it("a changed symbol's name click focuses its own file (always in-diff; no line in its contract)", () => {
    const onFocusFile = vi.fn();
    useBlast.mockReturnValue({ data: populatedData, isLoading: false, isFetching: false });

    renderWithIntl(
      <BlastTab prId="pr-1" repoFullName="acme/repo" headSha="sha1" diffFiles={[]} onFocusFile={onFocusFile} />,
    );

    fireEvent.click(screen.getByText("processPayment()"));
    expect(onFocusFile).toHaveBeenCalledWith("server/src/payments.ts", null);
  });

  it("an in-diff caller focuses in-app (Files-changed tab) instead of linking out to GitHub", () => {
    const onFocusFile = vi.fn();
    useBlast.mockReturnValue({ data: populatedData, isLoading: false, isFetching: false });

    renderWithIntl(
      <BlastTab
        prId="pr-1"
        repoFullName="acme/repo"
        headSha="sha1"
        diffFiles={["server/src/routes/checkout.ts"]}
        onFocusFile={onFocusFile}
      />,
    );

    expect(
      screen.queryByRole("link", { name: "server/src/routes/checkout.ts:42" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "server/src/routes/checkout.ts:42" }));
    expect(onFocusFile).toHaveBeenCalledWith("server/src/routes/checkout.ts", 42);
  });

  it("an off-diff caller keeps linking out to GitHub (unchanged behavior)", () => {
    useBlast.mockReturnValue({ data: populatedData, isLoading: false, isFetching: false });

    renderWithIntl(<BlastTab prId="pr-1" repoFullName="acme/repo" headSha="sha1" diffFiles={[]} />);

    expect(screen.getByRole("link", { name: "server/src/routes/checkout.ts:42" })).toHaveAttribute(
      "href",
      "https://github.com/acme/repo/blob/sha1/server/src/routes/checkout.ts#L42",
    );
  });

  it("an in-diff endpoint focuses in-app (file only, no line) instead of linking out to GitHub", () => {
    const onFocusFile = vi.fn();
    useBlast.mockReturnValue({ data: populatedData, isLoading: false, isFetching: false });

    renderWithIntl(
      <BlastTab
        prId="pr-1"
        repoFullName="acme/repo"
        headSha="sha1"
        diffFiles={["server/src/routes/checkout.ts"]}
        onFocusFile={onFocusFile}
      />,
    );

    expect(
      screen.queryByRole("link", { name: "Open POST /checkout on GitHub" }),
    ).not.toBeInTheDocument();
    // Renders twice (per-symbol chip + the "Affected endpoints" full list).
    const endpointBtns = screen.getAllByRole("button", { name: "Open POST /checkout in Files changed" });
    expect(endpointBtns).toHaveLength(2);
    fireEvent.click(endpointBtns[0]!);
    expect(onFocusFile).toHaveBeenCalledWith("server/src/routes/checkout.ts", null);
  });
});
