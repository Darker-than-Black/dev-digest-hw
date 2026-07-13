import { describe, it, expect } from "vitest";
import type { Skill } from "@devdigest/shared";
import { filterSkills, TYPE_COLOR, SOURCE_ICON } from "./helpers";

const mk = (over: Partial<Skill>): Skill => ({
  id: "1",
  name: "pr-quality-rubric",
  description: "Rubric for PR quality",
  type: "rubric",
  source: "manual",
  body: "",
  enabled: true,
  version: 1,
  evidence_files: null,
  ...over,
});

describe("filterSkills", () => {
  const skills = [
    mk({ id: "1", name: "pr-quality-rubric", description: "Rubric for PR quality" }),
    mk({ id: "2", name: "secret-leakage-gate", description: "Detects sk_live tokens" }),
  ];

  it("returns all when the query is blank", () => {
    expect(filterSkills(skills, "  ")).toHaveLength(2);
  });

  it("matches on slug and description, case-insensitively", () => {
    expect(filterSkills(skills, "RUBRIC").map((s) => s.id)).toEqual(["1"]);
    expect(filterSkills(skills, "sk_live").map((s) => s.id)).toEqual(["2"]);
  });
});

describe("skill meta maps", () => {
  it("has a color for every type and an icon for every source", () => {
    expect(TYPE_COLOR.security).toBeTruthy();
    expect(SOURCE_ICON.imported_url).toBe("Upload");
  });
});
