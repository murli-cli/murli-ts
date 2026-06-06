import { SCHEMA_VERSION, getToolVersion } from "./version.js";

export const ExitCode = {
  OK: 0,
  UserError: 1,
  ToolError: 2,
  Partial: 3,
  Timeout: 4,
  NotFound: 5,
  Permission: 6,
  Conflict: 7,
  RateLimited: 8,
  Cancelled: 9,
} as const;
export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

export type ExitFn = (code: number) => void;

export interface AgentErrorInit {
  code: number;
  /** Machine-readable category, serialized as "error". */
  error: string;
  message: string;
  suggestion?: string;
  recoverable?: boolean;
  validValues?: string[];
  retryAfterMs?: number;
  docUrl?: string;
  field?: string;
}

/** Structured error envelope written to stderr in agent mode. */
export class AgentError extends Error {
  code: number;
  errorType: string;
  suggestion?: string;
  recoverable: boolean;
  validValues?: string[];
  retryAfterMs?: number;
  docUrl?: string;
  field?: string;

  constructor(init: AgentErrorInit) {
    super(init.message);
    this.name = "AgentError";
    this.code = init.code;
    this.errorType = init.error;
    this.suggestion = init.suggestion;
    this.recoverable = init.recoverable ?? false;
    this.validValues = init.validValues;
    this.retryAfterMs = init.retryAfterMs;
    this.docUrl = init.docUrl;
    this.field = init.field;
  }

  /**
   * Serialize to the wire envelope. Key order matches the Go AgentError struct;
   * empty optional fields are omitted. schema_version / tool_version are added here.
   */
  toEnvelope(): Record<string, unknown> {
    const env: Record<string, unknown> = {
      code: this.code,
      error: this.errorType,
      message: this.message,
    };
    if (this.suggestion) env.suggestion = this.suggestion;
    env.recoverable = this.recoverable;
    if (this.validValues && this.validValues.length > 0) {
      env.valid_values = [...this.validValues];
    }
    if (this.retryAfterMs) env.retry_after_ms = this.retryAfterMs;
    if (this.docUrl) env.doc_url = this.docUrl;
    if (this.field) env.field = this.field;
    env.schema_version = SCHEMA_VERSION;
    const tv = getToolVersion();
    if (tv) env.tool_version = tv;
    return env;
  }
}

export function newUserError(message: string, suggestion: string): AgentError {
  return new AgentError({
    code: ExitCode.UserError,
    error: "user_error",
    message,
    suggestion,
    recoverable: true,
  });
}

export function newToolError(message: string): AgentError {
  return new AgentError({
    code: ExitCode.ToolError,
    error: "tool_error",
    message,
    recoverable: false,
  });
}
