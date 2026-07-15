param(
  [string]$BaseUrl = "http://127.0.0.1:3000",
  [string]$JobId = "cmr6etetn0000e74me4icnsm8",
  [string]$OutputRoot = "generated/ui-design-screenshots"
)

$ErrorActionPreference = "Stop"

function Get-ChromePath {
  $candidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe"
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) { return $candidate }
  }
  throw "Chrome or Edge executable was not found."
}

function Get-DotEnvValue([string]$Name) {
  if (-not (Test-Path ".env")) { return $null }
  foreach ($line in Get-Content ".env") {
    if ($line -match "^\s*$([regex]::Escape($Name))\s*=\s*(.*)\s*$") {
      return $Matches[1].Trim().Trim('"').Trim("'")
    }
  }
  return $null
}

function Get-Sha256([string]$Value) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
    return -join ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") })
  } finally {
    $sha.Dispose()
  }
}

function New-CustomerSession([string]$JobId) {
  $nodeScript = @'
const { randomBytes, randomUUID, createHash } = require("crypto");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
(async () => {
  const jobId = process.env.SCREENSHOT_JOB_ID;
  const job = await prisma.siteJob.findUnique({ where: { id: jobId }, select: { ownerAccountId: true } });
  let accountId = job && job.ownerAccountId;
  if (!accountId) {
    const account = await prisma.customerAccount.findFirst({ where: { status: "active" }, orderBy: { createdAt: "asc" }, select: { id: true } });
    accountId = account && account.id;
  }
  if (!accountId) throw new Error("No active customer account available for screenshot session.");
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
  await prisma.customerSession.create({
    data: {
      id: randomUUID(),
      accountId,
      tokenHash: sha256(token),
      expiresAt
    }
  });
  console.log(JSON.stringify({ token }));
})().finally(() => prisma.$disconnect());
'@
  $env:SCREENSHOT_JOB_ID = $JobId
  $result = $nodeScript | node -
  return ($result | ConvertFrom-Json).token
}

function Send-Cdp {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Socket,
    [string]$Method,
    [hashtable]$Params = @{}
  )
  $script:CdpId += 1
  $id = $script:CdpId
  $payload = @{ id = $id; method = $Method; params = $Params } | ConvertTo-Json -Depth 20 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
  $segment = [ArraySegment[byte]]::new($bytes)
  $Socket.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()

  while ($true) {
    $buffer = New-Object byte[] 1048576
    $stream = New-Object System.IO.MemoryStream
    do {
      $receiveSegment = [ArraySegment[byte]]::new($buffer)
      $received = $Socket.ReceiveAsync($receiveSegment, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
      if ($received.Count -gt 0) {
        $stream.Write($buffer, 0, $received.Count)
      }
    } while (-not $received.EndOfMessage)
    $message = [System.Text.Encoding]::UTF8.GetString($stream.ToArray())
    $stream.Dispose()
    if (-not $message) { continue }
    $json = $message | ConvertFrom-Json
    if ($json.id -eq $id) {
      if ($json.error) { throw "$Method failed: $($json.error.message)" }
      return $json.result
    }
  }
}

function New-CdpTab([int]$Port) {
  $encoded = [uri]::EscapeDataString("about:blank")
  try {
    return Invoke-RestMethod -Method Put -Uri "http://127.0.0.1:$Port/json/new?$encoded"
  } catch {
    return Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:$Port/json/new?$encoded"
  }
}

function Capture-Page {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Socket,
    [string]$Url,
    [string]$OutputPath,
    [int]$Width,
    [int]$Height,
    [int]$Scale,
    [bool]$Mobile
  )
  Send-Cdp $Socket "Page.enable" | Out-Null
  Send-Cdp $Socket "Network.enable" | Out-Null
  Send-Cdp $Socket "Emulation.setDeviceMetricsOverride" @{
    width = $Width
    height = $Height
    deviceScaleFactor = $Scale
    mobile = $Mobile
  } | Out-Null
  Send-Cdp $Socket "Page.navigate" @{ url = $Url } | Out-Null
  Start-Sleep -Seconds 5
  Send-Cdp $Socket "Runtime.evaluate" @{ expression = "window.scrollTo(0,0); document.fonts && document.fonts.ready ? document.fonts.ready.then(()=>true) : true"; awaitPromise = $true } | Out-Null
  Start-Sleep -Milliseconds 600

  $metrics = Send-Cdp $Socket "Page.getLayoutMetrics"
  $contentWidth = [Math]::Max($Width, [int][Math]::Ceiling($metrics.contentSize.width))
  $contentHeight = [Math]::Min(14000, [Math]::Max($Height, [int][Math]::Ceiling($metrics.contentSize.height)))
  $screenshot = Send-Cdp $Socket "Page.captureScreenshot" @{
    format = "png"
    fromSurface = $true
    captureBeyondViewport = $true
    clip = @{
      x = 0
      y = 0
      width = $contentWidth
      height = $contentHeight
      scale = 1
    }
  }
  [System.IO.File]::WriteAllBytes($OutputPath, [Convert]::FromBase64String($screenshot.data))
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outDir = Join-Path $OutputRoot "ui-design-screenshots-$timestamp"
$desktopDir = Join-Path $outDir "desktop"
$mobileDir = Join-Path $outDir "mobile"
New-Item -ItemType Directory -Force -Path $desktopDir, $mobileDir | Out-Null

