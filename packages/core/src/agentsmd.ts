import type { DescribeOutput } from "./schema.js";

/** Generate an AGENTS.md stub from describe output (matches Go FormatAgentsMD). */
export function formatAgentsMd(out: DescribeOutput): string {
  const lines: string[] = [];
  lines.push("# AGENTS.md");
  lines.push("");
  lines.push(`> Auto-generated from \`${out.name} describe\`. Edit to add project context.`);
  lines.push("");
  lines.push(`## Tool: ${out.name}`);
  lines.push("");
  if (out.summary) {
    lines.push(out.summary);
    lines.push("");
  }
  lines.push("## Introspection");
  lines.push("");
  lines.push("```bash");
  lines.push(`${out.name} describe        # full JSON schema`);
  lines.push(`${out.name} --help          # human-readable help`);
  lines.push("```");
  lines.push("");
  lines.push("## Schema Version");
  lines.push("");
  lines.push(`\`${out.schemaVersion}\``);
  if (out.commands && out.commands.length > 0) {
    lines.push("");
    lines.push("## Commands");
    for (const cmd of out.commands) {
      lines.push("");
      lines.push(`### ${cmd.name}`);
      lines.push("");
      if (cmd.agentDescription) {
        lines.push(cmd.agentDescription);
        lines.push("");
      } else if (cmd.summary) {
        lines.push(cmd.summary);
        lines.push("");
      }
      lines.push("```bash");
      lines.push(`${out.name} ${cmd.name} --schema    # JSON schema for this command`);
      lines.push("```");
      if (cmd.subcommands && cmd.subcommands.length > 0) {
        lines.push("");
        const names = cmd.subcommands.map((s) => `\`${s.name}\``).join(", ");
        lines.push(`**Subcommands:** ${names}`);
      }
    }
  }
  return `${lines.join("\n")}\n`;
}
