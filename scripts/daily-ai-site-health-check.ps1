param(
  [switch]$StartMissingWorker,
  [switch]$CheckModelApi,
  [switch]$SkipEcs,
  [switch]$Strict
)

$ErrorActionPreference = "Continue"
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$WorkspaceRoot = (Resolve-Path (Join-Path $RepoRoot "..")).Path
$NodeDir = Join-Path $WorkspaceRoot "tools\node-v24.16.0-win-x64"
$NodeExe = Join-Path $NodeDir "node.exe"
$NpmCmd = Join-Path $NodeDir "npm.cmd"
$EnvPath = Join-Path $RepoRoot ".env"
$LogPath = Join-Path $RepoRoot "site-worker.current.log"
$ErrLogPath = Join-Path $RepoRoot "site-worker.current.err.log"
$WorkerLauncher = Join-Path $RepoRoot "scripts\start-site-worker.ps1"
$ReportDir = Join-Path $RepoRoot "logs\daily-health"
$EcsKey = Join-Path $WorkspaceRoot ".deploy\xinyingst_ecs_ed25519"
$EcsHost = "root@8.138.148.34"
$PublicBase = "https://xinyingst.com"
$LocalBase = "http://127.0.0.1:3000"

New-Item -ItemType Directory -Force -Path $ReportDir | Out-Null
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$JsonReport = Join-Path $ReportDir "daily-health-$Stamp.json"
$TextReport = Join-Path $ReportDir "daily-health-$Stamp.txt"

$Checks = New-Object System.Collections.Generic.List[object]

function Add-Check {
  param(
    [string]$Name,
    [ValidateSet("PASS", "WARN", "FAIL", "INFO")]
    [string]$Status,
    [string]$Detail,
    [string]$Action = ""
  )
  $Checks.Add([pscustomobject]@{
    name = $Name
    status = $Status
    detail = $Detail
    action = $Action
  })
}

function Read-DotEnv {
  param([string]$Path)
  $map = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $map }
  foreach ($line in Get-Content -LiteralPath $Path -ErrorAction SilentlyContinue) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $parts = $line -split '=', 2
    $key = $parts[0].Trim()
    $value = $parts[1].Trim()
    if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $map[$key] = $value
  }
  return $map
}

function Quote-PsLiteral {
  param([string]$Value)
  return "'" + ($Value -replace "'", "''") + "'"
}

function Resolve-CodexCli {
  if ($env:CODEX_CLI_PATH) {
    $configured = $env:CODEX_CLI_PATH.Trim()
    if ($configured -and (Test-Path -LiteralPath $configured)) {
      return (Resolve-Path -LiteralPath $configured).Path
    }
  }

  $command = Get-Command codex -ErrorAction SilentlyContinue
  if ($command -and $command.Source -and (Test-Path -LiteralPath $command.Source)) {
    return (Resolve-Path -LiteralPath $command.Source).Path
  }

  $extensionsRoot = Join-Path $env:USERPROFILE ".vscode\extensions"
  if (Test-Path -LiteralPath $extensionsRoot) {
    $bundled = Get-ChildItem -LiteralPath $extensionsRoot -Directory -Filter "openai.chatgpt-*-win32-x64" -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending |
      ForEach-Object {
        Join-Path $_.FullName "bin\windows-x86_64\codex.exe"
      } |
      Where-Object { Test-Path -LiteralPath $_ } |
      Select-Object -First 1
    if ($bundled) {
      return (Resolve-Path -LiteralPath $bundled).Path
    }
  }

  return $null
}

function Test-Url {
  param(
    [string]$Name,
    [string]$Url,
    [int]$TimeoutSec = 12
  )
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec -Method Get
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
      Add-Check $Name "PASS" "$Url -> HTTP $($response.StatusCode)"
    } else {
      Add-Check $Name "WARN" "$Url -> HTTP $($response.StatusCode)" "Check whether this route should be reachable."
    }
  } catch {
    Add-Check $Name "FAIL" "$Url -> $($_.Exception.Message)" "Check network, DNS, Nginx/Next, security group, and release."
  }
}

function Run-Ssh {
  param([string]$RemoteCommand)
  if (-not (Test-Path -LiteralPath $EcsKey)) {
    throw "SSH key not found: $EcsKey"
  }
  $args = @(
    "-i", $EcsKey,
    "-o", "StrictHostKeyChecking=no",
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=8",
    $EcsHost,
    $RemoteCommand
  )
  return & ssh @args 2>&1
}

