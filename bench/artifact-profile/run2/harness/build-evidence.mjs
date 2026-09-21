import { readFileSync, writeFileSync } from "node:fs";
const P = "pack/evidence";

// ---- 03 · the collector's own survey, with its limit stated
const surveys = JSON.parse(readFileSync(`${P}/surveys.json`, "utf8"));
const line = (c) => {
  const t = c.target ?? {};
  const bits = [];
  for (const k of ["id", "testid", "appId", "appIdAttr", "role", "name", "type", "label", "placeholder", "title", "editable", "href", "size"]) if (t[k] !== undefined) bits.push(`${k}=${JSON.stringify(t[k])}`);
  if (t.classes?.length) bits.push(`classes=${JSON.stringify(t.classes)}`);
  if (t.text !== undefined) bits.push(`text=${JSON.stringify(String(t.text).slice(0, 110))}`);
  return `${String(c.ord).padStart(3)}  parent=${String(c.parent ?? "-").padStart(3)}  <${t.tag}> ${bits.join(" ")}\n       selector: ${t.selector ?? ""}`;
};
const tally = (list) => { const n = {}; for (const c of list) n[c.target.tag] = (n[c.target.tag] ?? 0) + 1; return Object.entries(n).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(", "); };
let out = `# The same page, as the collector describes it

The collector walks the document keeping the elements it considers worth
pointing at, and describes each one with the fields a rule can be written
against. These are those descriptions, at four moments of the interface's life.
\`parent\` is the \`ord\` of the nearest kept ancestor.

**The walk stops after 120 elements.** Every one of these four surveys is
truncated — the counts below say which tags the 120 were spent on. Read this
file for the *shape of a description*, and \`02-raw-dom.md\` for what the document
actually contains.
`;
for (const [label, s] of Object.entries(surveys)) {
  const list = s.candidates ?? [];
  out += `\n## ${label} — ${list.length} elements, truncated: ${s.truncated}\n\ntags: ${tally(list)}\n\n\`\`\`\n${list.map(line).join("\n")}\n\`\`\`\n`;
}
writeFileSync(`${P}/03-dom-survey.md`, out);

// ---- 04 · every attribute in the document
const attrs = JSON.parse(readFileSync("attrs.json", "utf8"));
const all = Object.values(attrs).flat();
const n = {}, values = {};
for (const e of all) for (const [k, v] of Object.entries(e.attrs)) {
  n[k] = (n[k] ?? 0) + 1;
  (values[k] ??= new Set()).add(v);
}
const rows = Object.entries(n).sort((a, b) => b[1] - a[1]);
const sample = (k, limit = 14) => [...values[k]].slice(0, limit).map((v) => `\`${v.length > 40 ? v.slice(0, 40) + "…" : v}\``).join(", ") + (values[k].size > limit ? `, … ${values[k].size - limit} more` : "");
writeFileSync(`${P}/04-attributes.md`, `# Every attribute this interface uses

Counted over ${all.length} elements across the four states in \`02-raw-dom.md\`.
Nothing is filtered: this is the raw attribute census.

| attribute | elements | distinct values |
|---|---:|---:|
${rows.map(([k, v]) => `| \`${k}\` | ${v} | ${values[k].size} |`).join("\n")}

The attributes that carry names rather than geometry:

${["id", "class", "name", "for", "placeholder", "title", "role", "type", "href", "tabindex"].filter((k) => values[k]).map((k) => `- \`${k}\` — ${sample(k)}`).join("\n")}

There is no \`data-testid\`, \`data-test\`, \`data-cy\`, \`data-qa\`, \`data-e2e\` or any
other test-harness attribute anywhere in this interface, and no
application-provided \`data-…-id\` either. The only \`data-\` attribute present is
\`data-vite-dev-id\`, which the development server puts on its injected
\`<style>\` tags; its value is an absolute file path.
`);

// ---- 05 · the discovery session, whole
const run = JSON.parse(readFileSync("sessions/discovery.json", "utf8"));
const t0 = new Date(run.events[0].at).getTime();
const off = (e) => { const s = (new Date(e.at).getTime() - t0) / 1000; return `${String(Math.floor(s / 60)).padStart(2, "0")}:${s % 60 < 10 ? "0" : ""}${(s % 60).toFixed(1)}`; };
writeFileSync(`${P}/05-discovery-session.md`, `# One recorded session, exactly as it was stored

${run.events.length} rows, run \`${run.runId}\`, ${((new Date(run.events.at(-1).at) - t0) / 1000).toFixed(0)} seconds long.
This is the whole row, every field, in order — the same JSON the pipeline reads.
The offset in the heading is from the first row; it is not stored, it is
arithmetic on \`at\`.

${run.events.map((e) => `## ${String(e.seq).padStart(2)} · +${off(e)} · ${e.kind}\n\n\`\`\`json\n${JSON.stringify(e, null, 1)}\n\`\`\`\n`).join("\n")}`);

// ---- 06 · what changed, and where
const changes = run.events.filter((e) => e.kind === "ui.change");
const el = (t) => t ? `<${t.tag}>${t.id ? ` #${t.id}` : ""}${t.classes?.length ? ` .${t.classes.join(".")}` : ""}${t.testid ? ` testid=${t.testid}` : ""}${t.appId ? ` ${t.appIdAttr}=${t.appId}` : ""}${t.role ? ` role=${t.role}` : ""}` : "(none)";
let six = `# Where the page changed, burst by burst

Every \`ui.change\` in the discovery session. A burst is one settled run of DOM
mutations. \`container\` is the one element that contains all of them; \`regions\`
are the nameable places inside it that actually gained text, each with the two
ancestors above it. A burst with no regions is one whose added text could not be
placed under anything nameable.

`;
for (const e of changes) {
  const d = e.data;
  six += `## seq ${e.seq} · +${off(e)} · ${d.mutations} mutations over ${d.durationMs} ms · closed ${JSON.stringify(d.closed)}\n\n`;
  six += `- ${d.addedNodes} nodes added, ${d.removedNodes} removed, ${d.textChanges} text changes, ${d.attributeChanges} attribute changes\n`;
  six += `- ${d.sinceInteractionMs === undefined ? "no interaction preceded it" : `began ${d.sinceInteractionMs} ms after interaction \`${e.interaction_id}\``}, ${d.requestsInFlight} requests in flight\n`;
  six += `- container: ${el(d.container)}\n  - \`${d.container?.selector ?? ""}\`\n`;
  six += `- added text (container level): ${(d.added ?? []).length ? (d.added).map((x) => `\n  - ${JSON.stringify(x)}`).join("") : "none"}\n`;
  six += `- removed text: ${(d.removed ?? []).length ? (d.removed).map((x) => `\n  - ${JSON.stringify(x)}`).join("") : "none"}\n`;
  if (!(d.regions ?? []).length) six += `- regions: none — nothing that gained text sat under a nameable element\n`;
  else {
    six += `- regions (${d.regions.length}):\n`;
    for (const r of d.regions) {
      six += `  - ${el(r.target)}\n    - \`${r.target?.selector ?? ""}\`\n`;
      if (r.within?.length) six += `    - within: ${r.within.map(el).join(" ← ")}\n`;
      six += `    - added: ${r.added.map((x) => JSON.stringify(x)).join(", ")}\n`;
    }
  }
  six += "\n";
}
writeFileSync(`${P}/06-regions.md`, six);
console.log("wrote 03–06");
