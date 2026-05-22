param(
  [string]$Version = "0.1.9",
  [string]$OutputDir = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
if (-not $OutputDir) {
  $OutputDir = Join-Path $repoRoot "src-tauri\\resources\\sqlite-vec"
}

$assetName = "sqlite-vec-$Version-loadable-windows-x86_64.tar.gz"
$assetUrl = "https://github.com/asg017/sqlite-vec/releases/download/v$Version/$assetName"
$tempDir = Join-Path $env:TEMP "atlas-sqlite-vec-$Version"
$archivePath = Join-Path $tempDir $assetName
$extractDir = Join-Path $tempDir "extract"

New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Invoke-WebRequest -Uri $assetUrl -OutFile $archivePath
& tar -xzf $archivePath -C $extractDir

$vecDll = Join-Path $extractDir "vec0.dll"
if (-not (Test-Path $vecDll)) {
  throw "No se encontro vec0.dll dentro del paquete descargado: $assetUrl"
}

Copy-Item $vecDll (Join-Path $OutputDir "vec0.dll") -Force

Write-Host "sqlite-vec preparado:"
Get-ChildItem $OutputDir | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
