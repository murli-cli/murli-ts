import type { ArgumentMetadata, Example, FlagAnnotation, Metadata, ReturnSchema } from "./metadata.js";
import { SCHEMA_VERSION, VALID_OUTPUT_FORMATS, getToolVersion } from "./version.js";

export interface SafetyBlock {
  readOnly: boolean;
  idempotent: boolean;
  destructive?: boolean;
  dryRunSupported?: boolean;
}

export interface FlagSchema {
  name: string;
  type: string;
  default: unknown;
  description: string;
  env?: string;
  sensitive?: boolean;
  persistent?: boolean;
  mutuallyExclusiveWith?: string[];
  enum?: string[];
  pattern?: string;
  profileable?: boolean;
}

export interface SubcommandSchema {
  name: string;
  summary: string;
}

interface CommandFields {
  name: string;
  summary: string;
  whenToUse?: string;
  agentDescription?: string;
  idempotent: boolean;
  mutating?: boolean;
  arguments?: ArgumentMetadata[];
  flags?: FlagSchema[];
  returns?: ReturnSchema;
  examples?: Example[];
  safety: SafetyBlock;
}

export interface CommandSchema extends CommandFields {
  subcommands?: SubcommandSchema[];
}

export interface DescribeCommandSchema extends CommandFields {
  subcommands?: DescribeCommandSchema[];
}

export interface Capabilities {
  streaming: boolean;
  dryRun: boolean;
  outputFormats?: string[];
  schemaVersion: string;
  toolVersion?: string;
  protocolVersion?: string;
  profiles: boolean;
}

export interface ProfilesInfo {
  available?: string[];
  default?: string;
  profileableFlags: string[];
}

export interface DescribeOutput {
  name: string;
  summary: string;
  schemaVersion: string;
  toolVersion?: string;
  capabilities: Capabilities;
  profiles?: ProfilesInfo;
  commands?: DescribeCommandSchema[];
}

/** Merge a FlagAnnotation onto a FlagSchema in place (booleans one-way; slices deep-copied). */
export function applyFlagAnnotation(fs: FlagSchema, ann: FlagAnnotation): void {
  if (ann.env) fs.env = ann.env;
  if (ann.sensitive) fs.sensitive = true;
  if (ann.persistent) fs.persistent = true;
  if (ann.mutuallyExclusiveWith && ann.mutuallyExclusiveWith.length > 0) {
    fs.mutuallyExclusiveWith = [...ann.mutuallyExclusiveWith];
  }
  if (ann.enum && ann.enum.length > 0) fs.enum = [...ann.enum];
  if (ann.pattern) fs.pattern = ann.pattern;
  if (ann.profileable) fs.profileable = true;
}

export function safetyFromMetadata(meta: Metadata): SafetyBlock {
  const s: SafetyBlock = { readOnly: !meta.mutating, idempotent: meta.idempotent ?? false };
  if (meta.destructive) s.destructive = true;
  if (meta.dryRunnable) s.dryRunSupported = true;
  return s;
}

export function defaultCapabilities(): Capabilities {
  const tv = getToolVersion();
  const cap: Capabilities = {
    streaming: true,
    dryRun: false,
    outputFormats: [...VALID_OUTPUT_FORMATS],
    schemaVersion: SCHEMA_VERSION,
    profiles: true,
  };
  if (tv) cap.toolVersion = tv;
  return cap;
}

function wireArgument(a: ArgumentMetadata): Record<string, unknown> {
  return {
    name: a.name,
    type: a.type ?? "string",
    required: a.required ?? false,
    description: a.description ?? "",
  };
}

function wireExample(e: Example): Record<string, unknown> {
  const o: Record<string, unknown> = { command: e.command };
  if (e.description) o.description = e.description;
  if (e.expectedExitCode) o.expected_exit_code = e.expectedExitCode;
  return o;
}

function wireReturn(r: ReturnSchema): Record<string, unknown> {
  const o: Record<string, unknown> = { type: r.type, description: r.description };
  if (r.shape) o.shape = r.shape;
  if (r.outputSchema !== undefined) o.output_schema = r.outputSchema;
  return o;
}

