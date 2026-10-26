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

fn folder_of(path: &str) -> &Path {
    Path::new(path).parent().unwrap()
}

#[test]
fn a_new_home_has_no_workspace_until_one_is_created() {
    let dir = tempfile::tempdir().unwrap();
    let r = registry(&dir.path().join("home"));
    let list = r.list();
    assert!(list.workspaces.is_empty());
    assert_eq!(list.active, "");
    assert_eq!(r.active_path(), None);
    assert!(!dir.path().join("home").join("trama.sqlite").exists());
}

#[test]
fn creating_puts_each_workspace_in_its_own_folder_and_renaming_moves_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let home = dir.path().join("one");
    let other = registry(&dir.path().join("two"));
    let r = registry(&home);
    let a = r.create("Alpha", Some(2), Some("terminal")).unwrap().active;
    let id = folder_of(&a)
        .file_name()
        .unwrap()
        .to_string_lossy()
        .into_owned();
    assert_eq!(
        Path::new(&a),
        home.join("Workspaces").join(&id).join("workspace.sqlite")
    );
    assert_eq!(id.len(), 8);
    assert_eq!(id, id.to_lowercase());
    assert!(other.list().workspaces.is_empty());
    assert!(r.create("  ", None, None).is_err());
    // The name only labels the list, so the same one twice still makes two folders.
    let b = r.create("Alpha", None, None).unwrap().active;
    assert_ne!(folder_of(&a), folder_of(&b));
    let before: Vec<_> = fs::read_dir(home.join("Workspaces"))
        .unwrap()
        .map(|e| e.unwrap().path())
        .collect();
    let edited = r.edit(&a, "Renamed", Some(4), Some(" star ")).unwrap();
    let alpha = edited.workspaces.iter().find(|w| w.path == a).unwrap();
    assert_eq!(
        (&alpha.name, alpha.color, alpha.icon.as_deref()),
        (&"Renamed".to_string(), Some(4), Some("star"))
    );
    let after: Vec<_> = fs::read_dir(home.join("Workspaces"))
        .unwrap()
        .map(|e| e.unwrap().path())
        .collect();
    assert_eq!(before, after);
    assert!(Path::new(&a).is_file());
    r.remove(&a).unwrap();
    assert!(Path::new(&a).is_file());
    // The last one can leave too, and the list waits for a new one.
    let empty = r.remove(&b).unwrap();
    assert!(empty.workspaces.is_empty() && empty.active.is_empty());
    assert_eq!(r.active_path(), None);
    assert!(Path::new(&b).is_file());
    assert!(!home.join("workspaces.json.partial").exists());
}

#[test]
fn reopening_a_workspace_file_asks_for_its_name_and_keeps_its_look() {
    let dir = tempfile::tempdir().unwrap();
    let r = registry(&dir.path().join("home"));
    let a = r.create("Alpha", Some(3), Some("star")).unwrap().active;
    r.remove(&a).unwrap();
    // Every workspace file is `workspace.sqlite`, so the file can't name it.
    assert_eq!(r.open(&a, None).unwrap_err(), "The workspace needs a name.");
    assert!(r.open(&a, Some("  ")).is_err());
    assert!(r.list().workspaces.is_empty());
    let opened = r.open(&a, Some(" Again ")).unwrap();
    let again = &opened.workspaces[0];
    assert_eq!(opened.active, a);
    assert_eq!(
        (again.name.as_str(), again.color, again.icon.as_deref()),
        ("Again", Some(3), Some("star"))
    );
    // Once listed, it keeps its name.
    let reopened = r.open(&a, None).unwrap();
    assert_eq!(reopened.workspaces.len(), 1);
    assert_eq!(reopened.workspaces[0].name, "Again");
}