function Get-WorkerProcesses {
  return Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -match 'site-worker\.ts' -or
    $_.CommandLine -match 'worker:site' -or
    $_.CommandLine -match 'start-site-worker\.ps1'
  }
}

$Env = Read-DotEnv $EnvPath
$CodexCli = Resolve-CodexCli
if ($CodexCli) {
  $env:CODEX_CLI_PATH = $CodexCli
  $env:Path = "$(Split-Path -Parent $CodexCli);$env:Path"
}

Add-Check "repo_root" "INFO" $RepoRoot

if (Test-Path -LiteralPath $NodeExe) {
  $nodeVersion = (& $NodeExe -v 2>$null)
  Add-Check "node" "PASS" "$NodeExe ($nodeVersion)"
} else {
  Add-Check "node" "FAIL" "Missing $NodeExe" "Check portable Node under D:\codex002\tools."
}

if (Test-Path -LiteralPath $NpmCmd) {
  Add-Check "npm" "PASS" $NpmCmd
} else {
  Add-Check "npm" "FAIL" "Missing $NpmCmd" "Check portable Node package."
}

if ($CodexCli) {
  try {
    $codexVersion = (& $CodexCli --version 2>$null)
    Add-Check "codex_cli" "PASS" "$CodexCli ($codexVersion)"
  } catch {
    Add-Check "codex_cli" "WARN" "$CodexCli found but version check failed: $($_.Exception.Message)" "Try opening Codex once, or update CODEX_CLI_PATH."
  }
} else {
  Add-Check "codex_cli" "FAIL" "codex.exe not found" "Set CODEX_CLI_PATH or install/update the OpenAI ChatGPT/Codex extension."
}

$configSummary = @{
  SITE_GENERATION_MODE = $Env["SITE_GENERATION_MODE"]
  SITE_GENERATOR_PROVIDER = $Env["SITE_GENERATOR_PROVIDER"]
  WORKER_SERVER_BASE_URL = $Env["WORKER_SERVER_BASE_URL"]
  PUBLIC_SITE_BASE_URL = $Env["PUBLIC_SITE_BASE_URL"]
  CODEX_CLI_PATH = $CodexCli
  CODEX_SITE_MODEL = $Env["CODEX_SITE_MODEL"]
  CODEX_SITE_TIMEOUT_MS = $Env["CODEX_SITE_TIMEOUT_MS"]
  WORKER_LEASE_SECONDS = $Env["WORKER_LEASE_SECONDS"]
  STYLE_IMAGE_PROVIDER = $Env["STYLE_IMAGE_PROVIDER"]
  STYLE_IMAGE_MODEL = $Env["STYLE_IMAGE_MODEL"]
  COPY_PROVIDER = $Env["COPY_PROVIDER"]
  COPY_MODEL = $Env["COPY_MODEL"]
  OPENAI_BASE_URL = $Env["OPENAI_BASE_URL"]
}
Add-Check "config_non_secret" "INFO" (($configSummary.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join "; ")

if ($Env["SITE_GENERATION_MODE"] -eq "worker_queue") {
  Add-Check "site_generation_mode" "PASS" "SITE_GENERATION_MODE=worker_queue"
} else {
  Add-Check "site_generation_mode" "WARN" "SITE_GENERATION_MODE=$($Env["SITE_GENERATION_MODE"])" "Public generation should use worker_queue."
}

$timeoutValue = 0
if ([int]::TryParse($Env["CODEX_SITE_TIMEOUT_MS"], [ref]$timeoutValue) -and $timeoutValue -ge 1500000) {
  Add-Check "codex_timeout" "PASS" "CODEX_SITE_TIMEOUT_MS=$timeoutValue"
} else {
  Add-Check "codex_timeout" "WARN" "CODEX_SITE_TIMEOUT_MS=$($Env["CODEX_SITE_TIMEOUT_MS"])" "Expected 1500000 ms (25 minutes)."
}

$leaseValue = 0
if ([int]::TryParse($Env["WORKER_LEASE_SECONDS"], [ref]$leaseValue) -and $leaseValue -ge 1500) {
  Add-Check "worker_lease" "PASS" "WORKER_LEASE_SECONDS=$leaseValue"
} else {
  Add-Check "worker_lease" "WARN" "WORKER_LEASE_SECONDS=$($Env["WORKER_LEASE_SECONDS"])" "Expected 1500 seconds."
}

$localListeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq 3000 }
if ($localListeners) {
  $owners = $localListeners | Select-Object -ExpandProperty OwningProcess -Unique
  Add-Check "local_port_3000" "PASS" "127.0.0.1:3000 listening; pid=$($owners -join ',')"
} else {
  Add-Check "local_port_3000" "WARN" "127.0.0.1:3000 is not listening" "Start local Next only if local testing is needed."
}

