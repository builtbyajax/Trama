use std::{fs, path::Path};
use trama_lib::documents;

#[test]
fn paths_stay_inside_the_vault_and_hidden_entries_are_rejected() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().canonicalize().unwrap();
    documents::create_note(&root, "Visible").unwrap();
    for path in [
        "../outside.md",
        "folder/../../outside.md",
        ".hidden.md",
        ".hidden/note.md",
        "",
    ] {
        assert!(documents::relative(&root, path).is_err(), "{path}");
    }
    let outside = tempfile::tempdir().unwrap();
    let external = outside.path().join("outside.md");
    fs::write(&external, "secret").unwrap();
    assert!(documents::read(&root, external.to_str().unwrap()).is_err());
    assert!(documents::read(&root, "../outside.md").is_err());
    assert_eq!(
        documents::read(&root, root.join("Visible.md").to_str().unwrap())
            .unwrap()
            .path,
        "Visible.md"
    );
    fs::write(root.join(".hidden.md"), "secret").unwrap();
    assert!(documents::read(&root, ".hidden.md").is_err());
    assert_eq!(documents::list(&root).unwrap().notes, ["Visible.md"]);
}

#[cfg(any(unix, windows))]
#[test]
fn external_symlinks_cannot_be_read_written_or_used_as_parent_folders() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().canonicalize().unwrap();
    let outside = tempfile::tempdir().unwrap();
    fs::write(outside.path().join("note.md"), "secret").unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(outside.path(), root.join("alias")).unwrap();
    #[cfg(windows)]
    std::os::windows::fs::symlink_dir(outside.path(), root.join("alias")).unwrap();
    assert!(documents::read(&root, "alias/note.md").is_err());
    assert!(documents::create_note(&root, "alias/new").is_err());
    assert!(documents::create_folder(&root, "alias/new-folder").is_err());
    assert!(documents::rename(&root, "alias/note.md", "changed").is_err());
    assert!(documents::trash(&root, "alias/note.md").is_err());
    assert_eq!(
        fs::read_to_string(outside.path().join("note.md")).unwrap(),
        "secret"
    );
}

#[test]
fn external_changes_cause_conflicts_without_losing_text_or_leaving_temporary_files() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().canonicalize().unwrap();
    let original = documents::create_note(&root, "note").unwrap();
    let saved = documents::write(&root, "note.md", "First edit", &original.version).unwrap();
    fs::write(root.join("note.md"), "External edit").unwrap();
    assert!(
        documents::write(&root, "note.md", "Stale edit", &saved.version)
            .unwrap_err()
            .contains("changed outside")
    );
    assert_eq!(
        fs::read_to_string(root.join("note.md")).unwrap(),
        "External edit"
    );
    assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
}

#[test]
fn creating_and_renaming_never_overwrites_or_creates_missing_parents() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().canonicalize().unwrap();
    assert!(documents::create_note(&root, "missing/note").is_err());
    assert!(documents::create_folder(&root, "missing/folder").is_err());
    assert!(!root.join("missing").exists());
    documents::create_note(&root, "First").unwrap();
    let second = documents::create_note(&root, "Second").unwrap();
    documents::write(&root, "Second.md", "Keep me", &second.version).unwrap();
    assert!(documents::create_note(&root, "Second").is_err());
    assert!(documents::rename(&root, "First.md", "Second").is_err());
    assert_eq!(documents::read(&root, "Second.md").unwrap().text, "Keep me");
    assert_eq!(
        documents::rename(&root, "First.md", "Renamed").unwrap(),
        "Renamed.md"
    );
    assert!(documents::rename(&root, "Renamed.md", "../escape").is_err());
    assert_eq!(documents::create_folder(&root, "folder").unwrap(), "folder");
    assert_eq!(
        documents::create_note(&root, "folder\\Nested")
            .unwrap()
            .path,
        "folder/Nested.md"
    );
}

#[test]
fn size_limits_and_utf8_are_enforced_before_replacing_content() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().canonicalize().unwrap();
    let file = documents::create_note(&root, "note").unwrap();
    let limit = "x".repeat(2 * 1024 * 1024);
    let saved = documents::write(&root, "note.md", &limit, &file.version).unwrap();
    assert!(documents::write(&root, "note.md", &(limit + "x"), &saved.version).is_err());
    assert_eq!(
        documents::read(&root, "note.md").unwrap().text.len(),
        2 * 1024 * 1024
    );
    fs::write(root.join("large.md"), vec![b'x'; 2 * 1024 * 1024 + 1]).unwrap();
    assert!(documents::read(&root, "large.md").is_err());
    fs::write(root.join("invalid.md"), [0xff]).unwrap();
    assert!(documents::read(&root, "invalid.md").is_err());
}

#[test]
fn note_search_ignores_accents_case_and_non_markdown_files() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().canonicalize().unwrap();
    fs::write(root.join("note.md"), "Uma decisão importante").unwrap();
    fs::write(root.join("ignore.txt"), "decisao").unwrap();
    let hits = documents::search(&root, "DECISAO").unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].path, "note.md");
    assert!(documents::search(&root, "d").unwrap().is_empty());
    assert!(documents::note_path(&root, Path::new("ignore.txt").to_str().unwrap()).is_err());
}

#[cfg(any(unix, windows))]
#[test]
fn internal_symlinks_cannot_bypass_hidden_folder_rules() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().canonicalize().unwrap();
    fs::create_dir(root.join(".hidden")).unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(root.join(".hidden"), root.join("alias")).unwrap();
    #[cfg(windows)]
    std::os::windows::fs::symlink_dir(root.join(".hidden"), root.join("alias")).unwrap();
    assert!(documents::create_note(&root, "alias/new.md").is_err());
    assert!(documents::create_folder(&root, "alias/new-folder").is_err());
    assert_eq!(fs::read_dir(root.join(".hidden")).unwrap().count(), 0);
}
