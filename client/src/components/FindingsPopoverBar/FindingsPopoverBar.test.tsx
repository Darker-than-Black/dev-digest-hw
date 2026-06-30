import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { FindingRecord } from "@devdigest/shared";
import { FindingsPopoverBar } from "./FindingsPopoverBar";

afterEach(cleanup);

const CRIT: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 12,
  end_line: 12,
  rationale: "A live Stripe key is committed in source.",
  suggestion: null,
  confidence: 0.98,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

const COUNTS = { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 };

describe("FindingsPopoverBar", () => {
  it("opens a popover for the clicked severity and navigates on finding click", () => {
    const onSelect = vi.fn();
    render(
      <FindingsPopoverBar counts={COUNTS} findings={[CRIT]} onSelectFinding={onSelect} hideZero />,
    );

    // Closed initially.
    expect(screen.queryByText("Hardcoded Stripe secret key")).not.toBeInTheDocument();

    // Click the CRITICAL counter (only one button rendered with hideZero).
    fireEvent.click(screen.getByRole("button"));

    // Popover lists the finding + its file:line.
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts:12")).toBeInTheDocument();

    // Clicking the finding navigates + closes.
    fireEvent.click(screen.getByText("Hardcoded Stripe secret key"));
    expect(onSelect).toHaveBeenCalledWith(CRIT);
    expect(screen.queryByText("src/config.ts:12")).not.toBeInTheDocument();
  });

  it("fires onOpenSeverity so the host can lazy-load findings", () => {
    const onOpen = vi.fn();
    render(
      <FindingsPopoverBar
        counts={COUNTS}
        findings={undefined}
        loading
        onOpenSeverity={onOpen}
        onSelectFinding={vi.fn()}
        hideZero
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalledWith("CRITICAL");
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });
});
