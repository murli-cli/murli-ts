import {
  AgentError,
  ExitCode,
  type ExitFn,
  type Metadata,
  ProfileStore,
  type ProfilesInfo,
  VALID_OUTPUT_FORMATS,
  checkConventions,
  commandSchemaToWire,
  describeOutputToWire,
  formatAgentsMd,
  newToolError,
  resolveMode,
} from "@murli-cli/core";
import { Command, Option } from "commander";
import { buildCommandSchema, buildDescribeTree, walkCommands } from "./introspect.js";
import { getMetadata, isInternal, markInternal } from "./store.js";
import { newWriter, normalizeOutput } from "./writer.js";

export interface EnableOptions {
  dev?: boolean;
}
export interface RunOptions extends EnableOptions {
  exitFn?: ExitFn;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

/** Where structured errors are emitted and how the process terminates. */
interface ErrorSink {
  exitFn: ExitFn;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}

const enabled = new WeakSet<Command>();

// Commander writes help text to stdout and its own error text to stderr; murli emits
// structured envelopes instead, so error text is suppressed. Applied to EVERY command in
// `enable` because commander copies output config per command at creation time.
const outputConfiguration = {
  writeOut: (s: string) => void process.stdout.write(s),
  writeErr: () => {},
};

function toCamel(flag: string): string {
  return flag.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function isTruthy(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "yes";
}

function addOptionOnce(cmd: Command, flags: string, desc: string): void {
  const long = flags.split(" ")[0];
  if (long && !cmd.options.some((o) => o.long === long)) {
    // Injected flags are hidden from human help (mirrors murli-go).
    cmd.addOption(new Option(flags, desc).hideHelp());
  }
}

function injectGlobalFlags(cmd: Command): void {
  addOptionOnce(cmd, "--agent", "force JSON agent output");
  addOptionOnce(cmd, "--output <format>", "output format: json|ndjson|text");
  addOptionOnce(cmd, "--schema", "print this command's JSON schema and exit");
  addOptionOnce(cmd, "--profile <name>", "use a named flag profile");
}

function injectMutatingFlags(cmd: Command, meta: Metadata): void {
  if (!meta.mutating) return;
  addOptionOnce(cmd, "--force", "bypass the non-interactive mutation guard");
  addOptionOnce(cmd, "--yes", "alias for --force");
  if (meta.dryRunnable) addOptionOnce(cmd, "--dry-run", "preview without making changes");
}

/** Profileable flags relevant to one command (its own annotations plus the root's). */
function collectProfileableFlags(program: Command, cmd: Command): string[] {
  const names = new Set<string>();
  for (const c of [program, cmd]) {
    const anns = getMetadata(c)?.flagAnnotations ?? {};
    for (const [name, ann] of Object.entries(anns)) if (ann.profileable) names.add(name);
  }
  return [...names];
}

/** Every profileable flag anywhere in the command tree (the describe/save contract). */
function allProfileableFlags(program: Command): string[] {
  const names = new Set<string>();
  for (const c of walkCommands(program)) {
    const anns = getMetadata(c)?.flagAnnotations ?? {};
    for (const [name, ann] of Object.entries(anns)) if (ann.profileable) names.add(name);
  }
  return [...names];
}

function anyProfileable(program: Command): boolean {
  return allProfileableFlags(program).length > 0;
}

function buildProfilesInfo(program: Command): ProfilesInfo | undefined {
  const flags = allProfileableFlags(program);
  if (flags.length === 0) return undefined;
  const store = ProfileStore.load(program.name());
  const info: ProfilesInfo = { profileableFlags: flags.sort() };
  const names = store.names();
  if (names.length > 0) info.available = names;
  if (store.default) info.default = store.default;
  return info;
}

function applyProfile(program: Command, cmd: Command, opts: Record<string, unknown>): void {
  const profileable = collectProfileableFlags(program, cmd);
  if (profileable.length === 0) return;
  const store = ProfileStore.load(program.name());
  const name = (typeof opts.profile === "string" && opts.profile) || store.default;
  if (!name) return;
  const profile = store.get(name);
  if (!profile) return;
  for (const flag of profileable) {
    const attr = toCamel(flag);
    const value = profile.flags[flag];
    if (value !== undefined && cmd.getOptionValueSource(attr) !== "cli") {
      cmd.setOptionValue(attr, value);
    }
  }
}

function profileNotFound(name: string): AgentError {
  return new AgentError({
    code: ExitCode.NotFound,
    error: "not_found",
    message: `profile "${name}" not found`,
    recoverable: false,
  });
}

/**
 * preAction guards throw `AgentError` (never write+return): a throw aborts the action even
 * when the injected exitFn does not terminate the process, so the guard is provably terminal
 * and every envelope is emitted through the single `handleError`.
 */
function preAction(program: Command, cmd: Command): void {
  const opts = cmd.optsWithGlobals() as Record<string, unknown>;

  if (
    typeof opts.output === "string" &&
    !(VALID_OUTPUT_FORMATS as readonly string[]).includes(opts.output)
  ) {
    throw new AgentError({
      code: ExitCode.UserError,
      error: "flag_error",
      message: `invalid value "${opts.output}" for --output`,
      suggestion: `Valid values: ${VALID_OUTPUT_FORMATS.join(", ")}.`,
      recoverable: true,
      validValues: [...VALID_OUTPUT_FORMATS],
      field: "output",
    });
  }

  applyProfile(program, cmd, opts);

  const meta = getMetadata(cmd);
  if (meta?.mutating) {
    const { isTTY } = resolveMode({
      agentMode: Boolean(opts.agent),
      outputFormat: normalizeOutput(opts.output),
      stdoutIsTTY: Boolean(process.stdout.isTTY),
    });
    const forced = Boolean(opts.force) || Boolean(opts.yes);
    if (!isTTY && !forced) {
      throw new AgentError({
        code: ExitCode.UserError,
        error: "confirmation_required",
        message: "This command mutates state and requires explicit confirmation.",
        suggestion: "Pass --force or --yes to proceed without a TTY.",
        recoverable: true,
      });
    }
  }
}

function mountDescribe(program: Command): void {
  const cmd = new Command("describe").description("print the full command tree as JSON");
  markInternal(cmd);
  cmd.option("--agents-md", "emit an AGENTS.md stub instead of JSON");
  cmd.action(() => {
    const tree = buildDescribeTree(program, buildProfilesInfo(program));
    const opts = cmd.opts() as Record<string, unknown>;
    if (opts.agentsMd) process.stdout.write(formatAgentsMd(tree));
    else process.stdout.write(`${JSON.stringify(describeOutputToWire(tree), null, 2)}\n`);
  });
  program.addCommand(cmd);
}

function mountProfile(program: Command): void {
  if (!anyProfileable(program)) return;
  const tool = program.name();
  const group = new Command("profile").description("manage saved flag profiles");
  markInternal(group);

  group
    .command("list")
    .description("list profile names")
    .action(() => {
      const store = ProfileStore.load(tool);
      newWriter(group).writeSuccess(store.names().join("\n"), {
        names: store.names(),
        default: store.default,
      });
    });

  group
    .command("save <name>")
    .description("save current profileable flag values")
    .action((name: string) => {
      const store = ProfileStore.load(tool);
      const opts = program.optsWithGlobals() as Record<string, unknown>;
      const flags: Record<string, string> = {};
      for (const f of allProfileableFlags(program)) {
        const v = opts[toCamel(f)];
        if (v !== undefined && v !== false) flags[f] = String(v);
      }
      store.set(name, { flags });
      store.save(tool);
      newWriter(group).writeSuccess(`Saved profile "${name}".`, { name, flags });
    });

  group
    .command("use <name>")
    .description("set the default profile")
    .action((name: string) => {
      const store = ProfileStore.load(tool);
      if (!store.get(name)) throw profileNotFound(name);
      store.setDefault(name);
      store.save(tool);
      newWriter(group).writeSuccess(`Default profile set to "${name}".`, { default: name });
    });

  group
    .command("show <name>")
    .description("show a profile's flag values")
    .action((name: string) => {
      const store = ProfileStore.load(tool);
      const p = store.get(name);
      if (!p) throw profileNotFound(name);
      newWriter(group).writeSuccess(JSON.stringify(p.flags), { name, flags: p.flags });
    });

  group
    .command("delete <name>")
    .description("delete a profile")
    .action((name: string) => {
      const store = ProfileStore.load(tool);
      store.delete(name);
      store.save(tool);
      newWriter(group).writeSuccess(`Deleted profile "${name}".`, { name });
    });

  program.addCommand(group);
}

function mountDoctor(program: Command): void {
  const cmd = new Command("doctor").description("run murli self-checks (dev only)");
  markInternal(cmd);
  cmd.action(() => {
    const tree = buildDescribeTree(program);
    const checks: Array<{ name: string; status: string; message?: string }> = [];
    checks.push({ name: "schema_version", status: tree.schemaVersion === "1.0" ? "pass" : "fail" });
    checks.push({
      name: "output_formats",
      status: (tree.capabilities.outputFormats?.length ?? 0) > 0 ? "pass" : "fail",
    });
    const missing = (tree.commands ?? [])
      .filter((c) => !c.agentDescription && !c.summary)
      .map((c) => c.name);
    checks.push(
      missing.length > 0
        ? {
            name: "command_metadata",
            status: "warn",
            message: `commands missing description: [${missing.join(" ")}]`,
          }
        : { name: "command_metadata", status: "pass" },
    );
    const passed = checks.filter((c) => c.status === "pass").length;
    const warnings = checks.filter((c) => c.status === "warn").length;
    const failed = checks.filter((c) => c.status === "fail").length;
    const payload = { checks, passed, warnings, failed };
    const w = newWriter(cmd);
    if (failed > 0) w.writePlan("doctor: checks failed", payload);
    else w.writeSuccess("doctor: ok", payload);
  });
  program.addCommand(cmd);
}

function emitConventionAdvisories(program: Command): void {
  if (!process.stdout.isTTY) return;
  const commandNames: string[] = [];
  const flagNames: string[] = [];
  for (const cmd of walkCommands(program)) {
    if (isInternal(cmd) || cmd === program) continue;
    commandNames.push(cmd.name());
    for (const opt of cmd.options) if (opt.long) flagNames.push(opt.long.replace(/^--/, ""));
  }
  checkConventions(commandNames, flagNames, (s) => void process.stderr.write(s));
}

/** Wire murli middleware into a commander program in place (no parse). */
export function enable(program: Command, opts: EnableOptions = {}): void {
  if (enabled.has(program)) return;
  enabled.add(program);

  mountDescribe(program);
  mountProfile(program);
  const dev = opts.dev === true || isTruthy(process.env.MURLI_DEV);
  if (dev) mountDoctor(program);

  for (const cmd of walkCommands(program)) {
    // exitOverride/output config must be set per command: commander copies both at command
    // creation time, so a root-only override never reaches pre-built subcommands and their
    // parse errors would call process.exit(1) directly instead of throwing a CommanderError.
    cmd.exitOverride();
    cmd.configureOutput(outputConfiguration);
    if (isInternal(cmd)) continue;
    injectGlobalFlags(cmd);
    const meta = getMetadata(cmd);
    if (meta) injectMutatingFlags(cmd, meta);
  }

  program.hook("preAction", (_thisCommand, actionCommand) => preAction(program, actionCommand));
  if (dev) emitConventionAdvisories(program);
}

/** True when `token` consumes the following argv token as its value. */
function isValueOption(cmd: Command, token: string): boolean {
  // Adapter-owned value flags are always value-taking.
  if (token === "--output" || token === "--profile") return true;
  const opt = cmd.options.find((o) => o.long === token || o.short === token);
  return opt ? opt.required || opt.optional : false;
}

/**
 * Walk argv to the deepest matching command for `--schema`. Value tokens belonging to a
 * value-taking option are skipped so a global option's value (e.g. `--output json`) is not
 * mistaken for a subcommand name and does not abort traversal.
 */
function resolveCommandPath(program: Command, tokens: string[]): Command {
  let current = program;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok === undefined) break;
    if (tok.startsWith("-")) {
      if (!tok.includes("=") && isValueOption(current, tok)) i++;
      continue;
    }
    const sub = current.commands.find((c) => c.name() === tok || c.aliases().includes(tok));
    if (!sub) break;
    current = sub;
  }
  return current;
}

