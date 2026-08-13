const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const dns = require("node:dns");
const { spawn } = require("node:child_process");

dns.setDefaultResultOrder("ipv4first");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const DATA_DIR = path.resolve(process.env.PROJECT_CARD_DATA_DIR || (
  process.env.PROJECT_CARD_STORAGE_DIR
    ? path.dirname(path.resolve(process.env.PROJECT_CARD_STORAGE_DIR))
    : path.join(ROOT, "storage")
));
const STORAGE_DIR = path.resolve(process.env.PROJECT_CARD_STORAGE_DIR || path.join(DATA_DIR, "generated"));
const TRACE_INDEX_FILE = path.join(STORAGE_DIR, "trace-index.json");
const LOG_DIR = path.resolve(process.env.PROJECT_CARD_LOG_DIR || path.join(ROOT, "logs"));
const LOG_FILE = path.join(LOG_DIR, "server.log");
const TMP_DIR = path.resolve(process.env.PROJECT_CARD_TMP_DIR || path.join(ROOT, "tmp"));
const API_BASE_URL = (process.env.IMAGE_API_BASE_URL || process.env.OPENAI_BASE_URL || "").replace(/\/$/, "");
const API_KEY = process.env.IMAGE_API_KEY || process.env.OPENAI_API_KEY || "";
const IMAGE_MODEL = process.env.IMAGE_API_MODEL || process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
const SSO_SECRET = process.env.PROJECT_CARD_SSO_SECRET || "";
const SSO_ISSUER = process.env.PROJECT_CARD_SSO_ISSUER || "ai-site";
const SSO_AUDIENCE = process.env.PROJECT_CARD_SSO_AUDIENCE || "project-card-tool";
const SSO_USED_JTI_FILE = path.join(DATA_DIR, "sso-used-jti.json");
const MAX_JSON_BODY_BYTES = 16_000_000;
const MAX_SOURCE_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_SOURCE_TEXT_CHARS = 20_000;
const IMAGE_API_REQUEST_TIMEOUT_MS = Number(process.env.IMAGE_API_REQUEST_TIMEOUT_MS || 220_000);
const IMAGE_API_RETRY_COUNT = Math.max(1, Math.min(3, Number(process.env.IMAGE_API_RETRY_COUNT || 1)));
const APP_ENV = process.env.PROJECT_CARD_ENV || process.env.NODE_ENV || "development";
const IS_PRODUCTION = /^(production|prod)$/i.test(APP_ENV);
const DEMO_SESSION_ENABLED = !IS_PRODUCTION && process.env.PROJECT_CARD_ALLOW_DEMO_SESSION !== "false";
const ADMIN_ENABLED = !IS_PRODUCTION && process.env.PROJECT_CARD_ADMIN_ENABLED === "true";
const TRACE_LOOKUP_REQUIRES_AUTH = IS_PRODUCTION && process.env.PROJECT_CARD_PUBLIC_TRACE_LOOKUP !== "true";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const server = http.createServer(async (req, res) => {
  try {
    log(`REQ ${req.method} ${req.url}`);
    if (req.method === "GET" && req.url === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        env: APP_ENV,
        production: IS_PRODUCTION,
        imageApiConfigured: Boolean(API_BASE_URL && API_KEY),
        ssoConfigured: Boolean(SSO_SECRET),
        demoSessionEnabled: DEMO_SESSION_ENABLED,
        adminEnabled: ADMIN_ENABLED
      });
    }

    if (req.method === "GET" && req.url === "/api/ready") {
      return await handleReady(req, res);
    }

    if (req.method === "GET" && req.url === "/api/config") {
      return sendJson(res, 200, publicAppConfig());
    }

    if (req.method === "POST" && req.url === "/api/sso/exchange") {
      return await handleSsoExchange(req, res);
    }

    if (req.method === "GET" && req.url.startsWith("/api/trace-card")) {
      return await handleTraceCard(req, res);
    }

    if (req.method === "POST" && req.url === "/api/my-cards") {
      return await handleMyCards(req, res);
    }

    if (req.method === "POST" && req.url === "/api/generate-card") {
      return await handleGenerateCard(req, res);
    }

    if (req.method !== "GET") return sendText(res, 405, "Method not allowed");
    return await serveStatic(req, res);
  } catch (error) {
    logError("REQUEST_ERROR", error);
    const status = error.statusCode || 500;
    return safeSendJson(res, status, { ok: false, error: error.safeMessage || error.message || "Server error" });
  }
});

