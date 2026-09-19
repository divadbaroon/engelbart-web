// A researcher's note as Bart reads it: their words kept apart from what
// the DOM held, the run and the commit named as where it came from, and
// what the trace holds nearby offered as timing and nothing more.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { annotationList, annotationReport } from "../../lib/bart/annotations";
import { frameLine } from "../../lib/annotations/target";
import { situationBlock } from "../../lib/bart/prompt";
import { traceModel } from "../../lib/bart/grounding";
import { events } from "../trace/fixtures/session";
import { call1 } from "./fixtures/call";
import type { Annotation } from "../../lib/annotations/model";
import type { Repo } from "../../lib/repos";
import type { SandboxRun } from "../../lib/sandbox";

const note = (over: Partial<Annotation> = {}): Annotation => ({
  id: "a-1", projectId: "p1", repoId: "repo1", runId: "run1", recordingId: null, userId: "u1",
  body: "Why does the tutor tell me to inspect the Solution here?",
  anchor: {
    element: { tag: "p", testid: "advice", text: "Inspect the Solution.", selector: "main > p" },
    ancestors: [{ tag: "section", label: "Tutor" }],
    frame: { frameId: "f_a1b2c3d4e5", name: null, selectorInParent: null, path: [], depth: 0, kind: "document" },
    route: "/play", documentTitle: null,
  },
  route: "/play", commitSha: "abc1234def", stageId: "stage:i_page000001_8", callId: null,
  createdAt: "2026-09-19T00:00:00.000Z", updatedAt: "2026-09-19T00:00:00.000Z",
  ...over,
});

describe("an annotation as Bart reads it", () => {
  it("keeps the researcher's words apart from what the page held", () => {
    const text = annotationReport(note(), null);
    assert.match(text, /What the researcher wrote \(their own words, an observation or a question, not a recording of the system\)/);
    assert.match(text, /Why does the tutor tell me to inspect the Solution here\?/);
    assert.match(text, /On: “Inspect the Solution\.” \(p\) · main > p · at \/play/, "the element is described the way every other target in the trace is");
    assert.match(text, /Cite it as \[\[annotation:a-1\]\]/);
  });
  it("names where it came from without saying any of it caused anything", () => {
    const text = annotationReport(note({ recordingId: "rec-1" }), null);
    assert.match(text, /Written while looking at: run run1, commit abc1234def, recording rec-1\./);
    assert.match(text, /The moment selected at the time: stage:i_page000001_8 — what the person had open, not a cause/);
    assert.doesNotMatch(text, /because|caused|led to/i);
  });
  it("offers what was recorded nearby as timing, and says so", () => {
    const trace = traceModel(events, [call1]);
    const at = trace.stages[0].at;
    const text = annotationReport(note({ createdAt: at, updatedAt: at }), trace);
    assert.match(text, /Moments recorded around the same time\. This is timing only: the trace records no tie between a note and a moment/);
    assert.doesNotMatch(annotationReport(note(), null), /Moments recorded around the same time/, "and nothing is offered when nothing is near");
  });
  it("says a canvas is a canvas, and that the DOM holds nothing about what is drawn in it", () => {
    const text = annotationReport(note({ anchor: { ...note().anchor, element: { tag: "canvas", size: "300x600", selector: "#solution" } } }), null);
    assert.match(text, /This element is a canvas \(300x600\)\. The trace records it as a DOM element and nothing about what is drawn in it/);
  });
  it("says which frame it is in, and nothing when it is the page", () => {
    assert.equal(frameLine(note().anchor), null);
    const nested = note({ anchor: { ...note().anchor, frame: { frameId: "f_x", name: "Solution", selectorInParent: "iframe:nth-of-type(2)", path: ["main > iframe", "iframe:nth-of-type(2)"], depth: 2, kind: "document" } } });
    assert.match(frameLine(nested.anchor)!, /In “Solution”, 2 frames inside the page \(main > iframe → iframe:nth-of-type\(2\)\)/);
  });
});

