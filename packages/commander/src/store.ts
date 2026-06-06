import type { Metadata } from "@murli-cli/core";
import type { Command } from "commander";
import { setInternalLookup, setMetadataLookup } from "./introspect.js";

const store = new WeakMap<Command, Metadata>();

/** Attach (and shallow-merge) metadata to a command. Call once per command, outside handlers. */
export function annotate(command: Command, meta: Metadata): void {
  store.set(command, { ...(store.get(command) ?? {}), ...meta });
}

export function getMetadata(command: Command): Metadata | undefined {
  return store.get(command);
}

/**
 * Single source of truth for "internal" (introspection/dev) commands. Backed by a
 * WeakSet here in the low-cycle module; introspect.ts reads it through the same
 * indirection pattern as the metadata lookup to avoid an import cycle.
 */
const internalCommands = new WeakSet<Command>();

export function markInternal(command: Command): void {
  internalCommands.add(command);
}

export function isInternal(command: Command): boolean {
  return internalCommands.has(command);
}

setMetadataLookup(getMetadata);
setInternalLookup(isInternal);
