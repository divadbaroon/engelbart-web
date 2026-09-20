// Reading a profile before it runs.
//
// The point of these is not that the validator rejects nonsense — it is
// that it rejects the particular nonsense a writer who cannot be asked
// questions will produce: a rule about a control that was never defined,
// two rules at one priority, a label with a hole nothing fills. Every
// case below is a mistake somebody could make and then not notice,
// because the profile would run and quietly say less than it meant to.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateProfile, type ProfileIssue } from "../../../lib/activity/profile/validate.ts";

const MINIMAL = {
  version: 1,
  artifact: { name: "An interface" },
  provenance: { by: "handwritten" },
  surfaces: [{ id: "page", match: { equals: "/" }, label: "the page", role: "shell" }],
  channels: [
    { id: "said", label: "what it says", from: "system", container: { testid: { equals: "log" } } },
    { id: "wrote", label: "what they wrote", from: "person", container: { testid: { equals: "mine" } } },
  ],
  controls: [{ id: "go", label: "the Go button", moment: true, anchor: { testid: { equals: "go" } } }],
  keySets: [{ id: "move", label: "the movement keys", keys: ["ArrowLeft"] }],
  rules: [{
    id: "did-it", sub: "DID_IT", broad: "ACTING", priority: 10,
    when: { controlUsed: ["go"] }, description: { lit: "Did it." }, because: { lit: "the control was used" },
  }],
  fallback: { id: "unclear", sub: "UNCLEAR_MOMENT", broad: "UNCLEAR", description: { lit: "Unclear." }, because: { lit: "nothing identifies it" }, confidence: "low" },
};

type Profile = Record<string, unknown>;
const base = (): Profile => JSON.parse(JSON.stringify(MINIMAL));
const codes = (issues: ProfileIssue[], severity: ProfileIssue["severity"]) => issues.filter((i) => i.severity === severity).map((i) => i.code);
const broken = (edit: (p: Profile) => void) => {
  const p = base();
  edit(p);
  return validateProfile(p);
};
// Every rejection names a code and a path somebody can follow into the file.
const refuses = (code: string, edit: (p: Profile) => void, path?: string) => {
  const r = broken(edit);
  assert.equal(r.ok, false, `expected ${code}`);
  const hit = r.issues.find((i) => i.code === code && i.severity === "error");
  assert.ok(hit, `no ${code} in ${JSON.stringify(codes(r.issues, "error"))}`);
  if (path) assert.equal(hit.path, path);
};