async function handleSsoExchange(req, res) {
  if (!SSO_SECRET) {
    return sendJson(res, 503, {
      ok: false,
      error: "SSO 未配置，请设置 PROJECT_CARD_SSO_SECRET 后重启服务。"
    });
  }

  try {
    const input = await readJson(req);
    const ticket = String(input.ticket || "").trim();
    const payload = verifySsoTicket(ticket);
    const usedTickets = await readUsedSsoTickets();
    const now = Math.floor(Date.now() / 1000);

    if (usedTickets[payload.jti]) {
      return sendJson(res, 409, {
        ok: false,
        error: "SSO ticket 已使用，请从官网重新进入工具。"
      });
    }

    usedTickets[payload.jti] = payload.exp;
    for (const [jti, exp] of Object.entries(usedTickets)) {
      if (!Number.isFinite(Number(exp)) || Number(exp) < now - 86400) delete usedTickets[jti];
    }
    await writeUsedSsoTickets(usedTickets);

    const session = normalizeSsoSession(payload);
    return sendJson(res, 200, {
      ok: true,
      session: {
        ...session,
        sessionToken: createToolSessionToken(session)
      }
    });
  } catch (error) {
    const status = error.statusCode || 401;
    log(`SSO_EXCHANGE_FAILED status=${status} reason=${error.safeMessage || error.message || "invalid"}`);
    return sendJson(res, status, {
      ok: false,
      error: error.safeMessage || "SSO ticket 已过期或无效。"
    });
  }
}

process.on("uncaughtException", (error) => {
  logError("UNCAUGHT_EXCEPTION", error);
});

process.on("unhandledRejection", (error) => {
  logError("UNHANDLED_REJECTION", error);
});

validateStartupConfig();

server.listen(PORT, HOST, () => {
  console.log(`Project Card Tool listening on http://${HOST}:${PORT}/`);
  console.log(`Image API: ${API_BASE_URL ? "configured" : "not configured"}`);
  console.log(`Image model: ${IMAGE_MODEL}`);
  console.log(`Runtime env: ${APP_ENV}`);
  log(`START host=${HOST} port=${PORT} env=${APP_ENV} api=${API_BASE_URL ? "configured" : "not configured"} model=${IMAGE_MODEL}`);
});

function validateStartupConfig() {
  const missing = [];
  if (IS_PRODUCTION && !SSO_SECRET) missing.push("PROJECT_CARD_SSO_SECRET");
  if (IS_PRODUCTION && !API_BASE_URL) missing.push("IMAGE_API_BASE_URL");
  if (IS_PRODUCTION && !API_KEY) missing.push("IMAGE_API_KEY");
  if (!missing.length) return;

  const message = `Production startup blocked. Missing required env: ${missing.join(", ")}`;
  console.error(message);
  log(message);
  process.exit(1);
}

async function handleReady(req, res) {
  const checks = {
    imageApiConfigured: Boolean(API_BASE_URL && API_KEY),
    ssoConfigured: Boolean(SSO_SECRET),
    storageWritable: await canWriteStorage(),
    demoSessionDisabledForProduction: !IS_PRODUCTION || !DEMO_SESSION_ENABLED,
    adminDisabledForProduction: !IS_PRODUCTION || !ADMIN_ENABLED,
    traceLookupProtectedForProduction: !IS_PRODUCTION || TRACE_LOOKUP_REQUIRES_AUTH || process.env.PROJECT_CARD_PUBLIC_TRACE_LOOKUP === "true"
  };
  const ok = Object.values(checks).every(Boolean);
  return sendJson(res, ok ? 200 : 503, {
    ok,
    env: APP_ENV,
    production: IS_PRODUCTION,
    checks
  });
}

async function canWriteStorage() {
  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
    await fs.access(STORAGE_DIR);
    return true;
  } catch {
    return false;
  }
}

function publicAppConfig() {
  return {
    ok: true,
    env: APP_ENV,
    production: IS_PRODUCTION,
    demoSessionEnabled: DEMO_SESSION_ENABLED,
    adminEnabled: ADMIN_ENABLED,
    generationEnabled: Boolean(API_BASE_URL && API_KEY),
    ssoConfigured: Boolean(SSO_SECRET)
  };
}

