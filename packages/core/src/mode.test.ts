import { describe, expect, it } from "vitest";
import { resolveMode } from "./mode.js";

describe("resolveMode", () => {
  it("TTY stdout with no agent flag is human mode", () => {
    expect(resolveMode({ agentMode: false, outputFormat: "", stdoutIsTTY: true }).isTTY).toBe(true);
  });

  it("piped stdout defaults to agent mode", () => {
    expect(resolveMode({ agentMode: false, outputFormat: "", stdoutIsTTY: false }).isTTY).toBe(false);
  });

  it("--agent forces agent mode even on a TTY", () => {
    expect(resolveMode({ agentMode: true, outputFormat: "", stdoutIsTTY: true }).isTTY).toBe(false);
  });

  it("--output text forces human mode even when piped", () => {
    expect(resolveMode({ agentMode: false, outputFormat: "text", stdoutIsTTY: false }).isTTY).toBe(true);
  });

  it("--output json/ndjson forces agent mode even on a TTY", () => {
    expect(resolveMode({ agentMode: false, outputFormat: "json", stdoutIsTTY: true }).isTTY).toBe(false);
    expect(resolveMode({ agentMode: false, outputFormat: "ndjson", stdoutIsTTY: true }).isTTY).toBe(false);
  });
});
