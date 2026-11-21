use serde_json::{json, Map, Value};
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use tempfile::NamedTempFile;

const SETTINGS_FILE: &str = "settings.json";

pub(super) fn executable_dir() -> io::Result<PathBuf> {
    let executable = std::env::current_exe()?;

    executable
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "missing executable directory"))
}

pub(super) fn source_path(dir: &Path, legacy_dir: &Path) -> io::Result<PathBuf> {
    let portable = dir.join(SETTINGS_FILE);

    if portable.try_exists()? {
        return Ok(portable);
    }

    Ok(legacy_dir.join(SETTINGS_FILE))
}

pub(super) fn read(path: &Path) -> io::Result<Option<Value>> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };

    let bytes = bytes.strip_prefix(b"\xef\xbb\xbf").unwrap_or(&bytes);
    let mut store: Map<String, Value> = serde_json::from_slice(bytes)?;
    if store.is_empty() {
        // Older versions could leave an empty store on exit or after reset.
        return Ok(None);
    }

    match store.remove("settings") {
        Some(settings) if settings.is_object() => Ok(Some(settings)),
        _ => Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "missing settings object",
        )),
    }
}

pub(super) fn write(dir: &Path, settings: Value) -> io::Result<()> {
    write_store(dir, &json!({ "settings": settings }))
}

pub(super) fn reset(dir: &Path) -> io::Result<()> {
    // A local empty store stops the next launch from importing legacy settings again.
    write_store(dir, &json!({}))
}

fn write_store(dir: &Path, store: &Value) -> io::Result<()> {
    fs::create_dir_all(dir)?;

    // Finish the new file in the same directory before replacing the live file.
    let mut temp = NamedTempFile::new_in(dir)?;
    serde_json::to_writer_pretty(&mut temp, store)?;
    temp.flush()?;
    temp.as_file().sync_all()?;
    temp.persist(dir.join(SETTINGS_FILE))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn resolves_the_directory_of_the_running_executable() {
        let executable = std::env::current_exe().unwrap();
        assert_eq!(executable_dir().unwrap(), executable.parent().unwrap());
    }

    #[test]
    fn reads_missing_file_and_legacy_empty_store_as_defaults() {
        let dir = tempdir().unwrap();
        assert_eq!(read(&dir.path().join(SETTINGS_FILE)).unwrap(), None);
        assert!(!dir.path().join(SETTINGS_FILE).exists());

        fs::write(dir.path().join(SETTINGS_FILE), b"{}").unwrap();
        assert_eq!(read(&dir.path().join(SETTINGS_FILE)).unwrap(), None);
    }

    #[test]
    fn reads_bom_with_the_existing_store_format() {
        let dir = tempdir().unwrap();
        fs::write(
            dir.path().join(SETTINGS_FILE),
            b"\xef\xbb\xbf{\"settings\":{\"schemaVersion\":6}}",
        )
        .unwrap();

        assert_eq!(
            read(&dir.path().join(SETTINGS_FILE)).unwrap(),
            Some(json!({ "schemaVersion": 6 }))
        );
    }

    #[test]
    fn failed_reads_leave_the_file_intact() {
        let dir = tempdir().unwrap();
        let path = dir.path().join(SETTINGS_FILE);

        for bytes in [
            b"".as_slice(),
            b"{\"settings\":",
            b"{\"settings\":null}",
            b"{\"other\":true}",
        ] {
            fs::write(&path, bytes).unwrap();
            assert!(read(&dir.path().join(SETTINGS_FILE)).is_err());
            assert_eq!(fs::read(&path).unwrap(), bytes);
        }
    }

    #[test]
    fn saves_and_replaces_settings_in_the_existing_format() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config");
        write(&path, json!({ "schemaVersion": 6 })).unwrap();
        let updated = json!({ "schemaVersion": 6, "activeLayoutId": "custom" });
        write(&path, updated.clone()).unwrap();

        assert_eq!(
            read(&path.join(SETTINGS_FILE)).unwrap(),
            Some(updated.clone())
        );
        let file = fs::read(path.join(SETTINGS_FILE)).unwrap();
        assert_eq!(
            serde_json::from_slice::<Value>(&file).unwrap(),
            json!({ "settings": updated }),
        );
        assert_eq!(fs::read_dir(&path).unwrap().count(), 1);
    }

    #[test]
    fn imports_legacy_settings_only_if_the_portable_file_is_missing() {
        let legacy = tempdir().unwrap();
        let portable = tempdir().unwrap();
        let legacy_settings = json!({ "activeLayoutId": "imported" });
        let portable_settings = json!({ "activeLayoutId": "portable" });
        write(legacy.path(), legacy_settings.clone()).unwrap();

        let source = || source_path(portable.path(), legacy.path()).unwrap();
        assert_eq!(read(&source()).unwrap(), Some(legacy_settings.clone()));

        write(portable.path(), portable_settings.clone()).unwrap();
        assert_eq!(read(&source()).unwrap(), Some(portable_settings));

        fs::write(portable.path().join(SETTINGS_FILE), b"{").unwrap();
        assert!(read(&source()).is_err());

        reset(portable.path()).unwrap();
        assert_eq!(read(&source()).unwrap(), None);
        assert_eq!(
            read(&legacy.path().join(SETTINGS_FILE)).unwrap(),
            Some(legacy_settings),
        );
    }
}
