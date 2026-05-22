# Licensing for OrganiCursos

## Objetivo

OrganiCursos soporta activacion offline con tokens firmados. El binario solo necesita la clave publica; la emision del token se hace fuera de la app con una clave privada controlada por ventas u operaciones.

Contacto operativo del licenciamiento:

- sales@organicursos.app
- https://organicursos.app/licensing

## 1. Generar par de claves Ed25519

PowerShell:

```powershell
openssl genpkey -algorithm ED25519 -out atlas-license-private.pem
openssl pkey -in atlas-license-private.pem -pubout -out atlas-license-public.pem
```

Tambien puedes generar el par con Node.js o con tu infraestructura interna de firma.

## 2. Compilar OrganiCursos con la clave publica

PowerShell:

```powershell
$env:ATLAS_LICENSE_PUBLIC_KEY_PEM = Get-Content .\atlas-license-public.pem -Raw
npm run build:windows:release
```

La app incrusta la clave publica en el build. Sin esa variable, la interfaz de licencia sigue funcionando pero no podra validar tokens firmados.

## 3. Emitir un token de licencia

Ejemplo:

```powershell
  node .\scripts\generate-license-token.mjs `
  --private-key .\atlas-license-private.pem `
  --licensed-to "Equipo Finance Ops" `
  --email "cliente@organicursos.app" `
  --tier professional `
  --company "Finance Ops LLC" `
  --days 365
```

El comando devuelve un token con formato:

```text
ATLAS1.<payload-base64url>.<signature-base64url>
```

## 4. Activar en la app

- Abrir `Licencia`
- Pegar token
- Confirmar `Activar licencia`

## Campos del token

- `iss`: debe ser `OrganiCursos`
- `aud`: debe ser `atlas-courses-desktop`
- `licenseId`
- `tier`: `professional`, `team` o `enterprise`
- `licensedTo`
- `email`
- `company`
- `issuedAt`
- `expiresAt`
- `notBefore`
- `features`

## Notas operativas

- La activacion se guarda en `app_settings` de la base local.
- `clear activation` elimina el token y la prueba local del equipo.
- La prueba local profesional dura 14 dias por defecto y tambien se registra en la base local.
- Para produccion real, la clave privada nunca debe vivir en este repositorio ni en maquinas de usuario final.
