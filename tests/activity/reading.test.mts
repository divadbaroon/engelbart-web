// Who is allowed to name a session.
//
// The bug this whole layer exists to close was a default: an artifact
// with no profile was read with the taxonomy of the one artifact this
// application happened to ship, so a canvas application was told it had
// a tutor and a message box, confidently, with nothing on the page to
// say the words were borrowed. The tests here are about that default
// being gone rather than merely unlikely — a repository is read in one
// artifact's vocabulary only by being named as that artifact, and
// everything else is read blind and says so.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BLIND_READING, blindReading, builtInReading, readingOf } from "../../lib/activity/reading.ts";
import { validateProfile } from "../../lib/activity/profile/validate.ts";
import type { ArtifactProfile } from "../../lib/activity/profile/schema.ts";
import type { ProfileRow } from "../../lib/activity/profile/store.ts";
import { activityExport } from "../../lib/activity/export.ts";
import { DEFAULT_SEGMENTATION } from "../../lib/activity/segment.ts";
import { readSession } from "../../lib/activity/read.ts";
import { events, frames, stages } from "./session.mts";

const ropeProfile = JSON.parse(
  readFileSync(fileURLToPath(new URL("../fixtures/rope-profile.json", import.meta.url)), "utf8"),
) as ArtifactProfile;

const row = (over: Partial<ProfileRow> = {}): ProfileRow => ({
  id: "row", repoId: "repo", runId: "run", signature: "sig", commitSha: "1ada018",
  status: "ready", profile: null, schemaVersion: 1, capabilityVersion: 1,
  issues: null, fit: null, error: null, model: "claude-opus-5", generatedBy: null,
  evidence: null, evidenceHash: null,
  createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-20T00:00:00.000Z",
  generatedAt: "2026-09-20T00:00:00.000Z",
  ...over,
});

describe("which artifact a repository is read as", () => {
  it("has a shipped reading for the repository it was written for", () => {
    const known = builtInReading({ owner: "mqo00", name: "rope" });
    assert.ok(known);
    assert.equal(known.taxonomy.name, "ROPE");
    assert.equal(known.stamp.source, "built-in");
  });

  it("matches the repository however it was written down", () => {
    for (const repo of [{ owner: "MQO00", name: "ROPE" }, { owner: " mqo00 ", name: "rope.git" }]) {
      assert.ok(builtInReading(repo), `${repo.owner}/${repo.name}`);
    }
  });

  it("has none for any other repository, however much it looks like one", () => {
    const others = [
      { owner: "kjfeng", name: "cocoa-canvas" },
      { owner: "someone-else", name: "rope" },
      { owner: "mqo00", name: "rope-tutor" },
      { owner: "mqo00", name: "rope2" },
      { owner: "mqo00", name: "" },
      null,
      undefined,
      { owner: null, name: null },
    ];
    for (const repo of others) assert.equal(builtInReading(repo), null, JSON.stringify(repo));
  });
});

describe("an artifact nobody has read", () => {
  it("is read in words that name nothing", () => {
    assert.equal(BLIND_READING.stamp.source, "blind");
    assert.notEqual(BLIND_READING.taxonomy.name, "ROPE");
    assert.deepEqual(BLIND_READING.taxonomy.channels, []);
    assert.deepEqual(BLIND_READING.taxonomy.controls, []);
    assert.deepEqual(BLIND_READING.taxonomy.surfaces, {});
  });

  it("says on the page why it reads the way it does", () => {
    for (const state of ["none", "pending", "failed"] as const) {
      const r = blindReading(state, `because ${state}`);
      assert.equal(r.stamp.status, state);
      assert.equal(r.detail, `because ${state}`);
      assert.equal(r.stamp.source, "blind");
    }
  });

  it("carries no repository, commit, model or signature to mistake for one", () => {
    const s = BLIND_READING.stamp;
    assert.deepEqual(
      [s.artifact, s.repoId, s.commit, s.signature, s.model, s.generatedAt, s.schemaVersion, s.capabilityVersion],
      [null, null, null, null, null, null, null, null],
    );
  });
});

describe("a profile that was written for this artifact", () => {
  it("becomes the reading, stamped with where it came from", () => {
    const checked = validateProfile(ropeProfile);
    assert.ok(checked.ok);
    const reading = readingOf(checked.profile, row({ profile: checked.profile }), "read as itself");
    assert.ok(reading);
    assert.equal(reading.stamp.source, "generated");
    assert.equal(reading.stamp.status, "ready");
    assert.equal(reading.stamp.name, reading.taxonomy.name);
    assert.equal(reading.stamp.model, "claude-opus-5");
    assert.equal(reading.stamp.signature, "sig");
    // The commit rides along as context and is never what identifies the
    // profile; the signature is.
    assert.equal(reading.stamp.commit, "1ada018");
  });

  it("is no reading at all when it will not compile", () => {
    const broken = { ...ropeProfile, rules: [{ nonsense: true }] } as unknown as ArtifactProfile;
    assert.equal(readingOf(broken, row(), "should not be used"), null);
  });
});

describe("what the export says about who named the session", () => {
  const episodes = readSession({ stages, frames, events, taxonomy: BLIND_READING.taxonomy, surfaceOf: BLIND_READING.surfaceOf });

  it("names the reading and where it came from, not just a word", () => {
    const made = activityExport({ episodes, profile: BLIND_READING.stamp, segmentation: DEFAULT_SEGMENTATION, runId: "run" });
    assert.equal(made.profile.source, "blind");
    assert.equal(made.taxonomy, made.profile.name);
  });

  it("cannot say ROPE about a session read blind", () => {
    const made = activityExport({ episodes, profile: BLIND_READING.stamp, segmentation: DEFAULT_SEGMENTATION, runId: "run" });
    assert.notEqual(made.taxonomy, "ROPE");
    // And nothing in the reading's own words is ROPE's, either: the one
    // way "ROPE" can appear in an export is a ROPE profile having been
    // chosen for a repository named as ROPE.
    assert.doesNotMatch(JSON.stringify(made.episodes.map((e) => [e.subBehavior, e.description, e.because])), /tutor|requirements document/i);
  });
});