function wireFlag(f: FlagSchema): Record<string, unknown> {
  const o: Record<string, unknown> = {
    name: f.name,
    type: f.type,
    default: f.default ?? null,
    description: f.description,
  };
  if (f.env) o.env = f.env;
  if (f.sensitive) o.sensitive = true;
  if (f.persistent) o.persistent = true;
  if (f.mutuallyExclusiveWith && f.mutuallyExclusiveWith.length > 0) {
    o.mutually_exclusive_with = f.mutuallyExclusiveWith;
  }
  if (f.enum && f.enum.length > 0) o.enum = f.enum;
  if (f.pattern) o.pattern = f.pattern;
  if (f.profileable) o.profileable = true;
  return o;
}

function wireSafety(s: SafetyBlock): Record<string, unknown> {
  const o: Record<string, unknown> = { read_only: s.readOnly, idempotent: s.idempotent };
  if (s.destructive) o.destructive = true;
  if (s.dryRunSupported) o.dry_run_supported = true;
  return o;
}

function wireCommandFields(c: CommandFields): Record<string, unknown> {
  const o: Record<string, unknown> = { name: c.name, summary: c.summary };
  if (c.whenToUse) o.when_to_use = c.whenToUse;
  if (c.agentDescription) o.agent_description = c.agentDescription;
  o.idempotent = c.idempotent;
  if (c.mutating) o.mutating = true;
  if (c.arguments && c.arguments.length > 0) o.arguments = c.arguments.map(wireArgument);
  if (c.flags && c.flags.length > 0) o.flags = c.flags.map(wireFlag);
  if (c.returns) o.returns = wireReturn(c.returns);
  if (c.examples && c.examples.length > 0) o.examples = c.examples.map(wireExample);
  return o;
}

export function describeCommandToWire(c: DescribeCommandSchema): Record<string, unknown> {
  const o = wireCommandFields(c);
  if (c.subcommands && c.subcommands.length > 0) {
    o.subcommands = c.subcommands.map(describeCommandToWire);
  }
  o.safety = wireSafety(c.safety);
  return o;
}

export function commandSchemaToWire(c: CommandSchema): Record<string, unknown> {
  const o = wireCommandFields(c);
  if (c.subcommands && c.subcommands.length > 0) {
    o.subcommands = c.subcommands.map((s) => ({ name: s.name, summary: s.summary }));
  }
  o.safety = wireSafety(c.safety);
  return o;
}

export function capabilitiesToWire(cap: Capabilities): Record<string, unknown> {
  const o: Record<string, unknown> = { streaming: cap.streaming, dry_run: cap.dryRun };
  if (cap.outputFormats && cap.outputFormats.length > 0) o.output_formats = cap.outputFormats;
  o.schema_version = cap.schemaVersion;
  if (cap.toolVersion) o.tool_version = cap.toolVersion;
  if (cap.protocolVersion) o.protocol_version = cap.protocolVersion;
  o.profiles = cap.profiles;
  return o;
}

function profilesInfoToWire(p: ProfilesInfo): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (p.available && p.available.length > 0) o.available = p.available;
  if (p.default) o.default = p.default;
  o.profileable_flags = p.profileableFlags;
  return o;
}

export function describeOutputToWire(d: DescribeOutput): Record<string, unknown> {
  const o: Record<string, unknown> = {
    name: d.name,
    summary: d.summary,
    schema_version: d.schemaVersion,
  };
  if (d.toolVersion) o.tool_version = d.toolVersion;
  o.capabilities = capabilitiesToWire(d.capabilities);
  if (d.profiles) o.profiles = profilesInfoToWire(d.profiles);
  if (d.commands && d.commands.length > 0) o.commands = d.commands.map(describeCommandToWire);
  return o;
}

/** Pretty-print a command schema as JSON (used by --schema). */
export function emitSchema(schema: CommandSchema, write: (s: string) => void): void {
  write(`${JSON.stringify(commandSchemaToWire(schema), null, 2)}\n`);
}
