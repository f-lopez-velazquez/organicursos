use std::fs;
use std::path::PathBuf;
use std::time::UNIX_EPOCH;

use anyhow::{Context, Result};
use regex::Regex;
use tauri::AppHandle;

use crate::utils::storage;

pub fn prepare_subtitle_track(
    app: &AppHandle,
    subtitle_path: Option<&str>,
) -> Result<Option<String>> {
    let Some(subtitle_path) = subtitle_path else {
        return Ok(None);
    };

    let source_path = PathBuf::from(subtitle_path);
    if !source_path.exists() {
        return Ok(None);
    }

    let extension = source_path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();

    if extension == "vtt" {
        return Ok(Some(source_path.to_string_lossy().to_string()));
    }

    if extension != "srt" {
        return Ok(None);
    }

    let cache_dir = storage::app_cache_dir(app)?.join("subtitles");
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
            "{}:{}:{}",
            source_path.to_string_lossy(),
            metadata.len(),
            modified
        )
        .as_bytes(),
    );
    let cached_path = cache_dir.join(format!("{}.vtt", cache_key.to_hex()));

    if cached_path.exists() {
        return Ok(Some(cached_path.to_string_lossy().to_string()));
    }

    let raw = fs::read(&source_path).context("no se pudo leer el archivo de subtitulos")?;
    let text = String::from_utf8_lossy(&raw);
    let vtt = convert_srt_to_vtt(&text);
    fs::write(&cached_path, vtt).context("no se pudo guardar el subtitulo convertido")?;

    Ok(Some(cached_path.to_string_lossy().to_string()))
}

fn convert_srt_to_vtt(content: &str) -> String {
    let timestamp_regex =
        Regex::new(r"(?m)(\d{2}:\d{2}:\d{2}),(\d{3})").expect("timestamp regex must compile");

    let normalized = content.replace("\r\n", "\n").replace('\r', "\n");
    let mut output = String::from("WEBVTT\n\n");

    for block in normalized.split("\n\n") {
        let mut lines = block
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .peekable();

        if lines.peek().is_none() {
            continue;
        }

        let mut cue_lines = Vec::new();
        while let Some(line) = lines.next() {
            if cue_lines.is_empty() && line.chars().all(|char| char.is_ascii_digit()) {
                continue;
            }
            let line = timestamp_regex.replace_all(line, "$1.$2").to_string();
            cue_lines.push(line);
        }

        if cue_lines.is_empty() {
            continue;
        }

        output.push_str(&cue_lines.join("\n"));
        output.push_str("\n\n");
    }

    output
}

#[cfg(test)]
mod tests {
    use super::convert_srt_to_vtt;

    #[test]
    fn converts_basic_srt_into_vtt() {
        let source = "1\r\n00:00:01,000 --> 00:00:02,500\r\nHola\r\n\r\n2\r\n00:00:03,000 --> 00:00:05,000\r\nMundo";
        let result = convert_srt_to_vtt(source);
        assert!(result.starts_with("WEBVTT"));
        assert!(result.contains("00:00:01.000 --> 00:00:02.500"));
        assert!(result.contains("Hola"));
        assert!(result.contains("Mundo"));
    }
}