describe("a profile is read before it is run", () => {
  it("passes one that is sound, and says nothing about it", () => {
    const r = validateProfile(base());
    assert.equal(r.ok, true);
    assert.deepEqual(codes(r.issues, "error"), []);
    assert.deepEqual(codes(r.issues, "warning"), []);
  });

  it("refuses a rule about a control nobody defined", () => {
    refuses("control.undefined", (p) => { (p.rules as Profile[])[0].when = { controlUsed: ["nope"] }; }, "rules[0].when.controlUsed[0]");
  });
  it("refuses a rule about a channel nobody defined", () => {
    refuses("channel.undefined", (p) => { (p.rules as Profile[])[0].when = { channelSaid: "nope" }; });
    refuses("channel.undefined", (p) => { (p.rules as Profile[])[0].when = { latestChannelSaid: "nope" }; });
    refuses("channel.undefined", (p) => {
      (p.rules as Profile[])[0].description = { quote: { source: { channel: "nope" }, max: 40 } };
    }, "rules[0].description.quote.source.channel");
  });
  it("refuses a rule about a key set nobody defined", () => {
    refuses("key set.undefined", (p) => { (p.rules as Profile[])[0].when = { keysIn: "nope" }; });
    refuses("key set.undefined", (p) => { (p.rules as Profile[])[0].because = { keys: { in: "nope" } }; });
  });

  it("refuses two rules at one priority", () => {
    // Which of two true readings is given is a decision, and it must be
    // one somebody made rather than one the file order happened to make.
    refuses("rule.priority.duplicate", (p) => {
      (p.rules as Profile[]).push({ ...(p.rules as Profile[])[0], id: "did-it-again", sub: "ALSO" });
    });
  });
  it("refuses two things that share an id", () => {
    refuses("control.duplicate", (p) => { (p.controls as Profile[]).push({ ...(p.controls as Profile[])[0] }); });
    refuses("channel.duplicate", (p) => { (p.channels as Profile[]).push({ ...(p.channels as Profile[])[0] }); });
  });

  it("refuses a broad class that is not one of the nine", () => {
    refuses("broad.unknown", (p) => { (p.rules as Profile[])[0].broad = "THINKING"; }, "rules[0].broad");
    refuses("broad.unknown", (p) => { (p.rules as Profile[])[0].when = { history: { window: 1, test: { broad: ["THINKING"] } } }; });
  });
  it("refuses a surface role that is not one of the four", () => {
    refuses("role.unknown", (p) => { (p.surfaces as Profile[])[0].role = "sidebar"; }, "surfaces[0].role");
  });

  it("refuses a label with a hole nothing fills", () => {
    // It would run, and print an empty string into a sentence.
    refuses("surface.capture", (p) => { (p.surfaces as Profile[])[0].label = "the page {1}"; }, "surfaces[0].label");
    refuses("surface.capture", (p) => {
      const s = (p.surfaces as Profile[])[0];
      s.match = { glob: "step-*" };
      s.label = "step {2}";
    });
  });
  it("accepts a label that fills the hole its glob opens", () => {
    const r = broken((p) => {
      const s = (p.surfaces as Profile[])[0];
      s.match = { glob: "step-*" };
      s.label = "the reference for step {1}";
    });
    assert.equal(r.ok, true);
  });

  it("refuses an anchor form nobody implements", () => {
    refuses("anchor.unknown", (p) => { (p.controls as Profile[])[0].anchor = { nearestButton: { equals: "go" } }; });
  });
  it("refuses an anchor that is two forms at once", () => {
    // Two keys would mean the compiler silently picked one of them.
    refuses("anchor.ambiguous", (p) => { (p.controls as Profile[])[0].anchor = { testid: { equals: "go" }, text: { equals: "Go" } }; });
  });
  it("refuses a string test that is two tests at once, or none", () => {
    refuses("test.form", (p) => { (p.controls as Profile[])[0].anchor = { testid: { equals: "go", prefix: "g" } }; });
    refuses("test.form", (p) => { (p.controls as Profile[])[0].anchor = { testid: {} }; });
  });

  it("refuses a predicate or a template it cannot compile", () => {
    refuses("predicate.unknown", (p) => { (p.rules as Profile[])[0].when = { scrolled: true }; });
    refuses("predicate.flag", (p) => { (p.rules as Profile[])[0].when = { flag: "regions" }; }, "rules[0].when.flag");
    refuses("predicate.acts", (p) => { (p.rules as Profile[])[0].when = { acts: { of: ["scrolls"], op: "gt", value: 0 } }; });
    refuses("op.unknown", (p) => { (p.rules as Profile[])[0].when = { acts: { of: ["keys"], op: "over", value: 0 } }; });
    refuses("predicate.window", (p) => { (p.rules as Profile[])[0].when = { history: { window: 0, test: { sub: ["DID_IT"] } } }; });
    refuses("template.unknown", (p) => { (p.rules as Profile[])[0].description = { number: "keys" }; });
    refuses("template.count", (p) => { (p.rules as Profile[])[0].because = { count: { of: ["scrolls"], one: "scroll" } }; });
  });
  it("refuses a cond with no else, because a sentence has to come out either way", () => {
    refuses("template.else", (p) => {
      (p.rules as Profile[])[0].description = { cond: [{ when: { always: true }, then: { lit: "Did it." } }] };
    });
  });
  it("refuses a fallback with a condition on it", () => {
    refuses("fallback.when", (p) => { (p.fallback as Profile).when = { always: true }; });
  });
  it("refuses a confidence that is not one of the three", () => {
    refuses("confidence.unknown", (p) => { (p.rules as Profile[])[0].confidence = "certain"; });
  });

  it("says everything that is wrong at once, not the first thing", () => {
    const r = broken((p) => {
      (p.rules as Profile[])[0].broad = "THINKING";
      (p.rules as Profile[])[0].when = { controlUsed: ["nope"] };
      (p.surfaces as Profile[])[0].role = "sidebar";
    });
    assert.equal(r.ok, false);
    assert.ok(codes(r.issues, "error").length >= 3, JSON.stringify(codes(r.issues, "error")));
  });
});

