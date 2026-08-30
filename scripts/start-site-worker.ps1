param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

$WorkspaceRoot = (Resolve-Path (Join-Path $RepoRoot "..")).Path
$NodeDir = Join-Path $WorkspaceRoot "tools\node-v24.16.0-win-x64"
$NodeExe = Join-Path $NodeDir "node.exe"
$TsxCli = Join-Path $RepoRoot "node_modules\tsx\dist\cli.mjs"
$WorkerScript = Join-Path $RepoRoot "scripts\site-worker.ts"
$LogPath = Join-Path $RepoRoot "site-worker.current.log"
$ErrLogPath = Join-Path $RepoRoot "site-worker.current.err.log"
$PidPath = Join-Path $RepoRoot "site-worker.current.pid"

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

  throw "codex.exe not found. Set CODEX_CLI_PATH to the full codex.exe path before starting worker."
}

function Resolve-SiteGeneratorProvider {
  if ($env:SITE_GENERATOR_PROVIDER) {
    return $env:SITE_GENERATOR_PROVIDER.Trim().ToLowerInvariant()
  }

  $EnvPath = Join-Path $RepoRoot ".env"
  if (Test-Path -LiteralPath $EnvPath) {
    $Configured = Get-Content -LiteralPath $EnvPath |
      Where-Object { $_ -match '^SITE_GENERATOR_PROVIDER=' } |
      Select-Object -Last 1
    if ($Configured) {
      return (($Configured -split '=', 2)[1]).Trim().Trim('"').Trim("'").ToLowerInvariant()
    }
  }

  return "codex"
}

if (-not (Test-Path -LiteralPath $NodeExe)) {
  throw "node.exe not found: $NodeExe"
}
if (-not (Test-Path -LiteralPath $TsxCli)) {
  throw "tsx cli not found: $TsxCli"
}
if (-not (Test-Path -LiteralPath $WorkerScript)) {
  throw "worker script not found: $WorkerScript"
}

Set-Location -LiteralPath $RepoRoot
$Provider = Resolve-SiteGeneratorProvider
$env:Path = "$NodeDir;$env:Path"
if ($Provider -eq "codex") {
  $CodexCli = Resolve-CodexCli
  $CodexDir = Split-Path -Parent $CodexCli
  $env:CODEX_CLI_PATH = $CodexCli
  $env:Path = "$NodeDir;$CodexDir;$env:Path"
}
$env:NODE_NO_WARNINGS = "1"

Set-Content -LiteralPath $PidPath -Value $PID -Encoding UTF8
Add-Content -LiteralPath $LogPath -Encoding UTF8 -Value ""
Add-Content -LiteralPath $LogPath -Encoding UTF8 -Value "[$((Get-Date).ToUniversalTime().ToString("s"))Z] worker launcher starting pid=$PID"
Add-Content -LiteralPath $LogPath -Encoding UTF8 -Value "[$((Get-Date).ToUniversalTime().ToString("s"))Z] SITE_GENERATOR_PROVIDER=$Provider"
if ($Provider -eq "codex") {
  Add-Content -LiteralPath $LogPath -Encoding UTF8 -Value "[$((Get-Date).ToUniversalTime().ToString("s"))Z] CODEX_CLI_PATH=$CodexCli"
}

try {
  & $NodeExe $TsxCli $WorkerScript 1>> $LogPath 2>> $ErrLogPath
  $exitCode = $LASTEXITCODE
  Add-Content -LiteralPath $ErrLogPath -Encoding UTF8 -Value "[$((Get-Date).ToUniversalTime().ToString("s"))Z] worker exited code=$exitCode"
  exit $exitCode
} finally {
  Add-Content -LiteralPath $LogPath -Encoding UTF8 -Value "[$((Get-Date).ToUniversalTime().ToString("s"))Z] worker launcher stopped pid=$PID"
}
