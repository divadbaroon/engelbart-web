// What Bart is told about a reading of the interface. The thing being
// tested is the framing as much as the text: this is the one source of
// the five that is not a recording of anything, and every claim in it
// has to arrive with the element it was read from.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { semanticsList, semanticsReport } from "../../lib/bart/semantics.ts";
import type { StoredSemantics } from "../../lib/semantics/model.ts";
import type { SemanticNode, UISemanticMap } from "../../lib/semantics/types.ts";
import type { FrameRef } from "../../lib/annotations/target.ts";

const frame = (over: Partial<FrameRef> = {}): FrameRef =>
  ({ frameId: null, name: null, selectorInParent: null, path: [], depth: 0, kind: "document", ...over });

const node = (over: Partial<SemanticNode> & Pick<SemanticNode, "semanticId" | "label">): SemanticNode => ({
  description: null, kind: "other", confidence: "high", ords: [1], targets: [], regionId: null, ...over,
});

const map = (over: Partial<UISemanticMap> = {}): UISemanticMap => ({
  v: 1, signature: "sig", route: "/", documentTitle: null, frame: frame(),
  documentLabel: null, documentConfidence: "high", regions: [], controls: [], truncated: false, ...over,
});

const stored = (over: Partial<StoredSemantics> = {}): StoredSemantics => ({
  id: "s1", repoId: "r", runId: null, signature: "abcdef1234567890", route: "/play", commitSha: null,
  frame: frame({ path: ["#solution"], depth: 1, name: "solution" }), map: null, candidates: null,
  model: "claude-haiku-4-5-20251001", createdAt: "2026-09-19T10:00:00.000Z", ...over,
});

const solution = stored({
  map: map({
    documentLabel: "Solution game", documentConfidence: "high",
    regions: [node({ semanticId: "region_play", label: "Play area", kind: "region", description: "Where the generated game is played." })],
    controls: [
      node({ semanticId: "ctl_generate", label: "Generate game", kind: "action", regionId: "region_play", targets: [{ tag: "button", testid: "gen", text: "Submit" }] }),
      node({ semanticId: "ctl_board", label: "Game board", kind: "visualization", confidence: "low", targets: [{ tag: "canvas", size: "600×400" }] }),
    ],
  }),
});

describe("listing what has been read", () => {
  it("says there is nothing, and why that is not a problem", () => {
    const text = semanticsList([]);
    assert.match(text, /No interface of this application has been read yet/);
    assert.match(text, /names elements by what the page said/);
  });

  it("keeps a failure to read as a failure, not as an empty application", () => {
    assert.match(semanticsList([], "The table is missing."), /The table is missing\./);
  });

  it("gives one line per document, with its path and its signature", () => {
    const text = semanticsList([solution]);
    assert.match(text, /#solution {2}at \/play {2}— {2}Solution game/);
    assert.match(text, /1 region, 2 controls; signature abcdef12/);
    assert.ok(!text.includes("abcdef1234567890"), "a signature is shown short, as the panel shows it");
  });
});

describe("one document's reading", () => {
  const text = semanticsReport([solution], "#solution")!;

  it("says what it is, when it was read and by what", () => {
    assert.match(text, /^Solution game — the document at #solution, route \/play\./m);
    assert.match(text, /claude-haiku-4-5-20251001/);
    assert.match(text, /signature abcdef12/);
  });

  it("puts the raw element under every name it gives", () => {
    assert.match(text, /- Generate game {2}\(action\), in Play area/);
    assert.match(text, /read from: “Submit” \(button\)/);
    assert.match(text, /read from: canvas/);
  });

  it("marks a weak reading as one", () => {
    assert.match(text, /- Game board {2}\(visualization\) {2}\[a guess\]/);
  });

  it("tells the reader it is not evidence", () => {
    assert.match(text, /not a recording of anything that happened/);
    assert.match(text, /where the two disagree, the elements are the evidence/);
  });

  it("finds a document by route or by name as well as by path", () => {
    assert.ok(semanticsReport([solution], "/play"));
    assert.ok(semanticsReport([solution], "solution game"));
  });

  it("says nothing rather than answering about the wrong document", () => {
    const top = stored({ id: "s2", frame: frame(), route: "/", map: map({ documentLabel: "Tutor workspace" }) });
    assert.equal(semanticsReport([solution, top], "#nowhere"), null);
    assert.match(semanticsReport([solution, top], "top")!, /Tutor workspace/);
  });

  it("says when the reading is of only part of a document", () => {
    const cut = stored({ map: map({ documentLabel: "Big page", truncated: true }) });
    assert.match(semanticsReport([cut], "#solution")!, /offered more parts than were shown/);
  });

  it("keeps the survey's worth when the reading itself is unreadable", () => {
    assert.match(semanticsReport([stored({ map: null })], "#solution")!, /could not be read back/);
  });
});
