import {
  type ArgumentMetadata,
  type CommandSchema,
  type DescribeCommandSchema,
  type DescribeOutput,
  type FlagSchema,
  type Metadata,
  type ProfilesInfo,
  SCHEMA_VERSION,
  applyFlagAnnotation,
  defaultCapabilities,
  getToolVersion,
  safetyFromMetadata,
} from "@murli-cli/core";
import type { Command } from "commander";

/** describe/doctor are introspection/dev surfaces; they are not listed as tool commands. */
const INTERNAL_COMMANDS = new Set(["describe", "doctor"]);

export function* walkCommands(cmd: Command): Generator<Command> {
  yield cmd;
  for (const sub of cmd.commands) yield* walkCommands(sub);
}

function argMetadata(cmd: Command, meta: Metadata): ArgumentMetadata[] {
  if (meta.arguments && meta.arguments.length > 0) return meta.arguments;
  return cmd.registeredArguments.map((a) => ({
    name: a.name(),
    type: "string",
    required: a.required,
    description: a.description ?? "",
  }));
}

function flagSchemas(cmd: Command, meta: Metadata): FlagSchema[] {
  const anns = meta.flagAnnotations ?? {};
  const out: FlagSchema[] = [];
  for (const opt of cmd.options) {
    const long = opt.long;
    if (!long || long === "--help" || long === "--version") continue;
    const name = long.replace(/^--/, "");
    const fs: FlagSchema = {
      name,
      type: opt.required || opt.optional ? "string" : "bool",
      default: opt.defaultValue ?? null,
      description: opt.description ?? "",
    };
    const ann = anns[name];
    if (ann) applyFlagAnnotation(fs, ann);
    out.push(fs);
  }
  return out;
}

function commandFields(cmd: Command) {
  const meta: Metadata = (getMetadataRef(cmd) ?? {}) as Metadata;
  return {
    name: cmd.name(),
    summary: cmd.description() ?? "",
    whenToUse: meta.whenToUse,
    agentDescription: meta.agentDescription,
    idempotent: meta.idempotent ?? false,
    mutating: meta.mutating,
    arguments: argMetadata(cmd, meta),
    flags: flagSchemas(cmd, meta),
    returns: meta.returns,
    examples: meta.examples,
    safety: safetyFromMetadata(meta),
  };
}

// Indirection so introspect.ts has no import cycle with store.ts at module-eval time.
let metadataLookup: (cmd: Command) => Metadata | undefined = () => undefined;
export function setMetadataLookup(fn: (cmd: Command) => Metadata | undefined): void {
  metadataLookup = fn;
}
function getMetadataRef(cmd: Command): Metadata | undefined {
  return metadataLookup(cmd);
}

export function buildCommandSchema(cmd: Command): CommandSchema {
  return {
    ...commandFields(cmd),
    subcommands: cmd.commands.map((c) => ({ name: c.name(), summary: c.description() ?? "" })),
  };
}

function buildDescribeCommand(cmd: Command): DescribeCommandSchema {
  return {
    ...commandFields(cmd),
    subcommands: cmd.commands
      .filter((c) => !INTERNAL_COMMANDS.has(c.name()))
      .map(buildDescribeCommand),
  };
}

export function buildDescribeTree(program: Command, profiles?: ProfilesInfo): DescribeOutput {
  const dryRun = [...walkCommands(program)].some((c) => getMetadataRef(c)?.dryRunnable);
  const tv = getToolVersion();
  const out: DescribeOutput = {
    name: program.name(),
    summary: program.description() ?? "",
    schemaVersion: SCHEMA_VERSION,
    capabilities: { ...defaultCapabilities(), dryRun, protocolVersion: "0.2" },
    profiles,
    commands: program.commands
      .filter((c) => !INTERNAL_COMMANDS.has(c.name()))
      .map(buildDescribeCommand),
  };
  if (tv) out.toolVersion = tv;
  return out;
}
