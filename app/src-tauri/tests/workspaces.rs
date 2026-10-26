use std::{
    fs,
    path::{Path, PathBuf},
};
use trama_lib::{store::Store, workspaces::Registry};

fn text(path: &Path) -> &str {
    path.to_str().unwrap()
}
fn registry(home: &Path) -> Registry {
    Registry::at(home.to_path_buf(), None)
}
fn saved(home: &Path, active: Option<&Path>, paths: &[&Path]) {
    fs::create_dir_all(home).unwrap();
    fs::write(home.join("workspaces.json"),serde_json::to_vec(&serde_json::json!({"active":active.map(text),"workspaces":paths.iter().map(|p|serde_json::json!({"name":"Synthetic","path":text(p)})).collect::<Vec<_>>()})).unwrap()).unwrap();
}

#[test]
fn independent_registries_create_edit_and_remove_without_restoring_the_default() {
    let dir = tempfile::tempdir().unwrap();
    let home = dir.path().join("one");
    let other = registry(&dir.path().join("two"));
    let r = registry(&home);
    let default = PathBuf::from(&r.list().workspaces[0].path);
    let a = r
        .create("Alpha", text(dir.path()), Some(2), Some("terminal"))
        .unwrap()
        .active;
    assert_eq!(other.list().workspaces.len(), 1);
    assert_ne!(other.active_path(), PathBuf::from(&a));
    assert!(r.create("Alpha", text(dir.path()), None, None).is_err());
    assert!(r.create("../escape", text(dir.path()), None, None).is_err());
    let b = r
        .create("Beta", text(dir.path()), None, None)
        .unwrap()
        .active;
    let edited = r.edit(&a, "Renamed", Some(4), Some(" star ")).unwrap();
    let alpha = edited.workspaces.iter().find(|w| w.path == a).unwrap();
    assert_eq!(
        (&alpha.name, alpha.color, alpha.icon.as_deref()),
        (&"Renamed".to_string(), Some(4), Some("star"))
    );
    r.remove(text(&default)).unwrap();
    assert!(!registry(&home)
        .list()
        .workspaces
        .iter()
        .any(|w| w.path == text(&default)));
    r.remove(&a).unwrap();
    assert!(Path::new(&a).is_file());
    assert!(r.remove(&b).is_err());
    assert!(r.delete(&b).is_err());
    assert!(!home.join("workspaces.json.partial").exists());
}

#[test]
fn deleting_an_inactive_workspace_removes_only_its_database_and_journals() {
    let dir = tempfile::tempdir().unwrap();
    let r = registry(&dir.path().join("home"));
    let a = r
        .create("Alpha", text(dir.path()), None, None)
        .unwrap()
        .active;
    let b = r
        .create("Beta", text(dir.path()), None, None)
        .unwrap()
        .active;
    for suffix in ["-wal", "-shm"] {
        fs::write(format!("{a}{suffix}"), b"synthetic").unwrap();
    }
    r.delete(&a).unwrap();
    for suffix in ["", "-wal", "-shm"] {
        assert!(!Path::new(&format!("{a}{suffix}")).exists());
    }
    assert!(Path::new(&b).is_file());
    assert!(!r.list().workspaces.iter().any(|w| w.path == a));
    assert!(r.delete(&b).is_err());
}

#[test]
fn active_path_falls_back_to_existing_then_first_and_explicit_database_wins() {
    let dir = tempfile::tempdir().unwrap();
    let home = dir.path().join("home");
    let missing = dir.path().join("missing.sqlite");
    let present = dir.path().join("present.sqlite");
    Store::open(&present).unwrap();
    saved(&home, Some(&missing), &[&missing, &present]);
    let r = registry(&home);
    assert_eq!(r.active_path(), present);
    fs::remove_file(&present).unwrap();
    assert_eq!(r.active_path(), missing);
    let pinned = dir.path().join("explicit.sqlite");
    let r = Registry::at(home, Some(pinned.clone()));
    assert_eq!(r.active_path(), pinned);
    assert!(r.list().pinned);
    assert!(r.create("Denied", text(dir.path()), None, None).is_err());
    assert!(r.switch(text(&missing)).is_err());
}

