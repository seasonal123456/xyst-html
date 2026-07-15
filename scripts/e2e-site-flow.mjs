import { readFile, writeFile } from "node:fs/promises";

const baseUrl = process.env.E2E_BASE_URL || "https://xinyingst.com";
const adminPasswordPath = process.env.E2E_ADMIN_PASSWORD_PATH || "D:/codex002/.deploy/xinyingst_admin_password.txt";
const adminPassword = (await readFile(adminPasswordPath, "utf8")).trim();
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const email = `e2e-${stamp}@xinyingst.test`;
const password = `Test${stamp}!`;
const report = {
  baseUrl,
  email,
  startedAt: new Date().toISOString(),
  steps: []
};

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  addFrom(headers) {
    const values = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
    const fallback = headers.get("set-cookie");
    for (const raw of values.length ? values : fallback ? [fallback] : []) {
      const first = raw.split(";")[0];
      const eq = first.indexOf("=");
      if (eq > 0) this.cookies.set(first.slice(0, eq), first.slice(eq + 1));
    }
  }

  header() {
    return Array.from(this.cookies.entries()).map(([key, value]) => `${key}=${value}`).join("; ");
  }
}

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
}

function step(name, data = {}) {
  report.steps.push({ name, at: new Date().toISOString(), ...data });
}

async function request(jar, path, init = {}) {
  const started = Date.now();
  const headers = new Headers(init.headers || {});
  const cookie = jar?.header();
  if (cookie) headers.set("Cookie", cookie);
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
  if (jar) jar.addFrom(res.headers);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { res, text, json, ms: Date.now() - started };
}

function requireOk(label, result) {
  if (!result.res.ok || result.json?.success === false) {
    const detail = result.json?.error || result.text.slice(0, 500) || `HTTP ${result.res.status}`;
    throw new Error(`${label} failed: ${result.res.status} ${detail}`);
  }
}

