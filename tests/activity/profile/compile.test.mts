// Turning data into the closures the classifier already consults.
//
// Two things are being pinned here. That each anchor form reads the field
// it says it reads — a profile that means "the element whose test id is
// go" must not match an element that merely says "go" — and that the
// order of preference is real: the schema claims a ranking from what the
// interface calls a thing down to where it happened to sit, and something
// that generates a profile will be told to work down that list, so the
// list has to be the one the code uses.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compileAnchor, compileProfile, globCaptures, globArity, HANDWRITTEN_ANCHOR_FORMS } from "../../../lib/activity/profile/compile.ts";
import { ANCHOR_FORMS, rung, positional, type Anchor, type ArtifactProfile } from "../../../lib/activity/profile/schema.ts";
import { validateProfile } from "../../../lib/activity/profile/validate.ts";
import type { ElementTarget } from "../../../lib/trace/types.ts";
import type { Context } from "../../../lib/activity/taxonomy.ts";
import type { Episode, Evidence } from "../../../lib/activity/types.ts";

const matches = (a: Anchor, t: ElementTarget) => compileAnchor(a)(t);

describe("an anchor reads the field it names", () => {
  const button: ElementTarget = {
    tag: "button", selector: "main > form > button:nth-of-type(2)", id: "send-it", name: "send", type: "submit",
    role: "button", text: "Send", label: "Send the message", placeholder: "Write here", title: "Send (Enter)",
    testid: "composer-send", classes: ["primary", "wide"], href: "https://example.test/go", editable: "text",
  };

  const each: [string, Anchor, boolean][] = [
    ["testid", { testid: { equals: "composer-send" } }, true],
    ["testid, wrong", { testid: { equals: "Send" } }, false],
    ["id", { elementId: { equals: "send-it" } }, true],
    ["role", { role: { equals: "button" } }, true],
    ["role and accessible name", { role: { equals: "button" }, name: { equals: "Send the message" } }, true],
    ["role, wrong name", { role: { equals: "button" }, name: { equals: "Cancel" } }, false],
    ["label", { label: { equals: "Send the message" } }, true],
    ["field name", { fieldName: { equals: "send" } }, true],
    ["input type", { inputType: { equals: "submit" } }, true],
    ["placeholder", { placeholder: { equals: "Write here" } }, true],
    ["editable", { editable: { present: true } }, true],
    ["title", { title: { prefix: "Send" } }, true],
    ["href", { href: { contains: "example.test" } }, true],
    ["text", { text: { equals: "Send" } }, true],
    ["tag", { tag: { equals: ["textarea", "button"] } }, true],
    ["classes", { classes: { equals: "wide" } }, true],
    ["classes, wrong", { classes: { equals: "narrow" } }, false],
    ["selector", { selector: { contains: "form" } }, true],
    ["all", { all: [{ tag: { equals: "button" } }, { testid: { present: true } }] }, true],
    ["all, one false", { all: [{ tag: { equals: "button" } }, { testid: { equals: "nope" } }] }, false],
    ["any", { any: [{ testid: { equals: "nope" } }, { text: { equals: "Send" } }] }, true],
    ["not", { not: { testid: { equals: "nope" } } }, true],
  ];
  for (const [name, a, expected] of each) it(name, () => assert.equal(matches(a, button), expected));

  it("does not confuse one field for another", () => {
    // The whole point of a ranked vocabulary: "go" as a test id and "go"
    // as the word on the button are different claims about the element.
    const said: ElementTarget = { tag: "button", text: "go" };
    assert.equal(matches({ text: { equals: "go" } }, said), true);
    assert.equal(matches({ testid: { equals: "go" } }, said), false);
    assert.equal(matches({ elementId: { equals: "go" } }, said), false);
  });

  it("reads wording the way somebody reads it, and identity exactly", () => {
    const loose: ElementTarget = { tag: "button", text: "  Next   Step ", testid: "Next-Step" };
    assert.equal(matches({ text: { equals: "next step" } }, loose), true, "collapsed and case-folded");
    assert.equal(matches({ testid: { equals: "next-step" } }, loose), false, "a test id that differs in case is a different test id");
  });

  it("falls back to the label for a control whose words are an icon", () => {
    const icon: ElementTarget = { tag: "button", label: "Close" };
    assert.equal(matches({ text: { equals: "Close" } }, icon), true);
  });

  it("matches nothing rather than throwing on a form it does not know", () => {
    assert.equal(matches({ nearestButton: { equals: "x" } } as unknown as Anchor, button), false);
    assert.doesNotThrow(() => matches(null as unknown as Anchor, button));
  });
});

