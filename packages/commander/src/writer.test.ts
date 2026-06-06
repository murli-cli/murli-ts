import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { newWriter, normalizeOutput } from "./writer.js";

describe("newWriter", () => {
  it("normalizeOutput accepts only valid formats", () => {
    expect(normalizeOutput("ndjson")).toBe("ndjson");
    expect(normalizeOutput("bogus")).toBe("");
    expect(normalizeOutput(undefined)).toBe("");
  });

  it("reads injected flags from merged options", () => {
    const program = new Command("t");
    program.option("--agent").option("--force").option("--dry-run").option("--output <f>");
    program.parse(["node", "t", "--agent", "--force", "--dry-run", "--output", "ndjson"]);
    const w = newWriter(program);
    expect(w.isForced()).toBe(true);
    expect(w.isDryRun()).toBe(true);
    expect(w.format()).toBe("ndjson");
    expect(w.isTTY()).toBe(false);
  });
});
