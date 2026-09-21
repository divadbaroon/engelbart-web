// Writing down what an artifact is, from evidence, without being told.
//
// This is the bench's method as a code path. The same two documents are
// handed over — what the instrument can and cannot record, and the
// profile format in full — followed by a pack built from the repository
// and one recording. Nothing in the prompt knows what any artifact is,
// and nothing in this file names one; the blind test over lib/ is what
// keeps that true.
//
// The answer comes back as two fenced blocks of ordinary text — a JSON
// profile and the notes behind it — which is the bench's own shape, where
// they were two files. It is then treated as what it is: untrusted text
// that claims to be a profile. It is validated before it is stored, and
// it is compiled and fitted before it is believed. A profile that does
// not validate is a failure recorded against the artifact, not an
// exception.
//
// It is text rather than a tool call because a forced tool call is
// refused: the API returns `stop_reason: "refusal"` with an empty tool
// input and zero output tokens, reproducibly, for a tool whose whole
// description was "Give the profile of this artifact, and your notes on
// how you arrived at it" — with no evidence attached at all. Text costs
// one parse and has no such cliff.
import Anthropic from "@anthropic-ai/sdk";
import type { ArtifactProfile } from "./schema";
import { validateProfile, renderIssues, type ProfileIssue } from "./validate";
import { SCHEMA_DOC } from "./prompt/schema-doc";
import type { EvidencePack } from "./evidence";

export const PROFILE_MODEL = "claude-opus-5";
// A profile for a real artifact runs to tens of thousands of tokens of
// careful JSON, and a run that stops at the ceiling leaves it half
// written — which arrives as unparseable rather than as an error, so the
// ceiling is set well above anything a profile has needed and
// `stop_reason` is reported when it is hit anyway.
const MAX_TOKENS = 64_000;

// Adapted from bench/artifact-profile/run2/evidence/TASK.md, which is
// frozen. One change only: the evidence arrives as one document rather
// than a directory of files. The rules are unchanged, and they are the
// part that was tested; so is the answer's shape, which is still a
// profile and a set of notes.
const TASK = `# Describe this software as an ArtifactProfile

You are given a piece of research software and a recording of one person using it. Nobody has
told you what it is. Your job is to work that out from the software and the recording, and to
write down what you learn in the format described below.

What this is for: a research tool observes people using software from papers, and turns each
recording into a readable timeline — stretches of time, each named with what the person was
doing. It can only do that if something tells it what the software's parts mean. That is the
profile you are writing. It will be run against **other recordings of this same software that
you will never see**, so write it to describe the software, not to fit this one afternoon.

## Rules

**Use only what you are given here.** If you find yourself wanting something that is not here,
say so in your notes and carry on without it.

**Work out the software's own vocabulary and use it.** The \`sub\` name of a rule should be what
somebody who works on this software would call that behaviour. Do not translate into generic
web words, and do not invent a product name.

**High precision beats coverage.** A stretch left to the fallback costs a row of "not
characterised". A stretch confidently named wrong is a false claim in a research tool, and it
is much worse. Where the evidence would support two readings, either write the rule so it only
fires when the evidence distinguishes them, or do not write it.

**Say nothing a recording cannot show.** No intent, no understanding, no belief, no whether
something worked. What was done, named.

**Abstractions are allowed, and must be cited.** If you name something the software never
names, mark it \`grounding: "abstraction"\` and say in \`note\` which pieces of evidence have it in
common. If you believe something you cannot point at, mark it \`grounding: "inference"\` and say
so. Do not dress an inference as a source.

**Prefer stable anchors.** Work down the rungs in the format document. Where you must use a
generated CSS path, mark that element's \`generation.confidence\` accordingly and say in \`note\`
what you looked for first and did not find.

**One recording is a sample, not the software.** Something used once in this recording is not
therefore rare; something absent from it is not therefore absent from the software. The
repository tells you what exists; the recording tells you what a session looks like.

**Match surfaces against the keys you are given.** The section listing the documents this run
served holds the exact strings a surface's \`match\` is tested against. A surface matching
anything else will never fire.

## What to produce

Two fenced blocks, in this order, and nothing outside them.

First, one ArtifactProfile as JSON, valid against the format below, and nothing else in it:

\`\`\`json
{ "version": 1, ... }
\`\`\`

Then, what you worked out and how, in your own words:

\`\`\`notes
What the software is. What you were confident about and what you were not. Anything you wanted
to express and the format would not let you. Anything you looked for and could not find. Any
rule you considered and decided not to write, and why. Write it for somebody who will read your
profile later and needs to know how much to trust each part of it.
\`\`\``;

