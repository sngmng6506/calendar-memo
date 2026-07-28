param(
  [string]$OutputRoot = "dist"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$package = Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json
$electronDist = Join-Path $root "node_modules\electron\dist"
$helper = Join-Path $root "tools\daymark-desktop-host\bin\Release\net8.0-windows\win-x64\publish\daymark-desktop-host.exe"
$output = Join-Path $root "$OutputRoot\Daymark-win32-x64"
$zip = Join-Path $root "$OutputRoot\Daymark-$($package.version)-win32-x64.zip"

if (-not (Test-Path (Join-Path $electronDist "electron.exe"))) {
  throw "Electron runtime is missing. Run npm ci first."
}

Push-Location $root
try {
  npm run verify
  if ($LASTEXITCODE -ne 0) { throw "Verification failed." }

  npm run build:desktop-host
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $helper)) {
    throw "Desktop helper build failed."
  }

  Remove-Item $output -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item $zip -Force -ErrorAction SilentlyContinue
  New-Item $output -ItemType Directory -Force | Out-Null

  Copy-Item (Join-Path $electronDist "*") $output -Recurse -Force
  Rename-Item (Join-Path $output "electron.exe") "Daymark.exe"

  $appDir = Join-Path $output "resources\app"
  New-Item $appDir -ItemType Directory -Force | Out-Null
  Copy-Item (Join-Path $root "electron") $appDir -Recurse -Force
  Copy-Item (Join-Path $root "web") $appDir -Recurse -Force
  Copy-Item (Join-Path $root "tools") $appDir -Recurse -Force

  $runtimeManifest = [ordered]@{
    name = $package.name
    version = $package.version
    private = $true
    main = "electron/main.js"
  } | ConvertTo-Json
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText((Join-Path $appDir "package.json"), $runtimeManifest, $utf8NoBom)

  $runtimeConfig = [ordered]@{
    syncUrl = [string]$env:DAYMARK_SYNC_URL
  } | ConvertTo-Json
  [System.IO.File]::WriteAllText((Join-Path $appDir "daymark-config.json"), $runtimeConfig, $utf8NoBom)

  Compress-Archive -Path (Join-Path $output "*") -DestinationPath $zip -CompressionLevel Optimal
  Write-Host "Portable build: $output"
  Write-Host "Archive: $zip"
} finally {
  Pop-Location
}
