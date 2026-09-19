// A researcher's note as Bart reads it: their words kept apart from what
// the DOM held, the run and the commit named as where it came from, and
// what the trace holds nearby offered as timing and nothing more.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { annotationReport } from "../../lib/bart/annotations";
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
