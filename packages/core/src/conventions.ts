const NON_CONVENTIONAL_VERBS: Record<string, string> = {
  fetch: "get",
  info: "get",
  retrieve: "get",
  "show-all": "list",
  ls: "list",
  enumerate: "list",
  remove: "delete",
  rm: "delete",
  add: "create",
  new: "create",
  make: "create",
  edit: "update",
  modify: "update",
  set: "update",
};

const NON_CONVENTIONAL_FLAGS: Record<string, string> = {
  "skip-confirmations": "force",
  "no-confirm": "force",
  silent: "quiet",
  "no-output": "quiet",
  preview: "dry-run",
  "what-if": "dry-run",
  format: "output",
  "output-format": "output",
};

/** Advisory check (dev only). Writes warnings to `write`, returns warning count. */
export function checkConventions(
  commandNames: string[],
  flagNames: string[],
  write: (s: string) => void,
): number {
  let count = 0;
  for (const name of commandNames) {
    const preferred = NON_CONVENTIONAL_VERBS[name];
    if (preferred) {
      write(`[murli advisory] command "${name}": prefer "${preferred}" (conventional vocabulary)\n`);
      count++;
    }
  }
  for (const name of flagNames) {
    const preferred = NON_CONVENTIONAL_FLAGS[name];
    if (preferred) {
      write(`[murli advisory] flag --${name}: prefer --${preferred} (conventional vocabulary)\n`);
      count++;
    }
  }
  return count;
}
