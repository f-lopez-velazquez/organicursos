fn main() {
    if let Ok(public_key) = std::env::var("ATLAS_LICENSE_PUBLIC_KEY_PEM") {
        println!("cargo:rustc-env=ATLAS_LICENSE_PUBLIC_KEY_PEM={public_key}");
    }
    tauri_build::build()
}
