import { describe, expect, it } from "vitest";
import { Logger, stripAnsi } from "./logger.js";

function collector() {
  const lines: string[] = [];
  return { write: (s: string) => lines.push(s), lines };
}

describe("Logger", () => {
  it("strips ANSI escape sequences", () => {
    expect(stripAnsi("\x1b[32mok\x1b[0m")).toBe("ok");
  });

  it("agent mode emits NDJSON with level/msg/ts keys in order", () => {
    const c = collector();
    const log = new Logger(c.write, false);
    log.log("hello");
    log.flush();
    expect(c.lines).toHaveLength(1);
    const obj = JSON.parse(c.lines[0]);
    expect(obj.level).toBe("info");
    expect(obj.msg).toBe("hello");
    expect(typeof obj.ts).toBe("string");
    expect(Object.keys(obj)).toEqual(["level", "msg", "ts"]);
  });

  it("collapses consecutive duplicate info lines with repeated count", () => {
    const c = collector();
    const log = new Logger(c.write, false);
    log.log("scan");
    log.log("scan");
    log.log("scan");
    log.flush();
    expect(c.lines).toHaveLength(1);
    expect(JSON.parse(c.lines[0]).repeated).toBe(2);
  });

  it("progress lines use level progress and do not dedup against info", () => {
    const c = collector();
    const log = new Logger(c.write, false);
    log.progress("p");
    log.log("p");
    log.flush();
    expect(c.lines).toHaveLength(2);
    expect(JSON.parse(c.lines[0]).level).toBe("progress");
    expect(JSON.parse(c.lines[1]).level).toBe("info");
  });

  it("TTY mode prints plain lines and overwrites progress", () => {
    const c = collector();
    const log = new Logger(c.write, true);
    log.log("hi");
    log.progress("working");
    expect(c.lines).toEqual(["hi\n", "\r\x1b[Kworking"]);
  });
});
