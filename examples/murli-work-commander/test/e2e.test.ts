import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { runConformance } from "@murli-cli/core";
import { beforeAll, describe, expect, it } from "vitest";

const BIN = fileURLToPath(new URL("../dist/main.js", import.meta.url));

function makeRun() {
  const dir = mkdtempSync(`${tmpdir()}/murli-work-e2e-`);
  return (...args: string[]) =>
    spawnSync("node", [BIN, ...args], {
      encoding: "utf8",
      env: { ...process.env, MURLI_WORK_DIR: dir },
    });
}

describe("murli-work e2e (agent mode)", () => {
  beforeAll(() => {
    expect(
      existsSync(BIN),
      "build the example first: pnpm --filter murli-work-commander build",
    ).toBe(true);
  });

  it("init emits an ok envelope and exits 0", () => {
    const run = makeRun();
    // `init` is annotated mutating, so agent mode requires explicit --force.
    const r = run("init", "--force");
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).status).toBe("ok");
  });

  it("task list returns the 5-task array as result", () => {
    const run = makeRun();
    run("init");
    const r = run("task", "list");
    const env = JSON.parse(r.stdout);
    expect(env.status).toBe("ok");
    expect(Array.isArray(env.result)).toBe(true);
    expect(env.result).toHaveLength(5);
  });

  it("mutating command without --force is rejected in agent mode", () => {
    const run = makeRun();
    run("init");
    const r = run("task", "delete", "1");
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stderr).error).toBe("confirmation_required");
  });

  it("delete --dry-run --force emits a plan envelope", () => {
    const run = makeRun();
    run("init");
    const r = run("task", "delete", "1", "--dry-run", "--force");
    const env = JSON.parse(r.stdout);
    expect(env.status).toBe("plan");
    expect(env.result).toEqual({ would_delete: 1 });
  });

  it("delete --force removes the task", () => {
    const run = makeRun();
    run("init");
    const r = run("task", "delete", "1", "--force");
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).status).toBe("ok");
    expect(JSON.parse(run("task", "list").stdout).result).toHaveLength(4);
  });

  it("not-found yields a code-5 not_found error", () => {
    const run = makeRun();
    run("init");
    const r = run("task", "delete", "999", "--force");
    expect(r.status).toBe(5);
    expect(JSON.parse(r.stderr).error).toBe("not_found");
  });

  it("invalid enum value is rejected with a flag_error envelope and no mutation", () => {
    const run = makeRun();
    run("init", "--force");
    const r = run("task", "create", "x", "--priority", "bogus", "--force");
    expect(r.status).toBe(1);
    expect(r.stdout).toBe("");
    expect(JSON.parse(r.stderr).error).toBe("flag_error");
    expect(JSON.parse(run("task", "list").stdout).result).toHaveLength(5);
  });

  it("describe emits a valid DescribeOutput", () => {
    const run = makeRun();
    const r = run("describe");
    expect(r.status).toBe(0);
    const doc = JSON.parse(r.stdout);
    expect(doc.schema_version).toBe("1.0");
    expect(doc.capabilities.protocol_version).toBe("0.2");
    const names = doc.commands.map((c: { name: string }) => c.name);
    expect(names).toEqual(expect.arrayContaining(["init", "task", "label", "report"]));
    expect(names).not.toContain("describe");
  });

  it("--schema bypasses argument validation", () => {
    const run = makeRun();
    const r = run("task", "create", "--schema");
    expect(r.status).toBe(0);
    const schema = JSON.parse(r.stdout);
    expect(schema.name).toBe("create");
    expect(schema.arguments[0].name).toBe("title");
    expect(schema.safety.read_only).toBe(false);
  });

  it("passes the murli conformance suite", () => {
    const dir = mkdtempSync(`${tmpdir()}/murli-work-conf-`);
    const result = runConformance({ command: ["node", BIN] });
    expect(result.failures).toEqual([]);
    expect(result.passed).toBe(true);
    void dir;
  });
});
