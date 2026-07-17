import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/blast.json";
import type { PriorPull } from "@devdigest/shared";
import { PriorPulls } from "./PriorPulls";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const pulls: PriorPull[] = [
  {
    number: 482,
    title: "Add rate limiting to checkout",
    author: "alice",
    opened_at: "2026-06-01T12:00:00.000Z",
    url: "https://github.com/acme/repo/pull/482",
  },
  {
    number: 401,
    title: "Refactor payment retries",
    author: "bob",
    opened_at: null,
    url: null,
  },
];

describe("PriorPulls", () => {
  it("renders nothing when there is no history", () => {
    const { container } = renderWithIntl(<PriorPulls pulls={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders each PR — number, linked title when a url is known, author + date", () => {
    renderWithIntl(<PriorPulls pulls={pulls} />);

    expect(screen.getByText("Prior PRs touching these files 2")).toBeInTheDocument();
    expect(screen.getByText("#482")).toBeInTheDocument();

    const link = screen.getByRole("link", { name: "Add rate limiting to checkout" });
    expect(link).toHaveAttribute("href", "https://github.com/acme/repo/pull/482");

    // No url → plain text, not a link.
    expect(screen.getByText("Refactor payment retries")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Refactor payment retries" }),
    ).not.toBeInTheDocument();

    // Author renders alone when there's no opened_at to pair it with.
    expect(screen.getByText("bob")).toBeInTheDocument();
  });

  it("collapses and re-expands via the header", () => {
    renderWithIntl(<PriorPulls pulls={pulls} />);

    expect(screen.getByText("#482")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Prior PRs touching these files 2" }));
    expect(screen.queryByText("#482")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Prior PRs touching these files 2" }));
    expect(screen.getByText("#482")).toBeInTheDocument();
  });
});
