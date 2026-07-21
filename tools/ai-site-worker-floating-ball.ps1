param(
  [switch]$StartMinimized
)

$ErrorActionPreference = 'SilentlyContinue'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$NodeDir = 'D:\codex002\tools\node-v24.16.0-win-x64'
$NpmPath = Join-Path $NodeDir 'npm.cmd'
$PublicHealthUrl = 'https://xinyingst.com/api/site-compliance'
$WorkerLog = Join-Path $RepoRoot 'site-worker.current.log'
$WorkerErrLog = Join-Path $RepoRoot 'site-worker.current.err.log'
$FreshLogSeconds = 90

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function Get-SiteWorkerProcesses {
  Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -match 'node|cmd|powershell' -and
      $_.CommandLine -match 'site-worker|worker:site|scripts/site-worker\.ts|scripts\\site-worker\.ts' -and
      $_.CommandLine -notmatch 'ai-site-worker-floating-ball'
    } |
    Sort-Object ProcessId
}

function Test-PublicApi {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $PublicHealthUrl -TimeoutSec 8
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300)
  } catch {
    return $false
  }
}

function Test-WorkerLogFresh {
  if (-not (Test-Path -LiteralPath $WorkerLog)) {
    return $false
  }

  $lastWrite = (Get-Item -LiteralPath $WorkerLog).LastWriteTime
  return (((Get-Date) - $lastWrite).TotalSeconds -le $FreshLogSeconds)
}

function Get-HealthState {
  $processes = @(Get-SiteWorkerProcesses)
  $apiOk = Test-PublicApi
  $workerOk = ($processes.Count -gt 0)
  $logFresh = Test-WorkerLogFresh

  $ok = $apiOk -and $workerOk -and $logFresh
  $detail = @()
  if ($apiOk) { $detail += 'Public API: OK' } else { $detail += 'Public API: blocked' }
  if ($workerOk) { $detail += "Worker: OK ($($processes.Count) processes)" } else { $detail += 'Worker: not running' }
  if ($logFresh) { $detail += 'Worker log: fresh' } else { $detail += 'Worker log: stale' }

  [pscustomobject]@{
    Ok = $ok
    Detail = ($detail -join "`r`n")
  }
}

