import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { AgentError } from "./errors.js";
import { Writer } from "./writer.js";

function goldenDir(): string {
  return fileURLToPath(new URL("../../../testdata/golden/", import.meta.url));
}
function golden(name: string): unknown {
  return JSON.parse(readFileSync(`${goldenDir()}${name}`, "utf8"));
}
function capture() {
  const out: string[] = [];
  const err: string[] = [];
  const mk = (b: string[]) =>
    ({ write: (s: string) => (b.push(s), true) }) as unknown as NodeJS.WritableStream;
  return { out, err, stdout: mk(out), stderr: mk(err) };
}

describe("golden parity with murli-go", () => {
  it("success envelope", () => {
    const c = capture();
    const w = new Writer({ stdout: c.stdout, stderr: c.stderr, agentMode: true });
    w.writeSuccess("Found 1", { count: 1, key: "value" });
    expect(JSON.parse(c.out.join(""))).toEqual(golden("success_envelope.json"));
  });

  it("plan envelope", () => {
    const c = capture();
    const w = new Writer({ stdout: c.stdout, stderr: c.stderr, agentMode: true });
    w.writePlan("plan", { count: 3, files: ["a", "b", "c"] });
    expect(JSON.parse(c.out.join(""))).toEqual(golden("plan_envelope.json"));
  });

  it("error envelope", () => {
    const c = capture();
    const w = new Writer({ stdout: c.stdout, stderr: c.stderr, agentMode: true, exitFn: vi.fn() });
    w.writeError(
      new AgentError({
        code: 1,
        error: "invalid_input",
        message: "the --region flag is required",
        suggestion: "Pass --region us-east-1",
        recoverable: true,
      }),
    );
    expect(JSON.parse(c.err.join(""))).toEqual(golden("error_envelope.json"));
  });
});