async function handleGenerateCard(req, res) {
  if (!API_BASE_URL || !API_KEY) {
    return sendJson(res, 503, {
      ok: false,
      error: "真实生图接口未配置，请设置 IMAGE_API_BASE_URL 和 IMAGE_API_KEY 后重启服务。"
    });
  }

  const input = await readJson(req);
  const payload = input.payload || {};
  validateGenerationPayload(payload);
  const context = authorizeRequestContext(req) || normalizeGenerationContext(input.context || {});
  const traceCode = String(input.traceCode || payload.traceCode || makeTraceCode());
  const prompt = buildProjectCardPrompt({ ...payload, traceCode });
  const endpoint = API_BASE_URL.endsWith("/images/generations")
    ? API_BASE_URL
    : `${API_BASE_URL}/images/generations`;

  const apiBody = {
    model: IMAGE_MODEL,
    prompt,
    size: "1024x1280",
    quality: "high",
    output_format: "png"
  };

  let json;
  try {
    json = await callImageApiWithRetry(endpoint, apiBody);
  } catch (error) {
    logError("IMAGE_API_FAILED", error);
    return sendJson(res, 502, {
      ok: false,
      error: publicImageApiError(error)
    });
  }
  const item = json.data && json.data[0];
  if (!item || (!item.b64_json && !item.url)) {
    return sendJson(res, 502, {
      ok: false,
      error: "生图接口返回格式异常，未包含图片数据。"
    });
  }

  let bytes;
  if (item.b64_json) {
    bytes = Buffer.from(item.b64_json, "base64");
  } else {
    const imageResponse = await fetch(item.url);
    if (!imageResponse.ok) throw new Error(`图片下载失败：HTTP ${imageResponse.status}`);
    bytes = Buffer.from(await imageResponse.arrayBuffer());
  }

  const day = compactDate();
  const fileBase = `${safeFileName(payload.projectName || "project-card")}-${traceCode}-${crypto.randomUUID().slice(0, 8)}`;
  const relativeDir = path.join("storage", "generated", day);
  const absoluteDir = path.join(STORAGE_DIR, day);
  await fs.mkdir(absoluteDir, { recursive: true });

  const imagePath = path.join(absoluteDir, `${fileBase}.png`);
  const metaPath = path.join(absoluteDir, `${fileBase}.json`);
  const createdAt = new Date().toISOString();
  await fs.writeFile(imagePath, bytes);
  await fs.writeFile(metaPath, JSON.stringify({
    traceCode,
    projectName: payload.projectName || "",
    model: IMAGE_MODEL,
    endpoint: API_BASE_URL ? "configured-image-api" : "not-configured",
    prompt,
    payload: stripLargeFields(payload),
    context,
    createdAt
  }, null, 2), "utf8");
  await upsertTraceIndexCard(metaPath, {
    traceCode,
    projectName: payload.projectName || "",
    payload: stripLargeFields(payload),
    context,
    createdAt
  });

  log(`GENERATED ${imagePath}`);
  return sendJson(res, 200, {
    ok: true,
    traceCode,
    imageUrl: `/${toUrlPath(path.join(relativeDir, `${fileBase}.png`))}`,
    metaStored: true
  });
}

async function handleTraceCard(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = String(url.searchParams.get("code") || url.searchParams.get("traceCode") || "").trim();
  if (!code) {
    return sendJson(res, 400, { ok: false, error: "缺少生成码。" });
  }

  const found = await findTraceMeta(code);
  if (!found) {
    return sendJson(res, 404, { ok: false, error: "未找到该生成码对应的推荐卡。" });
  }

  const card = publicTraceCard(found);
  if (TRACE_LOOKUP_REQUIRES_AUTH) {
    const context = authorizeRequestContext(req);
    if (!matchesTraceContext(card.context || {}, context)) {
      return sendJson(res, 404, { ok: false, error: "未找到当前账号可查看的推荐卡。" });
    }
  }

  return sendJson(res, 200, {
    ok: true,
    card
  });
}

async function handleMyCards(req, res) {
  const input = await readJson(req);
  const context = authorizeRequestContext(req) || normalizeGenerationContext(input.context || {});
  const limit = Math.max(1, Math.min(100, Number(input.limit || 30) || 30));
  if (!hasTraceIdentity(context)) {
    return sendJson(res, 400, { ok: false, error: "缺少会员或公司上下文。" });
  }

  const cards = await listTraceCardsForContext(context, limit);
  return sendJson(res, 200, {
    ok: true,
    cards
  });
}

function buildProjectCardPrompt(p) {
  const sourceText = cleanPromptLine(p.sourceText || "");
  const visualDirection = cleanPromptLine(p.visualDirection || "");
  const colorScheme = cleanPromptLine(p.colorScheme || "");
  const focusCondition = cleanPromptLine(p.focusCondition || "");
  const contactName = cleanPromptLine(p.contactName || "");
  const contactPhone = cleanPromptLine(p.contactPhone || "");
  const contactLine = [contactName, contactPhone].filter(Boolean).join(" ");

  return [
    "请生成 1 张 4:5 竖版中文招商项目推荐卡，可直接通过微信发给客户。",
    "只使用用户提供的文案信息，可以提炼成短标题、标签和重点数字，但不要添加文案中没有的事实。",
    "设计高级简洁，手机端易读，突出一个最有价值的主卖点；可以使用轻微抠像、叠层、毛玻璃、柔和阴影和留白。",
    colorScheme ? `配色：${colorScheme}` : "",
    focusCondition ? `优先突出的主卖点：${focusCondition}` : "",
    visualDirection ? `风格：${visualDirection}` : "",
    "",
    `用户文案：${sourceText}`,
    contactLine ? `可选联系信息：${contactLine}` : "",
    "",
    "不要出现生成码、追踪码、水印、二维码、供应商品牌、API 名称、模型名称、网页按钮、上传控件、Excel 痕迹或提示词内容。没有的信息不要展示。"
  ].filter(Boolean).join("\n");
}

