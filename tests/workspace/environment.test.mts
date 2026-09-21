// What was pasted, when it was not the value.
//
// A git commit subject was once saved as OPENAI_API_KEY. It stored
// without a word, the run launched with it, and the first sign was a 401
// from OpenAI two minutes later quoting the commit message back. These
// are the checks that would have said so at the moment it happened — and
// the ones deliberately not made, because a warning that cries wolf is
// read once and then never again.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pendingEnv, suspectValue, type EnvReport, type EnvVariable } from "../../lib/environment.ts";

describe("a value that was probably pasted from the wrong thing", () => {
  it("says so when a key holds prose", () => {
    const said = suspectValue("OPENAI_API_KEY", "feat(trace): recordings do not disappear when a run is relaunched");
    assert.match(said ?? "", /does not usually contain spaces/);
  });

  it("knows the names whose values are issued rather than written", () => {
    for (const name of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GITHUB_TOKEN", "DATABASE_PASSWORD", "SENTRY_DSN", "AWS_SECRET"]) {
      assert.ok(suspectValue(name, "two words"), `${name} should be suspicious of prose`);
    }
  });

  it("leaves an ordinary variable alone, whatever is in it", () => {
    // A sentence is a perfectly good value for most things, and a panel
    // that argued about it would be worse than one that stayed quiet.
    assert.equal(suspectValue("GREETING", "hello there"), null);
    assert.equal(suspectValue("MODEL_NAME", "gpt-4o mini"), null);
    // The last word is what decides, so a path that merely contains "KEY"
    // is not a secret.
    assert.equal(suspectValue("PUBLIC_KEY_PATH", "/etc/ssl/my key.pem"), null);
  });

  it("says nothing about a real key", () => {
    assert.equal(suspectValue("OPENAI_API_KEY", `sk-${"a".repeat(160)}`), null);
    assert.equal(suspectValue("GITHUB_TOKEN", "ghp_0123456789abcdefghijklmnopqrstuvwxyz"), null);
  });

  it("catches quotation marks that came along with the value", () => {
    assert.match(suspectValue("OPENAI_API_KEY", `"sk-abc123"`) ?? "", /quotation marks/);
    assert.match(suspectValue("PORT", "'3000'") ?? "", /quotation marks/);
    // Not a quote at one end only, and not an apostrophe inside.
    assert.equal(suspectValue("PORT", '"3000'), null);
    assert.equal(suspectValue("OWNER", "O'Brien"), null);
  });

  it("catches a whole assignment pasted rather than its right-hand side", () => {
    assert.match(suspectValue("OPENAI_API_KEY", "OPENAI_API_KEY=sk-abc123") ?? "", /whole line/);
    assert.match(suspectValue("OPENAI_API_KEY", "openai_api_key = sk-abc123") ?? "", /whole line/);
    // A value that merely starts with the same letters is not that.
    assert.equal(suspectValue("PORT", "PORTLAND"), null);
  });

  it("is quiet about key material, which carries spaces by construction", () => {
    // A PEM label is always "-----BEGIN <multi-word label>-----", so the
    // space rule is not imprecise about these — it is wrong about every
    // single one of them, which is the cry-wolf case the rule exists to
    // avoid. The check must hold for all three shapes a PEM arrives in:
    // real newlines, the \n-escaped single line the Firebase Admin SDK
    // documents, and the newline-stripped paste a single-line field leaves.
    const pem = (sep: string) => `-----BEGIN PRIVATE KEY-----${sep}MIIEvQIBADANBg${sep}-----END PRIVATE KEY-----`;
    for (const sep of ["\n", "\\n", ""]) {
      assert.equal(suspectValue("FIREBASE_PRIVATE_KEY", pem(sep)), null, `PEM with separator ${JSON.stringify(sep)}`);
    }
    assert.equal(suspectValue("SSH_PRIVATE_KEY", "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNza\n-----END OPENSSH PRIVATE KEY-----"), null);
    assert.equal(suspectValue("GPG_SIGNING_KEY", "-----BEGIN PGP PRIVATE KEY BLOCK-----\n\nlQOYBF\n-----END PGP PRIVATE KEY BLOCK-----"), null);
    assert.equal(suspectValue("SSH_PUBLIC_KEY", "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5 david@macbook"), null);
    // A document, not a token: structured data is spaced wherever it was
    // printed, and is never a commit message.
    assert.equal(suspectValue("SERVICE_ACCOUNT_KEY", '{\n  "type": "service_account",\n  "project_id": "x"\n}'), null);
    // But something that merely mentions BEGIN is not armor.
    assert.ok(suspectValue("OPENAI_API_KEY", "-----BEGIN not armor at all"));
  });

  it("leaves credentials alone, whose values are paths or documents", () => {
    // GOOGLE_APPLICATION_CREDENTIALS holds a path or a whole
    // service-account document. Both contain spaces, so the rule would
    // have been wrong every time it fired on one.
    assert.equal(suspectValue("GOOGLE_APPLICATION_CREDENTIALS", "/home/user/My Creds/gcp.json"), null);
    assert.equal(suspectValue("GCP_CREDENTIALS", '{"type": "service_account"}'), null);
  });

  it("is quiet on an empty name, and on a name with regex characters in it", () => {
    // It is pure and callable with anything, whatever the name rules say.
    assert.doesNotThrow(() => suspectValue("", "sk-abc"));
    assert.doesNotThrow(() => suspectValue("A.*B", "value"));
    assert.equal(suspectValue("A.*B", "value"), null);
  });
});

