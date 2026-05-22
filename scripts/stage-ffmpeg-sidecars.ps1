param(
  [string]$SourceRoot = "",
  [string]$OutputDir = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
if (-not $OutputDir) {
  $OutputDir = Join-Path $repoRoot "src-tauri\\bin"
}

function Resolve-SourceRoot {
  param([string]$Hint)

  if ($Hint) {
    if (-not (Test-Path $Hint)) {
      throw "La ruta de sidecars no existe: $Hint"
    }
    return $Hint
  }

  $ffmpegCommand = Get-Command ffmpeg -ErrorAction SilentlyContinue
  $ffprobeCommand = Get-Command ffprobe -ErrorAction SilentlyContinue
  if ($ffmpegCommand -and $ffprobeCommand) {
    return Split-Path -Path $ffmpegCommand.Source -Parent
  }

  $packageRoot = Join-Path $env:LOCALAPPDATA "Microsoft\\WinGet\\Packages"
  if (-not (Test-Path $packageRoot)) {
    throw "No se encontro el directorio de paquetes de winget: $packageRoot"
  }

  $ffmpegBinary = Get-ChildItem $packageRoot -Recurse -Filter ffmpeg.exe -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  $ffprobeBinary = Get-ChildItem $packageRoot -Recurse -Filter ffprobe.exe -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if (-not $ffmpegBinary -or -not $ffprobeBinary) {
    throw "No se localizaron ffmpeg.exe y ffprobe.exe. Instala una build LGPL con winget, por ejemplo: winget install --id BtbN.FFmpeg.LGPL.8.0"
  }

  return Split-Path -Path $ffmpegBinary.FullName -Parent
}

$resolvedSourceRoot = Resolve-SourceRoot -Hint $SourceRoot
$ffmpegSource = Join-Path $resolvedSourceRoot "ffmpeg.exe"
$ffprobeSource = Join-Path $resolvedSourceRoot "ffprobe.exe"

if (-not (Test-Path $ffmpegSource)) {
  throw "No se encontro ffmpeg.exe en $resolvedSourceRoot"
}

if (-not (Test-Path $ffprobeSource)) {
  throw "No se encontro ffprobe.exe en $resolvedSourceRoot"
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$ffmpegTarget = Join-Path $OutputDir "organicursos-ffmpeg-x86_64-pc-windows-msvc.exe"
$ffprobeTarget = Join-Path $OutputDir "organicursos-ffprobe-x86_64-pc-windows-msvc.exe"

Copy-Item $ffmpegSource $ffmpegTarget -Force
Copy-Item $ffprobeSource $ffprobeTarget -Force

Write-Host "Sidecars preparados:"
Get-ChildItem $OutputDir | Where-Object {
  $_.Name -eq "organicursos-ffmpeg-x86_64-pc-windows-msvc.exe" -or $_.Name -eq "organicursos-ffprobe-x86_64-pc-windows-msvc.exe"
} | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