// The two blocks, pulled back out. Nothing here is trusted: an answer
// that came back in some other shape is a failure recorded against the
// artifact, and this parse is what decides that.
function fenced(tag: string, text: string): string | null {
  const open = new RegExp("```[ \\t]*" + tag + "[ \\t]*\\r?\\n", "i").exec(text);
  if (!open) return null;
  const rest = text.slice(open.index + open[0].length);
  const close = /\r?\n[ \t]*```/.exec(rest);
  return close ? rest.slice(0, close.index) : rest;
}

// A JSON object even where the fence was left off or labelled something
// else: the outermost pair of braces, found by counting, with braces
// inside strings ignored.
function outermostObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

export type Generated =
  | { ok: true; profile: ArtifactProfile; notes: string; model: string; issues: ProfileIssue[] }
  | { ok: false; error: string; issues?: ProfileIssue[]; notes?: string; model: string };

export async function generateProfile(pack: EvidencePack, artifact: { name: string; repoId: string; commit: string | null }): Promise<Generated> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "No ANTHROPIC_API_KEY is set, so an artifact cannot be read.", model: PROFILE_MODEL };
  const client = new Anthropic();
  let answer: Anthropic.Messages.Message;
  try {
    // Streamed, and not because anything here wants the tokens as they
    // arrive: a profile is tens of thousands of tokens of careful JSON,
    // and the SDK refuses a single request that could outlast ten
    // minutes. The whole message is awaited either way.
    answer = await client.messages.stream({
      model: PROFILE_MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: `${TASK}\n\n---\n\n${SCHEMA_DOC}\n\n---\n\n${pack.text}` }],
    }).finalMessage();
  } catch (err) {
    return { ok: false, error: `The artifact could not be read: ${err instanceof Error ? err.message : String(err)}`, model: PROFILE_MODEL };
  }

  // Why it came back the shape it did, in the error rather than only in a
  // log: "max_tokens" and "refusal" are different problems and the first
  // one is fixed by a number.
  const how = `stop_reason ${answer.stop_reason ?? "none"}; ${answer.usage.output_tokens} output tokens`;
  const said = answer.content.filter((b): b is Anthropic.Messages.TextBlock => b.type === "text").map((b) => b.text).join("\n");
  if (!said.trim()) return { ok: false, error: `The model did not answer in the shape it was asked for (${how}).`, model: PROFILE_MODEL };
  const notes = (fenced("notes", said) ?? fenced("markdown", said) ?? "").trim();

  const body = fenced("json", said) ?? outermostObject(said);
  if (!body) return { ok: false, error: `The model's answer held no profile (${how}; ${said.length} characters of text).`, notes, model: PROFILE_MODEL };
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    return { ok: false, error: `The profile the model wrote is not JSON (${how}): ${err instanceof Error ? err.message : String(err)}`, notes, model: PROFILE_MODEL };
  }

  // Where the profile came from is ours to say, not the model's: it is a
  // fact about this call, and a generated profile that claimed to be
  // handwritten would be the one lie the provenance exists to prevent.
  const claimed = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  if (!claimed) return { ok: false, error: `The model's answer held ${Array.isArray(parsed) ? "a list" : typeof parsed} where a profile should be (${how}).`, notes, model: PROFILE_MODEL };
  const stamped = {
    ...claimed,
    artifact: { ...(claimed.artifact && typeof claimed.artifact === "object" ? claimed.artifact : {}), name: nameOf(claimed, artifact.name), repoId: artifact.repoId, commit: artifact.commit },
    provenance: {
      ...(claimed.provenance && typeof claimed.provenance === "object" ? claimed.provenance : {}),
      by: "generated",
      model: PROFILE_MODEL,
      generatedAt: new Date().toISOString(),
      evidenceHash: undefined,
    },
  };

  const checked = validateProfile(stamped);
  if (!checked.ok) {
    return { ok: false, error: `The profile the model wrote does not validate:\n${renderIssues(checked.issues)}`, issues: checked.issues, notes, model: PROFILE_MODEL };
  }
  return { ok: true, profile: checked.profile, notes, model: PROFILE_MODEL, issues: checked.issues };
}

// The model names the artifact; the repository's name is the fallback,
// never an override, because what the software calls itself is part of
// what was worked out.
function nameOf(claimed: Record<string, unknown>, fallback: string): string {
  const artifact = claimed.artifact as { name?: unknown } | undefined;
  const name = typeof artifact?.name === "string" ? artifact.name.trim() : "";
  return name || fallback;
}
