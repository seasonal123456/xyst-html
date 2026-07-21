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
$env:Path = "$NodeDir;$env:Path"
$env:NODE_NO_WARNINGS = "1"

Set-Content -LiteralPath $PidPath -Value $PID -Encoding UTF8
Add-Content -LiteralPath $LogPath -Encoding UTF8 -Value ""
Add-Content -LiteralPath $LogPath -Encoding UTF8 -Value "[$((Get-Date).ToUniversalTime().ToString("s"))Z] worker launcher starting pid=$PID"

try {
  & $NodeExe $TsxCli $WorkerScript 1>> $LogPath 2>> $ErrLogPath
  $exitCode = $LASTEXITCODE
  Add-Content -LiteralPath $ErrLogPath -Encoding UTF8 -Value "[$((Get-Date).ToUniversalTime().ToString("s"))Z] worker exited code=$exitCode"
  exit $exitCode
} finally {
  Add-Content -LiteralPath $LogPath -Encoding UTF8 -Value "[$((Get-Date).ToUniversalTime().ToString("s"))Z] worker launcher stopped pid=$PID"
}
