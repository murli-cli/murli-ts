import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initStorage, loadDb, nextId, saveDb, slugify } from "./db.js";

describe("db", () => {
  let prev: string | undefined;
  beforeEach(() => {
    prev = process.env.MURLI_WORK_DIR;
    process.env.MURLI_WORK_DIR = mkdtempSync(join(tmpdir(), "murli-work-"));
  });
  afterEach(() => {
    process.env.MURLI_WORK_DIR = prev;
  });

  it("slugify lowercases and hyphenates", () => {
    expect(slugify("Hello World!")).toBe("hello-world");
    expect(slugify("  A_B  ")).toBe("a-b");
  });

  it("initStorage writes 5 tasks and 6 labels", () => {
    initStorage();
    const db = loadDb();
    expect(db.tasks).toHaveLength(5);
    expect(db.labels).toHaveLength(6);
    expect(nextId(db)).toBe(6);
  });

  it("loadDb self-heals when the file is absent", () => {
    const db = loadDb();
    expect(db.tasks.length).toBeGreaterThan(0);
  });

  it("saveDb round-trips", () => {
    const db = loadDb();
    db.tasks.push({
      id: 99,
      title: "x",
      desc: "",
      status: "todo",
      priority: "low",
      labels: [],
      created_at: "2026-01-01T00:00:00Z",
    });
    saveDb(db);
    expect(loadDb().tasks.some((t) => t.id === 99)).toBe(true);
  });
});
