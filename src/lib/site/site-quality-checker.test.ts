import assert from "node:assert/strict";
import test from "node:test";
import { siteQualityCdpTimeoutMs } from "./site-quality-checker";

test("uses a production-friendly CDP timeout with bounded overrides", () => {
  assert.equal(siteQualityCdpTimeoutMs("120000"), 120_000);
  assert.equal(siteQualityCdpTimeoutMs("1000"), 30_000);
  assert.equal(siteQualityCdpTimeoutMs("999999"), 300_000);
});
