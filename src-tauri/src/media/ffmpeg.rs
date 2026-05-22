use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use anyhow::{Context, Result};
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

use crate::utils::storage;

pub async fn generate_thumbnail(
    app: &AppHandle,
    input_path: &str,
    output_path: &Path,
    second_hint: i64,
) -> Result<()> {
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)?;
    }

    let output = app
        .shell()
        .sidecar("organicursos-ffmpeg")?
        .args([
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            &second_hint.to_string(),
            "-i",
            input_path,
            "-frames:v",
            "1",
            "-q:v",
            "2",
            "-vf",
            "scale=640:-1",
            output_path.to_string_lossy().as_ref(),
        ])
        .output()
        .await
        .context("fallÃ³ la ejecuciÃ³n de ffmpeg")?;

    if !output.status.success() {
        anyhow::bail!("ffmpeg no pudo generar miniatura");
    }

    Ok(())
}

pub async fn prepare_playback_source(
    app: &AppHandle,
    input_path: &str,
    container_hint: Option<&str>,
) -> Result<Option<String>> {
    let source_path = PathBuf::from(input_path);
    if !source_path.exists() {
        return Ok(None);
    }

    if !needs_playback_proxy(&source_path, container_hint) {
        return Ok(None);
    }

    let cache_dir = storage::app_cache_dir(app)?.join("playback");
    fs::create_dir_all(&cache_dir)?;

    let metadata = fs::metadata(&source_path)?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_secs())
        .unwrap_or_default();

    let cache_key = blake3::hash(
        format!(
            "{}:{}:{}:{}",
            source_path.to_string_lossy(),
            metadata.len(),
            modified,
            container_hint.unwrap_or_default()
        )
        .as_bytes(),
    );
    let output_path = cache_dir.join(format!("{}.mp4", cache_key.to_hex()));

    if output_path.exists() {
        return Ok(Some(output_path.to_string_lossy().to_string()));
    }

    if try_fast_remux(app, &source_path, &output_path).await.is_err() {
        transcode_for_playback(app, &source_path, &output_path).await?;
    }

    Ok(Some(output_path.to_string_lossy().to_string()))
}

fn needs_playback_proxy(path: &Path, container_hint: Option<&str>) -> bool {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();

    let safe_extension = matches!(extension.as_str(), "mp4" | "m4v" | "mov" | "webm");
    let container = container_hint.unwrap_or_default().to_ascii_lowercase();

    if container.contains("mpegts") || container.contains("mpeg-ts") || container.contains("transport stream") {
        return true;
    }

    !safe_extension
}

async fn try_fast_remux(app: &AppHandle, input_path: &Path, output_path: &Path) -> Result<()> {
    let output = app
        .shell()
        .sidecar("organicursos-ffmpeg")?
        .args([
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            input_path.to_string_lossy().as_ref(),
            "-map",
            "0:v:0?",
            "-map",
            "0:a?",
            "-c:v",
            "copy",
            "-c:a",
            "copy",
            "-bsf:a",
            "aac_adtstoasc",
            "-movflags",
            "+faststart",
            output_path.to_string_lossy().as_ref(),
        ])
        .output()
        .await
        .context("fallÃ³ el remux rÃ¡pido de reproducciÃ³n")?;

    if !output.status.success() {
        anyhow::bail!("ffmpeg no pudo remuxear el archivo para reproducciÃ³n");
    }

    Ok(())
}

async fn transcode_for_playback(app: &AppHandle, input_path: &Path, output_path: &Path) -> Result<()> {
    let output = app
        .shell()
        .sidecar("organicursos-ffmpeg")?
        .args([
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            input_path.to_string_lossy().as_ref(),
            "-map",
            "0:v:0?",
            "-map",
            "0:a?",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "23",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            output_path.to_string_lossy().as_ref(),
        ])
        .output()
        .await
        .context("fallÃ³ la transcodificaciÃ³n de reproducciÃ³n")?;

    if !output.status.success() {
        anyhow::bail!("ffmpeg no pudo convertir el archivo para reproducirlo");
    }

    Ok(())
}
