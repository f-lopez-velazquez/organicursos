use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProbeMetadata {
    pub duration_seconds: Option<i64>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub container: Option<String>,
    pub subtitle_tracks: Vec<String>,
    pub raw: serde_json::Value,
}

pub async fn probe_media(app: &AppHandle, absolute_path: &str) -> Result<ProbeMetadata> {
    let command = app.shell().sidecar("organicursos-ffprobe")?;
    let output = command
        .args([
            "-v",
            "error",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
            absolute_path,
        ])
        .output()
        .await
        .context("falló la ejecución de ffprobe")?;

    let raw: serde_json::Value = serde_json::from_slice(&output.stdout)?;
    let streams = raw
        .get("streams")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();
    let format = raw.get("format").cloned().unwrap_or_default();

    let mut width = None;
    let mut height = None;
    let mut video_codec = None;
    let mut audio_codec = None;
    let mut subtitle_tracks = Vec::new();

    for stream in streams {
        match stream.get("codec_type").and_then(|value| value.as_str()) {
            Some("video") => {
                width = stream.get("width").and_then(|value| value.as_i64());
                height = stream.get("height").and_then(|value| value.as_i64());
                video_codec = stream
                    .get("codec_name")
                    .and_then(|value| value.as_str())
                    .map(str::to_string);
            }
            Some("audio") => {
                audio_codec = stream
                    .get("codec_name")
                    .and_then(|value| value.as_str())
                    .map(str::to_string);
            }
            Some("subtitle") => {
                if let Some(codec) = stream.get("codec_name").and_then(|value| value.as_str()) {
                    subtitle_tracks.push(codec.to_string());
                }
            }
            _ => {}
        }
    }

    let duration_seconds = format
        .get("duration")
        .and_then(|value| value.as_str())
        .and_then(|value| value.parse::<f64>().ok())
        .map(|value| value.round() as i64);

    Ok(ProbeMetadata {
        duration_seconds,
        width,
        height,
        video_codec,
        audio_codec,
        container: format
            .get("format_name")
            .and_then(|value| value.as_str())
            .map(str::to_string),
        subtitle_tracks,
        raw,
    })
}
