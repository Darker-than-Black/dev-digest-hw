import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, screen, cleanup, within, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en/shell.json";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiffResponse } from "@devdigest/shared";
import { SmartDiffViewer } from "./SmartDiffViewer";

afterEach(cleanup);

beforeAll(() => {
  // jsdom doesn't implement scrollIntoView.
  Element.prototype.scrollIntoView = () => {};
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

/** The disclosure header (`role="button"`) ancestor of a file's path text. */
function fileHeader(path: string): HTMLElement {
  return screen.getByText(path).closest('[role="button"]') as HTMLElement;
}

function finding(o: Partial<FindingRecord> & Pick<FindingRecord, "file" | "start_line">): FindingRecord {
  return {
    id: `f-${o.file}-${o.start_line}`,
    severity: "CRITICAL",
    category: "bug",
    title: "issue",
    end_line: o.start_line,
    rationale: "because",
    confidence: 0.9,
    review_id: "review-1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

// Core file: a real patch whose 3rd rendered line lands on newNo=3 (matches
// the finding's start_line) so the gutter/pill + jump anchor can be asserted.
const CORE_PATCH = "@@ -1,2 +1,3 @@\n context\n+added line\n+finding line";
// Boilerplate file WITH a finding: newNo=5 lands on the "+finding" line.
const BOILERPLATE_FLAGGED_PATCH = "@@ -1,1 +1,5 @@\n context\n+a\n+b\n+c\n+finding";

const files: PrFile[] = [
  { path: "server/src/service.ts", additions: 2, deletions: 0, patch: CORE_PATCH },
  { path: "client/src/lib/hooks/index.ts", additions: 1, deletions: 0, patch: null },
  { path: "package-lock.json", additions: 4000, deletions: 4000, patch: "@@ -1,1 +1,1 @@\n-a\n+b" },
  { path: "dist/bundle.js", additions: 10, deletions: 2, patch: BOILERPLATE_FLAGGED_PATCH },
];

function smartDiff(tooBig: boolean): SmartDiffResponse {
  return {
    groups: [
      {
        role: "core",
        files: [
          {
            path: "server/src/service.ts",
            pseudocode_summary: null,
            additions: 2,
            deletions: 0,
            finding_lines: [3],
          },
        ],
      },
      {
        role: "wiring",
        files: [
          {
            path: "client/src/lib/hooks/index.ts",
            pseudocode_summary: null,
            additions: 1,
            deletions: 0,
            finding_lines: [],
          },
        ],
      },
      {
        role: "boilerplate",
        files: [
          {
            path: "package-lock.json",
            pseudocode_summary: null,
            additions: 4000,
            deletions: 4000,
            finding_lines: [],
          },
          {
            path: "dist/bundle.js",
            pseudocode_summary: null,
            additions: 10,
            deletions: 2,
            finding_lines: [5],
          },
        ],
      },
    ],
    split_suggestion: tooBig
      ? { too_big: true, total_lines: 4013, proposed_splits: [{ name: "server", files: ["server/src/service.ts"] }] }
      : { too_big: false, total_lines: 4013, proposed_splits: [] },
  };
}

const reviewRow: ReviewRecord = {
  id: "review-1",
  pr_id: "pr-1",
  agent_id: "agent-1",
  run_id: "run-1",
  agent_name: "Reviewer",
  kind: "review",
  verdict: "comment",
  summary: "ok",
  score: 70,
  model: "m",
  created_at: "2026-07-01T00:00:00.000Z",
  findings: [
    finding({ file: "server/src/service.ts", start_line: 3 }),
    finding({ file: "dist/bundle.js", start_line: 5, severity: "WARNING" }),
  ],
};

describe("SmartDiffViewer", () => {
  it("orders groups core→wiring→boilerplate, collapses boilerplate by default except flagged files, badges only flagged files, and degrades a null patch to the noDiff copy", () => {
    renderWithIntl(<SmartDiffViewer smartDiff={smartDiff(false)} files={files} findings={reviewRow.findings} />);

    // Flagged core file: red dot + "N findings" badge, expanded (finding line visible).
    const coreHeader = fileHeader("server/src/service.ts");
    expect(coreHeader).toHaveAttribute("aria-expanded", "true");
    expect(within(coreHeader).getByRole("button", { name: /finding/i })).toBeInTheDocument();
    expect(screen.getByText("finding line")).toBeInTheDocument();
    expect(document.querySelector('[data-diff-line="server/src/service.ts:3"]')).not.toBeNull();

    // Unflagged wiring file: auto-expanded (small churn), null patch → noDiff copy, no findings badge.
    const wiringHeader = fileHeader("client/src/lib/hooks/index.ts");
    expect(wiringHeader).toHaveAttribute("aria-expanded", "true");
    expect(within(wiringHeader).queryByRole("button", { name: /finding/i })).not.toBeInTheDocument();
    expect(
      screen.getAllByText("No diff text available (binary or unfetched patch).").length,
    ).toBeGreaterThan(0);

    // Boilerplate, no findings: collapsed by default, no badge.
    const pkgHeader = fileHeader("package-lock.json");
    expect(pkgHeader).toHaveAttribute("aria-expanded", "false");
    expect(within(pkgHeader).queryByRole("button", { name: /finding/i })).not.toBeInTheDocument();

    // Boilerplate WITH a finding: force-expanded despite the collapse default, badge present.
    const distHeader = fileHeader("dist/bundle.js");
    expect(distHeader).toHaveAttribute("aria-expanded", "true");
    expect(within(distHeader).getByRole("button", { name: /finding/i })).toBeInTheDocument();
    expect(document.querySelector('[data-diff-line="dist/bundle.js:5"]')).not.toBeNull();
  });

  it("clicking a findings badge jumps to and flashes the file's first flagged line, and the split banner only renders when too_big", async () => {
    const { rerender } = renderWithIntl(
      <SmartDiffViewer smartDiff={smartDiff(false)} files={files} findings={reviewRow.findings} />,
    );
    expect(screen.queryByText("This PR looks big for one review pass")).not.toBeInTheDocument();

    const coreHeader = fileHeader("server/src/service.ts");
    const badge = within(coreHeader).getByRole("button", { name: /finding/i });
    fireEvent.click(badge);

    await waitFor(() => {
      const el = document.querySelector('[data-diff-line="server/src/service.ts:3"]');
      expect(el).toHaveClass("dd-finding-flash");
    });

    rerender(
      <NextIntlClientProvider locale="en" messages={{ shell: messages }}>
        <SmartDiffViewer smartDiff={smartDiff(true)} files={files} findings={reviewRow.findings} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("This PR looks big for one review pass")).toBeInTheDocument();
  });

  it("clicking a per-line severity pill calls onOpenFinding with that line's finding id (reverse nav to the Findings tab)", () => {
    const onOpenFinding = vi.fn();
    renderWithIntl(
      <SmartDiffViewer
        smartDiff={smartDiff(false)}
        files={files}
        findings={reviewRow.findings}
        onOpenFinding={onOpenFinding}
      />,
    );

    const lineEl = document.querySelector('[data-diff-line="server/src/service.ts:3"]') as HTMLElement;
    const pill = within(lineEl).getByRole("button", { name: "Open this finding in Review runs" });
    fireEvent.click(pill);

    expect(onOpenFinding).toHaveBeenCalledWith("f-server/src/service.ts-3");
  });

  it("gives every rendered line a data-diff-line anchor (not just flagged ones) so a finding from an older run — absent from this overlay — still scrolls+flashes", async () => {
    // newNo=2 ("added line") carries no finding overlay in this file's `findings`
    // (only newNo=3 does) — mirrors an older run's finding with no `finding_lines`
    // entry. focusTarget simulates the resolved file:line for that finding id.
    renderWithIntl(
      <SmartDiffViewer
        smartDiff={smartDiff(false)}
        files={files}
        findings={reviewRow.findings}
        focusTarget={{ file: "server/src/service.ts", line: 2, nonce: 1 }}
      />,
    );

    const el = document.querySelector('[data-diff-line="server/src/service.ts:2"]');
    expect(el).not.toBeNull();
    // Unflagged: no severity pill on this line.
    expect(within(el as HTMLElement).queryByRole("button")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(el).toHaveClass("dd-finding-flash");
    });
  });
});
