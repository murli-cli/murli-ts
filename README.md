# murli-ts 🎶

[![CI](https://github.com/murli-cli/murli-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/murli-cli/murli-ts/actions/workflows/ci.yml)
[![@murli-cli/core](https://img.shields.io/npm/v/@murli-cli/core.svg?label=%40murli-cli%2Fcore)](https://www.npmjs.com/package/@murli-cli/core)
[![@murli-cli/commander](https://img.shields.io/npm/v/@murli-cli/commander.svg?label=%40murli-cli%2Fcommander)](https://www.npmjs.com/package/@murli-cli/commander)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

The TypeScript implementation of [murli](https://github.com/murli-cli/murli-go) — middleware for CLI tools that makes them speak natively to AI agents, with an adapter for [tj/commander.js](https://github.com/tj/commander.js). Byte-compatible with the murli `1.0` wire contract shared across every implementation.

`murli` is named after Krishna's sacred flute. The murli's music enchants every listener — each feeling it was meant for them alone. This library takes the same approach: your commands don't change, but a human at a terminal gets clear readable output, and an agent reading from a pipe gets structured JSON. Each audience gets the experience shaped for them.

---

## Philosophy

Five principles guide everything murli does:

**One tool, two audiences.** Humans and agents call the same commands. murli routes output automatically — no `if (agent) { ... }` branches in your code.

**Discoverability is a first-class feature.** Agents shouldn't need documentation to use your tool. The tool describes itself.

**Errors are instructions, not messages.** A structured error tells an agent what went wrong, whether to retry, and what to do instead.

**Dangerous operations require explicit intent.** Mutations are rejected in non-interactive mode until the agent — or human — confirms they know what they're doing.

**Context windows are finite.** Log deduplication, clean stderr routing, and streaming results keep agent context consumption predictable.

---

## Installation

```bash
# Core engine (Writer, AgentError, Metadata, schema types, conformance harness)
pnpm add @murli-cli/core

# Adapter for your CLI framework (commander is a peer dependency):
pnpm add @murli-cli/commander commander
```

Requires Node ≥ 18. Both packages ship dual ESM + CommonJS builds with type declarations.

> **Adapters.** Today `murli-ts` ships the **commander** adapter. Adapters for [yargs](https://github.com/yargs/yargs), [oclif](https://oclif.io/), and [citty](https://github.com/unjs/citty) are planned — they will reuse `@murli-cli/core` unchanged.

---

## Quick Start

The minimal change is one line at startup:

```ts
import { Command } from "commander";
import { run } from "@murli-cli/commander";

const program = new Command("riffle");
// ... define your commands ...

run(program, process.argv); // replaces program.parseAsync(process.argv)
```

That single change gives your tool structured JSON output, `--schema` on every command, a `describe` subcommand, a `profile` subcommand group, and automatic error handling. Everything below layers on top.

---

## Capabilities

### Dual-Audience Output

**What it is:** The same command produces plain text for humans and structured JSON for agents. The switch is automatic — murli checks whether stdout is a terminal.

**Principle:** One tool, two audiences.

---

**Zero effort — TTY detection is automatic.**

Run your command normally: human output. Pipe it: JSON.

```bash
$ riffle query woodworking
Found 3 matching folders

$ riffle query woodworking | cat
{
  "status": "ok",
  "schema_version": "1.0",
  "result": [...]
}
```

Use `--agent` to force JSON mode without piping (useful in scripts):

```bash
$ riffle query woodworking --agent
```

---

**Write your output once — murli routes it.**

Get a `Writer` inside your handler with `newWriter`, then call `writeSuccess` / `writeError`. murli renders them appropriately for the audience.

```ts
import { newWriter } from "@murli-cli/commander";
import { newToolError } from "@murli-cli/core";

query.action((text: string) => {
  const w = newWriter(query);

  const results = search(text);
  if (!results) {
    w.writeError(newToolError("search failed"));
    return;
  }

  w.writeSuccess(
    `Found ${results.length} results`, // human text (TTY only)
    results,                            // agent payload (the JSON `result`)
  );
});
```

> The human text is shown only in TTY/`text` mode; the JSON success envelope carries the payload as `result` and intentionally has no `message` field.

---

**Optional — stamp your tool version on every envelope.**

Call `setToolVersion` once at startup and every success envelope carries it:

```ts
import { setToolVersion } from "@murli-cli/core";

setToolVersion("1.2.3"); // e.g. from your package.json version
```

```json
{ "status": "ok", "schema_version": "1.0", "tool_version": "1.2.3", "result": [...] }
```

---

**Output format — `--output`.**

`--output` is auto-registered on every command. Pass it to control serialisation:

| Value | Behaviour |
|---|---|
| `json` | Pretty-printed JSON (default in agent mode) |
| `ndjson` | Minified single-line JSON |
| `text` | Plain text (same as TTY mode) |

```bash
$ riffle query woodworking --output ndjson
{"result":[...],"schema_version":"1.0","status":"ok"}
```

---

### Command Introspection

**What it is:** Agents can discover everything about your tool — commands, flags, capabilities, and health — without reading documentation. murli auto-mounts subcommands that do this work.

**Principle:** Discoverability is a first-class feature.

---

**Zero effort — `describe` is auto-mounted.**

`describe` dumps your complete command tree as a single JSON document. Agents call it once at startup to understand the full tool.

```bash
$ riffle describe
{
  "name": "riffle",
  "summary": "Riffle semantic search",
  "schema_version": "1.0",
  "capabilities": {
    "streaming": true,
    "dry_run": false,
    "output_formats": ["json", "ndjson", "text"],
    "schema_version": "1.0",
    "protocol_version": "0.2",
    "profiles": true
  },
  "commands": [
    { "name": "query", "summary": "Semantic query search", "idempotent": true, "flags": [...], "safety": { "read_only": true, "idempotent": true } }
  ]
}
```

---

**Zero effort — `--schema` is auto-registered on every command.**

`--schema` on any command prints the full schema for that command — flags, arguments, return shape, safety block, and all metadata.

```bash
$ riffle query --schema
{
  "name": "query",
  "agent_description": "Searches the semantic index for directory conceptual matches.",
  "idempotent": true,
  "arguments": [{ "name": "text", "type": "string", "required": true, "description": "" }],
  "flags": [{ "name": "top", "type": "string", "default": 5, "description": "result count" }],
  "safety": { "read_only": true, "idempotent": true }
}
```

Positional argument validation is automatically bypassed when generating schemas, so `--schema` never fails due to missing args.

---

**One flag — generate an AGENTS.md stub.**

Pass `--agents-md` to `describe` to generate a Markdown file ready to drop into your repository. Agents reading your repo get immediate tool context without running the binary.

```bash
$ riffle describe --agents-md > AGENTS.md
```

---

**Development only — `doctor` requires dev mode.**

`doctor` runs built-in self-checks and reports whether your murli integration is correctly configured. It is a developer tool, not an agent-facing command, so it is stripped by default — it never appears in `describe` output or pollutes the command surface agents see.

Enable it by passing `{ dev: true }` to `enable`/`run`, or by setting `MURLI_DEV=1`:

```ts
run(program, process.argv, { dev: true });
```

```bash
$ MURLI_DEV=1 riffle doctor --agent
{
  "status": "ok",
  "result": {
    "checks": [
      { "name": "schema_version", "status": "pass" },
      { "name": "output_formats", "status": "pass" },
      { "name": "command_metadata", "status": "warn", "message": "commands missing description: [index]" }
    ],
    "passed": 2, "warnings": 1, "failed": 0
  }
}
```

`status` is `"ok"` when all checks pass or only warnings exist; `"plan"` when any check fails — signalling the tool needs attention before release.

---

### Rich Agent Metadata

**What it is:** Annotations layered onto commands and flags that give agents richer signal — what a command does, when to use it, which flags are sensitive or enumerable, and worked examples. None of it is required; add as much or as little as your tool needs.

**Principle:** Discoverability is a first-class feature.

---

**Zero effort — commands work unannotated.**

murli emits whatever it can infer from your command definitions automatically (name, description, flags, argument bounds). Annotation extends that, not replaces it.

---

**One call — annotate a command.**

```ts
import { annotate } from "@murli-cli/commander";

annotate(query, {
  agentDescription: "Searches the semantic index for directory conceptual matches.",
  whenToUse: "Use when looking for folders matching general topics.",
  idempotent: true,
  returns: {
    type: "json",
    description: "Ranked list of vector similarity results",
    shape: { path: "string", score: "number" },
  },
  examples: [
    { command: "riffle query woodworking", description: "Find woodworking folders" },
    { command: "riffle query --top 20 art", description: "Return top 20 art matches" },
  ],
});
```

All fields are optional. Set what is meaningful.

---

**Add code — annotate individual flags.**

`flagAnnotations` adds per-flag metadata to `--schema` and `describe` output, giving agents richer signal for parameter construction:

```ts
annotate(query, {
  flagAnnotations: {
    region: { env: "AWS_REGION", enum: ["us-east-1", "eu-west-1"], persistent: true },
    token:  { env: "RIFFLE_TOKEN", sensitive: true },        // agents must not log this value
    top:    { mutuallyExclusiveWith: ["all"], pattern: "^\\d+$" },
  },
});
```

| Field | Type | Purpose |
|---|---|---|
| `env` | `string` | Environment variable that sets this flag |
| `sensitive` | `boolean` | Flag carries secrets; agents must not log its value |
| `persistent` | `boolean` | Flag applies to all subcommands |
| `enum` | `string[]` | Exhaustive list of valid values |
| `pattern` | `string` | Regex the value must match |
| `mutuallyExclusiveWith` | `string[]` | Other flags that cannot be set simultaneously |
| `profileable` | `boolean` | Flag can be saved in a profile (see [Saved Profiles](#saved-profiles)) |

---

**Naming convention advisory — requires dev mode.**

In dev mode (`{ dev: true }` or `MURLI_DEV=1`), murli emits advisory warnings to stderr in TTY mode when command or flag names deviate from conventional vocabulary:

```
[murli advisory] command "fetch": prefer "get" (conventional vocabulary)
[murli advisory] flag --format: prefer --output (conventional vocabulary)
```

Warnings are informational only — they never block execution and are suppressed entirely in agent mode. Like `doctor`, this is a developer aid disabled by default.

---

### Structured Errors

**What it is:** Every error — whether from flag parsing, routing, or your own handler — is intercepted and wrapped into a consistent JSON envelope with an exit code, error type, recovery suggestion, and retryability signal. Agents can act on errors without parsing message strings.

**Principle:** Errors are instructions, not messages.

---

**Zero effort — flag and routing errors are auto-wrapped.**

murli intercepts errors from commander before your code runs:

```bash
$ riffle query woodworking --output bogus | cat
{
  "code": 1,
  "error": "flag_error",
  "message": "invalid value \"bogus\" for --output",
  "suggestion": "Valid values: json, ndjson, text.",
  "recoverable": true,
  "valid_values": ["json", "ndjson", "text"],
  "field": "output",
  "schema_version": "1.0"
}
```

In TTY mode the same error prints as readable `Error:` / `Hint:` text.

---

**Return structured errors from your handlers.**

Use the convenience constructors for common cases:

```ts
import { newUserError, newToolError } from "@murli-cli/core";

w.writeError(newUserError("query string cannot be empty", "Provide a search keyword."));
w.writeError(newToolError("database connection failed: timeout after 30s"));
```

Or build the full `AgentError` when you need precise control:

```ts
import { AgentError, ExitCode } from "@murli-cli/core";

w.writeError(new AgentError({
  code: ExitCode.NotFound,
  error: "index_missing",
  message: "Semantic index not found at ~/.riffle/index",
  suggestion: "Run `riffle index build` to create the index first.",
  recoverable: false,
  docUrl: "https://example.com/docs/indexing",
}));
```

Extended fields (all optional): `validValues`, `retryAfterMs`, `docUrl`, `field`.

---

**Exit code taxonomy.**

murli standardises exit codes so agents know how to respond to any failure:

| Code | `ExitCode` | Meaning | Agent action |
|---|---|---|---|
| `0` | `OK` | Success | Proceed |
| `1` | `UserError` | Bad input or configuration | Read `suggestion`, fix parameters, retry |
| `2` | `ToolError` | Environment, network, or filesystem failure | Surface to user; do not retry immediately |
| `3` | `Partial` | Some operations succeeded, some failed | Inspect response, retry on subset if appropriate |
| `4` | `Timeout` | Operation timed out | Retry after a delay |
| `5` | `NotFound` | Requested resource does not exist | Verify resource; do not retry blindly |
| `6` | `Permission` | Caller lacks permission | Not retryable without an auth or config change |
| `7` | `Conflict` | State conflict (resource already exists, etc.) | Read current state before deciding to retry |
| `8` | `RateLimited` | Rate limit hit | Wait at least `retry_after_ms` milliseconds |
| `9` | `Cancelled` | Operation cancelled | Do not retry unless the parent operation resumes |

---

### Safety Rails

**What it is:** Commands that mutate state are automatically guarded in non-interactive mode. Agents cannot accidentally trigger destructive operations — they must explicitly signal intent. Dry-run support lets agents preview before executing.

**Principle:** Dangerous operations require explicit intent.

---

**Mark a command mutating — the guard is automatic.**

```ts
annotate(deleteCmd, { mutating: true, destructive: true });
```

When a mutating command runs in agent mode (non-TTY, no `--force`), murli rejects it before your handler runs:

```json
{
  "code": 1,
  "error": "confirmation_required",
  "message": "This command mutates state and requires explicit confirmation.",
  "suggestion": "Pass --force or --yes to proceed without a TTY.",
  "recoverable": true
}
```

`--force` and `--yes` are auto-registered on mutating commands. Either bypasses the guard.

---

**The safety block appears automatically in schema output.**

Every annotated command carries a `safety` block in `--schema` and `describe`. Agents use it to reason about risk before calling:

```json
{
  "name": "delete",
  "safety": { "read_only": false, "idempotent": false, "destructive": true, "dry_run_supported": true }
}
```

`read_only` is derived from `!mutating`. Fields are omitted from JSON when false.

---

**Add code — support dry-run.**

Mark `dryRunnable: true` and handle it in your handler. murli auto-registers `--dry-run`:

```ts
annotate(deleteCmd, { mutating: true, dryRunnable: true });

deleteCmd.action((id: string) => {
  const w = newWriter(deleteCmd);

  if (w.isDryRun()) {
    w.writePlan(`Would delete ${id} (no changes made)`, { would_delete: id });
    return;
  }

  // real deletion here
  w.writeSuccess(`Deleted ${id}`, { id });
});
```

`writePlan` emits `"status": "plan"` — the same envelope shape as `writeSuccess` but signalling "preview, not executed." Agents that see `"plan"` know to confirm before proceeding.

You can also check `w.isForced()` for your own confirmation logic.

---

### Saved Profiles

**What it is:** Named sets of flag values that apply automatically on every invocation. Agents and humans stop repeating `--region us-east-1 --token abc` on every call — they save a profile once and use it by name.

**Principle:** One tool, two audiences (agents need persistent configuration too).

---

**Mark flags as profileable — the profile commands are auto-mounted.**

```ts
annotate(program, {
  flagAnnotations: {
    region: { profileable: true },
    token:  { profileable: true, sensitive: true },
  },
});
```

murli auto-mounts `profile save`, `profile use`, `profile list`, `profile show`, and `profile delete`. No further code required.

```bash
# Save the current profileable flag values as "production"
$ mytool --region us-east-1 --token abc123 profile save production

# Set it as the default — all future calls use it automatically
$ mytool profile use production

# Now every invocation gets --region and --token without passing them
$ mytool query woodworking
```

Pass `--profile <name>` to override the default for a single invocation. An explicit flag on the command line always wins over a stored profile value. Profiles are stored in `~/.<toolname>/profiles.json`. Agents discover available profiles and `profileable_flags` via `describe`.

---

### Streaming & Progress

**What it is:** Long-running operations can stream results and progress incrementally. Agents get NDJSON on stdout or structured progress objects on stderr; humans get in-place progress lines.

**Principle:** Context windows are finite.

---

**Stream incremental results with `writeEvent`.**

Call it as results become available, then close with `writeSuccess` or `writeError`:

```ts
for (const file of files) {
  w.writeEvent(process(file)); // one minified JSON line per call
}
w.writeSuccess("Processing complete", null);
```

`writeEvent` is a no-op in TTY mode — events are machine-only.

---

**Report progress with `writeProgress`.**

`writeProgress` writes to stderr, keeping stdout clean for results:

```ts
w.writeProgress({ stage: "indexing", current: 500, total: 2000, percent: 25, etaMs: 6000, message: "Indexing files" });
```

Agent mode: minified JSON on stderr. TTY mode: a human-readable line with a carriage return (overwrites in place). All fields are optional.

---

**Log with deduplication.**

`w.log()` and `w.progress()` write to stderr. In agent mode they produce NDJSON; consecutive duplicate messages are collapsed with a `repeated` count, keeping agent context windows lean. ANSI escape codes are stripped in agent mode.

```ts
w.progress("Scanning /docs");
w.progress("Scanning /docs"); // deduplicated
w.progress("Scanning /docs"); // deduplicated
w.flush();
```

```
{"level":"progress","msg":"Scanning /docs","repeated":2,"ts":"..."}
```

---

## Packages

| Package | Use when |
|---|---|
| [`@murli-cli/core`](packages/core) | Always — `Writer`, `Logger`, `AgentError`, `Metadata`, schema types, profile store, and the conformance harness. Zero runtime dependencies. |
| [`@murli-cli/commander`](packages/commander) | Your CLI uses [tj/commander.js](https://github.com/tj/commander.js) |
| yargs / oclif / citty | _Planned_ — will reuse `@murli-cli/core` unchanged |

The commander adapter exposes:

| Purpose | API |
|---|---|
| Create a writer | `newWriter(command)` |
| Annotate a command | `annotate(command, metadata)` |
| Enable + run (drop-in for `parseAsync`) | `run(program, argv, opts?)` |
| Enable only (no parse) | `enable(program, opts?)` |
| Emit one command's schema | `buildCommandSchema(command)` |
| Build the describe tree | `buildDescribeTree(program)` |

---

## Contract Compliance

`@murli-cli/core` ships a conformance harness so downstream CLI maintainers can verify their integration against the murli `1.0` contract in CI:

```ts
import { runConformance } from "@murli-cli/core";

const result = runConformance({ command: ["node", "dist/main.js"] });
// result.passed === true when describe output, schema_version, and capabilities are valid
```

The wire format is identical across every murli implementation; the same golden envelopes that validate [murli-go](https://github.com/murli-cli/murli-go) validate `murli-ts`.

---

## Reference CLI

[`examples/murli-work-commander`](examples/murli-work-commander) is a complete sprint task tracker (`murli-work`) wrapped with the commander adapter. It exercises the full surface — dual-audience output, the mutation guard, dry-run, `describe`, `--schema`, structured errors, and conformance — and doubles as the end-to-end test target.

---

## Development

This is a [pnpm](https://pnpm.io/) workspace. From the repo root:

```bash
pnpm install        # install (lifecycle scripts are allowlisted; see pnpm-workspace.yaml)
pnpm build          # build all packages
pnpm test           # run the full test suite (unit + golden + e2e + conformance)
pnpm lint           # Biome lint + format check
```

To exercise the developer-only surface (`doctor`, convention advisories), set `MURLI_DEV=1`.

---

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.
