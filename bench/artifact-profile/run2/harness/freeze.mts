// Validate the generated profile, and if it is valid, freeze it.
// Nothing about the profile is edited here, by anybody, ever.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, chmodSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { validateProfile, renderIssues } from "@/lib/activity/profile/validate";
import { DIR } from "./lib.mts";

const src = `${DIR}/gen/profile.json`;
const raw = readFileSync(src);
const sha = createHash("sha256").update(raw).digest("hex");
const profile = JSON.parse(raw.toString());
const checked = validateProfile(profile);

console.log(`profile.json — ${raw.length} bytes, sha256 ${sha}`);
console.log(`surfaces ${profile.surfaces?.length ?? 0} · controls ${profile.controls?.length ?? 0} · channels ${profile.channels?.length ?? 0} · keySets ${profile.keySets?.length ?? 0} · rules ${profile.rules?.length ?? 0}`);
console.log(`\nvalidation: ${checked.ok ? "OK" : "FAILED"}`);
if (checked.issues?.length) console.log(renderIssues(checked.issues));

if (!checked.ok) { console.log("\nNOT frozen."); process.exit(1); }

const out = `${DIR}/experiment/run2`;
mkdirSync(out, { recursive: true });
for (const f of ["profile.json", "NOTES.md"]) {
  const to = `${out}/${f}`;
  if (existsSync(to)) { console.log(`\n${f} already frozen — refusing to overwrite.`); process.exit(1); }
  copyFileSync(`${DIR}/gen/${f}`, to);
  chmodSync(to, 0o444);
}
writeFileSync(`${out}/FROZEN.md`, `# Run 2 profile, frozen\n\n| | |\n|---|---|\n| profile.json sha256 | \`${sha}\` |\n| bytes | ${raw.length} |\n| surfaces | ${profile.surfaces.length} |\n| controls | ${profile.controls.length} |\n| channels | ${profile.channels.length} |\n| key sets | ${profile.keySets?.length ?? 0} |\n| rules | ${profile.rules.length} |\n| validation | clean${checked.issues?.length ? ` (${checked.issues.length} warnings)` : ""} |\n\nFrozen before any held-out session was read. Not edited afterwards.\n`);
console.log(`\nFROZEN at experiment/run2/ (read-only).`);
