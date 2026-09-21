import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
const R2 = "/private/tmp/claude-501/-Users-divadbaroon-Desktop-engelbart-web/9513afc7-e24b-43db-8b54-e5cd74b27ae9/scratchpad/run2";
const P = `${R2}/pack`;

// ---- the artifact, as it is upstream, minus what cannot be read
rmSync(`${P}/artifact`, { recursive: true, force: true });
mkdirSync(`${P}/artifact`, { recursive: true });
cpSync(`${R2}/artifact`, `${P}/artifact`, { recursive: true, filter: (src) =>
  !/\/(node_modules|\.git|public\/data|gh-page|dist)(\/|$)/.test(src) });
const tree = execSync(`cd ${P}/artifact && find . -type f | sed 's|^\\./||' | sort`).toString().trim().split("\n");
writeFileSync(`${P}/evidence/01-repo-tree.md`, `# Files in the artifact repository\n\n${tree.length} files (the 146 MB of bundled datasets under \`public/data\` are not copied here; the application loads them from that path at runtime).\n\n\`\`\`\n${tree.join("\n")}\n\`\`\`\n`);

// ---- the DOM survey, rendered
const surveys = JSON.parse(readFileSync(`${P}/evidence/surveys.json`, "utf8"));
const line = (c) => {
  const t = c.target ?? {};
  const bits = [];
  for (const k of ["id", "testid", "appId", "appIdAttr", "role", "name", "type", "label", "placeholder", "title", "editable", "href", "size"]) if (t[k] !== undefined) bits.push(`${k}=${JSON.stringify(t[k])}`);
  if (t.classes?.length) bits.push(`classes=${JSON.stringify(t.classes)}`);
  if (t.text !== undefined) bits.push(`text=${JSON.stringify(String(t.text).slice(0, 110))}`);
  return `${String(c.ord).padStart(3)}  parent=${String(c.parent ?? "-").padStart(3)}  <${t.tag}> ${bits.join(" ")}\n       selector: ${t.selector ?? ""}`;
};
let out = `# What the collector sees in the page\n\nThe survey is a walk of the live document keeping every element the collector\nconsiders worth pointing at, as a tree (\`parent\` is the \`ord\` of the nearest kept\nancestor). These are the exact fields a rule can be written against.\n\nFour moments of the interface are surveyed.\n`;
for (const [label, s] of Object.entries(surveys)) {
  const list = s.candidates ?? [];
  out += `\n## ${label} — ${list.length} elements${s.truncated ? " (truncated)" : ""}\n\n\`\`\`\n${list.map(line).join("\n")}\n\`\`\`\n`;
}
writeFileSync(`${P}/evidence/02-dom-survey.md`, out);

// ---- the identifier census
const all = Object.values(surveys).flatMap((s) => s.candidates ?? []).map((c) => c.target ?? {});
const count = (k) => all.filter((t) => t[k] !== undefined).length;
writeFileSync(`${P}/evidence/03-identifiers.md`, `# Identifiers present in this interface

Across all ${all.length} surveyed elements:

| field | elements carrying it |
|---|---|
| \`id\` (a stable DOM id) | ${count("id")} |
| \`testid\` (any test-harness attribute) | ${count("testid")} |
| \`appId\` (the value of a \`data-…-id\`) | ${count("appId")} |
| \`appIdAttr\` (which attribute that was) | ${count("appIdAttr")} |
| \`role\` | ${count("role")} |
| \`label\` (aria-label, aria-labelledby or a \`<label>\`) | ${count("label")} |
| \`text\` (visible words) | ${count("text")} |
| \`classes\` (after hashed and utility classes are dropped) | ${count("classes")} |
| \`placeholder\` | ${count("placeholder")} |
| \`title\` | ${count("title")} |

The distinct values actually present:

- \`id\`: ${[...new Set(all.map((t) => t.id).filter(Boolean))].map((x) => `\`${x}\``).join(", ") || "(none)"}
- \`testid\`: ${[...new Set(all.map((t) => t.testid).filter(Boolean))].map((x) => `\`${x}\``).join(", ") || "(none)"}
- \`appIdAttr\`: ${[...new Set(all.map((t) => t.appIdAttr).filter(Boolean))].map((x) => `\`${x}\``).join(", ") || "(none)"}
- \`role\`: ${[...new Set(all.map((t) => t.role).filter(Boolean))].map((x) => `\`${x}\``).join(", ") || "(none)"}
- \`classes\`: ${[...new Set(all.flatMap((t) => t.classes ?? []))].slice(0, 60).map((x) => `\`${x}\``).join(", ") || "(none)"}
`);
console.log("artifact files:", tree.length, "| survey elements:", all.length);
