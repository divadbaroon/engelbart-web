import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ANSWER_LENGTH, ATTACH, DEFAULT_OPTIONS, TEMPERATURE, THINKING_BUDGET,
  callOptions, isTextFile, readAttachments, readOptions, withAttachments,
} from "../../lib/bart/options.ts";

describe("the knobs a question is answered with", () => {
  it("falls back to the defaults for anything it cannot read", () => {
    assert.deepEqual(readOptions(undefined), DEFAULT_OPTIONS);
    assert.deepEqual(readOptions(null), DEFAULT_OPTIONS);
    assert.deepEqual(readOptions("high"), DEFAULT_OPTIONS);
    assert.deepEqual(readOptions({}), DEFAULT_OPTIONS);
    assert.deepEqual(readOptions({ effort: "maximum" }), DEFAULT_OPTIONS);
  });

  it("clamps rather than refuses, so a bad knob never loses the question", () => {
    assert.equal(readOptions({ temperature: 9 }).temperature, TEMPERATURE.max);
    assert.equal(readOptions({ temperature: -4 }).temperature, TEMPERATURE.min);
    assert.equal(readOptions({ maxTokens: 10 }).maxTokens, ANSWER_LENGTH.min);
    assert.equal(readOptions({ maxTokens: 1e9 }).maxTokens, ANSWER_LENGTH.max);
    assert.equal(readOptions({ maxTokens: 4096.6 }).maxTokens, 4097);
  });

  it("rejects a temperature that is not a number", () => {
    assert.equal(readOptions({ temperature: Number.NaN }).temperature, DEFAULT_OPTIONS.temperature);
    assert.equal(readOptions({ temperature: Infinity }).temperature, DEFAULT_OPTIONS.temperature);
    assert.equal(readOptions({ temperature: "0.4" }).temperature, DEFAULT_OPTIONS.temperature);
  });
});

describe("turning the knobs into a model call", () => {
  it("sends the temperature when no effort was asked for", () => {
    const call = callOptions({ effort: "off", temperature: 0.2, maxTokens: 2048 });
    assert.deepEqual(call, { max_tokens: 2048, temperature: 0.2 });
    assert.equal("thinking" in call, false);
  });

  // The API refuses a call that sets both; this is the rule, not a taste.
  it("drops the temperature as soon as an effort is asked for", () => {
    for (const effort of ["low", "medium", "high"] as const) {
      const call = callOptions({ effort, temperature: 0.2, maxTokens: 2048 });
      assert.equal(call.temperature, undefined, effort);
      assert.deepEqual(call.thinking, { type: "enabled", budget_tokens: THINKING_BUDGET[effort] }, effort);
    }
  });

  // max_tokens covers the thinking as well as the answer, so the answer
  // has to have room left after the budget is spent.
  it("leaves the whole asked-for answer on top of the thinking budget", () => {
    for (const effort of ["low", "medium", "high"] as const) {
      const call = callOptions({ effort, temperature: 1, maxTokens: 4096 });
      assert.equal(call.max_tokens, THINKING_BUDGET[effort] + 4096, effort);
      assert.ok(call.max_tokens > THINKING_BUDGET[effort], effort);
    }
  });

  it("holds for every clamped input", () => {
    for (const raw of [{ effort: "high", maxTokens: 1e9 }, { effort: "low", temperature: -1 }, {}]) {
      const call = callOptions(readOptions(raw));
      assert.ok(call.max_tokens >= ANSWER_LENGTH.min);
      if (call.thinking) assert.ok(call.max_tokens > call.thinking.budget_tokens);
      if (call.thinking) assert.equal(call.temperature, undefined);
    }
  });
});

describe("a file carried with a question", () => {
  it("leaves a question with no files exactly as it was", () => {
    assert.equal(withAttachments("why did it fail?", []), "why did it fail?");
  });

  it("names each file and fences it, with the question last", () => {
    const out = withAttachments("what is wrong here?", [{ name: "run.log", text: "boom" }]);
    assert.match(out, /<attached-file name="run\.log">\nboom\n<\/attached-file>/);
    assert.ok(out.endsWith("what is wrong here?"));
  });

  it("cannot be used to close the tag early", () => {
    const out = withAttachments("q", [{ name: 'a"><b', text: "x" }]);
    assert.equal(out.includes('name="a"><b"'), false);
    assert.match(out, /name="a'><b"/);
  });

  it("keeps the whole set under the total, however many files are sent", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `f${i}.txt`, text: "x".repeat(ATTACH.perFile) }));
    const kept = readAttachments(many);
    assert.ok(kept.length <= ATTACH.files);
    assert.ok(kept.reduce((n, a) => n + a.text.length, 0) <= ATTACH.total);
  });

  it("drops anything that is not a named piece of text", () => {
    assert.deepEqual(readAttachments("nope"), []);
    assert.deepEqual(readAttachments([null, 3, { name: "a" }, { text: "b" }, { name: "c", text: "" }]), []);
  });

  it("knows a text file from a binary one", () => {
    assert.equal(isTextFile("notes.md", ""), true);
    assert.equal(isTextFile("run.log", ""), true);
    assert.equal(isTextFile("main.py", "application/octet-stream"), true);
    assert.equal(isTextFile("anything", "text/plain"), true);
    assert.equal(isTextFile("shot.png", "image/png"), false);
    assert.equal(isTextFile("paper.pdf", "application/pdf"), false);
  });
});
