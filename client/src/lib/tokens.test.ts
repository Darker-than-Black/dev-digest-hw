import { describe, it, expect } from "vitest";
import { estimateTokens } from "./tokens";

describe("estimateTokens", () => {
  it("returns 0 for empty / nullish", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens(null)).toBe(0);
    expect(estimateTokens(undefined)).toBe(0);
  });

  it("estimates ~4 chars per token, rounding up", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });
});
