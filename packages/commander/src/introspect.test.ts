import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { buildCommandSchema, buildDescribeTree } from "./introspect.js";
import { annotate } from "./store.js";

function fixture(): Command {
  const program = new Command("mytool").description("demo tool");
  const get = program.command("get <id>").description("get a thing").option("--verbose", "noisy");
  annotate(get, { agentDescription: "Gets it", idempotent: true });
  const del = program.command("delete <id>").description("delete a thing");
  annotate(del, { mutating: true, destructive: true });
  return program;
}

describe("introspect", () => {
  it("buildDescribeTree maps commands, idempotency, and safety", () => {
    const tree = buildDescribeTree(fixture());
    expect(tree.name).toBe("mytool");
    expect(tree.schemaVersion).toBe("1.0");
    const cmds = tree.commands ?? [];
    const get = cmds.find((c) => c.name === "get");
    const del = cmds.find((c) => c.name === "delete");
    expect(get?.idempotent).toBe(true);
    expect(get?.safety.readOnly).toBe(true);
    expect(get?.agentDescription).toBe("Gets it");
    expect(del?.mutating).toBe(true);
    expect(del?.safety.readOnly).toBe(false);
    expect(del?.safety.destructive).toBe(true);
  });

  it("buildCommandSchema extracts arguments and flags", () => {
    const program = fixture();
    const get = program.commands.find((c) => c.name() === "get") as Command;
    const schema = buildCommandSchema(get);
    expect(schema.arguments?.[0]).toEqual({
      name: "id",
      type: "string",
      required: true,
      description: "",
    });
    expect(schema.flags?.some((f) => f.name === "verbose" && f.type === "bool")).toBe(true);
  });
});