Test-Url "local_home" "$LocalBase/" 8
Test-Url "local_site_start" "$LocalBase/site/start" 8
Test-Url "public_home" "$PublicBase/" 15
Test-Url "public_site_start" "$PublicBase/site/start" 15
Test-Url "public_login" "$PublicBase/login" 15

$workerProcesses = Get-WorkerProcesses

if ($workerProcesses.Count -gt 0) {
  $workerDetail = ($workerProcesses | Sort-Object CreationDate | ForEach-Object { "$($_.ProcessId):$($_.Name)" }) -join "; "
  Add-Check "local_worker_process" "PASS" $workerDetail
} elseif ($StartMissingWorker) {
  if (-not (Test-Path -LiteralPath $WorkerLauncher)) {
    Add-Check "local_worker_process" "FAIL" "Missing worker launcher: $WorkerLauncher" "Restore scripts/start-site-worker.ps1."
  } else {
    Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $WorkerLauncher) -WorkingDirectory $RepoRoot -WindowStyle Hidden
    Start-Sleep -Seconds 8
    $workerProcesses = Get-WorkerProcesses
  }
  if ($workerProcesses.Count -gt 0) {
    $workerDetail = ($workerProcesses | Sort-Object CreationDate | ForEach-Object { "$($_.ProcessId):$($_.Name)" }) -join "; "
    Add-Check "local_worker_process" "PASS" "Worker was missing and has been started: $workerDetail"
  } elseif (($Checks | Where-Object { $_.name -eq "local_worker_process" -and $_.status -eq "FAIL" }).Count -eq 0) {
    Add-Check "local_worker_process" "FAIL" "Worker is still missing after start attempt." "Check site-worker.current.err.log."
  }
} else {
  Add-Check "local_worker_process" "FAIL" "No npm run worker:site / scripts/site-worker.ts process found." "Run again with -StartMissingWorker, or start worker manually."
}

if (Test-Path -LiteralPath $LogPath) {
  $logItem = Get-Item -LiteralPath $LogPath
  $age = (Get-Date) - $logItem.LastWriteTime
  if ($age.TotalMinutes -lt 5) {
    Add-Check "worker_log_activity" "PASS" "last_write=$($logItem.LastWriteTime)"
  } else {
    Add-Check "worker_log_activity" "WARN" "last_write=$($logItem.LastWriteTime); age_minutes=$([math]::Round($age.TotalMinutes,1))" "If worker is idle this may be ok; if a job is active, inspect generated/codex-runs."
  }
} else {
  Add-Check "worker_log_activity" "WARN" "Missing $LogPath" "Worker should create this file after startup."
}

$codexChildren = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -match '^codex(\.exe)?$' -and ($_.CommandLine -match 'codex exec' -or $_.CommandLine -match 'generated\\codex-runs')
}
if ($codexChildren.Count -gt 0) {
  $detail = ($codexChildren | ForEach-Object { "$($_.ProcessId) started=$($_.CreationDate)" }) -join "; "
  Add-Check "codex_child_process" "INFO" "Active site generation: $detail"
} else {
  Add-Check "codex_child_process" "INFO" "No active Codex site generation process."
}

if ($CheckModelApi) {
  $base = $Env["OPENAI_BASE_URL"]
  $key = $Env["OPENAI_API_KEY"]
  if ($base -and $key) {
    try {
      $modelsUrl = ($base.TrimEnd("/") + "/models")
      $response = Invoke-WebRequest -Uri $modelsUrl -UseBasicParsing -TimeoutSec 15 -Headers @{ Authorization = "Bearer $key" }
      Add-Check "model_api_models" "PASS" "$modelsUrl -> HTTP $($response.StatusCode)"
    } catch {
      Add-Check "model_api_models" "WARN" "$($_.Exception.Message)" "This does not consume generation credits; provider may not support /models."
    }
  } else {
    Add-Check "model_api_config" "WARN" "OPENAI_BASE_URL or OPENAI_API_KEY missing" "Secrets are never printed."
  }
} else {
  Add-Check "model_api_check" "INFO" "Skipped. Add -CheckModelApi to call /models only."
}

