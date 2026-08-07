$ErrorActionPreference = 'Stop'

$Root = if ($PSScriptRoot) { $PSScriptRoot } else { 'D:\codex002\project-card-tool' }
$Node = 'D:\codex002\tools\node-v24.16.0-win-x64\node.exe'

if (-not (Test-Path -LiteralPath $Node)) {
  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if (-not $nodeCommand) {
    throw 'Node.js was not found. Expected D:\codex002\tools\node-v24.16.0-win-x64\node.exe or node on PATH.'
  }
  $Node = $nodeCommand.Source
}

if (-not $env:IMAGE_API_BASE_URL -and -not $env:OPENAI_BASE_URL) {
  $baseUrl = Read-Host '请输入 Image API Base URL（例如 https://example.com/v1，不会写入文件）'
  if (-not $baseUrl) {
    throw 'Missing IMAGE_API_BASE_URL. Start canceled.'
  }
  $env:IMAGE_API_BASE_URL = $baseUrl
}

if (-not $env:IMAGE_API_KEY -and -not $env:OPENAI_API_KEY) {
  $secureKey = Read-Host '请输入局域网/中转站 Image API Key' -AsSecureString
  $plainKey = [System.Net.NetworkCredential]::new('', $secureKey).Password
  if (-not $plainKey) {
    throw 'Missing IMAGE_API_KEY. Start canceled.'
  }
  $env:IMAGE_API_KEY = $plainKey
}

if (-not $env:IMAGE_API_MODEL) {
  $env:IMAGE_API_MODEL = 'gpt-image-2'
}

Push-Location $Root
try {
  & $Node "$Root\server.js"
} finally {
  Pop-Location
}
