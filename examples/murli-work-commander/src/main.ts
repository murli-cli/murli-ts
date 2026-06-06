import { AgentError, ExitCode, newToolError, setToolVersion } from "@murli-cli/core";
import { annotate, newWriter, run } from "@murli-cli/commander";
import { Command, Option } from "commander";
import {
  type Task,
  PRIORITIES,
  STATUSES,
  ensureLabels,
  initStorage,
  loadDb,
  nextId,
  saveDb,
  slugify,
} from "./db.js";
import { renderLabelTable, renderReport, renderTaskTable, reportData } from "./format.js";

setToolVersion("0.1.0");

const program = new Command("murli-work").description("Sprint/project task tracker");

// init
const initCmd = program
  .command("init")
  .description("reset/initialize the database with sample data")
  .action(() => {
    const w = newWriter(initCmd);
    const dir = initStorage();
    w.writeSuccess(
      `Initialized/Reset murli-work database with sample data and configuration in ${dir}`,
      { dir },
    );
  });
annotate(initCmd, { mutating: true, agentDescription: "Reset the database to sample data." });

// task group
const task = program.command("task").description("manage tasks");

const taskCreate = task
  .command("create <title>")
  .description("create a task")
  .option("-d, --desc <desc>", "description", "")
  .addOption(new Option("-p, --priority <priority>", "priority").choices([...PRIORITIES]).default("medium"))
  .option("-l, --labels <labels>", "comma-separated labels")
  .action((title: string, opts: { desc: string; priority: string; labels?: string }) => {
    const w = newWriter(taskCreate);
    const db = loadDb();
    const labels = (opts.labels ?? "").split(",").map(slugify).filter(Boolean);
    ensureLabels(db, labels);
    const task: Task = {
      id: nextId(db),
      title,
      desc: opts.desc,
      status: "todo",
      priority: opts.priority,
      labels,
      created_at: new Date().toISOString(),
    };
    db.tasks.push(task);
    saveDb(db);
    w.writeSuccess(`Task ${task.id} ("${title}") created successfully.`, task);
  });
annotate(taskCreate, {
  mutating: true,
  agentDescription: "Create a new task.",
  flagAnnotations: { priority: { enum: [...PRIORITIES] } },
});

const taskList = task
  .command("list")
  .description("list tasks")
  .addOption(new Option("-s, --status <status>", "filter by status").choices([...STATUSES]))
  .addOption(new Option("-p, --priority <priority>", "filter by priority").choices([...PRIORITIES]))
  .option("-l, --label <label>", "filter by label")
  .action((opts: { status?: string; priority?: string; label?: string }) => {
    const w = newWriter(taskList);
    const db = loadDb();
    const tasks = db.tasks.filter(
      (t) =>
        (!opts.status || t.status === opts.status) &&
        (!opts.priority || t.priority === opts.priority) &&
        (!opts.label || t.labels.includes(opts.label)),
    );
    w.writeSuccess(renderTaskTable(tasks), tasks);
  });
annotate(taskList, { idempotent: true, agentDescription: "List tasks with optional filters." });

const taskUpdate = task
  .command("update <id>")
  .description("update a task")
  .option("-t, --title <title>", "new title")
  .option("-d, --desc <desc>", "new description")
  .addOption(new Option("-p, --priority <priority>", "priority").choices([...PRIORITIES]))
  .addOption(new Option("-s, --status <status>", "status").choices([...STATUSES]))
  .option("-l, --labels <labels>", "comma-separated labels (replaces)")
  .action(
    (
      id: string,
      opts: { title?: string; desc?: string; priority?: string; status?: string; labels?: string },
    ) => {
      const w = newWriter(taskUpdate);
      const db = loadDb();
      const task = db.tasks.find((t) => t.id === Number.parseInt(id, 10));
      if (!task) {
        w.writeError(
          new AgentError({
            code: ExitCode.NotFound,
            error: "not_found",
            message: `Task with ID ${id} not found.`,
            recoverable: false,
          }),
        );
        return;
      }
      if (opts.title !== undefined) task.title = opts.title;
      if (opts.desc !== undefined) task.desc = opts.desc;
      if (opts.priority !== undefined) task.priority = opts.priority;
      if (opts.status !== undefined) task.status = opts.status;
      if (opts.labels !== undefined) {
        task.labels = opts.labels.split(",").map(slugify).filter(Boolean);
        ensureLabels(db, task.labels);
      }
      saveDb(db);
      w.writeSuccess(`Task ${id} updated successfully.`, task);
    },
  );