function Start-SiteWorker {
  if (@(Get-SiteWorkerProcesses).Count -gt 0) {
    return
  }

  if (-not (Test-Path -LiteralPath $NpmPath)) {
    [System.Windows.Forms.MessageBox]::Show("Node/npm not found: $NpmPath", 'AI Site Worker Ball') | Out-Null
    return
  }

  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  if (Test-Path -LiteralPath $WorkerLog) {
    Move-Item -LiteralPath $WorkerLog -Destination (Join-Path $RepoRoot "site-worker.current.$stamp.log") -Force
  }
  if (Test-Path -LiteralPath $WorkerErrLog) {
    Move-Item -LiteralPath $WorkerErrLog -Destination (Join-Path $RepoRoot "site-worker.current.$stamp.err.log") -Force
  }

  $command = "& { `$env:Path = '$NodeDir;' + `$env:Path; & '$NpmPath' run worker:site }"
  Start-Process -FilePath 'powershell.exe' `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $command) `
    -WorkingDirectory $RepoRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $WorkerLog `
    -RedirectStandardError $WorkerErrLog
}

function Stop-SiteWorker {
  $processes = @(Get-SiteWorkerProcesses | Sort-Object ProcessId -Descending)
  foreach ($process in $processes) {
    try {
      Stop-Process -Id $process.ProcessId -Force
    } catch {}
  }
}

function Open-LogFile {
  if (Test-Path -LiteralPath $WorkerLog) {
    Start-Process -FilePath 'notepad.exe' -ArgumentList @($WorkerLog)
  }
}

function Open-ErrorLogFile {
  if (Test-Path -LiteralPath $WorkerErrLog) {
    Start-Process -FilePath 'notepad.exe' -ArgumentList @($WorkerErrLog)
  }
}

$darkGreen = [System.Drawing.Color]::FromArgb(14, 95, 61)
$gray = [System.Drawing.Color]::FromArgb(128, 128, 128)
$borderGreen = [System.Drawing.Color]::FromArgb(169, 232, 190)
$borderGray = [System.Drawing.Color]::FromArgb(210, 210, 210)

$form = New-Object System.Windows.Forms.Form
$form.Text = 'AI Site Worker'
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$form.Width = 66
$form.Height = 66
$form.BackColor = $gray
$form.Cursor = [System.Windows.Forms.Cursors]::Hand

$screen = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$form.Location = New-Object System.Drawing.Point(($screen.Right - 90), ($screen.Bottom - 150))

$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddEllipse(0, 0, $form.Width, $form.Height)
$form.Region = New-Object System.Drawing.Region($path)

$tooltip = New-Object System.Windows.Forms.ToolTip
$tooltip.InitialDelay = 200
$tooltip.ReshowDelay = 100
$tooltip.AutoPopDelay = 12000

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$refreshItem = $menu.Items.Add('Refresh')
$startItem = $menu.Items.Add('Start worker')
$restartItem = $menu.Items.Add('Restart worker')
$menu.Items.Add('-') | Out-Null
$logItem = $menu.Items.Add('Open worker log')
$errLogItem = $menu.Items.Add('Open error log')
$menu.Items.Add('-') | Out-Null
$exitItem = $menu.Items.Add('Exit')
$form.ContextMenuStrip = $menu

$script:lastMouse = $null
$script:dragging = $false
$script:lastState = $null
$script:isBusy = $false

function Set-BallState {
  param([bool]$Ok, [string]$Detail, [string]$Prefix = '')

  if ($Ok) {
    $form.BackColor = $darkGreen
    $tooltip.SetToolTip($form, "$Prefix AI site worker/API OK`r`n$Detail")
  } else {
    $form.BackColor = $gray
    $tooltip.SetToolTip($form, "$Prefix AI site worker/API not ready; click to start`r`n$Detail")
  }
  $form.Invalidate()
}

function Refresh-State {
  $state = Get-HealthState
  $script:lastState = $state
  Set-BallState -Ok $state.Ok -Detail $state.Detail
}

$form.Add_Paint({
  param($sender, $event)
  $event.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $penColor = if ($script:lastState -and $script:lastState.Ok) { $borderGreen } else { $borderGray }
  $pen = New-Object System.Drawing.Pen($penColor, 3)
  $event.Graphics.DrawEllipse($pen, 2, 2, $form.Width - 5, $form.Height - 5)
  $pen.Dispose()
})

$form.Add_MouseDown({
  param($sender, $event)
  if ($event.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
    $script:lastMouse = $event.Location
    $script:dragging = $false
  }
})

$form.Add_MouseMove({
  param($sender, $event)
  if ($event.Button -eq [System.Windows.Forms.MouseButtons]::Left -and $script:lastMouse) {
    $dx = [Math]::Abs($event.X - $script:lastMouse.X)
    $dy = [Math]::Abs($event.Y - $script:lastMouse.Y)
    if ($dx -gt 3 -or $dy -gt 3) {
      $script:dragging = $true
      $form.Left += ($event.X - $script:lastMouse.X)
      $form.Top += ($event.Y - $script:lastMouse.Y)
    }
  }
})

$form.Add_Click({
  if ($script:dragging -or $script:isBusy) {
    return
  }

  Refresh-State
  if ($script:lastState -and $script:lastState.Ok) {
    return
  }

  $script:isBusy = $true
  Set-BallState -Ok $false -Detail 'Starting worker...' -Prefix ''
  Start-SiteWorker
  Start-Sleep -Seconds 6
  Refresh-State
  $script:isBusy = $false
})

$refreshItem.Add_Click({ Refresh-State })
$startItem.Add_Click({
  if (-not $script:isBusy) {
    $script:isBusy = $true
    Start-SiteWorker
    Start-Sleep -Seconds 6
    Refresh-State
    $script:isBusy = $false
  }
})
$restartItem.Add_Click({
  if (-not $script:isBusy) {
    $script:isBusy = $true
    Stop-SiteWorker
    Start-Sleep -Seconds 2
    Start-SiteWorker
    Start-Sleep -Seconds 6
    Refresh-State
    $script:isBusy = $false
  }
})
$logItem.Add_Click({ Open-LogFile })
$errLogItem.Add_Click({ Open-ErrorLogFile })
$exitItem.Add_Click({ $form.Close() })

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 15000
$timer.Add_Tick({ Refresh-State })
$timer.Start()

Refresh-State
[System.Windows.Forms.Application]::EnableVisualStyles()
[System.Windows.Forms.Application]::Run($form)