/** Single error path: AgentError envelopes, CommanderError→flag_error, help/version pass-through. */
function handleError(program: Command, err: unknown, sink: ErrorSink): void {
  const ce = err as { code?: string; exitCode?: number; message?: string };
  if (
    ce.code === "commander.helpDisplayed" ||
    ce.code === "commander.version" ||
    ce.code === "commander.help"
  ) {
    sink.exitFn(ce.exitCode ?? 0);
    return;
  }
  const w = newWriter(program, { exitFn: sink.exitFn, stdout: sink.stdout, stderr: sink.stderr });
  if (err instanceof AgentError) {
    w.writeError(err);
    return;
  }
  if (typeof ce.code === "string" && ce.code.startsWith("commander.")) {
    w.writeError(
      new AgentError({
        code: ExitCode.UserError,
        error: "flag_error",
        message: ce.message ?? "invalid usage",
        suggestion: "Check command usage with --schema or --help.",
        recoverable: true,
      }),
    );
    return;
  }
  w.writeError(newToolError(err instanceof Error ? err.message : String(err)));
}

/** Drop-in replacement for program.parseAsync(argv). */
export async function run(
  program: Command,
  argv: string[] = process.argv,
  opts: RunOptions = {},
): Promise<void> {
  const exitFn = opts.exitFn ?? ((c: number) => process.exit(c));
  const stdout = opts.stdout ?? process.stdout;
  const stderr = opts.stderr ?? process.stderr;
  enable(program, opts);

  const tokens = argv.slice(2);

  // --schema bypasses positional-argument validation, so handle it before parse.
  if (tokens.includes("--schema")) {
    const target = resolveCommandPath(program, tokens);
    stdout.write(`${JSON.stringify(commandSchemaToWire(buildCommandSchema(target)), null, 2)}\n`);
    exitFn(0);
    return;
  }

  try {
    await program.parseAsync(argv);
  } catch (err) {
    handleError(program, err, { exitFn, stdout, stderr });
  }
}
