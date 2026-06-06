/** Documents one positional argument. type/required/description default at wire time. */
export interface ArgumentMetadata {
  name: string;
  type?: string;
  required?: boolean;
  description?: string;
}

export interface ReturnSchema {
  type: string;
  description: string;
  shape?: Record<string, unknown>;
  /** Raw JSON Schema blob, serialized as-is into output_schema. */
  outputSchema?: unknown;
}

export interface Example {
  command: string;
  description?: string;
  expectedExitCode?: number;
}

export interface FlagAnnotation {
  env?: string;
  sensitive?: boolean;
  persistent?: boolean;
  profileable?: boolean;
  mutuallyExclusiveWith?: string[];
  enum?: string[];
  pattern?: string;
}

/** LLM-facing metadata layered onto a command via the adapter's annotate(). All optional. */
export interface Metadata {
  agentDescription?: string;
  whenToUse?: string;
  idempotent?: boolean;
  mutating?: boolean;
  dryRunnable?: boolean;
  destructive?: boolean;
  arguments?: ArgumentMetadata[];
  returns?: ReturnSchema;
  examples?: Example[];
  flagAnnotations?: Record<string, FlagAnnotation>;
}
