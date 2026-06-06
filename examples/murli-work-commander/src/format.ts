import type { Db, Task } from "./db.js";

function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length), 0),
  );
  const sep = `+${widths.map((w) => "-".repeat(w + 2)).join("+")}+`;
  const line = (cells: string[]) =>
    `| ${cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join(" | ")} |`;
  return [sep, line(headers), sep, ...rows.map(line), sep].join("\n");
}

export function renderTaskTable(tasks: Task[]): string {
  const rows = tasks.map((t) => [
    String(t.id),
    t.title,
    t.status.toUpperCase(),
    t.priority.toUpperCase(),
    t.labels.join(","),
  ]);
  return table(["ID", "Title", "Status", "Priority", "Labels"], rows);
}

export function renderLabelTable(db: Db): string {
  const rows = db.labels.map((l) => [
    l.name,
    String(db.tasks.filter((t) => t.labels.includes(l.name)).length),
  ]);
  return table(["Label Name", "Task Count"], rows);
}

export interface ReportData {
  total: number;
  done: number;
  percent: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
}

export function reportData(db: Db): ReportData {
  const byStatus = { todo: 0, doing: 0, done: 0 } as Record<string, number>;
  const byPriority = { low: 0, medium: 0, high: 0 } as Record<string, number>;
  for (const t of db.tasks) {
    if (t.status in byStatus) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    if (t.priority in byPriority) byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1;
  }
  const total = db.tasks.length;
  const done = byStatus.done ?? 0;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, percent, byStatus, byPriority };
}

export function renderReport(db: Db): string {
  const d = reportData(db);
  const filled = Math.round(d.percent / 10);
  const bar = "■".repeat(filled) + "□".repeat(10 - filled);
  return [
    "========================================",
    "          MURLI-WORK SPRINT REPORT      ",
    "========================================",
    `Completion Rate : [${bar}] ${d.percent}% (${d.done}/${d.total} tasks)`,
    "",
    "Status Breakdown:",
    `- TODO  : ${d.byStatus.todo} tasks`,
    `- DOING : ${d.byStatus.doing} tasks`,
    `- DONE  : ${d.byStatus.done} tasks`,
    "",
    "Priority Breakdown:",
    `- HIGH  : ${d.byPriority.high} tasks`,
    `- MEDIUM: ${d.byPriority.medium} tasks`,
    `- LOW   : ${d.byPriority.low} tasks`,
    "========================================",
  ].join("\n");
}
