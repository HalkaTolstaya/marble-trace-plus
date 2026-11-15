//! A folder the driver drops Garage 61 CSV exports into (`<install dir>\laps`).
//! Every new or changed `.csv` is parsed and added to the lap library, where
//! the session's matching picks it up like any other lap.
//!
//! Polled, not watched: a scan every few seconds is cheap for a handful of
//! files and needs no platform file-notification code. Files stay where they
//! are; the library dedupes by content, so a re-scan never adds a lap twice.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use crate::lap::MAX_CSV_BYTES;

/// Name of the folder next to the executable.
pub const INBOX_DIR: &str = "laps";
/// Files looked at per scan; a folder with more is read a batch at a time.
const MAX_FILES_PER_SCAN: usize = 200;

/// What a file looked like when it was last read.
type Stamp = (u64, Option<SystemTime>);

#[derive(Debug, Default)]
pub struct InboxScanner {
    seen: HashMap<PathBuf, Stamp>,
}

/// A CSV to import, read from the inbox.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InboxFile {
    pub path: PathBuf,
    pub file_name: String,
    pub text: String,
}

fn is_csv(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("csv"))
}

impl InboxScanner {
    /// The `.csv` files in `dir` that are new or changed since the last scan.
    /// Symlinks, folders, oversized and unreadable files are skipped; a file
    /// still being written (size changing between scans) is read on the next
    /// scan that sees it unchanged.
    pub fn scan(&mut self, dir: &Path) -> Vec<InboxFile> {
        let Ok(entries) = fs::read_dir(dir) else {
            return Vec::new();
        };
        let mut found = Vec::new();
        let mut present = Vec::new();

        for entry in entries.flatten().take(MAX_FILES_PER_SCAN) {
            let path = entry.path();
            let Ok(meta) = fs::symlink_metadata(&path) else {
                continue;
            };

            if !meta.file_type().is_file() || !is_csv(&path) {
                continue;
            }

            present.push(path.clone());

            let stamp: Stamp = (meta.len(), meta.modified().ok());

            if meta.len() > MAX_CSV_BYTES as u64 || self.seen.get(&path) == Some(&stamp) {
                continue;
            }

            // Mark it seen first: an unreadable file is not retried every scan.
            self.seen.insert(path.clone(), stamp);

            let Ok(text) = fs::read_to_string(&path) else {
                continue;
            };
            let file_name = path
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_default();

            found.push(InboxFile {
                path,
                file_name,
                text,
            });
        }

        // Forget deleted files, so one dropped in again is read again.
        self.seen.retain(|path, _| present.contains(path));

        found
    }

    /// A file that failed to parse while still being written is read again on
    /// the next scan.
    pub fn retry(&mut self, path: &Path) {
        self.seen.remove(path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_new_and_changed_csvs_once() {
        let dir = tempfile::tempdir().unwrap();
        let mut scanner = InboxScanner::default();
        let lap = dir
            .path()
            .join("Garage 61 - A - Car - Track - 01.00.000 - X.csv");

        fs::write(&lap, "a,b\n1,2\n").unwrap();
        fs::write(dir.path().join("notes.txt"), "not a lap").unwrap();
        fs::create_dir(dir.path().join("folder.csv")).unwrap();

        let first = scanner.scan(dir.path());

        assert_eq!(first.len(), 1);
        assert_eq!(first[0].text, "a,b\n1,2\n");
        assert!(scanner.scan(dir.path()).is_empty());

        fs::write(&lap, "a,b\n1,2\n3,4\n").unwrap();
        assert_eq!(scanner.scan(dir.path()).len(), 1);
    }

    #[test]
    fn a_deleted_and_re_added_file_is_read_again() {
        let dir = tempfile::tempdir().unwrap();
        let mut scanner = InboxScanner::default();
        let lap = dir.path().join("lap.CSV");

        fs::write(&lap, "x").unwrap();
        assert_eq!(scanner.scan(dir.path()).len(), 1);
        fs::remove_file(&lap).unwrap();
        assert!(scanner.scan(dir.path()).is_empty());
        fs::write(&lap, "x").unwrap();
        assert_eq!(scanner.scan(dir.path()).len(), 1);
    }

    #[test]
    fn retry_reads_the_file_again() {
        let dir = tempfile::tempdir().unwrap();
        let mut scanner = InboxScanner::default();
        let lap = dir.path().join("lap.csv");

        fs::write(&lap, "x").unwrap();
        scanner.scan(dir.path());
        scanner.retry(&lap);
        assert_eq!(scanner.scan(dir.path()).len(), 1);
    }

    #[test]
    fn a_missing_folder_is_empty_not_an_error() {
        let mut scanner = InboxScanner::default();

        assert!(scanner.scan(Path::new("/definitely/not/here")).is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn symlinks_are_not_followed() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let target = outside.path().join("secret.csv");

        fs::write(&target, "x").unwrap();
        std::os::unix::fs::symlink(&target, dir.path().join("link.csv")).unwrap();

        assert!(InboxScanner::default().scan(dir.path()).is_empty());
    }
}
