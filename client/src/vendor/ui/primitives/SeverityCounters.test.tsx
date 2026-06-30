import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SeverityCounters } from "./SeverityCounters";

afterEach(cleanup);

const COUNTS = { CRITICAL: 3, WARNING: 5, SUGGESTION: 2 };

describe("SeverityCounters", () => {
  it("renders the three counts in fixed CRITICAL→WARNING→SUGGESTION order", () => {
    render(<SeverityCounters counts={COUNTS} />);
    // Compact badges render icon + count only; assert the counts and their order.
    const counts = screen.getAllByText(/^\d+$/).map((n) => n.textContent);
    expect(counts).toEqual(["3", "5", "2"]);
  });

  it("hideZero drops zero-count severities", () => {
    render(<SeverityCounters counts={{ CRITICAL: 0, WARNING: 4, SUGGESTION: 0 }} hideZero />);
    const counts = screen.getAllByText(/^\d+$/).map((n) => n.textContent);
    expect(counts).toEqual(["4"]);
  });

  it("display-only mode renders no buttons", () => {
    render(<SeverityCounters counts={COUNTS} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("interactive mode: each severity is a toggle button reflecting aria-pressed", () => {
    const onToggle = vi.fn();
    render(
      <SeverityCounters counts={COUNTS} active={new Set(["CRITICAL"])} onToggle={onToggle} />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
    // First (CRITICAL) is active.
    expect(buttons[0]).toHaveAttribute("aria-pressed", "true");
    expect(buttons[1]).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(buttons[1]!);
    expect(onToggle).toHaveBeenCalledWith("WARNING");
  });
});
