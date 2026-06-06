import { describe, expect, it } from "vitest";
import { defaultDb } from "./db.js";
import { renderLabelTable, renderReport, renderTaskTable, reportData } from "./format.js";

describe("format", () => {
  it("task table includes uppercased status/priority and comma labels", () => {
    const out = renderTaskTable(defaultDb().tasks);
    expect(out).toContain("| ID");
    expect(out).toContain("DONE");
    expect(out).toContain("setup,dev");
  });

  it("label table shows usage counts", () => {
    const out = renderLabelTable(defaultDb());
    expect(out).toContain("dev");
    expect(out).toContain("4");
  });

  it("reportData computes completion and breakdowns", () => {
    const d = reportData(defaultDb());
    expect(d.total).toBe(5);
    expect(d.done).toBe(2);
    expect(d.percent).toBe(40);
    expect(d.byPriority.high).toBe(3);
    expect(renderReport(defaultDb())).toContain("MURLI-WORK SPRINT REPORT");
  });
});