function cleanPromptLine(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function validateGenerationPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw httpError(400, "生成资料格式不正确。");
  }
  if (payload.sourceText && String(payload.sourceText).length > MAX_SOURCE_TEXT_CHARS) {
    throw httpError(413, "项目文案过长，请精简后再生成。");
  }
  if (payload.backgroundImage) {
    const imageBytes = estimateDataUrlBytes(payload.backgroundImage);
    if (!imageBytes || imageBytes > MAX_SOURCE_IMAGE_BYTES) {
      throw httpError(413, "单张图片请控制在 8MB 以内；项目图片也可以不上传。");
    }
  }
}

function estimateDataUrlBytes(value) {
  const text = String(value || "");
  const match = text.match(/^data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return 0;
  const base64 = match[1].replace(/\s+/g, "");
  const padding = (base64.match(/=+$/) || [""])[0].length;
  return Math.floor(base64.length * 3 / 4) - padding;
}

function isMeaningfulPromptValue(value) {
  if (!value) return false;
  return !/^(待补充|详见项目资料|详见资料|未命名项目|综合推荐|月租金)$/i.test(value);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callImageApiWithRetry(endpoint, apiBody) {
  let lastError;
  for (let attempt = 1; attempt <= IMAGE_API_RETRY_COUNT; attempt += 1) {
    try {
      return await callImageApiWithFetch(endpoint, apiBody);
    } catch (error) {
      lastError = error;
      logError(`IMAGE_API_FETCH_ATTEMPT_${attempt}_FAILED`, error);
      if (error.retryable === false) throw error;
      if (error.providerStatus || error.timeout) {
        if (attempt < IMAGE_API_RETRY_COUNT) await sleep(1200 * attempt);
        continue;
      }
    }

    try {
      return await callImageApiWithCurl(endpoint, apiBody);
    } catch (error) {
      lastError = error;
      logError(`IMAGE_API_CURL_ATTEMPT_${attempt}_FAILED`, error);
      if (error.retryable === false) throw error;
    }

    if (process.platform === "win32") {
      try {
        return await callImageApiWithPowerShell(endpoint, apiBody);
      } catch (error) {
        lastError = error;
        logError(`IMAGE_API_POWERSHELL_ATTEMPT_${attempt}_FAILED`, error);
        if (error.retryable === false) throw error;
      }
    }

    if (attempt < IMAGE_API_RETRY_COUNT) {
      await sleep(1200 * attempt);
    }
  }
  throw lastError || new Error("Image API request failed.");
}

async function callImageApiWithFetch(endpoint, apiBody) {
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`
      },
      body: JSON.stringify(apiBody),
      signal: AbortSignal.timeout(IMAGE_API_REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    if (isFetchTimeoutError(error)) {
      throw providerTransportError("生图接口响应超时，可能是上游正在排队或临时拥堵。", { timeout: true });
    }
    throw providerTransportError(error.message || "生图接口连接失败。");
  }
  const text = await response.text();
  if (!response.ok) throw providerHttpError(response.status, text);
  return parseImageApiJson(text);
}

async function callImageApiWithCurl(endpoint, apiBody) {
  const curl = await findCurlExe();
  const tempDir = path.join(TMP_DIR, `image-api-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`);
  const payloadPath = path.join(tempDir, "payload.json");
  await fs.mkdir(tempDir, { recursive: true });
  await fs.writeFile(payloadPath, toAsciiJson(apiBody), "utf8");
  const config = [
    `header = "Authorization: Bearer ${escapeCurlConfig(API_KEY)}"`
  ].join("\n");
  const args = [
    "--connect-timeout", "45",
    "--max-time", String(Math.ceil(IMAGE_API_REQUEST_TIMEOUT_MS / 1000)),
    "--silent",
    "--show-error",
    "--fail-with-body",
    "--request", "POST",
    "--header", "Content-Type: application/json",
    "--data-binary", `@${payloadPath.replace(/\\/g, "/")}`,
    "--config", "-",
    endpoint
  ];
  if (process.platform === "win32") args.unshift("--ssl-no-revoke");

  try {
    const stdout = await new Promise((resolve, reject) => {
      const child = spawn(curl, args, {
        cwd: ROOT,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"]
      });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) {
          reject(providerTransportError(`curl exited ${code}: ${stderr || stdout || "no response"}`));
          return;
        }
        resolve(stdout);
      });
      child.stdin.end(config, "utf8");
    });
    return parseImageApiJson(stdout);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function findCurlExe() {
  const command = process.env.CURL_EXE || (process.platform === "win32" ? "curl.exe" : "curl");
  return command;
}

function parseImageApiJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw providerTransportError("生图接口返回内容不是有效 JSON。");
  }
}

function providerHttpError(status, text) {
  const error = new Error(sanitizeProviderError(status, text));
  error.providerStatus = status;
  error.providerText = String(text || "");
  error.retryable = status === 408 || status === 429 || status >= 500;
  return error;
}

function providerTransportError(message, options = {}) {
  const error = new Error(message || "Image API transport failed.");
  error.retryable = true;
  if (options.timeout) error.timeout = true;
  return error;
}

function isFetchTimeoutError(error) {
  return error && (error.name === "TimeoutError" || error.code === "ABORT_ERR");
}

function escapeCurlConfig(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function callImageApiWithPowerShell(endpoint, apiBody) {
  if (process.platform !== "win32") {
    return Promise.reject(providerTransportError("PowerShell fallback is only available on Windows."));
  }
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12",
    "[System.Net.ServicePointManager]::CheckCertificateRevocationList = $false",
    "$payload = [Console]::In.ReadToEnd()",
    "$headers = @{ Authorization = \"Bearer $env:IMAGE_API_KEY\" }",
    "$response = Invoke-RestMethod -Uri $env:IMAGE_API_ENDPOINT -Method Post -ContentType 'application/json' -Headers $headers -Body $payload -TimeoutSec 220",
    "$response | ConvertTo-Json -Depth 20 -Compress"
  ].join("; ");

  const env = {
    ...process.env,
    IMAGE_API_ENDPOINT: endpoint,
    IMAGE_API_KEY: API_KEY
  };

  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      cwd: ROOT,
      env,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(providerTransportError(sanitizeProviderError(code || 502, stderr || stdout || "PowerShell image request failed")));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(providerTransportError("PowerShell fallback returned invalid JSON."));
      }
    });
    child.stdin.end(toAsciiJson(apiBody), "utf8");
  });
}

function toAsciiJson(value) {
  return JSON.stringify(value).replace(/[^\x00-\x7F]/g, (char) => {
    return `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
  });
}

