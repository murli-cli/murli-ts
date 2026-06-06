export const SCHEMA_VERSION = "1.0";
export const VALID_OUTPUT_FORMATS = ["json", "ndjson", "text"] as const;
export const VALID_PROTOCOL_VERSIONS = ["0.2"] as const;

let toolVersion = "";

/** Set the tool version stamped onto every envelope (parallels Go's ToolVersion). */
export function setToolVersion(v: string): void {
  toolVersion = v;
}

/** Get the current tool version. Empty string means "unset" and is omitted from envelopes. */
export function getToolVersion(): string {
  return toolVersion;
}