describe("the two anchor vocabularies stay the same size", () => {
  // A taxonomy written by hand and one compiled from data have to be able
  // to point at the same elements, or a profile is a second-class way of
  // saying things. This is the correspondence, written down, so that a
  // helper added to one side and not the other fails here rather than
  // turning up as an anchor a generated profile cannot express.
  const SAME: Record<string, string> = {
    testid: "testid", appId: "appId", appIdAttr: "appIdAttr", id: "elementId", role: "role", label: "label",
    name: "fieldName", type: "inputType", placeholder: "placeholder", editable: "editable",
    title: "title", href: "href", text: "text", tag: "tag", classes: "classes",
    selector: "selector", all: "all", any: "any", not: "not",
    // The accessible name is the optional half of the role form rather
    // than a form of its own.
    named: "role",
  };

  it("has a profile form for every helper a handwritten taxonomy can use", () => {
    const missing = HANDWRITTEN_ANCHOR_FORMS.filter((h) => !SAME[h]);
    assert.deepEqual(missing, [], `no profile form for ${missing.join(", ")}`);
    for (const [hand, form] of Object.entries(SAME)) {
      assert.ok(HANDWRITTEN_ANCHOR_FORMS.includes(hand), `anchor.${hand} no longer exists`);
      assert.ok((ANCHOR_FORMS as readonly string[]).includes(form), `the profile has no ${form} form`);
    }
  });

  it("has a helper for every profile form", () => {
    const covered = new Set(Object.values(SAME));
    const missing = ANCHOR_FORMS.filter((f) => !covered.has(f));
    assert.deepEqual(missing, [], `nothing handwritten corresponds to ${missing.join(", ")}`);
  });
});

describe("the ranking is the one the schema claims", () => {
  it("puts what the interface calls a thing above what it says, and position last", () => {
    const order: Anchor[] = [
      { testid: { equals: "a" } }, { role: { equals: "button" } },
      { inputType: { equals: "text" } }, { text: { equals: "a" } },
      { tag: { equals: "a" } }, { selector: { equals: "a" } },
    ];
    const rungs = order.map(rung);
    assert.deepEqual(rungs, [...rungs].sort((a, b) => a - b), "the list is in preference order");
    assert.equal(rungs[0], 1);
    assert.equal(rungs[rungs.length - 1], 6);
  });

  it("is as strong as the strongest thing every match must satisfy", () => {
    assert.equal(rung({ all: [{ testid: { equals: "a" } }, { selector: { equals: "b" } }] }), 1);
  });
  it("is only as strong as the weakest thing a match may rest on", () => {
    assert.equal(rung({ any: [{ testid: { equals: "a" } }, { selector: { equals: "b" } }] }), 6);
  });
  it("says when position is involved at all", () => {
    assert.equal(positional({ all: [{ testid: { equals: "a" } }, { selector: { equals: "b" } }] }), true);
    assert.equal(positional({ testid: { equals: "a" } }), false);
  });
});

describe("a glob stands for a family without being a pattern", () => {
  it("captures what it stood for", () => {
    assert.deepEqual(globCaptures("step-*", "step-12"), ["12"]);
    assert.deepEqual(globCaptures("*-of-*", "one-of-two"), ["one", "two"]);
    assert.equal(globCaptures("step-*", "other-12"), null);
    assert.equal(globArity("a-*-b-*"), 2);
  });
  it("is anchored at both ends", () => {
    assert.equal(globCaptures("step-*", "a step-1"), null);
    assert.deepEqual(globCaptures("step-*", "step-"), [""]);
  });
  it("treats everything but the star as itself", () => {
    // A profile cannot smuggle a pattern in through a glob.
    assert.equal(globCaptures("a.b", "axb"), null);
    assert.deepEqual(globCaptures("a.b", "a.b"), []);
    assert.equal(globCaptures("a+", "aaa"), null);
    assert.equal(globCaptures("(a)", "a"), null);
  });
});

// ---- the whole compile, on a profile with no artifact in it
const SHAPE = {
  version: 1,
  artifact: { name: "A shape" },
  provenance: { by: "handwritten" },
  surfaces: [
    { id: "page", match: { equals: ["/", "top"] }, label: "the page", role: "shell" },
    { id: "part", match: { glob: "part-*" }, label: "part {1} of {key}", role: "reference" },
  ],
  channels: [
    { id: "out", label: "what it says", from: "system", container: { testid: { equals: "log" } } },
    { id: "in", label: "what they wrote", from: "person", container: { role: { equals: "log" } }, text: { prefix: "you:" } },
  ],
  controls: [
    { id: "go", label: "the Go button", moment: true, anchor: { testid: { equals: "go" } } },
    { id: "tab", label: "the tab", anchor: { role: { equals: "tab" } } },
  ],
  keySets: [{ id: "move", label: "the movement keys", keys: ["ArrowLeft", "ArrowRight"] }],
  rules: [
    { id: "late", sub: "LATE", broad: "UNCLEAR", priority: 99, when: { always: true }, description: { lit: "Late." }, because: { lit: "last" } },
    { id: "early", sub: "EARLY", broad: "ACTING", priority: 1, when: { controlUsed: ["go"] }, description: { lit: "Early." }, because: { lit: "first" } },
  ],
  fallback: { id: "none", sub: "NONE", broad: "UNCLEAR", description: { lit: "Nothing." }, because: { lit: "nothing" }, confidence: "low" },
};