describe("the situation names an open annotation", () => {
  const repo = { id: "repo1", owner: "o", name: "n", fullName: "o/n", description: "", language: "" } as Repo;
  const run = { id: "run1", status: "running", trace: "off" } as unknown as SandboxRun;

  it("even with no trace, so a note on an untraced run is not invisible", () => {
    const s = situationBlock({ repo, run, selection: null, trace: null, source: "sandbox", recording: null, annotation: note() });
    assert.match(s, /Annotation open \(what "this" refers to, together with any selected moment\): id a-1, on “Inspect the Solution\.” \(p\) at \/play\./);
    assert.match(s, /Call inspect_annotation with that id/);
  });
  it("and says nothing about one when none is open", () => {
    const s = situationBlock({ repo, run, selection: null, trace: null, source: "sandbox", recording: null, annotation: null });
    assert.doesNotMatch(s, /Annotation open/);
  });
});

describe("the notes listed so Bart can find them", () => {
  it("says there are none rather than inventing a shape", () => {
    assert.equal(annotationList([]), "No notes have been written on this repository's interface.");
  });

  it("gives every note an id, the element it is on and an excerpt", () => {
    const text = annotationList([note(), note({ id: "a-2", body: "The Run button does nothing the second time.", route: "/solve" })]);
    assert.match(text, /^2 notes on this repository's interface\./);
    assert.match(text, /\(a-1\)/);
    assert.match(text, /\(a-2\)/);
    assert.match(text, /on “Inspect the Solution\.” \(p\) at \/play/);
    assert.match(text, /wrote: “Why does the tutor tell me to inspect the Solution here\?”/);
    assert.match(text, /read one in full with inspect_annotation/, "the list is a way in, not the whole note");
  });

  it("orders by when they were written, whatever order the rows arrive in", () => {
    const later = note({ id: "a-2", createdAt: "2026-09-19T01:00:00.000Z", updatedAt: "2026-09-19T01:00:00.000Z" });
    const text = annotationList([later, note()]);
    assert.ok(text.indexOf("(a-1)") < text.indexOf("(a-2)"), "the earlier note is listed first");
    assert.match(text, /#1 .*\(a-1\)/);
    assert.match(text, /#2 .*\(a-2\)/);
  });

  it("marks which run and recording a note was written in, and filters out neither", () => {
    const other = note({ id: "a-2", runId: "run2", recordingId: "rec-9" });
    const text = annotationList([note(), other], { runId: "run1", recordingId: "rec-9" });
    assert.match(text, /\(a-1\)  \[this run\]/);
    assert.match(text, /\(a-2\)  \[the open recording\]/);
    assert.ok(text.includes("(a-2)"), "a note from another run is still listed: notes outlive the run that made them");
  });

  it("marks nothing when the workspace has no run or recording in hand", () => {
    const text = annotationList([note()]);
    assert.ok(!text.includes("[this run]"));
    assert.ok(!text.includes("[the open recording]"));
  });

  it("excerpts a long note instead of spending the budget on one of them", () => {
    const text = annotationList([note({ body: "x".repeat(4000) })]);
    assert.ok(text.length < 600, `one note should not fill the answer, got ${text.length} characters`);
    assert.match(text, /x{159}…/);
  });

  it("flattens a note's newlines so one note stays one line", () => {
    const text = annotationList([note({ body: "First thought.\n\nSecond thought." })]);
    assert.match(text, /wrote: “First thought\. Second thought\.”/);
  });

  it("stays inside the tool budget with many notes", () => {
    const many = Array.from({ length: 300 }, (_, i) => note({ id: `a-${i}`, body: "y".repeat(4000) }));
    const text = annotationList(many);
    assert.ok(text.length <= 12_200, `the listing must be bounded, got ${text.length} characters`);
    assert.match(text, /^300 notes on this repository's interface; the last 200\./);
  });
});
