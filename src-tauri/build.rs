fn main() {
    let env_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(".env");
    let _ = dotenvy::from_path(&env_path);

    // The Twitch client id is baked into `mt-chat`, which reads it, by that
    // crate's own build script: `cargo:rustc-env` reaches only this crate.

    println!("cargo:rerun-if-changed={}", env_path.display());

    tauri_build::build()
}
