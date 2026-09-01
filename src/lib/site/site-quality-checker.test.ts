import assert from "node:assert/strict";
import test from "node:test";
import { siteQualityBrowserMode, siteQualityCdpTimeoutMs, siteQualityCliTimeoutMs } from "./site-quality-checker";

test("uses a production-friendly CDP timeout with bounded overrides", () => {
  assert.equal(siteQualityCdpTimeoutMs("120000"), 120_000);
  assert.equal(siteQualityCdpTimeoutMs("1000"), 30_000);
  assert.equal(siteQualityCdpTimeoutMs("999999"), 300_000);
});

test("supports an explicit CLI browser mode for low-memory production hosts", () => {
  assert.equal(siteQualityBrowserMode("cli"), "cli");
  assert.equal(siteQualityBrowserMode("CDP"), "cdp");
  assert.equal(siteQualityCliTimeoutMs("180000"), 180_000);
  assert.equal(siteQualityCliTimeoutMs("1000"), 60_000);
});
