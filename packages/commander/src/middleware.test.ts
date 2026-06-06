import { Command, Option } from "commander";
import { describe, expect, it } from "vitest";
import { run } from "./middleware.js";
import { annotate } from "./store.js";

/** Minimal in-memory stream so error/schema output can be captured without spawning a child. */
class StringSink {
  chunks: string[] = [];
  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }
  text(): string {
    return this.chunks.join("");
  }
}

interface Harness {
  out: StringSink;
  err: StringSink;
  codes: number[];
  /** Last exit code passed to the injected exitFn, or undefined if it was never called. */
  code(): number | undefined;
}

function harness(): Harness {
  const out = new StringSink();
  const err = new StringSink();
  const codes: number[] = [];
  return { out, err, codes, code: () => codes.at(-1) };
}

function invoke(program: Command, h: Harness, args: string[]): Promise<void> {
  return run(program, ["node", "t", ...args], {
    exitFn: (c) => void h.codes.push(c),
    stdout: h.out as unknown as NodeJS.WritableStream,
    stderr: h.err as unknown as NodeJS.WritableStream,
  });
}

describe("run mutation guard", () => {
  it("throws (no action) without --force in agent mode", async () => {
    let ran = false;
    const program = new Command("t");
    const del = program.command("del <id>").action(() => {
      ran = true;
    });
    annotate(del, { mutating: true });

    const h = harness();
    await invoke(program, h, ["del", "1", "--agent"]);

    // The guard throws, so the action never runs even though the injected exitFn does not
    // terminate the process — proving the guard is terminal independent of process.exit.
    expect(ran).toBe(false);
    expect(h.code()).toBe(1);
    const env = JSON.parse(h.err.text()) as { error: string; code: number; recoverable: boolean };
    expect(env.error).toBe("confirmation_required");
    expect(env.code).toBe(1);
    expect(env.recoverable).toBe(true);
  });

  it("runs the action with --force and emits no error", async () => {
    let ran = false;
    const program = new Command("t");
    const del = program.command("del <id>").action(() => {
      ran = true;
    });
    annotate(del, { mutating: true });

    const h = harness();
    await invoke(program, h, ["del", "1", "--force", "--agent"]);

    expect(ran).toBe(true);
    expect(h.code()).toBeUndefined();
    expect(h.err.text()).toBe("");
  });
});

describe("run --schema", () => {
  function schema(text: string): { name: string } {
    return JSON.parse(text) as { name: string };
  }

  it("resolves the targeted command, even when a value-taking global flag precedes it", async () => {
    const program = new Command("t");
    const get = program.command("get <id>").action(() => {});
    annotate(get, { idempotent: true });

    const direct = harness();
    await invoke(program, direct, ["get", "--schema"]);
    expect(direct.code()).toBe(0);
    expect(schema(direct.out.text()).name).toBe("get");

    // B1: `--output json` must not be mistaken for a subcommand and abort traversal.
    const spaced = harness();
    await invoke(program, spaced, ["--output", "json", "get", "--schema"]);
    expect(schema(spaced.out.text()).name).toBe("get");

    const joined = harness();
    await invoke(program, joined, ["--output=json", "get", "--schema"]);
    expect(schema(joined.out.text()).name).toBe("get");

    const root = harness();
    await invoke(program, root, ["--schema"]);
    expect(schema(root.out.text()).name).toBe("t");
  });
});

describe("run error mapping", () => {
  it("maps an invalid .choices() value to a flag_error envelope on stderr (exit 1)", async () => {
    const program = new Command("t");
    const create = program
      .command("create <title>")
      .addOption(new Option("-p, --priority <p>", "priority").choices(["low", "high"]))
      .action(() => {});
    annotate(create, { mutating: true });

    const h = harness();
    await invoke(program, h, ["create", "x", "--priority", "bogus", "--force"]);

    expect(h.code()).toBe(1);
    expect(h.out.text()).toBe("");
    const env = JSON.parse(h.err.text()) as { error: string; code: number };
    expect(env.error).toBe("flag_error");
    expect(env.code).toBe(1);
  });

  it("maps an unknown command to a flag_error envelope on stderr (exit 1)", async () => {
    const program = new Command("t");
    program.command("get <id>").action(() => {});

    const h = harness();
    await invoke(program, h, ["nope"]);

    expect(h.code()).toBe(1);
    const env = JSON.parse(h.err.text()) as { error: string };
    expect(env.error).toBe("flag_error");
  });
});