annotate(taskUpdate, { mutating: true, agentDescription: "Update fields of an existing task." });

const taskDelete = task
  .command("delete <id>")
  .description("delete a task")
  .action((id: string) => {
    const w = newWriter(taskDelete);
    const db = loadDb();
    const idx = db.tasks.findIndex((t) => t.id === Number.parseInt(id, 10));
    if (idx === -1) {
      w.writeError(
        new AgentError({
          code: ExitCode.NotFound,
          error: "not_found",
          message: `Task with ID ${id} not found.`,
          recoverable: false,
        }),
      );
      return;
    }
    if (w.isDryRun()) {
      w.writePlan(`Would delete task ${id} (no changes made)`, { would_delete: Number(id) });
      return;
    }
    db.tasks.splice(idx, 1);
    saveDb(db);
    w.writeSuccess(`Task ${id} deleted successfully.`, { id: Number(id) });
  });
annotate(taskDelete, { mutating: true, destructive: true, dryRunnable: true, agentDescription: "Delete a task." });

// label group
const label = program.command("label").description("manage labels");

const labelList = label
  .command("list")
  .description("list labels with usage counts")
  .action(() => {
    const w = newWriter(labelList);
    const db = loadDb();
    const rows = db.labels.map((l) => ({
      name: l.name,
      count: db.tasks.filter((t) => t.labels.includes(l.name)).length,
    }));
    w.writeSuccess(renderLabelTable(db), rows);
  });
annotate(labelList, { idempotent: true, agentDescription: "List labels and how many tasks use them." });

const labelCreate = label
  .command("create <name>")
  .description("create a label")
  .action((name: string) => {
    const w = newWriter(labelCreate);
    const db = loadDb();
    const slug = slugify(name);
    if (db.labels.some((l) => l.name === slug)) {
      w.writeError(
        new AgentError({
          code: ExitCode.Conflict,
          error: "conflict",
          message: `Label "${slug}" already exists.`,
          recoverable: false,
        }),
      );
      return;
    }
    db.labels.push({ name: slug });
    saveDb(db);
    w.writeSuccess(`Label "${slug}" created successfully.`, { name: slug });
  });
annotate(labelCreate, { mutating: true, agentDescription: "Create a new label." });

const labelDelete = label
  .command("delete <name>")
  .description("delete a label")
  .action((name: string) => {
    const w = newWriter(labelDelete);
    const db = loadDb();
    if (!db.labels.some((l) => l.name === name)) {
      w.writeError(
        new AgentError({
          code: ExitCode.NotFound,
          error: "not_found",
          message: `Label "${name}" not found.`,
          recoverable: false,
        }),
      );
      return;
    }
    db.labels = db.labels.filter((l) => l.name !== name);
    for (const t of db.tasks) t.labels = t.labels.filter((l) => l !== name);
    saveDb(db);
    w.writeSuccess(`Label "${name}" deleted successfully.`, { name });
  });
annotate(labelDelete, { mutating: true, destructive: true, agentDescription: "Delete a label." });

// report
const reportCmd = program
  .command("report")
  .description("summarize the sprint")
  .action(() => {
    const w = newWriter(reportCmd);
    const db = loadDb();
    w.writeSuccess(renderReport(db), reportData(db));
  });
annotate(reportCmd, { idempotent: true, agentDescription: "Summarize task completion and breakdowns." });

run(program, process.argv).catch((err: unknown) => {
  // Last-resort guard; handlers normally call writeError themselves.
  newWriter(program).writeError(
    err instanceof AgentError ? err : newToolError(err instanceof Error ? err.message : String(err)),
  );
});
