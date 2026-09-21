// Reaching a run that is not the newest one.
//
// The workspace keeps one run per repository — the newest — so every
// relaunch put the session before it out of reach: its trace, its
// recordings, the activity read off it, all still stored and none of it
// findable. These are the two decisions that let an earlier run be read,
// and the ordering the recordings of earlier runs are listed in.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runBeingRead, runsWithLive } from "../../lib/run-history.ts";
import { byRunThenMade, type RecordingOnRun } from "../../lib/trace/recording.ts";
import type { RunStatus, SandboxRun } from "../../lib/sandbox.ts";

const run = (id: string, startedAt: string, status: RunStatus = "killed") =>
  ({ id, repoId: "repo", sandboxId: null, template: "t", commit: null, fresh: false, trace: "full", status, workdir: null, errorKind: null, error: null, port: null, previewUrl: null, services: null, startedAt } as unknown as SandboxRun);

const THIRD = run("c", "2026-09-21T03:00:00Z");
const SECOND = run("b", "2026-09-21T02:00:00Z");
const FIRST = run("a", "2026-09-21T01:00:00Z");
const LOADED = [THIRD, SECOND, FIRST];

describe("a repository's runs, with the live one among them", () => {
  it("shows the live run rather than the copy that was loaded with the list", () => {
    // The loaded row is a photograph. The live run changes as it goes,
    // and a picker reading the photograph would show a run still
    // launching long after it came up.
    const live = { ...THIRD, status: "running" as RunStatus };
    const runs = runsWithLive(LOADED, live);
    assert.equal(runs.length, 3);
    assert.equal(runs[0].status, "running");
    assert.equal(runs[0], live, "the live object itself, not a copy of the row");
  });

  it("puts a run started since the list was loaded on the front", () => {
    const fresh = run("d", "2026-09-21T04:00:00Z", "launching");
    const runs = runsWithLive(LOADED, fresh);
    assert.deepEqual(runs.map((r) => r.id), ["d", "c", "b", "a"]);
  });

  it("is the list itself when there is no run at all", () => {
    assert.deepEqual(runsWithLive(LOADED, undefined).map((r) => r.id), ["c", "b", "a"]);
    assert.deepEqual(runsWithLive([], undefined), []);
  });
});

describe("which run is being read", () => {
  const runs = runsWithLive(LOADED, THIRD);

  it("is the live run when nothing was chosen", () => {
    assert.equal(runBeingRead(runs, null, THIRD), THIRD);
  });

  it("is the earlier run that was chosen", () => {
    assert.equal(runBeingRead(runs, "a", THIRD), FIRST);
  });

  it("treats choosing the live run as choosing nothing", () => {
    // Stored as nothing on purpose: a later run of the same repository
    // then becomes the one being read, rather than leaving the tab
    // pinned to a run that is no longer live.
    assert.equal(runBeingRead(runs, "c", THIRD), THIRD);
    const next = run("d", "2026-09-21T04:00:00Z", "running");
    assert.equal(runBeingRead(runsWithLive(LOADED, next), null, next), next);
  });

  it("falls back to the live run when the chosen one is not there", () => {
    // Deleted, or past the bound the list was loaded with. An empty
    // trace with no explanation is the failure this exists to remove.
    assert.equal(runBeingRead(runs, "gone", THIRD), THIRD);
  });

  it("is nothing when the repository has never been run", () => {
    assert.equal(runBeingRead([], null, undefined), undefined);
    assert.equal(runBeingRead([], "a", undefined), undefined);
  });
});

describe("recordings from earlier runs, in the order they are listed", () => {
  const on = (runId: string, runStartedAt: string, name: string, startedAt: string): RecordingOnRun => ({
    recording: { id: name, runId, projectId: "p", name, status: "complete", startedAt, stoppedAt: null, createdAt: startedAt, replayPath: null },
    run: { id: runId, status: "killed", startedAt: runStartedAt, commit: null },
  });

  it("puts the newest run first and keeps each run's recordings in the order they were made", () => {
    const earlier = [
      on("old", "2026-09-20T10:00:00Z", "old-2", "2026-09-20T10:30:00Z"),
      on("new", "2026-09-21T10:00:00Z", "new-2", "2026-09-21T10:30:00Z"),
      on("old", "2026-09-20T10:00:00Z", "old-1", "2026-09-20T10:05:00Z"),
      on("new", "2026-09-21T10:00:00Z", "new-1", "2026-09-21T10:05:00Z"),
    ];
    assert.deepEqual([...earlier].sort(byRunThenMade).map((e) => e.recording.name), ["new-1", "new-2", "old-1", "old-2"]);
  });
});
