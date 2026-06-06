import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { AgentError } from "./errors.js";
import { Writer } from "./writer.js";

function goldenDir(): string {
  return fileURLToPath(new URL("../../../testdata/golden/", import.meta.url));
}
function goldenText(name: string): string {
  return readFileSync(`${goldenDir()}${name}`, "utf8");
}
function capture() {
  const out: string[] = [];
  const err: string[] = [];
  const mk = (b: string[]) =>
    ({
      write: (s: string) => {
        b.push(s);
        return true;
      },
    }) as unknown as NodeJS.WritableStream;
  return { out, err, stdout: mk(out), stderr: mk(err) };
}

describe("golden parity with murli-go", () => {
  it("success envelope", () => {
    const c = capture();
    const w = new Writer({ stdout: c.stdout, stderr: c.stderr, agentMode: true });
    w.writeSuccess("Found 1", { count: 1, key: "value" });
    expect(c.out.join("")).toBe(goldenText("success_envelope.json"));
  });

  it("plan envelope", () => {
    const c = capture();
    const w = new Writer({ stdout: c.stdout, stderr: c.stderr, agentMode: true });
    w.writePlan("plan", { count: 3, files: ["a", "b", "c"] });
    expect(c.out.join("")).toBe(goldenText("plan_envelope.json"));
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
    expect(c.err.join("")).toBe(goldenText("error_envelope.json"));
  });
});
