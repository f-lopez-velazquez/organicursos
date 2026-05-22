param(
  [string]$TargetDir = "."
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$resolved = Resolve-Path $TargetDir
$marker = Join-Path $resolved ".organicursos-portable"
$portableRoot = Join-Path $resolved "portable-data"

New-Item -ItemType Directory -Force -Path (Join-Path $portableRoot "data") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $portableRoot "cache") | Out-Null
Set-Content -Path $marker -Value "portable-mode=1" -Encoding ASCII

Write-Host "Modo portable habilitado en $resolved"
Write-Host "Se creo el marcador: $marker"