function verifySsoTicket(ticket) {
  if (!ticket) throw ssoError(400, "缺少 SSO ticket。");
  const parts = ticket.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw ssoError(400, "SSO ticket 格式错误。");

  const [payloadPart, signaturePart] = parts;
  const expected = crypto.createHmac("sha256", SSO_SECRET).update(payloadPart).digest();
  const actual = decodeBase64Url(signaturePart);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw ssoError(401, "SSO ticket 签名无效。");
  }

  let payload;
  try {
    payload = JSON.parse(decodeBase64Url(payloadPart).toString("utf8"));
  } catch {
    throw ssoError(400, "SSO ticket 内容不是有效 JSON。");
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== SSO_ISSUER) throw ssoError(401, "SSO ticket 签发方无效。");
  if (payload.aud !== SSO_AUDIENCE) throw ssoError(401, "SSO ticket 受众无效。");
  if (!payload.jti || typeof payload.jti !== "string") throw ssoError(400, "SSO ticket 缺少 jti。");
  if (!Number.isFinite(Number(payload.exp)) || Number(payload.exp) < now) throw ssoError(401, "SSO ticket 已过期。");
  if (Number.isFinite(Number(payload.iat)) && Number(payload.iat) > now + 60) throw ssoError(401, "SSO ticket 签发时间无效。");
  if (!payload.customer || !payload.customer.id) throw ssoError(401, "SSO ticket 缺少会员身份。");
  if (payload.customer.status && payload.customer.status !== "active") throw ssoError(401, "官网会员状态不可用。");

  return payload;
}

function normalizeSsoSession(payload) {
  const customer = payload.customer || {};
  const company = payload.company || {};
  const entitlement = payload.entitlement || {};
  const validUntil = entitlement.validUntil || addDaysIso(30);
  const companyId = String(company.id || company.inviteCode || `sso_company_${stableId(customer.id)}`);

  return {
    userId: String(customer.id),
    name: String(customer.name || customer.email || "官网会员"),
    email: String(customer.email || ""),
    companyId,
    companyName: String(company.name || "官网会员权益"),
    planType: entitlement.planType === "credits" ? "credits" : "time_unlimited",
    creditsRemaining: Number.isFinite(Number(entitlement.creditsRemaining)) ? Number(entitlement.creditsRemaining) : 20,
    validUntil,
    authSource: "website_sso"
  };
}