describe("what a run is running with that is no longer what is saved", () => {
  // A run reads its values once, at launch. Everything below is about
  // the gap that opens after that, which is where a corrected key sat
  // unnoticed for seven minutes while the preview kept failing.
  const variable = (name: string, source: string | null): EnvVariable =>
    ({ name, status: "provided", requirement: "required", group: "required", source, public: false });

  const report = (over: Partial<EnvReport> = {}): EnvReport => ({
    variables: [variable("OPENAI_API_KEY", "saved"), variable("PORT", ".env")],
    missing: [], ignored: [], local: [], localError: null,
    scannedAt: "2026-09-21T03:36:15.771Z", runId: "run-1", ...over,
  });

  const savedAt = (name: string, updatedAt: string) => ({ name, updatedAt });
  const BEFORE = savedAt("PORT", "2026-09-21T03:00:00.000Z");
  const AFTER = savedAt("OPENAI_API_KEY", "2026-09-21T03:38:32.919Z");

  it("names a value saved after the run read its environment", () => {
    assert.deepEqual(pendingEnv([BEFORE, AFTER], report()), { stale: ["OPENAI_API_KEY"], removed: [] });
  });

  it("says nothing when everything was saved before the run read it", () => {
    const early = savedAt("OPENAI_API_KEY", "2026-09-21T03:00:00.000Z");
    assert.deepEqual(pendingEnv([BEFORE, early], report()), { stale: [], removed: [] });
  });

  it("compares against the scan, not the launch", () => {
    // The run was queued, spent a minute cloning, then read its values.
    // A key typed during the clone IS in what it read, and saying
    // otherwise would leave the notice up for the life of the run — which
    // is also what a requeue does, since it reuses the row without
    // moving its start.
    const duringClone = savedAt("OPENAI_API_KEY", "2026-09-21T03:36:10.000Z");
    assert.deepEqual(pendingEnv([duringClone], report()).stale, []);
  });

  it("names a value that was removed, which the run still holds", () => {
    // The row is gone, so there is no timestamp left to compare. The
    // run's own scan is the only record of what it was handed.
    assert.deepEqual(pendingEnv([BEFORE], report()), { stale: [], removed: ["OPENAI_API_KEY"] });
  });

  it("does not call a value removed when the repository supplies it itself", () => {
    // PORT came from the repository's own .env, not from here, so its
    // absence from the saved list is not a change anybody made.
    assert.deepEqual(pendingEnv([], report()).removed, ["OPENAI_API_KEY"]);
  });

  it("says nothing at all when the run has not reported a scan", () => {
    // Nothing has been read yet, so nothing can be behind.
    assert.deepEqual(pendingEnv([AFTER], null), { stale: [], removed: [] });
  });
});
