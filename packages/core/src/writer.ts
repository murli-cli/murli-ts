import { type AgentError, type ExitFn } from "./errors.js";
import { Logger } from "./logger.js";
import { type OutputFormat, resolveMode } from "./mode.js";
import { SCHEMA_VERSION, getToolVersion } from "./version.js";

export interface ProgressEvent {
  stage?: string;
  current?: number;
  total?: number;
  percent?: number;
  etaMs?: number;
  message?: string;
}

export interface WriterInit {
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
  agentMode?: boolean;
  outputFormat?: OutputFormat;
  protocolVersion?: string;
  force?: boolean;
  dryRun?: boolean;
  exitFn?: ExitFn;
}

/** Routes output to humans (text) or agents (JSON envelopes) based on mode. */
export class Writer {
  private readonly stdout: NodeJS.WritableStream;
  private readonly stderr: NodeJS.WritableStream;
  private readonly _isTTY: boolean;
  private readonly _format: OutputFormat;
  private readonly _protocolVersion: string;
  private readonly _force: boolean;
  private readonly _dryRun: boolean;
  private readonly exitFn: ExitFn;
  private readonly logger: Logger;

  constructor(init: WriterInit = {}) {
    this.stdout = init.stdout ?? process.stdout;
    this.stderr = init.stderr ?? process.stderr;
    const stdoutIsTTY = Boolean((this.stdout as NodeJS.WriteStream).isTTY);
    const { isTTY, format } = resolveMode({
      agentMode: init.agentMode ?? false,
      outputFormat: init.outputFormat ?? "",
      stdoutIsTTY,
    });
    this._isTTY = isTTY;
    this._format = format;
    this._protocolVersion = init.protocolVersion ?? "";
    this._force = init.force ?? false;
    this._dryRun = init.dryRun ?? false;
    this.exitFn = init.exitFn ?? ((code: number) => process.exit(code));
    this.logger = new Logger((s) => void this.stderr.write(s), this._isTTY);
  }

  isTTY(): boolean {
    return this._isTTY;
  }
  isForced(): boolean {
    return this._force;
  }
  isDryRun(): boolean {
    return this._dryRun;
  }
  format(): OutputFormat {
    return this._format;
  }
  protocolVersion(): string {
    return this._protocolVersion === "" ? "0.2" : this._protocolVersion;
  }

  log(msg: string): void {
    this.logger.log(msg);
  }
  progress(msg: string): void {
    this.logger.progress(msg);
  }
  flush(): void {
    this.logger.flush();
  }

  writeSuccess(humanText: string, payload: unknown): void {
    this.writeResultEnvelope("ok", humanText, payload);
  }

  writePlan(humanText: string, plan: unknown): void {
    this.writeResultEnvelope("plan", humanText, plan);
  }

  private writeResultEnvelope(status: "ok" | "plan", humanText: string, result: unknown): void {
    if (this._format === "text" || (this._format === "" && this._isTTY)) {
      this.stdout.write(`${humanText}\n`);
      return;
    }
    const env: Record<string, unknown> = { result, schema_version: SCHEMA_VERSION, status };
    const tv = getToolVersion();
    if (tv) env.tool_version = tv;
    const json = this._format === "ndjson" ? JSON.stringify(env) : JSON.stringify(env, null, 2);
    this.stdout.write(`${json}\n`);
  }

  /**
   * Emit a structured error to stderr and exit. Matches Go: error envelopes are
   * always pretty-printed in agent mode regardless of --output (ndjson does not apply).
   */
  writeError(err: AgentError): void {
    if (this._isTTY) {
      this.stderr.write(`Error: ${err.message}\n`);
      if (err.suggestion) this.stderr.write(`Hint:  ${err.suggestion}\n`);
    } else {
      this.stderr.write(`${JSON.stringify(err.toEnvelope(), null, 2)}\n`);
    }
    this.exitFn(err.code);
  }

  writeEvent(v: unknown): void {
    if (this._isTTY) return;
    this.stdout.write(`${JSON.stringify(v)}\n`);
  }

  writeProgress(evt: ProgressEvent): void {
    if (this._isTTY) {
      let line = evt.message ?? "";
      if (evt.stage) line = `[${evt.stage}] ${line}`;
      if (evt.total && evt.total > 0) {
        line += ` (${evt.current ?? 0}/${evt.total}`;
        if (evt.percent && evt.percent > 0) line += `, ${Math.round(evt.percent)}%`;
        line += ")";
      }
      this.stderr.write(`\r\x1b[K${line}`);
      return;
    }
    const out: Record<string, unknown> = {};
    if (evt.stage) out.stage = evt.stage;
    if (evt.current) out.current = evt.current;
    if (evt.total) out.total = evt.total;
    if (evt.percent) out.percent = evt.percent;
    if (evt.etaMs) out.eta_ms = evt.etaMs;
    if (evt.message) out.message = evt.message;
    this.stderr.write(`${JSON.stringify(out)}\n`);
  }
}