function createToolSessionToken(session) {
  if (!SSO_SECRET) throw ssoError(503, "工具会话签名未配置。");
  const now = Math.floor(Date.now() / 1000);
  const exp = toolSessionExpiry(session.validUntil, now);
  const payload = {
    typ: "project-card-session",
    iss: "project-card-tool",
    aud: "project-card-api",
    iat: now,
    exp,
    session
  };
  const payloadPart = encodeBase64Url(JSON.stringify(payload));
  const signaturePart = encodeBase64Url(crypto.createHmac("sha256", SSO_SECRET).update(payloadPart).digest());
  return `${payloadPart}.${signaturePart}`;
}

function authorizeRequestContext(req) {
  if (!SSO_SECRET) return null;
  const token = readSessionToken(req);
  if (!token) throw ssoError(401, "请从官网会员中心重新进入工具。");
  const session = verifyToolSessionToken(token);
  return sessionToGenerationContext(session);
}

function readSessionToken(req) {
  const direct = req.headers["x-project-card-session"];
  if (direct) return String(Array.isArray(direct) ? direct[0] : direct).trim();
  const authorization = req.headers.authorization || "";
  const match = String(authorization).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function verifyToolSessionToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw ssoError(401, "工具会话已失效，请重新进入。");

  const [payloadPart, signaturePart] = parts;
  const expected = crypto.createHmac("sha256", SSO_SECRET).update(payloadPart).digest();
  const actual = decodeBase64Url(signaturePart);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw ssoError(401, "工具会话签名无效，请重新进入。");
  }

  let payload;
  try {
    payload = JSON.parse(decodeBase64Url(payloadPart).toString("utf8"));
  } catch {
    throw ssoError(401, "工具会话内容无效，请重新进入。");
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.typ !== "project-card-session") throw ssoError(401, "工具会话类型无效，请重新进入。");
  if (payload.iss !== "project-card-tool" || payload.aud !== "project-card-api") throw ssoError(401, "工具会话来源无效，请重新进入。");
  if (!Number.isFinite(Number(payload.exp)) || Number(payload.exp) < now) throw ssoError(401, "工具会话已过期，请重新进入。");
  if (!payload.session || !payload.session.userId || !payload.session.companyId) throw ssoError(401, "工具会话缺少会员权益。");

  return payload.session;
}

function sessionToGenerationContext(session) {
  return normalizeGenerationContext({
    user: {
      id: `website:${session.userId}`,
      externalCustomerId: session.userId,
      name: session.name,
      email: session.email,
      authSource: session.authSource || "website_sso"
    },
    company: {
      id: session.companyId,
      name: session.companyName,
      planType: session.planType,
      validUntil: session.validUntil
    }
  });
}

function toolSessionExpiry(validUntil, now) {
  const max = now + 31 * 24 * 60 * 60;
  const validUntilMs = Date.parse(`${validUntil || ""}T23:59:59+08:00`);
  if (!Number.isFinite(validUntilMs)) return max;
  const entitlementExp = Math.floor(validUntilMs / 1000);
  return Math.max(now + 60, Math.min(max, entitlementExp));
}

