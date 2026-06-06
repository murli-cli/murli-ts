import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileStore, profilePath } from "./profiles.js";

describe("ProfileStore", () => {
  let home: string;
  let prevHome: string | undefined;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "murli-home-"));
    prevHome = process.env.HOME;
    process.env.HOME = home;
  });
  afterEach(() => {
    process.env.HOME = prevHome;
  });

  it("profilePath resolves to ~/.<tool>/profiles.json", () => {
    expect(profilePath("mytool")).toBe(join(home, ".mytool", "profiles.json"));
  });

  it("save then load round-trips, default omitted when empty", () => {
    const s = new ProfileStore();
    s.set("prod", { flags: { region: "us-east-1" } });
    s.save("mytool");
    const raw = JSON.parse(readFileSync(profilePath("mytool"), "utf8"));
    expect(raw).toEqual({ profiles: { prod: { flags: { region: "us-east-1" } } } });

    const loaded = ProfileStore.load("mytool");
    expect(loaded.get("prod")).toEqual({ flags: { region: "us-east-1" } });
    expect(loaded.default).toBe("");
  });

  it("setDefault throws for unknown profile and names() is sorted", () => {
    const s = new ProfileStore();
    s.set("b", { flags: {} });
    s.set("a", { flags: {} });
    expect(s.names()).toEqual(["a", "b"]);
    expect(() => s.setDefault("missing")).toThrow();
    s.setDefault("a");
    expect(s.default).toBe("a");
  });

  it("delete clears default when it matches", () => {
    const s = new ProfileStore();
    s.set("a", { flags: {} });
    s.setDefault("a");
    s.delete("a");
    expect(s.get("a")).toBeUndefined();
    expect(s.default).toBe("");
  });

  it("load returns empty store when file is absent", () => {
    expect(ProfileStore.load("nope").names()).toEqual([]);
  });
});
