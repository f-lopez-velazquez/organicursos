param(
  [string]$SourceRoot = "$env:LOCALAPPDATA\AtlasCourses\cargo-target\release\bundle",
  [string]$OutputRoot = "$(Split-Path -Path $PSScriptRoot -Parent)\ENTREGA\OrganiCursos-0.1.0-Windows-x64"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$nsisSource = Join-Path $SourceRoot "nsis\Atlas Courses_0.1.0_x64-setup.exe"
$msiSource = Join-Path $SourceRoot "msi\Atlas Courses_0.1.0_x64_en-US.msi"

if (-not (Test-Path $nsisSource)) {
  throw "No se encontro el instalador NSIS en: $nsisSource"
}

if (-not (Test-Path $msiSource)) {
  throw "No se encontro el instalador MSI en: $msiSource"
}

New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

$setupTarget = Join-Path $OutputRoot "OrganiCursos-0.1.0-x64-setup.exe"
$msiTarget = Join-Path $OutputRoot "OrganiCursos-0.1.0-x64.msi"
$readmeTarget = Join-Path $OutputRoot "LEEME.txt"
$hashTarget = Join-Path $OutputRoot "SHA256SUMS.txt"

Copy-Item $nsisSource $setupTarget -Force
Copy-Item $msiSource $msiTarget -Force

$readme = @"
OrganiCursos 0.1.0 para Windows x64

Contenido de esta carpeta
- OrganiCursos-0.1.0-x64-setup.exe
- OrganiCursos-0.1.0-x64.msi

Que archivo conviene usar
- Para la mayoria de usuarios: OrganiCursos-0.1.0-x64-setup.exe
- Para empresas o instalaciones administradas: OrganiCursos-0.1.0-x64.msi

Uso recomendado
1. Instala OrganiCursos.
2. Abre el programa.
3. Agrega la carpeta donde guardas tus cursos, clases, videos o materiales.
4. Espera a que organice el contenido.
5. Abre una clase y el avance se ira guardando automaticamente.

Recomendaciones importantes
- No borres ni muevas la carpeta original de tus contenidos mientras los estes usando.
- Si cambias de equipo, exporta tu respaldo desde Ajustes para conservar avances, notas y marcadores.
- Si Windows muestra una advertencia al instalar, revisa que el archivo venga de tu copia oficial antes de continuar.

Soporte: https://organicursos.app/support
Sitio: https://organicursos.app
Mantenimiento: https://organicursos.app/support
"@

Set-Content -Path $readmeTarget -Value $readme -Encoding UTF8

$hashLines = @()
foreach ($file in @($setupTarget, $msiTarget, $readmeTarget)) {
  $hash = Get-FileHash -Path $file -Algorithm SHA256
  $hashLines += "{0} *{1}" -f $hash.Hash.ToLowerInvariant(), (Split-Path $file -Leaf)
}

Set-Content -Path $hashTarget -Value $hashLines -Encoding ASCII

Write-Host "Entrega preparada en:"
Write-Host "  $OutputRoot"
