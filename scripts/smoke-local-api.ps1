param(
  [string]$BaseUrl = "http://127.0.0.1:4173",
  [string]$SiteUrl = "http://127.0.0.1:3001",
  [string]$TraceCode = "PC-INDEX-NOCODE-2608051754"
)

$ErrorActionPreference = "Stop"

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )
  if (-not $Condition) {
    throw $Message
  }
}

$base = $BaseUrl.TrimEnd("/")
$site = $SiteUrl.TrimEnd("/")

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$email = "project-card-smoke-$stamp@example.test"
$password = "SmokePass$stamp!"
$registerBody = @{
  email = $email
  password = $password
  name = "推荐卡Smoke会员"
} | ConvertTo-Json

$register = Invoke-RestMethod -Uri "$site/api/auth/register" -Method Post -ContentType "application/json" -Body $registerBody -WebSession $session -TimeoutSec 8
Assert-True ($register.success -eq $true) "AI site smoke member registration failed."

$ticket = Invoke-RestMethod -Uri "$site/api/project-card/sso-ticket" -Method Post -ContentType "application/json" -Body "{}" -WebSession $session -TimeoutSec 8
Assert-True ($ticket.success -eq $true) "SSO ticket issuing failed."
$toolUrl = [Uri]$ticket.url
$ssoTicket = [System.Web.HttpUtility]::ParseQueryString($toolUrl.Query).Get("sso_ticket")
Assert-True ([bool]$ssoTicket) "SSO ticket is missing from tool URL."

$exchangeBody = @{ ticket = $ssoTicket } | ConvertTo-Json
$exchange = Invoke-RestMethod -Uri "$base/api/sso/exchange" -Method Post -ContentType "application/json" -Body $exchangeBody -TimeoutSec 8
Assert-True ($exchange.ok -eq $true) "Tool SSO exchange failed."
Assert-True ([bool]$exchange.session.sessionToken) "Tool session token is missing."
$apiHeaders = @{
  "Content-Type" = "application/json"
  "X-Project-Card-Session" = $exchange.session.sessionToken
}

$health = Invoke-RestMethod -Uri "$base/api/health" -TimeoutSec 5
Assert-True ($health.ok -eq $true) "Health check failed."
Assert-True ($health.imageApiConfigured -eq $true) "Image API is not configured."
Assert-True ($health.ssoConfigured -eq $true) "SSO is not configured."
Assert-True ($health.adminEnabled -eq $false) "Admin panel should be disabled by default."

$ready = Invoke-RestMethod -Uri "$base/api/ready" -TimeoutSec 5
Assert-True ($ready.ok -eq $true) "Ready check failed."
Assert-True ($ready.checks.storageWritable -eq $true) "Generated storage is not writable."
Assert-True ($ready.checks.imageApiConfigured -eq $true) "Ready check reports missing Image API."
Assert-True ($ready.checks.ssoConfigured -eq $true) "Ready check reports missing SSO."

$config = Invoke-RestMethod -Uri "$base/api/config" -TimeoutSec 5
Assert-True ($config.ok -eq $true) "Public config endpoint failed."
Assert-True ($config.adminEnabled -eq $false) "Public config should keep admin disabled by default."
Assert-True ($config.generationEnabled -eq $true) "Public config reports generation disabled."

$homeHtml = (Invoke-WebRequest -Uri "$base/" -TimeoutSec 5).Content
Assert-True ($homeHtml -match "contactNameInput") "Contact name input is missing."
Assert-True ($homeHtml -match "contactPhoneInput") "Contact phone input is missing."
Assert-True ($homeHtml -match "stylePresetGrid") "Style preset grid is missing."
Assert-True ($homeHtml -match "stylePresetName") "Selected style preset label is missing."
Assert-True ($homeHtml -notmatch "图片右下角生成码") "Old trace-code-on-image wording is still visible."
Assert-True ($homeHtml -notmatch "暂不开放额外选项") "Old locked-style wording is still visible."

$appJs = (Invoke-WebRequest -Uri "$base/app.js" -TimeoutSec 5).Content
Assert-True ($appJs -match "selectedVisualPresetCode") "Visual preset state is missing."
Assert-True ($appJs -match "colorScheme") "Color scheme payload field is missing."
Assert-True ($appJs -match "focusCondition") "Focus condition payload field is missing."
Assert-True ($appJs -match "createGenerationStatus") "Progressive generation status is missing."
$demoPasswordPattern = "admin" + "123"
Assert-True ($appJs -notmatch [regex]::Escape($demoPasswordPattern)) "Demo admin password leaked in app.js."
$clientPasswordConstantPattern = "ADMIN" + "_PASSWORD"
Assert-True ($appJs -notmatch [regex]::Escape($clientPasswordConstantPattern)) "Client-side admin password constant should not exist."

$trace = Invoke-RestMethod -Uri "$base/api/trace-card?code=$([Uri]::EscapeDataString($TraceCode))" -TimeoutSec 8
Assert-True ($trace.ok -eq $true) "Trace lookup failed."
Assert-True ($trace.card.traceCode -eq $TraceCode) "Trace lookup returned the wrong card."
Assert-True (-not ($trace.card.payload.PSObject.Properties.Name -contains "contactName")) "Trace summary leaked contactName."
Assert-True (-not ($trace.card.payload.PSObject.Properties.Name -contains "contactPhone")) "Trace summary leaked contactPhone."

$body = @{
  context = @{
    user = @{
      id = "website:$($exchange.session.userId)"
      externalCustomerId = $exchange.session.userId
    }
    company = @{
      id = $exchange.session.companyId
    }
  }
  limit = 5
} | ConvertTo-Json -Depth 8

$cards = Invoke-RestMethod -Uri "$base/api/my-cards" -Method Post -Headers $apiHeaders -Body $body -TimeoutSec 8
Assert-True ($cards.ok -eq $true) "My cards lookup failed."

try {
  Invoke-WebRequest -Uri "$base/storage/generated/trace-index.json" -TimeoutSec 5 | Out-Null
  throw "Trace index should not be publicly served."
} catch {
  if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 403) {
    throw
  }
}

$imageUrl = $trace.card.imageUrl
$metaUrl = $imageUrl -replace "\.png$", ".json"
try {
  Invoke-WebRequest -Uri "$base$metaUrl" -TimeoutSec 5 | Out-Null
  throw "Generated metadata should not be publicly served."
} catch {
  if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 403) {
    throw
  }
}

[pscustomobject]@{
  ok = $true
  baseUrl = $base
  siteUrl = $site
  traceCode = $TraceCode
  imageUrl = $imageUrl
  sso = "ok"
  checkedAt = (Get-Date).ToString("s")
} | ConvertTo-Json -Depth 4