const build = (over: Partial<ArtifactProfile> = {}) => {
  const checked = validateProfile({ ...SHAPE, ...over });
  assert.equal(checked.ok, true, checked.ok ? "" : JSON.stringify(checked.issues));
  return compileProfile((checked as { profile: ArtifactProfile }).profile);
};

const BLANK: Evidence = {
  surface: { key: "/", label: "the page", role: "shell", frameIds: [] },
  regions: [], acts: { keys: 0, clicks: 0, typing: 0, submits: 0, navigations: 0, gestures: 0 },
  keyNames: [], appeared: [], entered: null, observed: true,
  composing: false, submitted: false, awaiting: false, call: null,
  entered_by: [], controls: [], openingQuietMs: 0, quietMs: 0, discontinuity: null,
};
const context = (over: Partial<Evidence> = {}, ctx: Partial<Context> = {}): Context =>
  ({ evidence: { ...BLANK, ...over }, durationMs: 6_000, index: 0, previous: null, before: [], ...ctx });

describe("a compiled profile is a taxonomy like any other", () => {
  const c = build();

  it("names documents, and lets an unnamed one stand for itself", () => {
    assert.deepEqual(c.surfaceOf("/"), { label: "the page", role: "shell" });
    assert.deepEqual(c.surfaceOf("top"), { label: "the page", role: "shell" });
    assert.deepEqual(c.surfaceOf("part-3"), { label: "part 3 of part-3", role: "reference" });
    // Failing closed matters: every rule about a named document must miss.
    assert.deepEqual(c.surfaceOf("whatever"), { label: "whatever", role: "other" });
    assert.equal(c.surfaceMatch("whatever"), null);
  });

  it("orders rules by the priority they declare, not by where they sit in the file", () => {
    assert.deepEqual(c.ruleIds, ["early", "late"]);
    assert.deepEqual(c.taxonomy.rules.map((r) => r.sub), ["EARLY", "LATE"]);
  });

  it("carries which controls are deeds rather than doors", () => {
    assert.deepEqual(c.taxonomy.controls.map((x) => [x.id, !!x.moment]), [["go", true], ["tab", false]]);
  });

  it("recognises a channel by its container, its text, or both", () => {
    const out = c.taxonomy.channels.find((x) => x.id === "out")!;
    const inn = c.taxonomy.channels.find((x) => x.id === "in")!;
    assert.equal(out.is({ at: 0, container: { testid: "log" }, text: "anything" }), true);
    assert.equal(out.is({ at: 0, container: null, text: "anything" }), false);
    assert.equal(inn.is({ at: 0, container: { role: "log" }, text: "you: hello" }), true);
    assert.equal(inn.is({ at: 0, container: { role: "log" }, text: "it: hello" }), false, "the text has to match too");
  });

  it("looks outwards from the region a repaint reported when the region itself is anonymous", () => {
    // What changes on screen is often an unnamed wrapper inside the panel
    // a channel is written against, so a channel that names the panel
    // matched nothing. Its ancestors are recorded; the one the channel
    // names is among them.
    const out = c.taxonomy.channels.find((x) => x.id === "out")!;
    assert.equal(out.is({ at: 0, container: { tag: "div" }, within: [{ tag: "section" }, { testid: "log" }], text: "anything" }), true);
    assert.equal(out.is({ at: 0, container: { tag: "div" }, within: [{ tag: "section" }], text: "anything" }), false, "and only when one of them is it");
    assert.equal(out.is({ at: 0, container: { tag: "div" }, text: "anything" }), false, "an appearance recorded before ancestors were reads as it always did");
  });

  // Wheeling and dragging are counted like any other act, so a profile
  // can be written against them with no change to any of this. Run 2's
  // frozen profile predates them and says nothing about them, which is
  // the point: the language grew, the profile did not have to.
  it("lets a rule be written against gesturing, the way one is written against typing", () => {
    const g = build({
      rules: [
        { id: "gesturing", sub: "GESTURING", broad: "EXPLORING", priority: 1,
          when: { acts: { of: ["gestures"], op: "gte", value: 5 } },
          description: { count: { of: ["gestures"], one: "movement" } }, because: { lit: "they moved about" } },
        SHAPE.rules[0],
      ] as ArtifactProfile["rules"],
    });
    const fired = (gestures: number) => {
      const ctx = context({ acts: { ...BLANK.acts, gestures } });
      const rule = g.taxonomy.rules.find((r) => r.when(ctx)) ?? g.taxonomy.fallback;
      return [rule.sub, rule.read(ctx).description];
    };
    assert.deepEqual(fired(9), ["GESTURING", "9 movements"]);
    assert.deepEqual(fired(1), ["LATE", "Late."], "and it does not fire under the threshold");
  });

  it("keeps the record of exactly-named documents, for a caller that injects nothing", () => {
    assert.deepEqual(c.taxonomy.surfaces["/"], { label: "the page", role: "shell" });
    assert.ok(!("part-3" in c.taxonomy.surfaces), "a shape is not a key");
  });
});