$chrome = Get-ChromePath
$chromeProcess = $null
$staticServerProcess = $null
$port = 9222
$useExistingChrome = $false
try {
  Invoke-RestMethod -Uri "http://127.0.0.1:$port/json/version" | Out-Null
  $useExistingChrome = $true
} catch {
  $port = 9333 + (Get-Random -Minimum 0 -Maximum 300)
  $profileDir = Join-Path $outDir "chrome-profile"
  New-Item -ItemType Directory -Force -Path $profileDir | Out-Null
  $chromeArgs = @(
    "--headless",
    "--remote-debugging-port=$port",
    "--remote-allow-origins=*",
    "--user-data-dir=$profileDir",
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-extensions",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--new-window",
    "about:blank"
  )
  $chromeArgString = ($chromeArgs | ForEach-Object {
    if ($_ -match "\s") { '"' + $_.Replace('"', '\"') + '"' } else { $_ }
  }) -join " "
  $chromeProcess = Start-Process -FilePath $chrome -ArgumentList $chromeArgString -PassThru -WindowStyle Hidden
}

try {
  $ready = $useExistingChrome
  if (-not $ready) {
    for ($i = 0; $i -lt 30; $i++) {
      try {
        Invoke-RestMethod -Uri "http://127.0.0.1:$port/json/version" | Out-Null
        $ready = $true
        break
      } catch {
        Start-Sleep -Milliseconds 500
      }
    }
  }
  if (-not $ready) { throw "Chrome DevTools endpoint did not start." }

  $adminPassword = Get-DotEnvValue "ADMIN_PASSWORD"
  if (-not $adminPassword) { $adminPassword = "change-me" }
  $adminSession = Get-Sha256 "admin:$adminPassword`:stage3"
  $customerSession = New-CustomerSession $JobId

  $generatedPreview = $null
  try {
    $localSiteIndex = Get-ChildItem "generated/codex-runs" -Directory -Filter "$JobId-*" -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending |
      ForEach-Object { Join-Path $_.FullName "site/index.html" } |
      Where-Object { Test-Path $_ } |
      Select-Object -First 1
    if ($localSiteIndex) {
      $siteRoot = Split-Path (Resolve-Path $localSiteIndex).Path -Parent
      $staticPort = 4780 + (Get-Random -Minimum 0 -Maximum 300)
      $staticServerPath = Join-Path $outDir "static-site-server.mjs"
      @'
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2]);
const port = Number(process.argv[3]);
const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".webp", "image/webp"]
]);