async function jsonPost(jar, path, body) {
  return request(jar, path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

function testPngFile() {
  const b64 =
    "iVBORw0KGgoAAAANSUhEUgAAAoAAAAHgCAIAAAC6s0uzAAAACXBIWXMAAAsTAAALEwEAmpwYAAAGKklEQVR4nO3WMQ0AIBDAMMC/5yFjRxMFfXpnZ2cBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD4GbYAAWZxb+QAAAAASUVORK5CYII=";
  const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
  return new File([bytes], "xinying-e2e-test.png", { type: "image/png" });
}

const adminJar = new CookieJar();
const customerJar = new CookieJar();

try {
  log("admin login");
  let result = await jsonPost(adminJar, "/api/admin/login", { password: adminPassword });
  requireOk("admin login", result);
  step("admin_login", { ms: result.ms, status: result.res.status });

  log(`create test customer ${email}`);
  result = await jsonPost(adminJar, "/api/admin/customer-accounts", {
    email,
    password,
    name: "E2E 全流程测试账号",
    credits: 3,
    status: "active",
    note: "自动全流程测试账号，可清理。"
  });
  requireOk("create customer", result);
  const account = result.json.account;
  step("create_customer", { ms: result.ms, accountId: account.id, credits: account.credits });

  log("customer login");
  result = await jsonPost(customerJar, "/api/auth/login", { email, password });
  requireOk("customer login", result);
  step("customer_login", { ms: result.ms, status: result.res.status });

  log("create site job with one uploaded image");
  const form = new FormData();
  form.set(
    "businessDescription",
    [
      "星映树 E2E 测试工作室，提供少儿绘画体验课和作品展示服务。",
      "本测试用于验证客户从提交资料到生成官网、交付包和轻部署的全链路。",
      "请勿使用表单，展示联系人林老师、电话 13800138000、微信 xyst-test。"
    ].join("\n")
  );
  form.set("sourceCopy", "课程包含水彩启蒙、创意素描、作品墙展示。客户可电话或微信预约体验。");
  form.set("websitePurpose", "展示服务并引导电话/微信咨询");
  form.set("customerName", "星映树测试工作室");
  form.set("customerContact", "联系人：林老师；电话：13800138000；微信：xyst-test");
  form.set("materialConsent", "true");
  form.append("files", testPngFile());
  result = await request(customerJar, "/api/site-jobs", { method: "POST", body: form });
  requireOk("create site job", result);
  const jobId = result.json.siteJob.id;
  step("create_site_job", { ms: result.ms, jobId, status: result.json.siteJob.status, assets: result.json.siteJob.assets.length });

  log(`generate style concepts for ${jobId}`);
  result = await jsonPost(customerJar, `/api/site-jobs/${jobId}/style-concepts/generate`, {});
  requireOk("generate style concepts", result);
  const styles = result.json.siteJob.styleConcepts || [];
  if (!styles.length) throw new Error("No style concepts returned.");
  const styleId = styles[0].id;
  step("generate_style_concepts", {
    ms: result.ms,
    styleCount: styles.length,
    charged: result.json.charged,
    remainingCredits: result.json.credits,
    firstStyleId: styleId,
    imageUsage: result.json.siteJob.imageGenerationUsage
  });

  log(`select main style ${styleId}`);
  result = await request(customerJar, `/api/site-jobs/${jobId}/style-concepts/${styleId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isMainStyle: true })
  });
  requireOk("select main style", result);
  step("select_style", { ms: result.ms, status: result.json.siteJob.status });

  log("generate copy");
  result = await jsonPost(customerJar, `/api/site-jobs/${jobId}/copy/generate`, {
    revisionInstruction: "请保持 MVP 直连咨询模式，不要写表单、预约组件、会员或后台入口。"
  });
  requireOk("generate copy", result);
  const copyVersionId = result.json.copyVersion.id;
  step("generate_copy", { ms: result.ms, copyVersionId, status: result.json.siteJob?.status });

  log(`finalize copy ${copyVersionId}`);
  result = await jsonPost(customerJar, `/api/site-jobs/${jobId}/copy/${copyVersionId}/finalize`, {});
  requireOk("finalize copy", result);
  step("finalize_copy", { ms: result.ms, status: result.json.siteJob.status, hasPrompt: Boolean(result.json.siteJob.codexPrompt) });

  log("queue final website generation");
  result = await jsonPost(customerJar, `/api/site-jobs/${jobId}/preview/generate`, { styleId });
  requireOk("queue preview", result);
  step("queue_preview", { ms: result.ms, queued: result.json.queued, status: result.json.siteJob.status });

  log("wait for worker to complete preview");
  let siteJob = null;
  const waitStart = Date.now();
  for (let attempt = 1; attempt <= 90; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10000));
    result = await request(customerJar, `/api/site-jobs/${jobId}`);
    requireOk("poll site job", result);
    siteJob = result.json.siteJob;
    log(`poll ${attempt}: ${siteJob.status}${siteJob.adminNote ? ` - ${String(siteJob.adminNote).slice(0, 120)}` : ""}`);
    if (["client_preview", "standard_delivery_ready"].includes(siteJob.status) && siteJob.previewUrl) break;
    if (siteJob.status === "failed") throw new Error(`Website generation failed: ${siteJob.adminNote || siteJob.publishError || "unknown"}`);
  }
  if (!siteJob?.previewUrl) throw new Error(`Preview did not complete after ${Math.round((Date.now() - waitStart) / 1000)}s.`);
  step("worker_preview_complete", {
    ms: Date.now() - waitStart,
    status: siteJob.status,
    previewUrl: siteJob.previewUrl,
    imageUsage: siteJob.imageGenerationUsage
  });

  log("verify preview URL");
  const previewRes = await fetch(siteJob.previewUrl);
  step("verify_preview_url", { status: previewRes.status, ok: previewRes.ok, previewUrl: siteJob.previewUrl });
  if (!previewRes.ok) throw new Error(`Preview URL HTTP ${previewRes.status}`);

  log("generate standard delivery package");
  result = await jsonPost(customerJar, `/api/site-jobs/${jobId}/delivery`, {});
  requireOk("generate delivery", result);
  siteJob = result.json.siteJob;
  step("generate_delivery", { ms: result.ms, status: siteJob.status, siteZipUrl: siteJob.siteZipUrl });
  if (!siteJob.siteZipUrl) throw new Error("Delivery package did not return siteZipUrl.");

  log("publish to Netlify");
  const siteName = `xyste2e${stamp.slice(-6)}`;
  result = await jsonPost(customerJar, `/api/site-jobs/${jobId}/publish`, { siteName });
  requireOk("publish netlify", result);
  siteJob = result.json.siteJob;
  step("publish_netlify", {
    ms: result.ms,
    status: siteJob.publishStatus,
    publishedUrl: siteJob.publishedUrl,
    publishError: siteJob.publishError,
    netlifySiteName: siteJob.netlifySiteName
  });
  if (!siteJob.publishedUrl) throw new Error(siteJob.publishError || "Netlify publish did not return URL.");

  const publishedRes = await fetch(siteJob.publishedUrl);
  step("verify_published_url", { status: publishedRes.status, ok: publishedRes.ok, publishedUrl: siteJob.publishedUrl });
  if (!publishedRes.ok) throw new Error(`Published URL HTTP ${publishedRes.status}`);

  report.completedAt = new Date().toISOString();
  report.success = true;
  report.jobId = jobId;
  report.previewUrl = siteJob.previewUrl;
  report.siteZipUrl = siteJob.siteZipUrl;
  report.publishedUrl = siteJob.publishedUrl;
  report.netlifySiteName = siteJob.netlifySiteName;
  log(`SUCCESS job=${jobId} preview=${siteJob.previewUrl} published=${siteJob.publishedUrl}`);
} catch (error) {
  report.completedAt = new Date().toISOString();
  report.success = false;
  report.error = error instanceof Error ? error.stack || error.message : String(error);
  console.error(report.error);
  process.exitCode = 1;
} finally {
  const reportPath = `D:/codex002/ai-image-mvp-stage1/logs/e2e-site-flow-${stamp}.json`;
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  log(`report saved: ${reportPath}`);
}