#[test]
fn deleting_an_inactive_workspace_removes_its_folder_with_journals_and_backups() {
    let dir = tempfile::tempdir().unwrap();
    let r = registry(&dir.path().join("home"));
    let a = r.create("Alpha", None, None).unwrap().active;
    let b = r.create("Beta", None, None).unwrap().active;
    let backups = folder_of(&a).join("Backups");
    fs::create_dir(&backups).unwrap();
    for name in [
        "workspace.sqlite.v0.3.1.schema-12.bak",
        "workspace.sqlite.v0.3.0.schema-11.bak",
    ] {
        fs::write(backups.join(name), b"synthetic").unwrap();
    }
    for suffix in ["-wal", "-shm"] {
        fs::write(format!("{a}{suffix}"), b"synthetic").unwrap();
    }
    r.delete(&a).unwrap();
    assert!(!folder_of(&a).exists());
    assert!(Path::new(&b).is_file());
    assert!(!r.list().workspaces.iter().any(|w| w.path == a));
    let empty = r.delete(&b).unwrap();
    assert!(empty.workspaces.is_empty() && empty.active.is_empty());
    assert!(!folder_of(&b).exists());
}

#[test]
fn leaving_the_open_workspace_opens_the_first_other_that_exists() {
    let dir = tempfile::tempdir().unwrap();
    let r = registry(&dir.path().join("home"));
    let a = r.create("Alpha", None, None).unwrap().active;
    let gone = r.create("Gone", None, None).unwrap().active;
    let c = r.create("Gamma", None, None).unwrap().active;
    let d = r.create("Delta", None, None).unwrap().active;
    fs::remove_dir_all(folder_of(&gone)).unwrap();
    r.switch(&a).unwrap();
    // A missing one is skipped.
    assert_eq!(r.delete(&a).unwrap().active, c);
    assert_eq!(r.remove(&c).unwrap().active, d);
    assert!(Path::new(&c).is_file());
    // Only a missing one is left, so nothing is open.
    assert_eq!(r.delete(&d).unwrap().active, "");
    assert_eq!(r.list().workspaces.len(), 1);
}

#[test]
fn deleting_keeps_what_is_not_the_workspace() {
    let dir = tempfile::tempdir().unwrap();
    let r = registry(&dir.path().join("home"));
    // A file opened from elsewhere shares its Backups folder with its neighbours.
    let loose = dir.path().join("loose.sqlite");
    Store::open(&loose).unwrap();
    let loose = text(&loose).to_string();
    r.open(&loose, None).unwrap();
    let a = r.create("Alpha", None, None).unwrap().active;
    let shared = dir.path().join("Backups");
    fs::create_dir(&shared).unwrap();
    let mine = shared.join("loose.sqlite.v0.3.1.schema-12.bak");
    let kept = [
        shared.join("neighbour.sqlite.v0.3.1.schema-12.bak"),
        shared.join("loose.sqlite.vnotes.txt"),
        shared.join("loose.sqlite.v0.3.1.schema-12.manual.bak"),
    ];
    for file in kept.iter().chain([&mine]) {
        fs::write(file, b"synthetic").unwrap();
    }
    r.switch(&a).unwrap();
    r.delete(&loose).unwrap();
    assert!(!Path::new(&loose).exists() && !mine.exists());
    assert!(kept.iter().all(|file| file.is_file()));
    // Something the person put in a workspace's folder keeps the folder.
    let b = r.create("Beta", None, None).unwrap().active;
    let note = folder_of(&a).join("note.txt");
    fs::write(&note, b"mine").unwrap();
    r.delete(&a).unwrap();
    assert!(!Path::new(&a).exists() && note.is_file());
    assert_eq!(r.list().active, b);
}

#[test]
fn active_path_falls_back_to_existing_and_explicit_database_wins() {
    let dir = tempfile::tempdir().unwrap();
    let home = dir.path().join("home");
    let missing = dir.path().join("missing.sqlite");
    let present = dir.path().join("present.sqlite");
    Store::open(&present).unwrap();
    saved(&home, Some(&missing), &[&missing, &present]);
    let r = registry(&home);
    assert_eq!(r.active_path(), Some(present.clone()));
    assert!(r.list().workspaces[0].missing);
    fs::remove_file(&present).unwrap();
    assert_eq!(r.active_path(), None);
    let pinned = dir.path().join("explicit.sqlite");
    let r = Registry::at(home, Some(pinned.clone()));
    assert_eq!(r.active_path(), Some(pinned));
    assert!(r.list().pinned);
    assert!(r.create("Denied", None, None).is_err());
    assert!(r.switch(text(&missing)).is_err());
}

