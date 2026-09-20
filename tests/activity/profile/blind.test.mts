// The machinery must not know what it is reading.
//
// This is the test the whole arrangement rests on. A profile language
// that quietly grew a special case for one artifact would still pass the
// parity test — it would pass it more easily — and the generated profile
// experiment would then be measuring how well a model can reproduce
// something the compiler already knew. Everything an artifact means has
// to live in a profile, which is data, and nothing may leak into the code
// that reads one.
//
// So the check is on the source text: the generic modules are read as
// files and searched for the nouns of the one artifact we have. They are
// searched with their comments intact, because a comment naming an
// artifact is evidence the code was written around it even when the code
// itself is clean.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compileProfile } from "../../../lib/activity/profile/compile.ts";
import { validateProfile } from "../../../lib/activity/profile/validate.ts";
import { fitReport } from "../../../lib/activity/profile/fit.ts";
import type { ArtifactProfile } from "../../../lib/activity/profile/schema.ts";

// The profile substrate: the language, and everything that reads one.
// These are new, and they are held to the strict standard — no artifact
// anywhere in them, comments included, because a comment naming an
// artifact is evidence the code was written around it even when the code
// itself is clean.
const SUBSTRATE = [
  "../../../lib/activity/profile/schema.ts",
  "../../../lib/activity/profile/validate.ts",
  "../../../lib/activity/profile/compile.ts",
  "../../../lib/activity/profile/fit.ts",
  // The tests for the generic machinery are generic too. A fixture that
  // smuggled the artifact in through a test would be the same leak.
  "./schema.test.mts",
  "./compile.test.mts",
];
// This file is not in that list, and cannot be: it has to spell the nouns
// it bans in order to ban them.

// The layers a profile compiles down into. These are older, and their
// comments explain themselves by pointing at the one artifact we have
// ("nothing in this file knows what a tutor is") — which is worth saying
// and is not a leak. So they are held to the standard that matters: no
// artifact in the code.
const BENEATH = [
  "../../../lib/activity/taxonomy.ts",
  "../../../lib/activity/classify.ts",
  "../../../lib/activity/segment.ts",
  "../../../lib/activity/types.ts",
  "../../../lib/activity/graph.ts",
];

const source = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const withoutComments = (text: string) => text.replace(/\/\/[^\n]*/g, "");

// The one artifact we have, in the words it uses for itself.
const NOUNS = [
  /\bROPE\b/,
  /\bTetris\b/i,
  /\btutors?\b/i,
  /\bsolutions?\b/i,
  /\bmy[ -]canvas\b/i,
  /\brequirements?\b/i,
];

// Banned in the profile language and allowed below it. "Participant" is
// the word for the person being observed, and graph.ts draws their own
// stream with it; it is also what this artifact happens to call the
// channel carrying their words, and the profile language has no business
// knowing either.
const SUBSTRATE_ONLY = [/\bparticipants?\b/i];

// One artifact-specific string is left in the layers beneath, knowingly.
//
// graph.ts picks the verb for a node that says what appeared — "The tutor
// answered", "The requirements document was added to" — by comparing the
// channel's id to a literal. Any other artifact's channel therefore
// renders as "answered", which would be wrong for a legend, a log or a
// map. The fix is a verb on the channel rather than a test on its id, and
// it belongs with whatever changes what the canvas says; it is pinned
// here so that it cannot grow a second one quietly.
const KNOWN_LEAKS: Record<string, string[]> = {
  "../../../lib/activity/graph.ts": ['if (id === "requirements") return `${head} was added to`;'],
};

const clean = (file: string): string => {
  let code = withoutComments(source(file));
  for (const line of KNOWN_LEAKS[file] ?? []) {
    assert.ok(code.includes(line), `${file} no longer contains the pinned line, so the pin is stale: ${line}`);
    code = code.replace(line, "");
  }
  return code;
};

