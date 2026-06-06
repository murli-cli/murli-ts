import { describe, expect, it } from "vitest";
import {
  applyFlagAnnotation,
  capabilitiesToWire,
  commandSchemaToWire,
  defaultCapabilities,
  describeOutputToWire,
  type FlagSchema,
  safetyFromMetadata,
} from "./schema.js";

describe("schema", () => {
  it("applyFlagAnnotation merges one-way and deep-copies slices", () => {
    const fs: FlagSchema = { name: "token", type: "string", default: null, description: "" };
    const src = ["a"];
    applyFlagAnnotation(fs, { sensitive: true, env: "TOK", enum: src });
    expect(fs.sensitive).toBe(true);
    expect(fs.env).toBe("TOK");
    expect(fs.enum).toEqual(["a"]);
    expect(fs.enum).not.toBe(src);
  });

  it("safety derives read_only from mutating", () => {
    expect(safetyFromMetadata({ mutating: false, idempotent: true })).toEqual({
      readOnly: true,
      idempotent: true,
    });
    expect(safetyFromMetadata({ mutating: true, destructive: true, dryRunnable: true })).toEqual({
      readOnly: false,
      idempotent: false,
      destructive: true,
      dryRunSupported: true,
    });
  });

  it("commandSchemaToWire emits Go key order and snake_case", () => {
    const wire = commandSchemaToWire({
      name: "delete",
      summary: "Delete a thing",
      idempotent: false,
      mutating: true,
      arguments: [{ name: "id", type: "int", required: true, description: "the id" }],
      flags: [{ name: "force", type: "bool", default: false, description: "skip guard" }],
      safety: { readOnly: false, idempotent: false, destructive: true, dryRunSupported: true },
    });
    expect(Object.keys(wire)).toEqual([
      "name",
      "summary",
      "idempotent",
      "mutating",
      "arguments",
      "flags",
      "safety",
    ]);
    expect(wire.arguments).toEqual([{ name: "id", type: "int", required: true, description: "the id" }]);
    expect(wire.flags).toEqual([{ name: "force", type: "bool", default: false, description: "skip guard" }]);
    expect(wire.safety).toEqual({ read_only: false, idempotent: false, destructive: true, dry_run_supported: true });
  });

  it("defaultCapabilities + capabilitiesToWire shape", () => {
    const wire = capabilitiesToWire(defaultCapabilities());
    expect(wire).toMatchObject({
      streaming: true,
      dry_run: false,
      output_formats: ["json", "ndjson", "text"],
      schema_version: "1.0",
      profiles: true,
    });
    expect(Object.keys(wire)).toEqual([
      "streaming",
      "dry_run",
      "output_formats",
      "schema_version",
      "profiles",
    ]);
  });

  it("describeOutputToWire nests commands and capabilities", () => {
    const wire = describeOutputToWire({
      name: "mytool",
      summary: "demo",
      schemaVersion: "1.0",
      capabilities: defaultCapabilities(),
      commands: [
        { name: "get", summary: "get a thing", idempotent: true, safety: { readOnly: true, idempotent: true } },
      ],
    });
    expect(Object.keys(wire)).toEqual(["name", "summary", "schema_version", "capabilities", "commands"]);
    expect((wire.commands as unknown[]).length).toBe(1);
  });
});
