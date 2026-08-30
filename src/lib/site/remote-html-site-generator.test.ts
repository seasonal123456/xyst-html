import assert from "node:assert/strict";
import test from "node:test";
import { ChatCompletionSseParser, extractRemoteHtml, isStructurallyValidImage, validateRemoteHtml } from "./remote-html-site-generator";

const validHtml = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>测试官网</title><style>body{font-family:sans-serif}</style></head>
<body><main><h1>测试官网</h1><p>${"完整内容".repeat(300)}</p></main></body>
</html>`;

test("parses SSE JSON split across arbitrary chunk boundaries", () => {
  const parser = new ChatCompletionSseParser();
  const stream = [
    'data: {"model":"gpt-5.6-sol","choices":[{"delta":{"content":"<!doctype html><html>"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"<body>ok</body></html>"}}]}\n\n',
    "data: [DONE]\n\n"
  ].join("");
  for (let index = 0; index < stream.length; index += 7) parser.push(stream.slice(index, index + 7));

  const result = parser.finish();
  assert.equal(result.model, "gpt-5.6-sol");
  assert.equal(result.eventCount, 2);
  assert.equal(result.content, "<!doctype html><html><body>ok</body></html>");
});

test("extracts one complete HTML document from provider wrappers", () => {
  assert.equal(extractRemoteHtml(`说明文字\n\`\`\`html\n${validHtml}\n\`\`\`\n尾注`), validHtml);
});

test("accepts a complete self-contained HTML document", () => {
  assert.deepEqual(validateRemoteHtml(validHtml), []);
});

test("rejects forms, embedded frames, external scripts and network calls", () => {
  const unsafe = validHtml.replace(
    "</body>",
    '<form></form><iframe src="https://example.com"></iframe><script src="https://example.com/a.js"></script><script>fetch("https://example.com")</script></body>'
  );
  const errors = validateRemoteHtml(unsafe).join("\n");
  assert.match(errors, /表单/);
  assert.match(errors, /iframe/);
  assert.match(errors, /外部脚本/);
  assert.match(errors, /fetch/);
});

test("rejects a truncated PNG before sending it to the remote model", () => {
  const truncatedPng = Buffer.from("89504e470d0a1a0a0000000d4948445200000280000001e0", "hex");
  assert.equal(isStructurallyValidImage(truncatedPng, "image/png"), false);
});