async function readUsedSsoTickets() {
  try {
    const text = await fs.readFile(SSO_USED_JTI_FILE, "utf8");
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function writeUsedSsoTickets(value) {
  await fs.mkdir(path.dirname(SSO_USED_JTI_FILE), { recursive: true });
  await fs.writeFile(SSO_USED_JTI_FILE, JSON.stringify(value, null, 2), "utf8");
}

function ssoError(statusCode, safeMessage) {
  const error = new Error(safeMessage);
  error.statusCode = statusCode;
  error.safeMessage = safeMessage;
  return error;
}

function decodeBase64Url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

function encodeBase64Url(value) {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function stableId(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 12);
}

function addDaysIso(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function normalizeGenerationContext(context) {
  const user = context.user && typeof context.user === "object" ? context.user : {};
  const company = context.company && typeof context.company === "object" ? context.company : {};
  return {
    user: {
      id: cleanMetaValue(user.id),
      externalCustomerId: cleanMetaValue(user.externalCustomerId),
      name: cleanMetaValue(user.name),
      email: cleanMetaValue(user.email || user.phone),
      authSource: cleanMetaValue(user.authSource)
    },
    company: {
      id: cleanMetaValue(company.id),
      name: cleanMetaValue(company.name),
      planType: cleanMetaValue(company.planType),
      validUntil: cleanMetaValue(company.validUntil)
    }
  };
}

async function findTraceMeta(traceCode) {
  const indexed = await findTraceIndexCard(traceCode);
  if (indexed) return indexed;

  const files = await listJsonFiles(STORAGE_DIR);
  for (const file of files) {
    try {
      const meta = JSON.parse(await fs.readFile(file, "utf8"));
      if (String(meta.traceCode || "") === traceCode) return { meta, file };
    } catch {
      // Ignore broken historical meta files.
    }
  }
  return null;
}

async function listTraceCardsForContext(context, limit) {
  const indexedCards = await listTraceIndexCardsForContext(context, limit);
  if (indexedCards.length >= limit) return indexedCards;

  const files = await listJsonFiles(STORAGE_DIR);
  const cards = [];
  const seen = new Set(indexedCards.map((card) => card.traceCode).filter(Boolean));
  for (const file of files) {
    if (cards.length >= limit) break;
    try {
      const meta = JSON.parse(await fs.readFile(file, "utf8"));
      if (!seen.has(meta.traceCode) && matchesTraceContext(meta.context || {}, context)) {
        cards.push(publicTraceCard({ meta, file }));
      }
    } catch {
      // Ignore broken historical meta files.
    }
  }
  return [...indexedCards, ...cards].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, limit);
}

function hasTraceIdentity(context) {
  const user = context.user || {};
  const company = context.company || {};
  return Boolean(user.id || user.externalCustomerId || user.email || company.id);
}

function matchesTraceContext(storedContext, currentContext) {
  const stored = normalizeGenerationContext(storedContext);
  const current = normalizeGenerationContext(currentContext);
  const storedUser = stored.user || {};
  const currentUser = current.user || {};
  const storedCompany = stored.company || {};
  const currentCompany = current.company || {};

  if (currentUser.id && storedUser.id && currentUser.id === storedUser.id) return true;
  if (currentUser.externalCustomerId && storedUser.externalCustomerId && currentUser.externalCustomerId === storedUser.externalCustomerId) return true;
  if (currentUser.email && storedUser.email && currentUser.email === storedUser.email) return true;
  if (!currentUser.id && !currentUser.externalCustomerId && !currentUser.email && currentCompany.id && storedCompany.id) {
    return currentCompany.id === storedCompany.id;
  }
  return false;
}

async function listJsonFiles(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await listJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json") && fullPath !== TRACE_INDEX_FILE) {
      results.push(fullPath);
    }
  }
  return results.sort().reverse();
}

async function readTraceIndex() {
  try {
    const parsed = JSON.parse(await fs.readFile(TRACE_INDEX_FILE, "utf8"));
    return {
      version: 1,
      updatedAt: parsed.updatedAt || "",
      cards: Array.isArray(parsed.cards) ? parsed.cards : []
    };
  } catch {
    return { version: 1, updatedAt: "", cards: [] };
  }
}

