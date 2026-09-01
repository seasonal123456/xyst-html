import assert from "node:assert/strict";
import test from "node:test";
import { buildSafetyRetrySiteImagePrompt, isSiteImageSafetyRejection } from "./codex-site-generator";
import type { StyleConceptDto } from "./site-types";

const style: StyleConceptDto = {
  id: "style-1",
  styleName: "高对比时尚陈列",
  styleDescription: "黑白基调，加入少量青色点缀。",
  suitableFor: "零售品牌",
  schemeType: null,
  layoutStyle: null,
  colorTendency: null,
  visualTechniques: [],
  emotionalDescription: "克制、现代、有质感",
  imageUrl: "",
  generationBatch: 1,
  mode: "real",
  isFavorite: false,
  isMainStyle: true,
  createdAt: new Date(0).toISOString()
};

test("detects image safety rejections without treating ordinary rate limits as safety failures", () => {
  assert.equal(isSiteImageSafetyRejection(new Error("HTTP 429 safety_violations=[sexual]")), true);
  assert.equal(isSiteImageSafetyRejection(new Error("request was rejected by the safety system")), true);
  assert.equal(isSiteImageSafetyRejection(new Error("HTTP 429 upstream load saturated")), false);
  assert.equal(isSiteImageSafetyRejection(new Error("HTTP 401 invalid api key")), false);
});

test("builds a neutral product-only retry prompt", () => {
  const prompt = buildSafetyRetrySiteImagePrompt(style, "hero");
  assert.match(prompt, /不透明产品包装/);
  assert.match(prompt, /无人商业静物/);
  assert.match(prompt, /黑、白、青/);
  assert.doesNotMatch(prompt, /客户业务|网站用途|原始文案|性感|内衣|人体|裸露/);
});
