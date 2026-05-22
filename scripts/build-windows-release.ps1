param(
  [switch]$SkipTests,
  [switch]$SkipSidecars,
  [switch]$SkipSqliteVec,
  [string]$CargoTargetDir = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
$stageScript = Join-Path $PSScriptRoot "stage-ffmpeg-sidecars.ps1"
$sqliteVecScript = Join-Path $PSScriptRoot "fetch-sqlite-vec-windows.ps1"

function Find-VcVars64 {
  $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\\Installer\\vswhere.exe"
  if (Test-Path $vswhere) {
    $installationPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if ($LASTEXITCODE -eq 0 -and $installationPath) {
      $candidate = Join-Path $installationPath "VC\\Auxiliary\\Build\\vcvars64.bat"
      if (Test-Path $candidate) {
        return $candidate
      }
    }
  }

  $fallback = "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat"
  if (Test-Path $fallback) {
    return $fallback
  }

  throw "No se pudo localizar vcvars64.bat. Instala Visual Studio Build Tools con MSVC y Windows SDK."
}

if (-not $CargoTargetDir) {
  $CargoTargetDir = Join-Path $env:LOCALAPPDATA "OrganiCursos\\cargo-target"
}

New-Item -ItemType Directory -Force -Path $CargoTargetDir | Out-Null

if (-not $SkipSidecars) {
  & $stageScript
}

if (-not $SkipSqliteVec) {
  & $sqliteVecScript
}

$vcvars = Find-VcVars64
$commands = @(
  "@echo off",
  "call `"$vcvars`" >nul",
  "set PATH=%USERPROFILE%\\.cargo\\bin;%PATH%",
  "set CARGO_TARGET_DIR=$CargoTargetDir",
  "cd /d `"$repoRoot`"",
  "call npm run build"
)

if (-not $SkipTests) {
  $commands += "call npm test"
}

$commands += "call npm run tauri -- build --bundles msi"
$commands += "if errorlevel 1 exit /b %errorlevel%"
$commands += "timeout /t 2 /nobreak >nul"
$commands += "call npm run tauri -- build --bundles nsis"

$scriptPath = Join-Path $env:TEMP "atlas-build-release.cmd"
Set-Content -Path $scriptPath -Value ($commands -join "`r`n") -Encoding ASCII

Write-Host "Compilando OrganiCursos para Windows..."
Write-Host "CARGO_TARGET_DIR=$CargoTargetDir"
& $scriptPath

if ($LASTEXITCODE -ne 0) {
  throw "La compilacion de release fallo con codigo $LASTEXITCODE"
}

Write-Host ""
Write-Host "Artefactos generados en:"
Write-Host "  $CargoTargetDir\\release\\bundle\\msi"
Write-Host "  $CargoTargetDir\\release\\bundle\\nsis"
