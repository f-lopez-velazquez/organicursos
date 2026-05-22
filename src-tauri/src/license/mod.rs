use anyhow::{anyhow, Context, Result};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{DateTime, Utc};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use pkcs8::DecodePublicKey;
use serde::{Deserialize, Serialize};

const TOKEN_PREFIX: &str = "ATLAS1";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseClaims {
    pub iss: String,
    pub aud: String,
    pub license_id: String,
    pub tier: String,
    pub licensed_to: String,
    pub email: String,
    pub company: Option<String>,
    pub issued_at: String,
    pub expires_at: Option<String>,
    pub not_before: Option<String>,
    pub features: Vec<String>,
}

pub fn public_key_configured() -> bool {
    option_env!("ATLAS_LICENSE_PUBLIC_KEY_PEM").is_some()
}

pub fn verify_license_token(token: &str) -> Result<LicenseClaims> {
    let public_key_pem = option_env!("ATLAS_LICENSE_PUBLIC_KEY_PEM")
        .ok_or_else(|| anyhow!("No hay clave publica de licencias configurada en este build."))?;
    let public_key = VerifyingKey::from_public_key_pem(public_key_pem)
        .context("La clave publica de licencias no tiene un formato valido.")?;

    let mut parts = token.trim().split('.');
    let prefix = parts.next().unwrap_or_default();
    let payload_segment = parts.next().unwrap_or_default();
    let signature_segment = parts.next().unwrap_or_default();

    if parts.next().is_some()
        || prefix != TOKEN_PREFIX
        || payload_segment.is_empty()
        || signature_segment.is_empty()
    {
        anyhow::bail!("El token de licencia no tiene el formato esperado.");
    }

    let payload_bytes = URL_SAFE_NO_PAD
        .decode(payload_segment)
        .context("No se pudo decodificar la carga del token de licencia.")?;
    let signature_bytes = URL_SAFE_NO_PAD
        .decode(signature_segment)
        .context("No se pudo decodificar la firma del token de licencia.")?;

    let signature = Signature::try_from(signature_bytes.as_slice())
        .context("La firma del token de licencia no es valida.")?;
    public_key
        .verify(&payload_bytes, &signature)
        .context("La firma del token de licencia no es valida.")?;

    let claims: LicenseClaims = serde_json::from_slice(&payload_bytes)
        .context("La carga del token de licencia no es un JSON valido.")?;
    validate_claims(&claims)?;
    Ok(claims)
}

fn validate_claims(claims: &LicenseClaims) -> Result<()> {
    if claims.iss.trim() != "Atlas Courses" {
        anyhow::bail!("El emisor del token de licencia no coincide.");
    }

    if claims.aud.trim() != "atlas-courses-desktop" {
        anyhow::bail!("La audiencia del token de licencia no coincide con Atlas Courses.");
    }

    if claims.license_id.trim().is_empty()
        || claims.licensed_to.trim().is_empty()
        || claims.email.trim().is_empty()
    {
        anyhow::bail!("El token de licencia no incluye los datos minimos requeridos.");
    }

    parse_timestamp(&claims.issued_at, "issuedAt")?;
    if let Some(expires_at) = &claims.expires_at {
        parse_timestamp(expires_at, "expiresAt")?;
    }
    if let Some(not_before) = &claims.not_before {
        parse_timestamp(not_before, "notBefore")?;
    }

    Ok(())
}

pub fn token_last4(token: &str) -> Option<String> {
    let compact = token.trim();
    if compact.is_empty() {
        return None;
    }
    let chars = compact.chars().rev().take(4).collect::<Vec<_>>();
    Some(chars.into_iter().rev().collect())
}

pub fn parse_timestamp(value: &str, field_name: &str) -> Result<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .with_context(|| format!("El campo {field_name} no tiene una fecha RFC3339 valida."))
        .map(|value| value.with_timezone(&Utc))
}