async function writeTraceIndex(index) {
  await fs.mkdir(path.dirname(TRACE_INDEX_FILE), { recursive: true });
  const contents = JSON.stringify({
    version: 1,
    updatedAt: new Date().toISOString(),
    cards: (index.cards || []).slice(0, 5000)
  }, null, 2);
  const tempPath = `${TRACE_INDEX_FILE}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(tempPath, `${contents}\n`, { encoding: "utf8", mode: 0o640 });
    await fs.rename(tempPath, TRACE_INDEX_FILE);
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => {});
  }
}

async function upsertTraceIndexCard(metaPath, meta) {
  const index = await readTraceIndex();
  const card = publicTraceCard({ meta, file: metaPath });
  index.cards = [
    card,
    ...index.cards.filter((item) => item.traceCode !== card.traceCode && item.imageUrl !== card.imageUrl)
  ].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  await writeTraceIndex(index);
}

async function findTraceIndexCard(traceCode) {
  const index = await readTraceIndex();
  const card = index.cards.find((item) => String(item.traceCode || "") === traceCode);
  return card ? { card } : null;
}

async function listTraceIndexCardsForContext(context, limit) {
  const index = await readTraceIndex();
  return index.cards
    .filter((card) => matchesTraceContext(card.context || {}, context))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, limit);
}

function publicTraceCard(found) {
  if (found.card) return found.card;
  const { meta, file } = found;
  const imagePath = file.replace(/\.json$/i, ".png");
  const relativeImage = path.join("storage", "generated", path.relative(STORAGE_DIR, imagePath));
  const payload = stripPrivateTraceFields(stripLargeFields(meta.payload || {}));
  return {
    traceCode: meta.traceCode || "",
    projectName: meta.projectName || "",
    createdAt: meta.createdAt || "",
    imageUrl: `/${toUrlPath(relativeImage)}`,
    context: normalizeGenerationContext(meta.context || {}),
    payload
  };
}

function stripPrivateTraceFields(payload) {
  const clone = { ...payload };
  delete clone.prompt;
  delete clone.sourceText;
  delete clone.rawJson;
  delete clone.backgroundImage;
  delete clone.contactName;
  delete clone.contactPhone;
  return clone;
}

function cleanMetaValue(value) {
  return String(value || "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 200);
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let requestPath = decodeURIComponent(url.pathname);
  if (requestPath === "/") requestPath = "/index.html";
  if (/^\/storage\/generated\/.*\.json$/i.test(requestPath)) {
    return sendText(res, 403, "Generated metadata is not publicly served. Use /api/trace-card for a safe summary.");
  }
  if (requestPath.startsWith("/storage/generated/")) {
    const storagePath = path.normalize(path.join(STORAGE_DIR, requestPath.replace(/^\/storage\/generated\/?/, "")));
    if (!isPathInside(storagePath, STORAGE_DIR)) return sendText(res, 403, "Forbidden");
    return await sendStaticFile(res, storagePath);
  }

  const fullPath = path.normalize(path.join(ROOT, requestPath.replace(/^\/+/, "")));
  if (!isPathInside(fullPath, ROOT)) return sendText(res, 403, "Forbidden");

  return await sendStaticFile(res, fullPath);
}

async function sendStaticFile(res, fullPath) {
  try {
    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) return sendText(res, 404, "Not found");
    const ext = path.extname(fullPath).toLowerCase();
    const bytes = await fs.readFile(fullPath);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(bytes);
  } catch {
    sendText(res, 404, "Not found");
  }
}

function isPathInside(candidate, root) {
  const resolvedCandidate = path.resolve(candidate);
  const resolvedRoot = path.resolve(root);
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let bytes = 0;
    let tooLarge = false;
    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_JSON_BODY_BYTES) {
        tooLarge = true;
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      if (tooLarge) {
        reject(httpError(413, "上传内容过大。单张图片请控制在 8MB 以内，项目图片也可以不上传。"));
        return;
      }
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(httpError(400, "请求内容不是有效 JSON。"));
      }
    });
    req.on("error", reject);
  });
}

function httpError(statusCode, safeMessage) {
  const error = new Error(safeMessage);
  error.statusCode = statusCode;
  error.safeMessage = safeMessage;
  return error;
}

function sendJson(res, status, payload) {
  const bytes = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": bytes.length
  });
  res.end(bytes);
}

function safeSendJson(res, status, payload) {
  try {
    if (res.headersSent || res.destroyed) return;
    sendJson(res, status, payload);
  } catch (error) {
    logError("SAFE_SEND_JSON_FAILED", error);
  }
}

function sendText(res, status, text) {
  const bytes = Buffer.from(text);
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": bytes.length
  });
  res.end(bytes);
}

function formatRent(value) {
  const raw = String(value || "").replace(/[元,/月\s]/g, "");
  const num = Number(raw);
  return Number.isFinite(num) && raw ? num.toLocaleString("zh-CN") : String(value || "");
}

function safeFileName(value) {
  return String(value || "project-card")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 48);
}

function compactDate() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function makeTraceCode() {
  return `PC-${compactDate()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function sanitizeProviderError(status, text) {
  const clipped = String(text || "").replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 800);
  if (status === 401 || status === 403) return "生图接口鉴权失败，请检查局域网 API Key。";
  if (status === 429) return "生图接口当前繁忙或额度受限，请稍后重试。";
  return `生图接口失败：HTTP ${status} ${clipped}`;
}

function publicImageApiError(error) {
  if (error && (error.providerStatus === 401 || error.providerStatus === 403)) {
    return "生图接口鉴权失败，请检查接口 Key 是否可用。";
  }
  if (error && error.providerStatus === 429) {
    return "生图接口当前繁忙或额度受限，请稍后重试。";
  }
  if (error && [502, 503, 504].includes(error.providerStatus)) {
    return "生图接口上游排队或超时，本次没有生成成功，也不会产生有效结果。请稍后再点一次生成。";
  }
  if (error && error.timeout) {
    return "生图接口响应超时，本次没有生成成功，也不会产生有效结果。请稍后再点一次生成。";
  }
  if (error && error.retryable === false) {
    return error.message || "生图接口拒绝了本次请求，请检查提交内容后重试。";
  }
  return "生图接口连接不稳定，本次没有生成成功，也不会产生有效结果。请稍后再点一次生成。";
}

function stripLargeFields(payload) {
  const clone = { ...payload };
  if (clone.backgroundImage) clone.backgroundImage = "[omitted]";
  if (clone.rawJson) clone.rawJson = "[stored in browser batch]";
  return clone;
}

function toUrlPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.mkdir(LOG_DIR, { recursive: true })
    .then(() => fs.appendFile(LOG_FILE, line, "utf8"))
    .catch(() => {});
}

function logError(label, error) {
  const detail = error && error.stack ? error.stack : String(error || "");
  log(`${label} ${detail.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")}`);
  console.error(label, error);
}
