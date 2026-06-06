import { describe, expect, it } from "vitest";
import { AgentError, ExitCode, newToolError, newUserError } from "./errors.js";
import { setToolVersion } from "./version.js";

describe("AgentError", () => {
  it("newUserError is recoverable with code 1", () => {
    const e = newUserError("bad input", "fix it");
    expect(e.code).toBe(ExitCode.UserError);
    expect(e.errorType).toBe("user_error");
    expect(e.recoverable).toBe(true);
    expect(e.suggestion).toBe("fix it");
  });

  it("newToolError is non-recoverable with code 2", () => {
    const e = newToolError("disk on fire");
    expect(e.code).toBe(ExitCode.ToolError);
    expect(e.errorType).toBe("tool_error");
    expect(e.recoverable).toBe(false);
  });

  it("envelope matches Go field order and omits empties", () => {
    const e = newUserError("the --region flag is required", "Pass --region us-east-1");
    expect(e.toEnvelope()).toEqual({
      code: 1,
      error: "user_error",
      message: "the --region flag is required",
      suggestion: "Pass --region us-east-1",
      recoverable: true,
      schema_version: "1.0",
    });
    expect(Object.keys(e.toEnvelope())).toEqual([
      "code",
      "error",
      "message",
      "suggestion",
      "recoverable",
      "schema_version",
    ]);
  });

  it("includes extended fields and tool_version when set", () => {
    setToolVersion("9.9.9");
    const e = new AgentError({
      code: ExitCode.RateLimited,
      error: "rate_limited",
      message: "slow down",
      recoverable: true,
      retryAfterMs: 1500,
      validValues: ["a", "b"],
      field: "name",
    });
    const env = e.toEnvelope();
    expect(env).toMatchObject({
      code: 8,
      error: "rate_limited",
      recoverable: true,
      valid_values: ["a", "b"],
      retry_after_ms: 1500,
      field: "name",
      tool_version: "9.9.9",
    });
    expect(Object.keys(env)).toEqual([
      "code",
      "error",
      "message",
      "recoverable",
      "valid_values",
      "retry_after_ms",
      "field",
      "schema_version",
      "tool_version",
    ]);
    setToolVersion("");
  });
});
