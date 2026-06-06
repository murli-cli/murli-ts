import "./store.js"; // registers the metadata lookup used by introspect.ts

export { annotate, getMetadata } from "./store.js";
export { newWriter, normalizeOutput } from "./writer.js";
export { buildCommandSchema, buildDescribeTree, walkCommands } from "./introspect.js";
export { type EnableOptions, type RunOptions, enable, run } from "./middleware.js";