describe("the profile machinery does not know what it is reading", () => {
  for (const file of SUBSTRATE) {
    it(`${file.split("/").pop()} names no artifact, in code or in comment`, () => {
      const text = source(file);
      for (const noun of [...NOUNS, ...SUBSTRATE_ONLY]) {
        const hit = noun.exec(text);
        assert.equal(hit, null, hit ? `${file} says "${hit[0]}" — ${text.slice(Math.max(0, hit.index - 60), hit.index + 60).replace(/\n/g, " ")}` : "");
      }
    });
  }

  for (const file of BENEATH) {
    it(`${file.split("/").pop()} names no artifact in its code`, () => {
      const code = clean(file);
      for (const noun of NOUNS) {
        const hit = noun.exec(code);
        assert.equal(hit, null, hit ? `${file} says "${hit[0]}" — ${code.slice(Math.max(0, hit.index - 60), hit.index + 60).replace(/\n/g, " ")}` : "");
      }
    });
  }

  it("has exactly one known leak, and it is the one that is written down", () => {
    // If this ever passes with an empty list, delete the pin.
    assert.deepEqual(Object.keys(KNOWN_LEAKS), ["../../../lib/activity/graph.ts"]);
    assert.equal(KNOWN_LEAKS["../../../lib/activity/graph.ts"].length, 1);
  });

  it("reaches for nothing that knows one", () => {
    // A single import would be enough, and it is the easiest leak to
    // make by accident.
    for (const file of [...SUBSTRATE, ...BENEATH]) {
      const imports = [...source(file).matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
      for (const from of imports) {
        assert.doesNotMatch(from, /rope/i, `${file} imports ${from}`);
        assert.doesNotMatch(from, /fixtures/, `${file} imports ${from}`);
      }
    }
  });

  it("holds no selector, route or element name of any particular page", () => {
    // Positional CSS, routes and framework attribute names are how an
    // artifact gets into code without being named.
    // The lib modules only: the tests below them are allowed to write a
    // positional selector down, because testing that the validator warns
    // about one means having one to hand it.
    for (const file of SUBSTRATE.filter((f) => f.endsWith(".ts"))) {
      const code = withoutComments(source(file));
      assert.doesNotMatch(code, /nth-of-type/, `${file} carries a positional selector`);
      assert.doesNotMatch(code, /\bdata-(testid|test-id|test)\b/, `${file} hard-codes an attribute name`);
      assert.doesNotMatch(code, /"\/[a-z]/, `${file} carries a route`);
    }
  });

  it("classifies on no name a model wrote", () => {
    // The regions of an interface are named by a model and drift between
    // runs of the same page. They are enrichment for a reader, and a
    // profile has no operator that can reach them — which has to stay
    // true of the compiler as well as of the schema.
    for (const file of [...SUBSTRATE, ...BENEATH]) {
      const code = withoutComments(source(file));
      assert.doesNotMatch(code, /evidence\.regions|\bsemanticId\b|\bregionId\b/, `${file} reads a generated name`);
    }
  });
});

// A profile with nothing in common with the one we have, to show the
// machinery is not shaped around a single artifact. Nothing here is a
// document, a conversation or a game.
const ELSEWHERE: ArtifactProfile = {
  version: 1,
  artifact: { name: "A mapping tool" },
  provenance: { by: "handwritten" },
  surfaces: [
    { id: "atlas", match: { equals: "atlas" }, label: "the atlas", role: "shell" },
    { id: "layer", match: { glob: "layer-*" }, label: "layer {1}", role: "reference" },
  ],
  channels: [
    { id: "legend", label: "the legend", from: "system", container: { role: { equals: "status" } } },
    { id: "annotation", label: "their annotations", from: "person", container: { testid: { equals: "note" } } },
  ],
  controls: [
    { id: "zoom", label: "the zoom control", anchor: { role: { equals: "slider" }, name: { equals: "Zoom" } } },
    { id: "measure", label: "the measure tool", moment: true, anchor: { testid: { equals: "measure" } } },
  ],
  keySets: [{ id: "pan", label: "the panning keys", keys: ["ArrowLeft", "ArrowRight"] }],
  rules: [
    {
      id: "measuring", sub: "MEASURE_DISTANCE", broad: "EVALUATING", priority: 10,
      when: { controlUsed: ["measure"] },
      description: { lit: "Measured a distance on the map." },
      because: { lit: "the measure tool was used" },
    },
    {
      id: "panning", sub: "PAN_THE_MAP", broad: "EXPLORING", priority: 20,
      when: { all: [{ surfaceRole: ["shell"] }, { keysIn: "pan" }] },
      description: { lit: "Moved around the map." },
      because: { join: [{ count: { of: ["keys"], one: "press", many: "presses" } }, { lit: " of " }, { keys: { in: "pan" } }, { lit: " over " }, { duration: true }] },
    },
    {
      id: "reading-legend", sub: "READ_THE_LEGEND", broad: "UNDERSTANDING", priority: 30,
      when: { all: [{ channelSaid: "legend" }, { not: { acts: { of: ["keys", "clicks"], op: "gt", value: 0 } } }] },
      description: { join: [{ lit: "Appeared to read the legend: " }, { quote: { source: { channel: "legend" }, max: 40 } }, { lit: "." }] },
      because: { join: [{ lit: "the legend changed and stayed on screen for " }, { duration: true }] },
      confidence: "medium",
    },
  ],
  fallback: {
    id: "unread", sub: "UNREAD", broad: "UNCLEAR",
    description: { lit: "Activity the trace does not characterise." },
    because: { join: [{ count: { of: ["clicks"], one: "click" } }, { lit: " in " }, { field: "surfaceLabel" }, { lit: ", with nothing that identifies the activity" }] },
    confidence: "low",
  },
};

describe("the same machinery reads an artifact it has never seen", () => {
  it("validates it with nothing to report", () => {
    const r = validateProfile(ELSEWHERE);
    assert.equal(r.ok, true, r.ok ? "" : JSON.stringify(r.issues, null, 2));
    assert.deepEqual(r.issues.filter((i) => i.severity === "warning").map((i) => i.code), []);
  });

  it("compiles it into a working taxonomy", () => {
    const c = compileProfile(ELSEWHERE);
    assert.equal(c.taxonomy.name, "A mapping tool");
    assert.deepEqual(c.surfaceOf("layer-7"), { label: "layer 7", role: "reference" });
    assert.deepEqual(c.surfaceOf("atlas"), { label: "the atlas", role: "shell" });
    assert.deepEqual(c.surfaceOf("elsewhere"), { label: "elsewhere", role: "other" });
    assert.deepEqual(c.ruleIds, ["measuring", "panning", "reading-legend"]);
    assert.equal(c.taxonomy.controls.find((x) => x.id === "measure")!.moment, true);
    // And the anchors point where they say they point.
    assert.equal(c.taxonomy.controls.find((x) => x.id === "zoom")!.is({ role: "slider", label: "Zoom" }), true);
    assert.equal(c.taxonomy.controls.find((x) => x.id === "zoom")!.is({ role: "slider", label: "Rotate" }), false);
  });

  it("reports the fit of a profile against a session it does not match", () => {
    const c = compileProfile(ELSEWHERE);
    const fit = fitReport(ELSEWHERE, c, { episodes: [], events: [] });
    // Everything dead, nothing silent-by-omission: an empty session is a
    // report of total non-fit rather than a clean bill of health.
    assert.equal(fit.episodes, 0);
    assert.deepEqual(fit.dead.map((d) => d.id).sort(), ["annotation", "atlas", "layer", "legend", "measure", "zoom"]);
    assert.deepEqual(fit.silent.map((s) => s.id), ["measuring", "panning", "reading-legend"]);
  });
});
