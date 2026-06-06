import { describe, expect, it, vi } from "vitest";
import { newUserError } from "./errors.js";
import { Writer } from "./writer.js";

function sink() {
  const out: string[] = [];
  const err: string[] = [];
  const stream = (buf: string[]) =>
    ({
      write: (s: string) => {
        buf.push(s);
        return true;
      },
    }) as unknown as NodeJS.WritableStream;
  return { out, err, stdout: stream(out), stderr: stream(err) };
}

function agentWriter(extra: Record<string, unknown> = {}) {
  const s = sink();
  const exitFn = vi.fn();
  const w = new Writer({ stdout: s.stdout, stderr: s.stderr, agentMode: true, exitFn, ...extra });
  return { w, s, exitFn };
}

describe("Writer", () => {
  it("writeSuccess in agent mode emits the ok envelope (no message field)", () => {
    const { w, s } = agentWriter();
    w.writeSuccess("Found 1 result", { count: 1, key: "value" });
    const obj = JSON.parse(s.out.join(""));
    expect(obj).toEqual({
      result: { count: 1, key: "value" },
      schema_version: "1.0",
      status: "ok",
    });
    expect(Object.keys(obj)).toEqual(["result", "schema_version", "status"]);
  });

  it("writePlan emits status plan using the result key", () => {
    const { w, s } = agentWriter();
    w.writePlan("would delete", { would_delete: "x" });
    const obj = JSON.parse(s.out.join(""));
    expect(obj.status).toBe("plan");
    expect(obj.result).toEqual({ would_delete: "x" });
    expect("plan" in obj).toBe(false);
  });

  it("ndjson success is single-line minified", () => {
    const { w, s } = agentWriter({ outputFormat: "ndjson" });
    w.writeSuccess("h", { a: 1 });
    expect(s.out.join("")).toBe('{"result":{"a":1},"schema_version":"1.0","status":"ok"}\n');
  });

  it("TTY/text mode prints only human text", () => {
    const s = sink();
    const w = new Writer({ stdout: s.stdout, stderr: s.stderr, outputFormat: "text" });
    w.writeSuccess("Found 1 result", { count: 1 });
    expect(s.out.join("")).toBe("Found 1 result\n");
  });

  it("writeError emits envelope to stderr and calls exitFn with the code", () => {
    const { w, s, exitFn } = agentWriter();
    w.writeError(newUserError("bad", "fix"));
    expect(exitFn).toHaveBeenCalledWith(1);
    const obj = JSON.parse(s.err.join(""));
    expect(obj.code).toBe(1);
    expect(obj.error).toBe("user_error");
    expect(s.out).toHaveLength(0);
  });

  it("writeError in TTY mode prints Error/Hint", () => {
    const s = sink();
    const exitFn = vi.fn();
    const w = new Writer({ stdout: s.stdout, stderr: s.stderr, outputFormat: "text", exitFn });
    w.writeError(newUserError("bad", "fix"));
    expect(s.err.join("")).toBe("Error: bad\nHint:  fix\n");
  });

  it("writeEvent is NDJSON in agent mode and a no-op in TTY", () => {
    const { w, s } = agentWriter();
    w.writeEvent({ event: "chunk", data: "a" });
    expect(s.out.join("")).toBe('{"event":"chunk","data":"a"}\n');

    const t = sink();
    const wt = new Writer({ stdout: t.stdout, stderr: t.stderr, outputFormat: "text" });
    wt.writeEvent({ event: "chunk" });
    expect(t.out).toHaveLength(0);
  });

  it("writeProgress in agent mode is raw struct JSON to stderr (no event wrapper)", () => {
    const { w, s } = agentWriter();
    w.writeProgress({ stage: "read", current: 1, total: 3, percent: 33, etaMs: 4200 });
    expect(s.err.join("")).toBe(
      '{"stage":"read","current":1,"total":3,"percent":33,"eta_ms":4200}\n',
    );
  });

  it("exposes state flags", () => {
    const { w } = agentWriter({ force: true, dryRun: true });
    expect(w.isForced()).toBe(true);
    expect(w.isDryRun()).toBe(true);
    expect(w.isTTY()).toBe(false);
    expect(w.protocolVersion()).toBe("0.2");
  });

  it("emits <, >, & literally (HTML escaping is off)", () => {
    const { w, s } = agentWriter();
    w.writeSuccess("h", { tag: "<x> & </x>" });
    const raw = s.out.join("");
    expect(raw).toContain("<x> & </x>");
    expect(raw).not.toContain("\\u003c");
    expect(raw).not.toContain("\\u0026");
  });

  it("error envelope has no status field", () => {
    const { w, s } = agentWriter();
    w.writeError(newUserError("bad", "fix"));
    const obj = JSON.parse(s.err.join(""));
    expect("status" in obj).toBe(false);
  });
});
