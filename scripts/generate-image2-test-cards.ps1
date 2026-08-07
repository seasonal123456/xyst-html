param(
  [string]$InputJsonl = "D:\codex002\project-card-tool\tmp\imagegen\project-card-test-prompts.jsonl",
  [string]$OutDir = "D:\codex002\project-card-tool\assets\generated-tests",
  [string]$BaseUrl = $env:IMAGE_API_BASE_URL,
  [string]$ApiKey = $env:IMAGE_API_KEY,
  [string]$Model = $env:IMAGE_API_MODEL,
  [switch]$AllowNoApiKey
)

$ErrorActionPreference = "Stop"

if (-not $BaseUrl) {
  $BaseUrl = $env:OPENAI_BASE_URL
}

if (-not $BaseUrl) {
  $BaseUrl = "https://api.openai.com/v1"
}

if (-not $ApiKey) {
  $ApiKey = $env:OPENAI_API_KEY
}

if (-not $Model) {
  $Model = "gpt-image-2"
}

if (-not $ApiKey -and -not $AllowNoApiKey) {
  throw "API key is not set. Set IMAGE_API_KEY / OPENAI_API_KEY, or pass -AllowNoApiKey if your LAN API does not require authorization."
}

if (-not (Test-Path -LiteralPath $InputJsonl)) {
  throw "Prompt file not found: $InputJsonl"
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$headers = @{
  "Content-Type" = "application/json"
}

if ($ApiKey) {
  $headers.Authorization = "Bearer $ApiKey"
}

$normalizedBase = $BaseUrl.TrimEnd("/")
if ($normalizedBase -match "/images/generations$") {
  $endpoint = $normalizedBase
} else {
  $endpoint = "$normalizedBase/images/generations"
}

$jobs = Get-Content -LiteralPath $InputJsonl | Where-Object { $_.Trim() } | ForEach-Object {
  $_ | ConvertFrom-Json
}

Write-Host "Image API endpoint: $endpoint"
Write-Host "Image model: $Model"
Write-Host "Output directory: $OutDir"
Write-Host ""

$saved = @()
foreach ($job in $jobs) {
  $outPath = Join-Path $OutDir $job.out
  Write-Host "Generating $($job.out) ..."

  $body = @{
    model = $Model
    prompt = $job.prompt
    size = $job.size
    quality = $job.quality
    output_format = "png"
  } | ConvertTo-Json -Depth 8

  $response = Invoke-RestMethod `
    -Method Post `
    -Uri $endpoint `
    -Headers $headers `
    -Body $body `
    -TimeoutSec 600

  $b64 = $response.data[0].b64_json
  $url = $response.data[0].url

  if ($b64) {
    [System.IO.File]::WriteAllBytes($outPath, [Convert]::FromBase64String($b64))
  } elseif ($url) {
    Invoke-WebRequest -Uri $url -OutFile $outPath -TimeoutSec 600 | Out-Null
  } else {
    $responseJson = $response | ConvertTo-Json -Depth 20
    throw "Image API response did not include data[0].b64_json or data[0].url for $($job.out). Response: $responseJson"
  }

  if (-not (Test-Path -LiteralPath $outPath)) {
    throw "Generation finished but output file was not found: $outPath"
  }

  $file = Get-Item -LiteralPath $outPath
  if ($file.Length -le 0) {
    throw "Generation produced an empty file: $outPath"
  }

  $saved += $outPath
  Write-Host "Saved $outPath"
}

Write-Host ""
Write-Host "Generated files:"
$saved | ForEach-Object { Write-Host $_ }
