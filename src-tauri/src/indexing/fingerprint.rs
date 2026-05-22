use std::fs::File;
use std::io::Read;
use std::path::Path;

use anyhow::Result;
use blake3::Hasher;

pub struct Fingerprint {
    pub file_size_bytes: u64,
    pub modified_at: String,
    pub partial_hash: String,
    pub fingerprint_key: String,
}

pub fn fingerprint_file(path: &Path) -> Result<Fingerprint> {
    let metadata = path.metadata()?;
    let modified_at = metadata
        .modified()?
        .duration_since(std::time::UNIX_EPOCH)?
        .as_secs()
        .to_string();
    let file_size_bytes = metadata.len();

    let mut file = File::open(path)?;
    let mut buffer = vec![0u8; 262_144];
    let bytes_read = file.read(&mut buffer)?;
    buffer.truncate(bytes_read);

    let mut hasher = Hasher::new();
    hasher.update(&buffer);
    let partial_hash = hasher.finalize().to_hex().to_string();
    let fingerprint_key = format!(
        "{}:{}:{}",
        path.to_string_lossy(),
        file_size_bytes,
        partial_hash
    );

    Ok(Fingerprint {
        file_size_bytes,
        modified_at,
        partial_hash,
        fingerprint_key,
    })
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::fingerprint_file;

    #[test]
    fn produces_partial_hash_and_key() {
        let temp_dir = std::env::temp_dir().join("atlas_courses_fingerprint_test");
        let _ = fs::create_dir_all(&temp_dir);
        let path = temp_dir.join("sample.txt");
        fs::write(&path, "atlas fingerprint").expect("write fixture");

        let fingerprint = fingerprint_file(&path).expect("fingerprint");
        assert!(!fingerprint.partial_hash.is_empty());
        assert!(fingerprint.fingerprint_key.contains("sample.txt"));
    }
}
