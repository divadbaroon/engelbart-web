// Which origins a sandbox will take a picker or a record message from.
//
// This is decided once, in the worker, at the moment the sandbox is
// launched, and it is unobservable from the workspace until somebody
// tries to annotate and nothing answers. Two spellings of "off" and a
// list of one used to be the whole story; it takes a list now, and the
// off-state is the part that quietly changed shape when it did.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { workspaceOrigins } from "../../lib/runtime/e2b.ts";

const KEYS = ["ENGELBART_WORKSPACE_ORIGIN", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL"] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
});

describe("the origins a launched sandbox will obey", () => {
  it("takes a comma-separated list, in the order it was given", () => {
    // The order is load-bearing: a sandbox from an older image reads only
    // the first of them, so the one you browse most goes first.
    process.env.ENGELBART_WORKSPACE_ORIGIN = "https://app.example.com,http://localhost:3000";
    assert.deepEqual(workspaceOrigins(), ["https://app.example.com", "http://localhost:3000"]);
  });

  it("reduces each entry to its origin and keeps each one once", () => {
    process.env.ENGELBART_WORKSPACE_ORIGIN = "https://app.example.com/a/b?c=1, https://app.example.com/, http://localhost:3000";
    assert.deepEqual(workspaceOrigins(), ["https://app.example.com", "http://localhost:3000"]);
  });

  it("leaves out what is not an origin rather than guessing at it", () => {
    process.env.ENGELBART_WORKSPACE_ORIGIN = "app.example.com,,   ,http://localhost:3000";
    assert.deepEqual(workspaceOrigins(), ["http://localhost:3000"]);
  });

  it("is empty when every entry was unusable, so no channel is opened", () => {
    process.env.ENGELBART_WORKSPACE_ORIGIN = "nope,also nope";
    assert.deepEqual(workspaceOrigins(), []);
  });

  it("reads an explicitly blank value as off, the same as a blank one always meant", () => {
    // The only way to spell "no control channel at all", since unset is
    // already the guess below. It went through a phase of meaning
    // localhost, which is the opposite: a page served at the operator's
    // own localhost:3000 could drive any preview whose URL it held.
    process.env.ENGELBART_WORKSPACE_ORIGIN = "";
    assert.deepEqual(workspaceOrigins(), []);
    process.env.ENGELBART_WORKSPACE_ORIGIN = "   ";
    assert.deepEqual(workspaceOrigins(), []);
  });

  it("guesses the production domain before the per-deployment URL", () => {
    // VERCEL_URL is the deployment's own hostname, which nobody browses.
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "app.example.com";
    process.env.VERCEL_URL = "app-git-main-xyz.vercel.app";
    assert.deepEqual(workspaceOrigins(), ["https://app.example.com"]);
  });

  it("falls back to the per-deployment URL, and then to the dev server", () => {
    process.env.VERCEL_URL = "app-git-main-xyz.vercel.app";
    assert.deepEqual(workspaceOrigins(), ["https://app-git-main-xyz.vercel.app"]);
    delete process.env.VERCEL_URL;
    assert.deepEqual(workspaceOrigins(), ["http://localhost:3000"]);
  });
});
