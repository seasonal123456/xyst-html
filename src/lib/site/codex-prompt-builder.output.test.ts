import assert from "node:assert/strict";
import test from "node:test";
import { buildPrompt } from "./codex-site-generator";

test("raw HTML prompt does not ask the model to shorten design quality", () => {
  const prompt = buildPrompt({ finalCopyDraft: "测试官网" }, "raw_html");
  assert.match(prompt, /Visual richness, section completeness/);
  assert.match(prompt, /Do not shorten or flatten the design/);
  assert.doesNotMatch(prompt, /concise enough/);
  assert.doesNotMatch(prompt, /finish quickly/);
});