if (-not $SkipEcs) {
  if (Test-Path -LiteralPath $EcsKey) {
    Add-Check "ecs_ssh_key" "PASS" $EcsKey
    try {
      $current = (Run-Ssh "readlink -f /opt/xinyingst/current") -join "`n"
      Add-Check "ecs_current_release" "PASS" $current.Trim()
    } catch {
      Add-Check "ecs_current_release" "FAIL" $_.Exception.Message "Check ECS network, port 22, security group, and SSH key."
    }
    try {
      $pm2 = (Run-Ssh "pm2 status --no-color") -join "`n"
      $pm2Short = (($pm2 -split "`n") | Select-Object -First 12) -join "`n"
      if ($pm2 -match "online") {
        Add-Check "ecs_pm2" "PASS" $pm2Short
      } else {
        Add-Check "ecs_pm2" "WARN" $pm2Short "Confirm xinyingst-ai-site is online."
      }
    } catch {
      Add-Check "ecs_pm2" "WARN" $_.Exception.Message "SSH works but PM2 query failed."
    }
    try {
      $py = @'
import sqlite3,json
con=sqlite3.connect('/opt/xinyingst/shared/prod.db')
con.row_factory=sqlite3.Row
status_counts=[dict(r) for r in con.execute('select status,count(*) c from SiteJob group by status order by c desc')]
latest=[dict(r) for r in con.execute("select id,status,workerId,updatedAt,substr(coalesce(adminNote,''),1,90) adminNote from SiteJob order by updatedAt desc limit 5")]
print(json.dumps({'statusCounts':status_counts,'latest':latest},ensure_ascii=False))
'@
      $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($py))
      $remote = "printf %s $b64 | base64 -d | python3"
      $dbOutput = (Run-Ssh $remote) -join "`n"
      Add-Check "prod_job_status" "INFO" $dbOutput.Trim()
    } catch {
      Add-Check "prod_job_status" "WARN" $_.Exception.Message "Manual DB check may be needed."
    }
  } else {
    Add-Check "ecs_ssh_key" "WARN" "Missing $EcsKey" "ECS read checks skipped."
  }
} else {
  Add-Check "ecs_check" "INFO" "Skipped by -SkipEcs."
}

$latestRunsRoot = Join-Path $RepoRoot "generated\codex-runs"
if (Test-Path -LiteralPath $latestRunsRoot) {
  $latestRuns = Get-ChildItem -LiteralPath $latestRunsRoot -Directory -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 3 |
    ForEach-Object {
      $progress = Join-Path $_.FullName "codex-progress.log"
      $index = Join-Path $_.FullName "site\index.html"
      [pscustomobject]@{
        name = $_.Name
        lastWrite = $_.LastWriteTime
        hasIndex = (Test-Path -LiteralPath $index)
        progressTail = if (Test-Path -LiteralPath $progress) { ((Get-Content -LiteralPath $progress -Tail 3 -ErrorAction SilentlyContinue) -join " | ") } else { "" }
      }
    }
  Add-Check "recent_codex_runs" "INFO" (($latestRuns | ConvertTo-Json -Depth 4 -Compress))
} else {
  Add-Check "recent_codex_runs" "INFO" "No generated/codex-runs directory yet."
}

$statusPriority = @{ FAIL = 0; WARN = 1; PASS = 2; INFO = 3 }
$Checks |
  Sort-Object @{ Expression = { $statusPriority[$_.status] } }, name |
  Format-Table status, name, detail -Wrap -AutoSize

$summary = [pscustomobject]@{
  generatedAt = (Get-Date).ToString("s")
  repoRoot = $RepoRoot
  counts = @{
    pass = ($Checks | Where-Object status -eq "PASS").Count
    warn = ($Checks | Where-Object status -eq "WARN").Count
    fail = ($Checks | Where-Object status -eq "FAIL").Count
    info = ($Checks | Where-Object status -eq "INFO").Count
  }
  checks = $Checks
}

$summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $JsonReport -Encoding UTF8
$textLines = @()
$textLines += "AI site daily health report $($summary.generatedAt)"
$textLines += "Repo: $RepoRoot"
$textLines += "Counts: PASS=$($summary.counts.pass) WARN=$($summary.counts.warn) FAIL=$($summary.counts.fail) INFO=$($summary.counts.info)"
$textLines += ""
foreach ($check in $Checks) {
  $textLines += "[$($check.status)] $($check.name)"
  $textLines += "  $($check.detail)"
  if ($check.action) { $textLines += "  Action: $($check.action)" }
}
$textLines | Set-Content -LiteralPath $TextReport -Encoding UTF8

Write-Host ""
Write-Host "Reports saved:"
Write-Host "  $TextReport"
Write-Host "  $JsonReport"

if ($Strict -and (($Checks | Where-Object status -eq "FAIL").Count -gt 0)) {
  exit 1
}
