import type { Metadata } from "@murli-cli/core";
import type { Command } from "commander";

const store = new WeakMap<Command, Metadata>();

/** Attach (and shallow-merge) metadata to a command. Call once per command, outside handlers. */
export function annotate(command: Command, meta: Metadata): void {
  store.set(command, { ...(store.get(command) ?? {}), ...meta });
}

export function getMetadata(command: Command): Metadata | undefined {
  return store.get(command);
}
