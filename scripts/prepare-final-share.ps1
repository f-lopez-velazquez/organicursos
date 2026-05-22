param(
  [string]$InstallerBundleRoot = "$env:LOCALAPPDATA\OrganiCursos\cargo-target\release\bundle",
  [string]$PortableReleaseRoot = "$env:LOCALAPPDATA\OrganiCursos\cargo-target\release",
  [string]$OutputRoot = "$(Split-Path -Path $PSScriptRoot -Parent)\ENTREGA\OrganiCursos-0.1.0-Compartir"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$installerDir = Join-Path $OutputRoot "INSTALABLE"
$portableDir = Join-Path $OutputRoot "PORTABLE"
$portableResourcesDir = Join-Path $portableDir "resources\sqlite-vec"
$portableDataDir = Join-Path $portableDir "portable-data"

$nsisSource = Join-Path $InstallerBundleRoot "nsis\OrganiCursos_0.1.0_x64-setup.exe"
$legacyNsisSource = Join-Path $InstallerBundleRoot "nsis\Atlas Courses_0.1.0_x64-setup.exe"
$msiSource = Join-Path $InstallerBundleRoot "msi\OrganiCursos_0.1.0_x64_en-US.msi"
$legacyMsiSource = Join-Path $InstallerBundleRoot "msi\Atlas Courses_0.1.0_x64_en-US.msi"
$exeSource = Join-Path $PortableReleaseRoot "atlas-courses.exe"
$ffmpegSource = Join-Path $PortableReleaseRoot "ffmpeg.exe"
$ffprobeSource = Join-Path $PortableReleaseRoot "ffprobe.exe"
$vecSource = Join-Path $PortableReleaseRoot "resources\sqlite-vec\vec0.dll"

if (-not (Test-Path $InstallerBundleRoot) -or -not (Test-Path $PortableReleaseRoot)) {
  $legacyInstallerBundleRoot = "$env:LOCALAPPDATA\OrganiCursos\cargo-target-clean\release\bundle"
  $legacyPortableReleaseRoot = "$env:LOCALAPPDATA\OrganiCursos\cargo-target-clean\release"

  if (Test-Path $legacyInstallerBundleRoot) {
    $InstallerBundleRoot = $legacyInstallerBundleRoot
  }

  if (Test-Path $legacyPortableReleaseRoot) {
    $PortableReleaseRoot = $legacyPortableReleaseRoot
  }

  $nsisSource = Join-Path $InstallerBundleRoot "nsis\OrganiCursos_0.1.0_x64-setup.exe"
  $legacyNsisSource = Join-Path $InstallerBundleRoot "nsis\Atlas Courses_0.1.0_x64-setup.exe"
  $msiSource = Join-Path $InstallerBundleRoot "msi\OrganiCursos_0.1.0_x64_en-US.msi"
  $legacyMsiSource = Join-Path $InstallerBundleRoot "msi\Atlas Courses_0.1.0_x64_en-US.msi"
  $exeSource = Join-Path $PortableReleaseRoot "atlas-courses.exe"
  $ffmpegSource = Join-Path $PortableReleaseRoot "ffmpeg.exe"
  $ffprobeSource = Join-Path $PortableReleaseRoot "ffprobe.exe"
  $vecSource = Join-Path $PortableReleaseRoot "resources\sqlite-vec\vec0.dll"
}

if (-not (Test-Path $msiSource) -and (Test-Path $legacyMsiSource)) {
  $msiSource = $legacyMsiSource
}

if (-not (Test-Path $nsisSource) -and (Test-Path $legacyNsisSource)) {
  $nsisSource = $legacyNsisSource
}

foreach ($required in @($msiSource, $exeSource, $ffmpegSource, $ffprobeSource, $vecSource)) {
  if (-not (Test-Path $required)) {
    throw "Falta un archivo requerido para la entrega: $required"
  }
}

if (Test-Path $OutputRoot) {
  Remove-Item -LiteralPath $OutputRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $installerDir | Out-Null
New-Item -ItemType Directory -Force -Path $portableDir | Out-Null
New-Item -ItemType Directory -Force -Path $portableResourcesDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $portableDataDir "data") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $portableDataDir "cache") | Out-Null

