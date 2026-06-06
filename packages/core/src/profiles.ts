import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface Profile {
  flags: Record<string, string>;
}

interface ProfileStoreData {
  default?: string;
  profiles?: Record<string, Profile>;
}

/** Resolves to ~/.<tool>/profiles.json (matches Go murli.ProfilePath). */
export function profilePath(tool: string): string {
  const home = homedir();
  const base = home && home.length > 0 ? home : ".";
  return join(base, `.${tool}`, "profiles.json");
}

export class ProfileStore {
  default = "";
  profiles: Record<string, Profile> = {};

  static load(tool: string): ProfileStore {
    const store = new ProfileStore();
    const path = profilePath(tool);
    if (existsSync(path)) {
      const data = JSON.parse(readFileSync(path, "utf8")) as ProfileStoreData;
      store.default = data.default ?? "";
      store.profiles = data.profiles ?? {};
    }
    return store;
  }

  get(name: string): Profile | undefined {
    return this.profiles[name];
  }

  set(name: string, p: Profile): void {
    this.profiles[name] = p;
  }

  delete(name: string): void {
    delete this.profiles[name];
    if (this.default === name) this.default = "";
  }

  setDefault(name: string): void {
    if (!this.profiles[name]) throw new Error(`profile "${name}" not found`);
    this.default = name;
  }

  names(): string[] {
    return Object.keys(this.profiles).sort();
  }

  save(tool: string): void {
    const path = profilePath(tool);
    mkdirSync(dirname(path), { recursive: true });
    const data: ProfileStoreData = { profiles: this.profiles };
    if (this.default) data.default = this.default;
    // Build in Go key order: default (omitempty), profiles.
    const ordered: Record<string, unknown> = {};
    if (this.default) ordered.default = this.default;
    ordered.profiles = this.profiles;
    writeFileSync(path, `${JSON.stringify(ordered, null, 2)}\n`);
  }
}
