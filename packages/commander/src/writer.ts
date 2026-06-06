import { type OutputFormat, VALID_OUTPUT_FORMATS, Writer, type WriterInit } from "@murli-cli/core";
import type { Command } from "commander";

export function normalizeOutput(value: unknown): OutputFormat {
  if (typeof value === "string" && (VALID_OUTPUT_FORMATS as readonly string[]).includes(value)) {
    return value as OutputFormat;
  }
  return "";
}

/**
 * Build a Writer from a command's merged (global + local) injected flags. The optional
 * `override` (streams + exitFn) lets callers inject sinks for in-process testing and for
 * routing structured errors through a single, terminal exit path.
 */
export function newWriter(command: Command, override: WriterInit = {}): Writer {
  const opts = command.optsWithGlobals() as Record<string, unknown>;
  return new Writer({
    agentMode: Boolean(opts.agent),
    outputFormat: normalizeOutput(opts.output),
    force: Boolean(opts.force) || Boolean(opts.yes),
    dryRun: Boolean(opts.dryRun),
    ...override,
  });
}