#[test]
fn corrupt_registry_recovers_and_missing_workspace_cannot_be_opened() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("workspaces.json"), b"{broken").unwrap();
    let r = registry(dir.path());
    assert_eq!(r.list().workspaces.len(), 1);
    assert_eq!(r.active_path(), dir.path().join("trama.sqlite"));
    assert!(r.open(text(&dir.path().join("missing.sqlite"))).is_err());
}

#[test]
fn listing_reads_appearance_from_closed_wal_without_shm() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("source.sqlite");
    let db = Store::open(&source).unwrap();
    db.db.execute_batch("PRAGMA wal_autocheckpoint=0; INSERT INTO settings VALUES('workspace.color','3'),('workspace.icon','terminal');").unwrap();
    let copy = dir.path().join("copy.sqlite");
    fs::copy(&source, &copy).unwrap();
    fs::copy(
        format!("{}-wal", source.display()),
        format!("{}-wal", copy.display()),
    )
    .unwrap();
    assert!(!Path::new(&format!("{}-shm", copy.display())).exists());
    let home = dir.path().join("home");
    saved(&home, Some(&copy), &[&copy]);
    let list = registry(&home).list();
    assert_eq!(list.workspaces[0].color, Some(3));
    assert_eq!(list.workspaces[0].icon.as_deref(), Some("terminal"));
}

#[test]
fn relocation_preserves_data_and_updates_the_active_path() {
    let dir = tempfile::tempdir().unwrap();
    let r = registry(&dir.path().join("home"));
    let source = r
        .create("Move", text(dir.path()), None, None)
        .unwrap()
        .active;
    Store::open(Path::new(&source))
        .unwrap()
        .save_project(None, "Preserved", None, None, None, None)
        .unwrap();
    let destination = dir.path().join("destination");
    fs::create_dir(&destination).unwrap();
    let moved = r.relocate(&source, text(&destination)).unwrap();
    assert_eq!(Path::new(&moved.active), destination.join("Move.sqlite"));
    assert!(!Path::new(&source).exists());
    assert_eq!(
        Store::open(Path::new(&moved.active))
            .unwrap()
            .projects()
            .unwrap()[0]
            .name,
        "Preserved"
    );
    assert!(r.relocate(&moved.active, text(&destination)).is_err());
}

#[test]
fn opening_existing_workspaces_migrates_once_and_switching_preserves_the_list() {
    let dir = tempfile::tempdir().unwrap();
    let home = dir.path().join("home");
    let r = registry(&home);
    let default = home.join("trama.sqlite");
    Store::open(&default).unwrap();
    let historical = dir.path().join("historical.sqlite");
    rusqlite::Connection::open(&historical)
        .unwrap()
        .execute_batch(include_str!("fixtures/schema-v1.sql"))
        .unwrap();
    let opened = r.open(text(&historical)).unwrap();
    assert_eq!(opened.workspaces.len(), 2);
    assert_eq!(r.open(text(&historical)).unwrap().workspaces.len(), 2);
    assert_eq!(
        Store::open(&historical).unwrap().tasks(None).unwrap()[0].title,
        "Migrated task"
    );
    r.edit(text(&historical), "Edited", Some(1), Some("star"))
        .unwrap();
    let cleared = r.edit(text(&historical), "Edited", None, None).unwrap();
    let item = cleared
        .workspaces
        .iter()
        .find(|w| w.path == text(&historical))
        .unwrap();
    assert_eq!((item.color, item.icon.as_deref()), (None, None));
    assert_eq!(r.switch(text(&default)).unwrap().active, text(&default));
    assert!(r
        .switch(text(&dir.path().join("unregistered.sqlite")))
        .is_err());
}