describe("a sentence is assembled, never interpolated", () => {
  const read = (description: unknown, evidence: Partial<Evidence> = {}, ctx: Partial<Context> = {}) => {
    const c = build({ rules: [{ ...SHAPE.rules[1], when: { always: true }, description }] as ArtifactProfile["rules"] });
    return c.taxonomy.rules[0].read(context(evidence, ctx)).description;
  };

  it("counts with the right number of the noun", () => {
    assert.equal(read({ count: { of: ["clicks"], one: "click" } }, { acts: { ...BLANK.acts, clicks: 1 } }), "1 click");
    assert.equal(read({ count: { of: ["clicks"], one: "click" } }, { acts: { ...BLANK.acts, clicks: 4 } }), "4 clicks");
    assert.equal(read({ count: { of: ["keys"], one: "press", many: "presses" } }, { acts: { ...BLANK.acts, keys: 2 } }), "2 presses");
    assert.equal(read({ count: { of: ["keys", "clicks"], one: "act" } }, { acts: { ...BLANK.acts, keys: 2, clicks: 3 } }), "5 acts");
  });

  it("says a duration the way it is read inside a sentence", () => {
    assert.equal(read({ duration: true }, {}, { durationMs: 122_000 }), "2m 2s");
  });

  it("quotes only the first sentence, clipped, and says nothing where there is nothing", () => {
    const said = [{ at: 0, channel: "out", text: "Good start. Now what about the walls?", fresh: true }];
    assert.equal(read({ quote: { source: { channel: "out" }, max: 40 } }, { appeared: said }), "“Good start”");
    assert.equal(read({ quote: { source: { channel: "out" }, max: 40 } }, {}), "", "nothing said is an empty string, not a crash");
  });

  it("takes the first source that has anything in it", () => {
    // Nothing was said in this stretch, so the quote has to come from the
    // last stretch in which something was.
    const earlier: Episode = {
      id: "episode:earlier", broadBehavior: "WAITING", subBehavior: "WAITED", description: "", startedAt: "", endedAt: "",
      durationMs: 0, confidence: "high", determined: "rule", because: "", stageIds: [], stages: [], events: [],
      evidence: { ...BLANK, appeared: [{ at: 0, channel: "out", text: "Earlier words.", fresh: true }] },
    };
    const tpl = { quote: { source: { firstOf: [{ channel: "out" }, { latestChannel: "out" }] }, max: 40 } };
    assert.equal(read(tpl, {}, { before: [earlier] }), "“Earlier words”");
  });

  it("lists only the keys of the set it was asked about", () => {
    assert.equal(read({ keys: { in: "move", join: ", " } }, { keyNames: ["ArrowLeft", "q", "ArrowRight"] }), "ArrowLeft, ArrowRight");
  });

  it("branches, and always comes out with a sentence", () => {
    const tpl = { cond: [{ when: { flag: "submitted" }, then: { lit: "Sent." } }], else: { lit: "Not sent." } };
    assert.equal(read(tpl, { submitted: true }), "Sent.");
    assert.equal(read(tpl, {}), "Not sent.");
  });

  it("chooses a confidence from the evidence where the rule says to", () => {
    const c = build({ rules: [{
      ...SHAPE.rules[1], when: { always: true },
      confidence: { cond: [{ when: { acts: { of: ["keys"], op: "gt", value: 0 } }, then: "high" }], else: "medium" },
    }] as ArtifactProfile["rules"] });
    assert.equal(c.taxonomy.rules[0].read(context({ acts: { ...BLANK.acts, keys: 2 } })).confidence, "high");
    assert.equal(c.taxonomy.rules[0].read(context()).confidence, "medium");
  });

  it("claims the act itself is in the trace only where a rule does not say otherwise", () => {
    assert.equal(build().taxonomy.rules[0].read(context()).confidence, "high");
    assert.equal(build().taxonomy.fallback.read(context()).confidence, "low");
  });
});
