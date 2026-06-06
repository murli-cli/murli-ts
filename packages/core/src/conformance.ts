import { spawnSync } from "node:child_process";

export interface ConformanceOptions {
  /** argv to launch the binary, e.g. ["node", "dist/cli.js"] or ["./mytool"]. */
  command: string[];
  expectedSchemaVersion?: string;
}

export interface ConformanceResult {
  passed: boolean;
  failures: string[];
}

/** Validate a built CLI against the murli 1.0 contract by running `describe`. */
export function runConformance(opts: ConformanceOptions): ConformanceResult {
  const failures: string[] = [];
  const [bin, ...rest] = opts.command;
  if (!bin) return { passed: false, failures: ["command is empty"] };

  const res = spawnSync(bin, [...rest, "describe"], { encoding: "utf8" });
  if (res.status !== 0) {
    failures.push(`describe exited with code ${String(res.status)}: ${res.stderr ?? ""}`);
    return { passed: false, failures };
  }

  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(res.stdout) as Record<string, unknown>;
  } catch (e) {
    failures.push(`describe output is not valid JSON: ${(e as Error).message}`);
    return { passed: false, failures };
  }

  const wantSV = opts.expectedSchemaVersion ?? "1.0";
  if (doc.schema_version !== wantSV) {
    failures.push(`schema_version: want ${wantSV}, got ${String(doc.schema_version)}`);
  }
  if (typeof doc.name !== "string" || doc.name === "") {
    failures.push("describe.name is missing or empty");
  }
  const cap = doc.capabilities as Record<string, unknown> | undefined;
  if (!cap) {
    failures.push("describe.capabilities is missing");
  } else {
    if (cap.output_formats !== undefined && !Array.isArray(cap.output_formats))
      failures.push("capabilities.output_formats must be an array");
    if (cap.schema_version !== wantSV) failures.push("capabilities.schema_version mismatch");
  }
  if (doc.commands !== undefined && !Array.isArray(doc.commands))
    failures.push("describe.commands must be an array");

  return { passed: failures.length === 0, failures };
}
