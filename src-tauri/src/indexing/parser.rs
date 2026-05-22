use std::fs;
use std::io::Read;
use std::path::Path;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use anyhow::Result;
use regex::Regex;
use zip::ZipArchive;

static TAG_REGEX: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
static SUBTITLE_TIMESTAMP_REGEX: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();

pub enum TextExtractionStatus {
    Extracted(Option<String>),
    TimedOut,
    Failed,
    SkippedLarge,
}

pub fn extract_text(path: &Path) -> Result<Option<String>> {
    let extension = path
        .extension()
        .map(|value| value.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    let output = match extension.as_str() {
        "txt" | "md" => Some(fs::read_to_string(path)?),
        "srt" | "vtt" => Some(clean_subtitles(&fs::read_to_string(path)?)),
        "html" | "htm" => Some(strip_html_tags(&fs::read_to_string(path)?)),
        "pdf" => pdf_extract::extract_text(path).ok(),
        "docx" => extract_docx_text(path).ok(),
        "pptx" => extract_pptx_text(path).ok(),
        _ => None,
    };

    Ok(output
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty()))
}

pub fn extract_text_resilient(path: &Path) -> TextExtractionStatus {
    let extension = path
        .extension()
        .map(|value| value.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    let file_size_bytes = fs::metadata(path).map(|metadata| metadata.len()).unwrap_or(0);

    match extension.as_str() {
        "pdf" => {
            if file_size_bytes > 12 * 1024 * 1024 {
                TextExtractionStatus::SkippedLarge
            } else {
                run_with_timeout(path, Duration::from_secs(3))
            }
        }
        "docx" => {
            if file_size_bytes > 8 * 1024 * 1024 {
                TextExtractionStatus::SkippedLarge
            } else {
                run_with_timeout(path, Duration::from_secs(2))
            }
        }
        "pptx" => {
            if file_size_bytes > 20 * 1024 * 1024 {
                TextExtractionStatus::SkippedLarge
            } else {
                run_with_timeout(path, Duration::from_secs(4))
            }
        }
        _ => match extract_text(path) {
            Ok(value) => TextExtractionStatus::Extracted(value),
            Err(_) => TextExtractionStatus::Failed,
        },
    }
}

fn run_with_timeout(path: &Path, timeout: Duration) -> TextExtractionStatus {
    let owned_path = path.to_path_buf();
    let (sender, receiver) = mpsc::channel();

    thread::spawn(move || {
        let result = extract_text(&owned_path);
        let _ = sender.send(result);
    });

    match receiver.recv_timeout(timeout) {
        Ok(Ok(value)) => TextExtractionStatus::Extracted(value),
        Ok(Err(_)) => TextExtractionStatus::Failed,
        Err(mpsc::RecvTimeoutError::Timeout) => TextExtractionStatus::TimedOut,
        Err(mpsc::RecvTimeoutError::Disconnected) => TextExtractionStatus::Failed,
    }
}

fn extract_docx_text(path: &Path) -> Result<String> {
    let file = fs::File::open(path)?;
    let mut archive = ZipArchive::new(file)?;
    let mut xml = String::new();
    archive
        .by_name("word/document.xml")?
        .read_to_string(&mut xml)?;
    let tag_regex = TAG_REGEX.get_or_init(|| Regex::new(r"<[^>]+>").expect("regex"));
    Ok(tag_regex.replace_all(&xml, " ").to_string())
}

fn extract_pptx_text(path: &Path) -> Result<String> {
    let file = fs::File::open(path)?;
    let mut archive = ZipArchive::new(file)?;
    let tag_regex = TAG_REGEX.get_or_init(|| Regex::new(r"<[^>]+>").expect("regex"));
    let mut collected = Vec::new();

    for index in 0..archive.len() {
        let mut file = archive.by_index(index)?;
        let name = file.name().to_string();
        if !name.starts_with("ppt/slides/slide") || !name.ends_with(".xml") {
            continue;
        }

        let mut xml = String::new();
        file.read_to_string(&mut xml)?;
        let text = tag_regex.replace_all(&xml, " ").to_string();
        let normalized = text.split_whitespace().collect::<Vec<_>>().join(" ");
        if !normalized.is_empty() {
            collected.push(normalized);
        }
    }

    Ok(collected.join("\n"))
}

fn clean_subtitles(value: &str) -> String {
    let regex = SUBTITLE_TIMESTAMP_REGEX
        .get_or_init(|| Regex::new(r"^\d+$|^\d{2}:\d{2}:\d{2}[\.,]\d{3} -->").expect("regex"));

    value
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            !trimmed.is_empty()
                && trimmed != "WEBVTT"
                && !regex.is_match(trimmed)
                && !trimmed.starts_with("NOTE")
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn strip_html_tags(value: &str) -> String {
    let tag_regex = TAG_REGEX.get_or_init(|| Regex::new(r"<[^>]+>").expect("regex"));
    tag_regex
        .replace_all(value, " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::clean_subtitles;

    #[test]
    fn strips_subtitle_timestamps_and_indexes() {
        let raw = "1\n00:00:01,000 --> 00:00:03,000\nHola mundo\n\n2\n00:00:04,000 --> 00:00:06,000\nAtlas";
        assert_eq!(clean_subtitles(raw), "Hola mundo Atlas");
    }
}