#[test]
fn corrupt_registry_recovers_and_missing_workspace_cannot_be_opened() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("workspaces.json"), b"{broken").unwrap();
    let r = registry(dir.path());
    assert!(r.list().workspaces.is_empty());
    Store::open(&dir.path().join("trama.sqlite")).unwrap();
    assert_eq!(r.list().workspaces.len(), 1);
    assert_eq!(r.active_path(), Some(dir.path().join("trama.sqlite")));
    assert!(r
        .open(text(&dir.path().join("missing.sqlite")), None)
        .is_err());
}

#[test]
fn organizing_moves_loose_workspaces_with_their_pending_data_once() {
    let dir = tempfile::tempdir().unwrap();
    let home = dir.path().join("home");
    // Trama 0.3.0 kept trama.sqlite and the ones it created loose in its folder.
    let legacy = home.join("trama.sqlite");
    let teste = home.join("teste.sqlite");
    let elsewhere = dir.path().join("elsewhere.sqlite");
    fs::create_dir_all(&home).unwrap();
    // A copy of a file with data still in its journal, as a closed app can leave it.
    let source = dir.path().join("source.sqlite");
    let pending = Store::open(&source).unwrap();
    pending
        .db
        .execute_batch("PRAGMA wal_autocheckpoint=0;")
        .unwrap();
    pending
        .save_project(None, "Pending", None, None, None, None)
        .unwrap();
    fs::copy(&source, &teste).unwrap();
    fs::copy(
        format!("{}-wal", source.display()),
        format!("{}-wal", teste.display()),
    )
    .unwrap();
    for path in [&legacy, &elsewhere] {
        Store::open(path).unwrap();
    }
    saved(&home, Some(&teste), &[&legacy, &teste, &elsewhere]);
    let r = registry(&home);
    assert!(Path::new(&format!("{}-wal", teste.display())).is_file());
    assert!(r.organize().unwrap());
    let list = r.list();
    assert!(list.organized);
    let paths: Vec<_> = list
        .workspaces
        .iter()
        .map(|w| PathBuf::from(&w.path))
        .collect();
    for path in &paths[..2] {
        assert_eq!(path.file_name().unwrap(), "workspace.sqlite");
        assert_eq!(
            path.parent().unwrap().parent().unwrap(),
            home.join("Workspaces")
        );
    }
    assert_eq!(paths[2], elsewhere);
    assert_eq!(PathBuf::from(&list.active), paths[1]);
    assert!(!legacy.exists() && !teste.exists());
    assert!(!Path::new(&format!("{}-wal", teste.display())).exists());
    assert_eq!(
        Store::open(&paths[1]).unwrap().projects().unwrap()[0].name,
        "Pending"
    );
    assert!(!r.organize().unwrap());
    assert!(!r.dismiss_organized().unwrap().organized);
    assert!(!r.list().organized);
}

#[test]
fn organizing_a_legacy_home_without_a_list_and_skipping_a_pinned_one() {
    let dir = tempfile::tempdir().unwrap();
    let home = dir.path().join("home");
    fs::create_dir_all(&home).unwrap();
    let legacy = home.join("trama.sqlite");
    Store::open(&legacy).unwrap();
    assert!(!Registry::at(home.clone(), Some(legacy.clone()))
        .organize()
        .unwrap());
    assert!(legacy.is_file());
    let r = registry(&home);
    assert!(r.organize().unwrap());
    let list = r.list();
    assert_eq!(list.workspaces.len(), 1);
    assert_eq!(list.workspaces[0].name, "");
    assert_eq!(list.active, list.workspaces[0].path);
    assert!(!legacy.exists());
    // Without the list the old file is no longer seeded once it is gone.
    assert_eq!(registry(&home).list().workspaces.len(), 1);
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
    let opened = r.open(text(&historical), None).unwrap();
    assert_eq!(opened.workspaces.len(), 2);
    assert_eq!(r.open(text(&historical), None).unwrap().workspaces.len(), 2);
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
