use std::path::{Path, PathBuf};

pub fn file_stem_string(path: &Path) -> String {
    path.file_stem()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_default()
}

pub fn relative_string(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .map(PathBuf::from)
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .replace('\\', "/")
}

pub fn sanitize_display_name(value: &str) -> String {
    let normalized = value
        .replace(['_', '.'], " ")
        .replace(['[', ']', '(', ')'], " ")
        .replace('-', " ");

    let cleaned = normalized
        .split_whitespace()
        .filter(|segment| !looks_like_noise(segment))
        .collect::<Vec<_>>()
        .join(" ");

    let without_prefix = cleaned
        .trim_start_matches(|character: char| {
            character.is_ascii_digit() || character == ' ' || character == '-'
        })
        .trim()
        .to_string();

    without_prefix
        .split_whitespace()
        .map(|segment| {
            if segment
                .chars()
                .all(|character| character.is_ascii_uppercase())
            {
                return segment.to_string();
            }
            let mut chars = segment.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn looks_like_noise(segment: &str) -> bool {
    let lower = segment.to_ascii_lowercase();
    matches!(
        lower.as_str(),
        "1080p"
            | "720p"
            | "480p"
            | "x264"
            | "h264"
            | "h265"
            | "webrip"
            | "bluray"
            | "aac"
            | "es"
            | "eng"
            | "final"
    )
}

#[cfg(test)]
mod tests {
    use super::sanitize_display_name;

    #[test]
    fn cleans_prefixed_video_titles() {
        assert_eq!(
            sanitize_display_name("01-introduccion_al_curso_1080p"),
            "Introduccion Al Curso"
        );
        assert_eq!(sanitize_display_name("02.async-await.final"), "Async Await");
    }
}
