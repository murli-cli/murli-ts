// biome-ignore lint/suspicious/noControlCharactersInRegex: matching the ESC (\x1b) control char is required to strip ANSI escape sequences
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;

/** Remove ANSI CSI escape sequences. */
export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

/**
 * Diagnostic logger for stderr.
 * TTY mode: plain text; progress overwrites the current line.
 * Agent mode: one NDJSON object per line with consecutive-duplicate dedup.
 */
export class Logger {
  private lastLine = "";
  private loggedAt = "";
  private dupCount = 0;
  private isProgress = false;

  constructor(
    private readonly write: (s: string) => void,
    private readonly isTTY: boolean,
  ) {}

  log(line: string): void {
    if (this.isTTY) {
      this.write(`${line}\n`);
      return;
    }
    const clean = stripAnsi(line);
    if (clean === this.lastLine && !this.isProgress) {
      this.dupCount++;
      return;
    }
    this.flush();
    this.lastLine = clean;
    this.loggedAt = new Date().toISOString();
    this.dupCount = 0;
    this.isProgress = false;
  }

  progress(line: string): void {
    if (this.isTTY) {
      this.write(`\r\x1b[K${line}`);
      return;
    }
    const clean = stripAnsi(line);
    if (clean === this.lastLine && this.isProgress) {
      this.dupCount++;
      return;
    }
    this.flush();
    this.lastLine = clean;
    this.loggedAt = new Date().toISOString();
    this.dupCount = 0;
    this.isProgress = true;
  }

  flush(): void {
    if (this.isTTY || this.lastLine === "") return;
    const entry: Record<string, unknown> = {
      level: this.isProgress ? "progress" : "info",
      msg: this.lastLine,
    };
    if (this.dupCount > 0) entry.repeated = this.dupCount;
    entry.ts = this.loggedAt;
    this.write(`${JSON.stringify(entry)}\n`);
    this.lastLine = "";
    this.dupCount = 0;
    this.isProgress = false;
  }
}
