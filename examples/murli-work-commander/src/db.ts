import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

export interface Task {
  id: number;
  title: string;
  desc: string;
  status: string;
  priority: string;
  labels: string[];
  created_at: string;
}
export interface Label {
  name: string;
}
export interface Db {
  tasks: Task[];
  labels: Label[];
}
export interface Config {
  default_output: string;
  default_priority: string;
}

export const PRIORITIES = ["low", "medium", "high"] as const;
export const STATUSES = ["todo", "doing", "done"] as const;

export function configDir(): string {
  const override = process.env.MURLI_WORK_DIR;
  if (override) return override;
  const home = homedir();
  switch (platform()) {
    case "darwin":
      return join(home, "Library", "Application Support", "murli-work");
    case "win32":
      return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "murli-work");
    default:
      return join(process.env.XDG_CONFIG_HOME || join(home, ".config"), "murli-work");
  }
}

const dbPath = (): string => join(configDir(), "db.json");
const configPath = (): string => join(configDir(), "config.json");

export function defaultConfig(): Config {
  return { default_output: "table", default_priority: "medium" };
}

export function defaultDb(): Db {
  return {
    tasks: [
      {
        id: 1,
        title: "Setup workspace layout",
        desc: "Bootstrap directory structures for Go, Rust, Python and TS",
        status: "done",
        priority: "high",
        labels: ["setup", "dev"],
        created_at: "2026-05-28T18:00:00Z",
      },
      {
        id: 2,
        title: "Document CLI specification",
        desc: "Draft the spec.md contracts and database JSON schemas",
        status: "done",
        priority: "medium",
        labels: ["docs"],
        created_at: "2026-05-28T18:30:00Z",
      },
      {
        id: 3,
        title: "Implement Cobra skeleton",
        desc: "Build the Go Cobra reference implementation",
        status: "doing",
        priority: "high",
        labels: ["dev", "go"],
        created_at: "2026-05-29T04:00:00Z",
      },
      {
        id: 4,
        title: "Integrate Murli middleware",
        desc: "Apply Murli wrappers to standard Go binaries",
        status: "todo",
        priority: "high",
        labels: ["dev", "murli"],
        created_at: "2026-05-29T05:00:00Z",
      },
      {
        id: 5,
        title: "Write Rust Clap reference",
        desc: "Develop Rust-native Clap derive parser",
        status: "todo",
        priority: "medium",
        labels: ["dev", "rust"],
        created_at: "2026-05-29T06:00:00Z",
      },
    ],
    labels: [
      { name: "setup" },
      { name: "dev" },
      { name: "docs" },
      { name: "go" },
      { name: "murli" },
      { name: "rust" },
    ],
  };
}

export function initStorage(): string {
  const dir = configDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(configPath(), `${JSON.stringify(defaultConfig(), null, 2)}\n`);
  writeFileSync(dbPath(), `${JSON.stringify(defaultDb(), null, 2)}\n`);
  return dir;
}

export function loadDb(): Db {
  if (!existsSync(dbPath())) initStorage();
  return JSON.parse(readFileSync(dbPath(), "utf8")) as Db;
}

export function saveDb(db: Db): void {
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(dbPath(), `${JSON.stringify(db, null, 2)}\n`);
}

export function loadConfig(): Config {
  if (!existsSync(configPath())) initStorage();
  return JSON.parse(readFileSync(configPath(), "utf8")) as Config;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function nextId(db: Db): number {
  return db.tasks.reduce((max, t) => Math.max(max, t.id), 0) + 1;
}

export function ensureLabels(db: Db, names: string[]): void {
  for (const n of names) if (!db.labels.some((l) => l.name === n)) db.labels.push({ name: n });
}