Copy-Item $msiSource (Join-Path $installerDir "OrganiCursos-0.1.0-x64.msi") -Force
if (Test-Path $nsisSource) {
  Copy-Item $nsisSource (Join-Path $installerDir "OrganiCursos-0.1.0-x64-setup.exe") -Force
}

Copy-Item $exeSource (Join-Path $portableDir "OrganiCursos.exe") -Force
Copy-Item $ffmpegSource (Join-Path $portableDir "ffmpeg.exe") -Force
Copy-Item $ffprobeSource (Join-Path $portableDir "ffprobe.exe") -Force
Copy-Item $vecSource (Join-Path $portableResourcesDir "vec0.dll") -Force
Set-Content -Path (Join-Path $portableDir ".organicursos-portable") -Value "portable-mode=1" -Encoding ASCII

$rootReadme = @"
OrganiCursos 0.1.0 - carpeta final para compartir en Windows x64

Esta entrega incluye dos maneras de usar la app:

1. INSTALABLE
- Recomendado para la mayoria de usuarios.
- Usa el setup.exe si esta incluido.
- Si no, usa OrganiCursos-0.1.0-x64.msi

2. PORTABLE
- No instala nada en el sistema.
- Abre directamente OrganiCursos.exe
- Guarda sus datos dentro de la misma carpeta portable-data

Recomendacion
- Para usuario final normal: usa INSTALABLE
- Para pruebas, memorias USB o uso controlado: usa PORTABLE
- Los respaldos del programa usan la extension .organi

Soporte: https://organicursos.app/support
Sitio: https://organicursos.app
Mantenimiento: https://organicursos.app/support
"@

$installerReadme = @"
INSTALABLE - OrganiCursos 0.1.0

Archivos:
- OrganiCursos-0.1.0-x64.msi
- OrganiCursos-0.1.0-x64-setup.exe si esta incluido

Uso:
1. Ejecuta el instalador.
2. Abre OrganiCursos.
3. Agrega la carpeta donde guardas tus cursos o videos.
4. Deja que organice el contenido.
5. Si exportas un respaldo, se guardara como archivo .organi
"@

$portableReadme = @"
PORTABLE - OrganiCursos 0.1.0

Como usar:
1. Manten esta carpeta completa junta.
2. No muevas ni borres los archivos internos del programa.
3. Abre OrganiCursos.exe
4. Los avances, notas y cache se guardaran en portable-data

Importante:
- No copies solo el .exe: debe ir con ffmpeg.exe, ffprobe.exe, resources y portable-data.
- Si cambias esta carpeta de lugar, muevela completa.
- Si tu equipo no tiene los runtimes necesarios de Visual C++, puede pedirlos.
- Los respaldos exportados por el programa usan la extension .organi.
"@

Set-Content -Path (Join-Path $OutputRoot "LEEME.txt") -Value $rootReadme -Encoding UTF8
Set-Content -Path (Join-Path $installerDir "LEEME.txt") -Value $installerReadme -Encoding UTF8
Set-Content -Path (Join-Path $portableDir "LEEME.txt") -Value $portableReadme -Encoding UTF8

$hashLines = @()
$files = Get-ChildItem -Path $OutputRoot -Recurse -File | Sort-Object FullName
foreach ($file in $files) {
  $hash = Get-FileHash -Path $file.FullName -Algorithm SHA256
  $relative = $file.FullName.Substring($OutputRoot.Length).TrimStart('\')
  $hashLines += "{0} *{1}" -f $hash.Hash.ToLowerInvariant(), $relative.Replace('\', '/')
}
Set-Content -Path (Join-Path $OutputRoot "SHA256SUMS.txt") -Value $hashLines -Encoding ASCII

Write-Host "Entrega final preparada en:"
Write-Host "  $OutputRoot"
