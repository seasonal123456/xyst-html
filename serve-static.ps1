$ErrorActionPreference = 'Stop'

$Root = if ($PSScriptRoot) { $PSScriptRoot } else { 'D:\codex002\project-card-tool' }
$Port = 4173
$Prefix = "http://localhost:$Port/"

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'
  '.png' = 'image/png'
  '.jpg' = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.webp' = 'image/webp'
  '.csv' = 'text/csv; charset=utf-8'
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($Prefix)
$listener.Start()

while ($listener.IsListening) {
  $context = $listener.GetContext()
  try {
    $requestPath = $context.Request.Url.AbsolutePath
    if ($requestPath -eq '/') {
      $requestPath = '/index.html'
    }

    $relative = [System.Uri]::UnescapeDataString($requestPath).TrimStart('/') -replace '/', [System.IO.Path]::DirectorySeparatorChar
    $fullPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($Root, $relative))
    $rootFull = [System.IO.Path]::GetFullPath($Root)

    if (-not $fullPath.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
      $context.Response.StatusCode = 403
      $bytes = [System.Text.Encoding]::UTF8.GetBytes('Forbidden')
      $context.Response.ContentType = 'text/plain; charset=utf-8'
    } elseif (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
      $context.Response.StatusCode = 404
      $bytes = [System.Text.Encoding]::UTF8.GetBytes('Not found')
      $context.Response.ContentType = 'text/plain; charset=utf-8'
    } else {
      $context.Response.StatusCode = 200
      $bytes = [System.IO.File]::ReadAllBytes($fullPath)
      $ext = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
      $context.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $context.Response.Headers['Cache-Control'] = 'no-store'
    }

    $context.Response.ContentLength64 = $bytes.Length
    $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch {
    $context.Response.StatusCode = 500
    $bytes = [System.Text.Encoding]::UTF8.GetBytes('Server error')
    $context.Response.ContentType = 'text/plain; charset=utf-8'
    $context.Response.ContentLength64 = $bytes.Length
    $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } finally {
    $context.Response.OutputStream.Close()
  }
}