describe("a profile is warned about before it disappoints", () => {
  it("warns when a control or a channel is known only by where it sat", () => {
    const r = broken((p) => { (p.controls as Profile[])[0].anchor = { selector: { prefix: "main > div:nth-of-type(2)" } }; });
    assert.equal(r.ok, true, "it still runs");
    assert.ok(codes(r.issues, "warning").includes("anchor.positional"));
  });
  it("does not warn when a positional test is one way in among better ones", () => {
    const r = broken((p) => {
      (p.controls as Profile[])[0].anchor = { all: [{ testid: { equals: "go" } }, { selector: { contains: "form" } }] };
    });
    assert.deepEqual(codes(r.issues, "warning"), []);
  });
  it("warns when nothing carries the person's own words", () => {
    const r = broken((p) => { p.channels = [(p.channels as Profile[])[0]]; });
    assert.ok(codes(r.issues, "warning").includes("profile.noperson"));
  });
  it("warns when no control is a deed rather than a door", () => {
    const r = broken((p) => { delete (p.controls as Profile[])[0].moment; });
    assert.ok(codes(r.issues, "warning").includes("profile.nomoment"));
  });
  it("warns about anything written down with nothing cited for it", () => {
    const r = broken((p) => {
      (p.rules as Profile[])[0].generation = { confidence: "medium", grounding: "inference", note: "a guess" };
    });
    assert.equal(r.ok, true);
    assert.ok(codes(r.issues, "warning").includes("generation.inference"));
  });
});

describe("a profile nobody wrote carefully still does not take the page down", () => {
  const junk: unknown[] = [null, undefined, 42, "a profile", [], true, { version: 2 }, { version: 1 }];
  for (const [i, v] of junk.entries()) {
    it(`survives junk ${i}`, () => {
      const r = validateProfile(v);
      assert.equal(r.ok, false);
      assert.ok(r.issues.length);
    });
  }

  it("survives every single key being missing", () => {
    // One field at a time, everywhere in the file. None of these may
    // throw: a profile is checked in front of somebody who wants to know
    // what is wrong with it, not in a crash.
    const walk = (node: unknown, path: string[] = []): string[][] => {
      if (Array.isArray(node)) return node.flatMap((v, i) => walk(v, [...path, String(i)]));
      if (node && typeof node === "object") {
        return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => [[...path, k], ...walk(v, [...path, k])]);
      }
      return [];
    };
    const paths = walk(MINIMAL);
    assert.ok(paths.length > 40, `${paths.length} places to break`);
    for (const path of paths) {
      const p = base();
      let node: Record<string, unknown> = p;
      for (const step of path.slice(0, -1)) node = node[step] as Record<string, unknown>;
      delete node[path[path.length - 1]];
      assert.doesNotThrow(() => validateProfile(p), `deleting ${path.join(".")} threw`);
    }
  });

  it("survives every single value being the wrong type", () => {
    const walk = (node: unknown, path: string[] = []): string[][] => {
      if (Array.isArray(node)) return node.flatMap((v, i) => walk(v, [...path, String(i)]));
      if (node && typeof node === "object") {
        return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => [[...path, k], ...walk(v, [...path, k])]);
      }
      return [];
    };
    for (const wrong of [null, 0, "", [], {}, true]) {
      for (const path of walk(MINIMAL)) {
        const p = base();
        let node: Record<string, unknown> = p;
        for (const step of path.slice(0, -1)) node = node[step] as Record<string, unknown>;
        node[path[path.length - 1]] = wrong;
        assert.doesNotThrow(() => validateProfile(p), `${path.join(".")} = ${JSON.stringify(wrong)} threw`);
      }
    }
  });
});
