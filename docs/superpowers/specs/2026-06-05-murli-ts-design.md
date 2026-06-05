# murli-ts — Design Spec

Date: 2026-06-05
Status: Draft (awaiting review)
Owner: (this repo, `murli-ts`)

## 1. Purpose

Port the [murli](https://github.com/murli-cli/murli-go) CLI middleware to TypeScript/Node.
murli makes a single CLI serve two audiences — humans at a terminal and AI agents reading a
pipe — without `if (agent) {…}` branching in application code. The TypeScript implementation
MUST emit the **same wire format** as murli-go so that the 1.x contract is honored across
languages and a shared conformance suite can validate any implementation.

The five principles are unchanged: unified interface, self-describing tools, actionable
errors, intentional mutations, bounded context.

## 2. Scope

### This deliverable
- **`@murli-cli/core`** — the framework-agnostic engine: writer, errors, logger, metadata
  and schema types, describe/schema serialization, profile store, TTY/format resolution,
  AGENTS.md generation, convention advisories, and a conformance harness.
- **`@murli-cli/commander`** — the first adapter, for [commander](https://github.com/tj/commander.js).
- **`examples/murli-work-commander`** — the reference `murli-work` CLI (per the murli-demo
  [spec.md](https://github.com/murli-cli/murli-demo/blob/main/spec.md)) wrapped with the
  commander adapter. Serves as the end-to-end integration + conformance target and validates
  cross-language DB interop against the Go/Python implementations.

### Future (explicitly out of scope here, but the architecture must accommodate them)
- Adapters for **yargs**, **oclif**, **citty** as sibling packages reusing `@murli-cli/core`
  unchanged. The core API and the describe/schema builders are designed so each new adapter
  only maps its framework's command model onto the shared types.

### Non-goals
- No new wire-format features beyond murli-go 1.0.2.
- No bundler/runtime support beyond Node (no Deno/Bun-specific code paths; they may work but
  are not a target this round).

## 3. Authoritative wire contract (verified against murli-go source)

The prose docs (org README, `llms-full.txt`) diverge from the actual Go implementation in
several places. **Source is authoritative.** The shapes below come from `writer.go`,
`errors.go`, `logging.go`, `schema.go`, and the `testdata/golden/*.json` fixtures.

Constants:
- `schema_version` = `"1.0"` (in every envelope and in describe output).
- `tool_version` — set by the consumer (mutable global, parallels Go's `ToolVersion`);
  **omitted from output when empty**.
- `protocol_version` — default `"0.2"`; appears only in describe `capabilities`. Valid: `["0.2"]`.
- Output formats: `["json", "ndjson", "text"]`.
- JSON is emitted with HTML escaping **off** (literal `<`, `>`, `&`). `json` mode is pretty
  (2-space indent); `ndjson` mode is minified. Every JSON line ends with `\n`.

### 3.1 Success (stdout)
```json
{ "result": <payload>, "schema_version": "1.0", "status": "ok" }
```
- Keys ordered as Go marshals a `map`: alphabetical → `result, schema_version, status, tool_version?`.
- **There is no `message` field.** `humanText` passed to `writeSuccess` is used only in TTY/text mode.

### 3.2 Plan / dry-run (stdout)
```json
{ "result": <plan>, "schema_version": "1.0", "status": "plan" }
```
- **Uses `result`, not `plan`** (prose docs say `plan`; source uses `result`). No `message`.

### 3.3 Error (stderr) — struct field order
```json
{ "code": 1, "error": "user_error", "message": "...", "suggestion": "...",
  "recoverable": true, "schema_version": "1.0" }
```
- **No `status: "error"` field** (prose docs show one; the `AgentError` struct has none).
- Field order: `code, error, message, suggestion?, recoverable, valid_values?,
  retry_after_ms?, doc_url?, field?, schema_version, tool_version?`.
- `omitempty` fields: `suggestion, valid_values, retry_after_ms, doc_url, field, tool_version`.
  `code`, `error`, `message`, `recoverable`, `schema_version` always present.
- TTY mode prints `Error: <message>` and, when present, `Hint:  <suggestion>` (two spaces
  after `Hint:`). Then exits with `code`.

### 3.4 Event (stdout, NDJSON streaming)
One minified JSON line per `writeEvent(v)`; the arbitrary value is serialized verbatim.
No-op in TTY mode. The final line of a stream is a success or error envelope.

### 3.5 Progress event (stderr)
- Agent mode: minified `ProgressEvent` JSON, **no `event` wrapper** (prose docs show
  `{"event":"progress",…}` — the source marshals the struct directly):
  ```json
  { "stage": "read", "current": 1, "total": 3, "percent": 33, "eta_ms": 4200, "message": "…" }
  ```
  All fields `omitempty`. Struct order: `stage, current, total, percent, eta_ms, message`.
- TTY mode: `\r\x1b[K[stage] message (current/total, percent%)`, written to stderr.

### 3.6 Log lines (stderr)
- Agent mode: NDJSON `{ "level": "info"|"progress", "msg": "...", "repeated"?: N, "ts": "<RFC3339Nano>" }`
  (Go map ordering → alphabetical). ANSI CSI sequences stripped before emit.
- Dedup: `log()` collapses consecutive identical non-progress lines; `progress()` collapses
  consecutive identical progress lines. The flushed entry carries `repeated` = count of
  *extra* repeats (3 identical lines → `repeated: 2`). `flush()` emits the buffered entry.
- TTY mode: `log()` prints the plain line; `progress()` overwrites with `\r\x1b[K`.

### 3.7 describe / --schema (stdout JSON)
Types mirror `schema.go` exactly (json tags + omitempty):
- `DescribeOutput`: `name, summary, schema_version, tool_version?, capabilities, profiles?, commands?`
- `Capabilities`: `streaming, dry_run, output_formats?, schema_version, tool_version?,
  protocol_version?, profiles`
- `DescribeCommandSchema` (recursive): `name, summary, when_to_use?, agent_description?,
  idempotent, mutating?, arguments?, flags?, returns?, examples?, subcommands?, safety`
- `CommandSchema` (`--schema` for one command): same as above but `subcommands` is a brief
  `[{name, summary}]` listing (`SubcommandSchema`), not recursive.
- `FlagSchema`: `name, type, default, description, env?, sensitive?, persistent?,
  mutually_exclusive_with?, enum?, pattern?, profileable?`
- `SafetyBlock`: `read_only, idempotent, destructive?, dry_run_supported?` (`read_only` =
  `!mutating`).
- `ProfilesInfo`: `available?, default?, profileable_flags` (always present, empty array when none).
- `--schema` MUST bypass positional-argument validation so it never fails on missing args.

## 4. Package & repo structure

pnpm workspace monorepo:

```
murli-ts/
  package.json                 # private root, workspaces, shared scripts
  pnpm-workspace.yaml
  tsconfig.base.json
  vitest.config.ts             # or per-package
  packages/
    core/                      # @murli-cli/core  (zero framework deps)
    commander/                 # @murli-cli/commander (peerDep: commander)
  examples/
    murli-work-commander/      # reference CLI; dev-only, not published
  docs/superpowers/specs/      # this spec
  testdata/golden/             # envelope fixtures reused from murli-go for parity
```

Rationale: mirrors murli-go's proven split (core + per-adapter packages), keeps adapter
dependencies isolated, and lets yargs/oclif/citty land as sibling packages without touching
core. Package scope `@murli-cli/*` matches the GitHub org; **confirm npm scope availability
before first publish** (fallback: unscoped `murli` + `murli-commander`).

## 5. `@murli-cli/core` API

Idiomatic TS (camelCase) with Go-parity semantics. Public modules:

- **`writer.ts`** — `class Writer`:
  - `writeSuccess(humanText: string, payload: unknown): void`
  - `writePlan(humanText: string, plan: unknown): void`
  - `writeError(err: AgentError): never` — emits envelope, calls `exitFn(code)`.
  - `writeEvent(v: unknown): void` — NDJSON line; no-op in TTY.
  - `writeProgress(evt: ProgressEvent): void`
  - `log(msg: string): void`, `progress(msg: string): void`, `flush(): void`
  - `isTTY(): boolean`, `isForced(): boolean`, `isDryRun(): boolean`,
    `format(): OutputFormat`, `protocolVersion(): string`
  - Constructed via `new Writer({ stdout, stderr, agentMode, outputFormat?, protocolVersion?,
    force?, dryRun?, exitFn? })`. Default `stdout`/`stderr` = `process.stdout`/`process.stderr`,
    `exitFn` = `process.exit`. Adapters call a factory (`newWriter`), not the constructor.
  - Format resolution: `text` ⇒ TTY-style; `json`/`ndjson` ⇒ agent-style; default ⇒ TTY
    detection (`stdout.isTTY` && !agentMode). `--agent` forces agent mode.
- **`errors.ts`** — `class AgentError` (fields per §3.3), `exitCodes` constants
  (`OK…CANCELLED` = 0…9), `newUserError(message, suggestion)`, `newToolError(message)`.
  A module-level `setExitFn`/injectable `exitFn` enables test capture (parallels Go `ExitFunc`).
- **`logger.ts`** — `class Logger` with dedup + ANSI strip per §3.6.
- **`metadata.ts`** — `interface Metadata`, `ArgumentMetadata`, `ReturnSchema`, `Example`,
  `FlagAnnotation` (all fields optional, matching Go).
- **`schema.ts`** — describe/schema types (§3.7), `applyFlagAnnotation`,
  `emitSchema(schema, writeFn)`, `defaultCapabilities()`, key-ordering helpers to match Go
  output for golden reuse.
- **`profiles.ts`** — `ProfileStore` (`get/set/delete/setDefault/names`, `save`),
  `profilePath(tool)` → `${XDG_CONFIG_HOME ?? ~/.config}/<tool>/profiles.json`,
  `loadProfileStore(tool)`.
- **`conventions.ts`** — `checkConventions(commandNames, flagNames)` advisory (dev only; see §7).
- **`agentsmd.ts`** — `formatAgentsMd(describeOutput): string`.
- **`version.ts`** — `SCHEMA_VERSION`, mutable `toolVersion`, `VALID_OUTPUT_FORMATS`,
  `VALID_PROTOCOL_VERSIONS`.
- **`conformance.ts`** — `class ConformanceSuite(binaryPath)` → spawns the binary, runs
  `describe`, validates `schema_version`, capabilities, and envelope shapes. Usable from any
  downstream CLI's test suite without importing the rest of core's runtime.
- **`index.ts`** — curated public exports.

## 6. `@murli-cli/commander` adapter

Exposes the same surface as the Go adapters:
- `run(program: Command, argv = process.argv): Promise<void>` — drop-in for
  `program.parseAsync(argv)`. Calls `enable`, then parses, catching framework errors.
- `enable(program: Command, opts?: { dev?: boolean }): void` — in-place wiring without parsing.
- `newWriter(command: Command): Writer` — reads injected flags from the resolved command.
- `annotate(command: Command, meta: Metadata): void` — stores metadata on a `WeakMap` keyed
  by the command instance (no mutation of commander internals).
- `emitSchema(command: Command): void`, `buildDescribeTree(program: Command): DescribeOutput`.

### What `enable` injects/mounts
1. **Global flags** on the root (inherited): `--agent`, `--output <fmt>`, `--schema`,
   `--profile <name>`. On commands annotated `mutating`: `--force`, `--yes`, and (when
   `dryRunnable`) `--dry-run`. Flags are registered idempotently and hidden from human help
   where murli-go hides them.
2. **Action wrapping**: each command's action is wrapped so that, before the user handler runs:
   - if `--schema` present → emit that command's schema and exit 0 (bypassing arg validation);
   - if the command is `mutating`, not forced, and not a TTY → emit the
     `confirmation_required` error envelope (code 1, recoverable) and exit;
   - a `Writer` is created and made available (handlers obtain it via `newWriter(cmd)`).
   The wrapper awaits async handlers and maps thrown `AgentError`s to `writeError`; unknown
   throws map to a `tool_error` (code 2). Returning normally exits 0.
3. **`describe` subcommand**: walks the command tree + merged metadata into `DescribeOutput`;
   supports `--agents-md` to emit the AGENTS.md stub instead of JSON.
4. **`profile` subcommand group** (`list`, `use`, `save`, `show`, `delete`): mounted when any
   flag is annotated `profileable`. Backed by `ProfileStore`. `--profile <name>` (or the
   stored default) pre-fills profileable flag values; an explicit CLI flag always wins.
5. **`doctor` subcommand** + convention advisories: only when dev mode is on (see §7).

### Error interception
commander is configured with `program.exitOverride()` so parse failures throw
`CommanderError` instead of calling `process.exit`, and `configureOutput` suppresses
commander's own stderr writes in agent mode. `run` catches and maps:
- missing required argument / unknown option / invalid value → `flag_error` envelope,
  code 1, `recoverable: true` (matches murli-go's auto-wrap), with `suggestion`
  "Check command usage with --schema or --help.";
- help/version requests → pass through commander's normal behavior in TTY; in agent mode,
  help is suppressed in favor of `describe`/`--schema`.

> Open item — **exit-code divergence**: murli-go auto-wraps flag errors to **code 1**, but the
> murli-work demo `spec.md` mandates **code 2** for parse/validation errors. The library
> default follows murli-go (code 1). The example CLI will document/handle this where the demo
> contract requires code 2 (validating enums itself and raising `newToolError`-style code-2
> errors, or via explicit `AgentError`). Confirm desired default during review.

## 7. Dev-only features without build tags

Go strips `doctor` and convention advisories from release builds via `-tags murlidev`. Node
has no build tags. Decision: gate dev features behind an explicit `dev` flag plus an env
fallback.
- `enable(program, { dev })` / `run` accept `dev?: boolean`. When `dev` is `true` **or**
  `process.env.MURLI_DEV` is truthy, the `doctor` subcommand is mounted and convention
  advisories are emitted to stderr in TTY mode only (never in agent mode, never blocking).
- Default (`dev` unset/false, env unset) ⇒ `doctor` absent from the command tree and from
  `describe`; no advisories. This keeps the agent-facing surface identical to a Go release build.

## 8. TTY / format resolution (single source of truth in core)

`resolveMode({ agentMode, outputFormat, stdoutIsTTY })` → `{ isTTY, format }`. `--agent`
or a non-TTY stdout ⇒ agent mode; `--output text` forces TTY-style; `--output json|ndjson`
forces agent-style. Adapters pass raw flag values in; all branching lives in core so every
adapter behaves identically.

## 9. Testing strategy

- **Unit (vitest), in `core`:**
  - Envelope parity: assert `writeSuccess`/`writePlan`/`writeError` JSON byte-matches the
    reused `murli-go/testdata/golden/*.json` fixtures (and the corrected plan/error shapes).
  - Logger: dedup counts, `repeated` semantics, ANSI stripping, progress vs info levels.
  - Profiles: path resolution (incl. `XDG_CONFIG_HOME`), round-trip save/load, default,
    `names()` sorted.
  - Schema: `applyFlagAnnotation` merge rules, `safety.read_only = !mutating`, omitempty
    behavior, `--schema` arg-validation bypass.
  - Format resolution truth table (agentMode × outputFormat × isTTY).
- **Adapter integration:** spawn the example CLI as a child process and assert real stdout/
  stderr/exit codes for: TTY vs piped, `--agent`, `--schema`, `describe` (+ `--agents-md`),
  `--output json|ndjson|text`, mutation guard with/without `--force`, `--dry-run` plan
  envelope, error envelopes + each exit code, profile save/use round-trip.
- **Conformance:** run `ConformanceSuite` against the example binary; this is the same harness
  downstream consumers would use.
- Test only behavior that can break (envelope shape, exit codes, dedup math, guard logic),
  not defaults or string cosmetics.

## 10. Build / tooling / runtime

- Language: TypeScript, `strict: true`, no `any` in public API.
- Build: `tsup` per package → dual ESM + CJS + `.d.ts`. Target Node ≥ 18.
- Test: `vitest`. Lint/format: **Biome** (single fast tool, default for this repo;
  overridable in review).
- `commander` is a `peerDependency` of `@murli-cli/commander`; core has **zero** runtime deps.
- Package manager: pnpm (workspace).

## 11. Open questions to confirm during review

1. **Adapter scope** — this round is core + commander only; yargs/oclif/citty deferred. OK?
2. **npm scope** — `@murli-cli/*` vs unscoped `murli` + `murli-commander`.
3. **Flag-error exit code** — library default code 1 (murli-go parity) vs demo-spec code 2 (§6).
4. **Example breadth** — full `murli-work` spec (cross-lang DB interop) vs a thinner demo that
   only exercises murli features. Default: full `murli-work`.
5. **`protocol_version`** — confirm we expose `"0.2"` in capabilities and accept only `["0.2"]`,
   matching Go (`schema_version` stays `"1.0"`).
6. **Lint/format toolchain** — Biome vs ESLint+Prettier.
