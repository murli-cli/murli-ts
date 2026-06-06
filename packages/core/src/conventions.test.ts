import { describe, expect, it } from "vitest";
import { checkConventions } from "./conventions.js";

describe("checkConventions", () => {
  it("flags non-conventional verbs and flags with advisories", () => {
    const lines: string[] = [];
    const count = checkConventions(["fetch", "get"], ["format"], (s) => lines.push(s));
    expect(count).toBe(2);
    expect(lines[0]).toBe(
      '[murli advisory] command "fetch": prefer "get" (conventional vocabulary)\n',
    );
    expect(lines[1]).toBe(
      "[murli advisory] flag --format: prefer --output (conventional vocabulary)\n",
    );
  });

  it("returns 0 for fully conventional names", () => {
    const count = checkConventions(["get", "list", "create"], ["output", "force"], () => {});
    expect(count).toBe(0);
  });
});