http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.resolve(root, "." + pathname);
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": mime.get(path.extname(filePath).toLowerCase()) || "application/octet-stream" });
    res.end(data);
  });
}).listen(port, "127.0.0.1");
'@ | Set-Content -Path $staticServerPath -Encoding UTF8
      $staticServerProcess = Start-Process -FilePath "node" -ArgumentList @($staticServerPath, $siteRoot, $staticPort) -PassThru -WindowStyle Hidden
      Start-Sleep -Seconds 1
      $generatedPreview = "http://127.0.0.1:$staticPort/index.html"
    }
  } catch {}
  if (-not $generatedPreview) {
    try {
      $env:SCREENSHOT_JOB_ID = $JobId
      $previewJson = @'
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.siteJob.findUnique({where:{id:process.env.SCREENSHOT_JOB_ID},select:{previewUrl:true}}).then(row=>console.log(row && row.previewUrl || "")).finally(()=>p.$disconnect());
'@ | node -
      $generatedPreview = $previewJson.Trim()
    } catch {}
  }

  $publicPages = @(
    @{ name = "01-home"; url = "/" },
    @{ name = "02-login"; url = "/login" },
    @{ name = "03-register"; url = "/register" },
    @{ name = "04-admin-login"; url = "/admin" }
  )
  $customerPages = @(
    @{ name = "05-site-start-upload"; url = "/site/start" },
    @{ name = "06-member-center"; url = "/account" },
    @{ name = "07-copy-editor"; url = "/site/copy/$JobId" },
    @{ name = "08-style-gallery"; url = "/site/style/$JobId" },
    @{ name = "09-copy-confirm"; url = "/site/confirm/$JobId" },
    @{ name = "10-result-delivery"; url = "/site/result/$JobId" },
    @{ name = "11-preview-shell"; url = "/site/preview/$JobId" }
  )
  $adminPages = @(
    @{ name = "12-admin-dashboard"; url = "/admin" },
    @{ name = "13-admin-customers"; url = "/admin/customers" },
    @{ name = "14-admin-site-jobs"; url = "/admin/site-jobs" },
    @{ name = "15-admin-site-job-detail"; url = "/admin/site-jobs/$JobId" },
    @{ name = "16-admin-site-job-codex"; url = "/admin/site-jobs/$JobId/codex" },
    @{ name = "17-admin-site-job-delivery"; url = "/admin/site-jobs/$JobId/delivery" }
  )
  $externalPages = @()
  if ($generatedPreview) {
    $externalPages += @{ name = "18-generated-website-sample"; url = $generatedPreview }
  }

  $script:ScreenshotManifest = @()

  function Open-ConnectedTab {
    $tab = New-CdpTab $port
    $socket = [System.Net.WebSockets.ClientWebSocket]::new()
    $socket.ConnectAsync([Uri]$tab.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
    return $socket
  }

  $script:CdpId = 0

  function Capture-Set([array]$Pages, [bool]$SetCustomerCookie, [bool]$SetAdminCookie) {
    $socket = Open-ConnectedTab
    try {
      Send-Cdp $socket "Network.enable" | Out-Null
      if ($SetCustomerCookie) {
        Send-Cdp $socket "Network.setCookie" @{ name = "ai_site_customer_session"; value = $customerSession; url = $BaseUrl; path = "/" } | Out-Null
      }
      if ($SetAdminCookie) {
        Send-Cdp $socket "Network.setCookie" @{ name = "ai_image_admin_session"; value = $adminSession; url = $BaseUrl; path = "/" } | Out-Null
      }
      foreach ($page in $Pages) {
        $url = if ($page.url -match "^https?://") { $page.url } else { "$BaseUrl$($page.url)" }
        $desktopPath = Join-Path $desktopDir "$($page.name).png"
        $mobilePath = Join-Path $mobileDir "$($page.name).png"
        Capture-Page $socket $url $desktopPath 1440 1100 1 $false
        Capture-Page $socket $url $mobilePath 390 844 2 $true
        $script:ScreenshotManifest += [pscustomobject]@{ name = $page.name; url = $url; desktop = "desktop/$($page.name).png"; mobile = "mobile/$($page.name).png" }
      }
    } finally {
      $socket.Dispose()
    }
  }

  Capture-Set $publicPages $false $false
  Capture-Set $customerPages $true $false
  Capture-Set $adminPages $false $true
  Capture-Set $externalPages $false $false

  $manifestLines = @(
    "# UI Design Screenshot Package",
    "",
    "- Created: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
    "- Base URL: $BaseUrl",
    "- Sample Job ID: $JobId",
    "- Desktop viewport: 1440x1100",
    "- Mobile viewport: 390x844 @2x",
    "",
    "| Page | URL | Desktop | Mobile |",
    "| --- | --- | --- | --- |"
  )
  foreach ($item in $script:ScreenshotManifest) {
    $manifestLines += "| $($item.name) | $($item.url) | $($item.desktop) | $($item.mobile) |"
  }
  $manifestPath = Join-Path $outDir "manifest.md"
  $manifestLines | Set-Content -Path $manifestPath -Encoding UTF8

  $zipPath = "$outDir.zip"
  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
  Compress-Archive -Path (Join-Path $outDir "*") -DestinationPath $zipPath -Force

  [pscustomobject]@{
    OutputDirectory = (Resolve-Path $outDir).Path
    ZipPath = (Resolve-Path $zipPath).Path
    ScreenshotCount = ($script:ScreenshotManifest.Count * 2)
  } | ConvertTo-Json
} finally {
  if ($chromeProcess -and -not $chromeProcess.HasExited) {
    Stop-Process -Id $chromeProcess.Id -Force -ErrorAction SilentlyContinue
  }
  if ($staticServerProcess -and -not $staticServerProcess.HasExited) {
    Stop-Process -Id $staticServerProcess.Id -Force -ErrorAction SilentlyContinue
  }
}
