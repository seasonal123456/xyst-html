param(
  [int]$ToolPort = 4173,
  [int]$SitePort = 3001,
  [switch]$StopExisting
)

$ErrorActionPreference = 'Stop'

$ToolRoot = Split-Path -Parent $PSScriptRoot
$SiteRoot = 'D:\codex002\ai-image-mvp-stage1'
$Node = 'D:\codex002\tools\node-v24.16.0-win-x64\node.exe'
$ImageApiBaseUrl = $env:IMAGE_API_BASE_URL

if (-not $ImageApiBaseUrl) {
  $ImageApiBaseUrl = Read-Host '请输入 Image API Base URL（例如 https://example.com/v1，不会写入文件）'
  if (-not $ImageApiBaseUrl) {
    throw 'Missing IMAGE_API_BASE_URL. Start canceled.'
  }
}

if (-not (Test-Path -LiteralPath $Node)) {
  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if (-not $nodeCommand) {
    throw 'Node.js was not found. Expected workspace Node or node on PATH.'
  }
  $Node = $nodeCommand.Source
}

if ($StopExisting) {
  foreach ($port in @($ToolPort, $SitePort)) {
    Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique |
      ForEach-Object {
        if ($_ -and $_ -ne $PID) {
          Stop-Process -Id $_ -ErrorAction SilentlyContinue
        }
      }
  }
  Start-Sleep -Milliseconds 800
}

$NextBin = Join-Path $SiteRoot 'node_modules\next\dist\bin\next'
if (-not (Test-Path -LiteralPath $NextBin)) {
  throw "Next.js CLI not found: $NextBin"
}

$apiKey = $env:IMAGE_API_KEY
if (-not $apiKey) {
  $secureKey = Read-Host '请输入 Image API Key（不会写入文件）' -AsSecureString
  $apiKey = [System.Net.NetworkCredential]::new('', $secureKey).Password
  if (-not $apiKey) {
    throw 'Missing IMAGE_API_KEY. Start canceled.'
  }
}

$ssoSecret = 'local-sso-' + [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
$toolLogs = Join-Path $ToolRoot 'logs'
$siteLogs = Join-Path $SiteRoot 'logs'
New-Item -ItemType Directory -Force -Path $toolLogs, $siteLogs | Out-Null

$toolEnv = @{
  PORT = [string]$ToolPort
  PROJECT_CARD_SSO_SECRET = $ssoSecret
  IMAGE_API_BASE_URL = $ImageApiBaseUrl
  IMAGE_API_KEY = $apiKey
  IMAGE_API_MODEL = 'gpt-image-2'
}

$siteEnv = @{
  PROJECT_CARD_TOOL_URL = "http://127.0.0.1:$ToolPort/"
  PROJECT_CARD_SSO_SECRET = $ssoSecret
}

function Start-NodeProcessWithEnv {
  param(
    [string]$WorkingDirectory,
    [string[]]$Arguments,
    [hashtable]$ExtraEnv,
    [string]$OutLog,
    [string]$ErrLog
  )

  $encodedEnv = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($ExtraEnv | ConvertTo-Json -Compress)))
  $encodedArgs = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($Arguments | ConvertTo-Json -Compress)))
  $command = @"
`$envMap = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('$encodedEnv')) | ConvertFrom-Json
foreach (`$item in `$envMap.PSObject.Properties) { Set-Item -Path "Env:`$(`$item.Name)" -Value `$item.Value }
`$argsList = @([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('$encodedArgs')) | ConvertFrom-Json)
Set-Location -LiteralPath '$WorkingDirectory'
& '$Node' @argsList
"@

  Start-Process -FilePath powershell.exe `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $command) `
    -WindowStyle Hidden `
    -RedirectStandardOutput $OutLog `
    -RedirectStandardError $ErrLog `
    -PassThru
}

$toolProcess = Start-NodeProcessWithEnv `
  -WorkingDirectory $ToolRoot `
  -Arguments @('server.js') `
  -ExtraEnv $toolEnv `
  -OutLog (Join-Path $toolLogs 'local-sso-stack-tool.out.log') `
  -ErrLog (Join-Path $toolLogs 'local-sso-stack-tool.err.log')

$siteProcess = Start-NodeProcessWithEnv `
  -WorkingDirectory $SiteRoot `
  -Arguments @($NextBin, 'start', '-p', [string]$SitePort) `
  -ExtraEnv $siteEnv `
  -OutLog (Join-Path $siteLogs 'local-sso-stack-site.out.log') `
  -ErrLog (Join-Path $siteLogs 'local-sso-stack-site.err.log')

Write-Host "Project card tool: http://127.0.0.1:$ToolPort/"
Write-Host "AI site account:    http://127.0.0.1:$SitePort/account"
Write-Host "AI site login:      http://127.0.0.1:$SitePort/login"
Write-Host "Tool PID: $($toolProcess.Id)"
Write-Host "Site PID: $($siteProcess.Id)"
