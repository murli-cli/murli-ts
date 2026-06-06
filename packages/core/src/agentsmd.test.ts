import { describe, expect, it } from "vitest";
import { formatAgentsMd } from "./agentsmd.js";
import { defaultCapabilities } from "./schema.js";

describe("formatAgentsMd", () => {
  it("renders the expected stub", () => {
    const md = formatAgentsMd({
      name: "riffle",
      summary: "Riffle semantic search",
      schemaVersion: "1.0",
      capabilities: defaultCapabilities(),
      commands: [
        {
          name: "query",
          summary: "Search",
          agentDescription: "Searches the semantic index.",
          idempotent: true,
          safety: { readOnly: true, idempotent: true },
        },
      ],
    });
    expect(md).toBe(
      [
        "# AGENTS.md",
        "",
        "> Auto-generated from `riffle describe`. Edit to add project context.",
        "",
        "## Tool: riffle",
        "",
        "Riffle semantic search",
        "",
        "## Introspection",
        "",
        "```bash",
        "riffle describe        # full JSON schema",
        "riffle --help          # human-readable help",
        "```",
        "",
        "## Schema Version",
        "",
        "`1.0`",
        "",
        "## Commands",
        "",
        "### query",
        "",
        "Searches the semantic index.",
        "",
        "```bash",
        "riffle query --schema    # JSON schema for this command",
        "```",
        "",
      ].join("\n"),
    );
  });
});
