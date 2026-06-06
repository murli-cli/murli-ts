export type OutputFormat = "" | "json" | "ndjson" | "text";

export interface ModeInput {
  agentMode: boolean;
  outputFormat: OutputFormat;
  stdoutIsTTY: boolean;
}

export interface ResolvedMode {
  isTTY: boolean;
  format: OutputFormat;
}

/**
 * Single source of truth for human-vs-agent routing.
 * Explicit --output overrides TTY detection; --agent forces agent mode.
 */
export function resolveMode(input: ModeInput): ResolvedMode {
  let isTTY = input.stdoutIsTTY && !input.agentMode;
  switch (input.outputFormat) {
    case "text":
      isTTY = true;
      break;
    case "json":
    case "ndjson":
      isTTY = false;
      break;
  }
  return { isTTY, format: input.outputFormat };
}
