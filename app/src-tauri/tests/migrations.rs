use rusqlite::{types::Value, Connection};
use std::{
    fs,
    sync::{Arc, Barrier},
};
use trama_lib::{
    agent::Agent,
    store::{Store, SCHEMA_VERSION},
};

const FIXTURES: [&str; 11] = [
    include_str!("fixtures/schema-v1.sql"),
    include_str!("fixtures/schema-v2.sql"),
    include_str!("fixtures/schema-v3.sql"),
    include_str!("fixtures/schema-v4.sql"),
    include_str!("fixtures/schema-v5.sql"),
    include_str!("fixtures/schema-v6.sql"),
    include_str!("fixtures/schema-v7.sql"),
    include_str!("fixtures/schema-v8.sql"),
    include_str!("fixtures/schema-v9.sql"),
    include_str!("fixtures/schema-v10.sql"),
    include_str!("fixtures/schema-v11.sql"),
];
const V11: &str = include_str!("fixtures/schema-v11.sql");

fn strings(db: &Connection, query: &str) -> Vec<String> {
    db.prepare(query)
        .unwrap()
        .query_map([], |r| r.get(0))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap()
}
fn rows(db: &Connection, table: &str, columns: &[String]) -> Vec<Vec<Value>> {
    let names = columns
        .iter()
        .map(|c| format!("\"{c}\""))
        .collect::<Vec<_>>()
        .join(",");
    db.prepare(&format!("SELECT {names} FROM \"{table}\""))
        .unwrap()
        .query_map([], |r| (0..columns.len()).map(|i| r.get(i)).collect())
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap()
}

fn backups(path: &std::path::Path) -> Vec<std::path::PathBuf> {
    let prefix = format!("{}.v", path.file_name().unwrap().to_string_lossy());
    let Ok(entries) = fs::read_dir(path.parent().unwrap().join("Backups")) else {
        return Vec::new();
    };
    let mut paths = entries
        .map(|e| e.unwrap().path())
        .filter(|p| {
            let name = p.file_name().unwrap().to_string_lossy();
            name.starts_with(&prefix) && name.ends_with(".bak")
        })
        .collect::<Vec<_>>();
    paths.sort();
    paths
}

#[test]
fn migration_backup_preserves_the_old_schema_and_all_committed_wal_data() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("team's.sqlite");
    let db = Connection::open(&path).unwrap();
    db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;")
        .unwrap();
    db.execute_batch(V11).unwrap();
    db.execute_batch("INSERT INTO settings VALUES('pending-wal','Data in WAL');")
        .unwrap();
    assert!(
        fs::metadata(format!("{}-wal", path.display()))
            .unwrap()
            .len()
            > 0
    );
    let original = strings(&db, "SELECT name FROM sqlite_schema WHERE type='table'")
        .into_iter()
        .map(|table| {
            let columns = strings(
                &db,
                &format!("SELECT name FROM pragma_table_info('{table}')"),
            );
            let data = rows(&db, &table, &columns);
            (table, columns, data)
        })
        .collect::<Vec<_>>();
    let store = Store::open(&path).unwrap();
    assert_eq!(
        store
            .db
            .query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        SCHEMA_VERSION
    );
    let copies = backups(&path);
    assert_eq!(copies.len(), 1);
    assert!(
        copies[0].file_name().unwrap().to_string_lossy()
            == format!("team's.sqlite.v{}.schema-11.bak", env!("CARGO_PKG_VERSION"))
    );
    let copy = Connection::open_with_flags(&copies[0], rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
        .unwrap();
    assert_eq!(
        copy.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        11
    );
    for (table, columns, expected) in original {
        assert_eq!(
            rows(&copy, &table, &columns),
            expected,
            "backup lost {table} data"
        );
    }
    assert_eq!(strings(&copy, "PRAGMA integrity_check"), ["ok"]);
    assert!(strings(&copy, "PRAGMA foreign_key_check").is_empty());
    drop(store);
    drop(db);
    Store::open(&path).unwrap();
    assert_eq!(
        backups(&path),
        copies,
        "an up-to-date database needs no new backup"
    );
}

#[test]
fn new_and_current_databases_do_not_create_backups() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("new.sqlite");
    Store::open(&path).unwrap();
    Store::open(&path).unwrap();
    assert!(backups(&path).is_empty());
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
}

#[test]
fn four_upgrades_retain_only_the_three_latest_backups_of_that_workspace() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("trama.sqlite");
    let folder = dir.path().join("Backups");
    fs::create_dir(&folder).unwrap();
    let unrelated = folder.join("other.sqlite.v0.3.0.schema-1.bak");
    let invalid = folder.join("trama.sqlite.v0.3.0.schema-manual.bak");
    fs::write(&unrelated, "keep other workspace").unwrap();
    fs::write(&invalid, "keep unrecognized file").unwrap();
    for version in 8..=11 {
        if path.exists() {
            fs::remove_file(&path).unwrap();
        }
        Connection::open(&path)
            .unwrap()
            .execute_batch(FIXTURES[version - 1])
            .unwrap();
        Store::open(&path).unwrap();
        let copies = backups(&path)
            .into_iter()
            .filter(|p| p != &invalid)
            .collect::<Vec<_>>();
        assert_eq!(copies.len(), (version - 7).min(3));
        let newest = copies
            .iter()
            .find(|p| {
                p.file_name()
                    .unwrap()
                    .to_string_lossy()
                    .contains(&format!(".schema-{version}."))
            })
            .unwrap();
        fs::OpenOptions::new()
            .write(true)
            .open(newest)
            .unwrap()
            .set_modified(std::time::UNIX_EPOCH + std::time::Duration::from_secs(version as u64))
            .unwrap();
    }
    let versions = backups(&path)
        .into_iter()
        .filter(|p| p != &invalid)
        .map(|p| {
            Connection::open(p)
                .unwrap()
                .query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
                .unwrap()
        })
        .collect::<Vec<_>>();
    assert_eq!(versions.len(), 3);
    assert!(versions.contains(&9) && versions.contains(&10) && versions.contains(&11));
    assert_eq!(
        fs::read_to_string(unrelated).unwrap(),
        "keep other workspace"
    );
    assert_eq!(
        fs::read_to_string(invalid).unwrap(),
        "keep unrecognized file"
    );
}

#[test]
fn failed_migration_retries_keep_existing_backups_intact() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("broken.sqlite");
    let db = Connection::open(&path).unwrap();
    db.execute_batch(FIXTURES[0]).unwrap();
    db.execute_batch("CREATE TABLE task_categories(unexpected TEXT);")
        .unwrap();
    drop(db);
    assert!(Store::open(&path).is_err());
    let original_path = backups(&path).pop().unwrap();
    let original_bytes = fs::read(&original_path).unwrap();
    assert!(Store::open(&path).is_err());
    assert_eq!(backups(&path).len(), 2);
    assert_eq!(fs::read(original_path).unwrap(), original_bytes);
    for copy in backups(&path) {
        let db = Connection::open(copy).unwrap();
        assert_eq!(
            db.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(strings(&db, "PRAGMA integrity_check"), ["ok"]);
    }
}

#[cfg(unix)]
#[test]
fn backup_failure_aborts_before_any_migration() {
    use std::os::unix::fs::PermissionsExt;
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("readonly-folder.sqlite");
    let db = Connection::open(&path).unwrap();
    db.execute_batch("PRAGMA journal_mode=WAL;").unwrap();
    db.execute_batch(V11).unwrap();
    let permissions = fs::metadata(dir.path()).unwrap().permissions();
    fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o500)).unwrap();
    let result = Store::open(&path);
    fs::set_permissions(dir.path(), permissions).unwrap();
    let error = result.err().expect("a backup requires a writable folder");
    assert!(error.contains("Could not save the backup"), "{error}");
    assert!(error.contains("database was not migrated"), "{error}");
    assert_eq!(
        db.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        11
    );
    assert!(backups(&path).is_empty());
    assert!(!fs::read_dir(dir.path()).unwrap().any(|e| e
        .unwrap()
        .path()
        .extension()
        .is_some_and(|ext| ext == "partial")));
}

#[cfg(feature = "agent-cli")]
#[test]
fn relative_database_paths_retain_three_backups() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("relative.sqlite");
    for version in 8..=11 {
        if path.exists() {
            fs::remove_file(&path).unwrap();
        }
        Connection::open(&path)
            .unwrap()
            .execute_batch(FIXTURES[version - 1])
            .unwrap();
        let output = std::process::Command::new(env!("CARGO_BIN_EXE_trama-agent"))
            .current_dir(dir.path())
            .args(["--workspace", "--database", "relative.sqlite"])
            .stdin(std::process::Stdio::null())
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert_eq!(backups(&path).len(), (version - 7).min(3));
    }
}

#[cfg(unix)]
#[test]
fn backup_preserves_database_file_permissions() {
    use std::os::unix::fs::PermissionsExt;
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("private.sqlite");
    Connection::open(&path).unwrap().execute_batch(V11).unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();
    Store::open(&path).unwrap();
    let copy = backups(&path).pop().unwrap();
    assert_eq!(
        fs::metadata(copy).unwrap().permissions().mode() & 0o777,
        0o600
    );
}

#[cfg(feature = "agent-cli")]
#[test]
fn app_and_mcp_process_share_one_migration_backup() {
    for _ in 0..5 {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("shared.sqlite");
        Connection::open(&path).unwrap().execute_batch(V11).unwrap();
        let child = std::process::Command::new(env!("CARGO_BIN_EXE_trama-agent"))
            .args(["--workspace", "--database"])
            .arg(&path)
            .stdin(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .unwrap();
        Store::open(&path).unwrap();
        let output = child.wait_with_output().unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert_eq!(backups(&path).len(), 1);
    }
}

#[test]
fn empty_database_has_latest_schema_and_foreign_keys() {
    let store = Store::open(std::path::Path::new(":memory:")).unwrap();
    assert_eq!(
        store
            .db
            .pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
            .unwrap(),
        SCHEMA_VERSION
    );
    assert_eq!(
        strings(
            &store.db,
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ),
        [
            "goals",
            "projects",
            "settings",
            "task_categories",
            "task_checks",
            "task_documents",
            "task_events",
            "task_messages",
            "task_notes",
            "tasks"
        ]
    );
    assert_eq!(
        store
            .db
            .pragma_query_value(None, "foreign_keys", |r| r.get::<_, i64>(0))
            .unwrap(),
        1
    );
}

#[test]
fn drafts_and_reserved_become_backlog_in_order_with_their_history() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("v11.sqlite");
    let db = Connection::open(&path).unwrap();
    db.execute_batch(V11).unwrap();
    let project = "00000000-0000-4000-8000-000000000001";
    for (id, status, position) in [
        ("reserved-a", "reserved", 0),
        ("reserved-b", "reserved", 1),
        ("draft-a", "preparing", 0),
        ("draft-b", "preparing", 1),
    ] {
        db.execute(
            "INSERT INTO tasks(id,project_id,title,category,assignee,status,created_at,updated_at,position) VALUES(?1,?2,?1,'Feature','agent',?3,1.0,1.0,?4)",
            rusqlite::params![id, project, status, position],
        )
        .unwrap();
    }
    db.execute_batch(
        "INSERT INTO task_events VALUES('moved','draft-a','user','status','preparing',3.0);
INSERT INTO task_messages VALUES('draft-message','draft-a','user','Kept with the draft',3.0);",
    )
    .unwrap();
    drop(db);
    let store = Store::open(&path).unwrap();
    assert_eq!(
        strings(
            &store.db,
            "SELECT id FROM tasks WHERE status='backlog' ORDER BY position"
        ),
        ["reserved-a", "reserved-b", "draft-a", "draft-b"]
    );
    assert_eq!(
        strings(&store.db, "SELECT value FROM task_events WHERE id='moved'"),
        ["backlog"]
    );
    assert_eq!(
        strings(
            &store.db,
            "SELECT body FROM task_messages WHERE task_id='draft-a'"
        ),
        ["Kept with the draft"]
    );
    assert_eq!(
        strings(&store.db, "SELECT body FROM task_notes"),
        ["Private legacy note"]
    );
    assert!(store
        .db
        .execute("UPDATE tasks SET status='preparing' WHERE id='draft-a'", [])
        .is_err());
    assert!(strings(&store.db, "PRAGMA integrity_check") == ["ok"]);
}

#[test]
fn backlog_migration_accepts_the_spaced_schema_of_the_first_releases() {
    // Databases created by the first releases keep the table text as typed, with spaces.
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("spaced.sqlite");
    let db = Connection::open(&path).unwrap();
    db.execute_batch(&V11.replace(
        "CHECK(status IN('todo','inProgress','review','done','preparing','reserved'))",
        "CHECK (status IN ('todo', 'inProgress', 'review', 'done', 'preparing', 'reserved'))",
    ))
    .unwrap();
    db.execute(
        "INSERT INTO tasks(id,project_id,title,category,assignee,status,created_at,updated_at) VALUES('spaced','00000000-0000-4000-8000-000000000001','Spaced','Feature','agent','reserved',1.0,1.0)",
        [],
    )
    .unwrap();
    drop(db);
    let store = Store::open(&path).unwrap();
    assert_eq!(
        strings(&store.db, "SELECT status FROM tasks WHERE id='spaced'"),
        ["backlog"]
    );
    assert!(strings(
        &store.db,
        "SELECT sql FROM sqlite_schema WHERE name='tasks'"
    )[0]
    .contains("CHECK(status IN('backlog','todo','inProgress','review','done'))"));
    assert!(store
        .db
        .execute("UPDATE tasks SET status='reserved' WHERE id='spaced'", [])
        .is_err());
    assert!(strings(&store.db, "PRAGMA integrity_check") == ["ok"]);
}

#[test]
fn historical_fixtures_upgrade_without_losing_existing_rows() {
    assert_eq!(
        FIXTURES.len() as i64,
        SCHEMA_VERSION - 1,
        "Add a frozen fixture for the previous schema when adding a migration"
    );
    for (index, fixture) in FIXTURES.iter().enumerate() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("historical.sqlite");
        let db = Connection::open(&path).unwrap();
        db.execute_batch(fixture).unwrap();
        let version: i64 = db
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .unwrap();
        assert_eq!(version, index as i64 + 1);
        let records = strings(&db, "SELECT name FROM sqlite_master WHERE type='table'")
            .into_iter()
            .map(|table| {
                let columns = strings(
                    &db,
                    &format!("SELECT name FROM pragma_table_info('{table}')"),
                )
                .into_iter()
                .filter(|c| !(table == "tasks" && c == "notes"))
                .collect::<Vec<_>>();
                let data = rows(&db, &table, &columns);
                (table, columns, data)
            })
            .collect::<Vec<_>>();
        drop(db);
        let upgraded = Store::open(&path).unwrap();
        for (table, columns, original) in records {
            let current = rows(&upgraded.db, &table, &columns);
            for row in original {
                assert!(
                    current.contains(&row),
                    "schema {version}: lost {table} row {row:?}"
                );
            }
        }
        assert!(strings(&upgraded.db, "PRAGMA foreign_key_check").is_empty());
        if version >= 3 {
            assert_eq!(
                strings(&upgraded.db, "SELECT body FROM task_notes"),
                ["Private legacy note"]
            );
        }
        assert_eq!(
            upgraded
                .db
                .pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
                .unwrap(),
            SCHEMA_VERSION
        );
    }
}

#[test]
fn newer_database_is_refused_without_altering_its_file_or_journal() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("future.sqlite");
    let db = Connection::open(&path).unwrap();
    db.execute_batch(&format!("CREATE TABLE future_data(secret TEXT); INSERT INTO future_data VALUES('preserved'); PRAGMA user_version={};",SCHEMA_VERSION+1)).unwrap();
    drop(db);
    let before = fs::read(&path).unwrap();
    let error = Store::open(&path)
        .err()
        .expect("must refuse a newer schema");
    assert_eq!(
        error,
        "This database uses a newer version of Trama. Update the app."
    );
    assert_eq!(fs::read(&path).unwrap(), before);
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
}

#[test]
fn simultaneous_openers_migrate_legacy_notes_only_once() {
    let dir = tempfile::tempdir().unwrap();
    for round in 0..25 {
        let path = dir.path().join(format!("concurrent-{round}.sqlite"));
        Connection::open(&path)
            .unwrap()
            .execute_batch(FIXTURES[2])
            .unwrap();
        let barrier = Arc::new(Barrier::new(2));
        let threads = (0..2)
            .map(|_| {
                let barrier = barrier.clone();
                let path = path.clone();
                std::thread::spawn(move || {
                    barrier.wait();
                    Store::open(&path).map(|_| ())
                })
            })
            .collect::<Vec<_>>();
        for thread in threads {
            thread
                .join()
                .unwrap()
                .unwrap_or_else(|e| panic!("round {round}: {e}"));
        }
        assert_eq!(backups(&path).len(), 1, "round {round}: duplicate backups");
        let store = Store::open(&path).unwrap();
        assert_eq!(
            strings(&store.db, "SELECT body FROM task_notes"),
            ["Private legacy note"]
        );
    }
}

#[test]
fn mcp_context_advertises_the_schema_it_actually_uses() {
    let store = Store::open(std::path::Path::new(":memory:")).unwrap();
    let project = store
        .save_project(None, "Synthetic", None, None, None, None)
        .unwrap();
    let actual: i64 = store
        .db
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .unwrap();
    let agent = Agent::workspace(store);
    let response=agent.handle(serde_json::json!({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_context","arguments":{"project_id":project.id}}})).unwrap();
    assert_eq!(response["result"]["isError"], false);
    assert_eq!(
        response["result"]["structuredContent"]["schema_version"],
        actual
    );
}

#[test]
fn invalid_version_is_reported_without_panicking() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("invalid.sqlite");
    Connection::open(&path)
        .unwrap()
        .execute_batch("PRAGMA user_version=-1;")
        .unwrap();
    assert!(Store::open(&path)
        .err()
        .unwrap()
        .contains("invalid schema version"));
}

#[test]
fn failed_migration_rolls_back_all_schema_changes() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("broken.sqlite");
    let db = Connection::open(&path).unwrap();
    db.execute_batch(FIXTURES[0]).unwrap();
    // v2 succeeds; v3 must fail, rolling v2 back as part of the same transaction.
    db.execute_batch("CREATE TABLE task_categories(unexpected TEXT);")
        .unwrap();
    drop(db);
    assert!(Store::open(&path).is_err());
    let db = Connection::open(&path).unwrap();
    assert_eq!(
        db.pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
            .unwrap(),
        1
    );
    assert!(!strings(&db, "SELECT name FROM pragma_table_info('tasks')")
        .contains(&"repository_branch".to_string()));
    assert_eq!(strings(&db, "SELECT title FROM tasks"), ["Migrated task"]);
}

#[test]
fn refusing_a_newer_wal_database_does_not_checkpoint_its_pending_data() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("live.sqlite");
    let db = Connection::open(&source).unwrap();
    db.execute_batch(&format!("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE future_data(value TEXT); INSERT INTO future_data VALUES('preserved'); PRAGMA user_version={};", SCHEMA_VERSION + 1)).unwrap();
    let path = dir.path().join("future-wal.sqlite");
    let wal = format!("{}-wal", path.display());
    fs::copy(&source, &path).unwrap();
    fs::copy(format!("{}-wal", source.display()), &wal).unwrap();
    drop(db);
    let before_db = fs::read(&path).unwrap();
    let before_wal = fs::read(&wal).unwrap();
    assert!(Store::open(&path).err().unwrap().contains("newer version"));
    assert!(
        fs::read(&path).unwrap() == before_db,
        "refusal must not checkpoint"
    );
    assert!(
        fs::read(&wal).unwrap() == before_wal,
        "pending WAL must remain intact"
    );
}

#[test]
fn done_tasks_move_to_the_archive_with_the_time_they_were_done() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("archive.sqlite");
    let db = Connection::open(&path).unwrap();
    db.execute_batch(FIXTURES[9]).unwrap();
    // One done task with its move in the history, one without, one archived by hand, and an open
    // task left with a stale archive time.
    db.execute_batch("INSERT INTO tasks(id,project_id,title,category,assignee,status,created_at,updated_at,position) VALUES
('done-with-event','00000000-0000-4000-8000-000000000001','Done with event','Feature','agent','done',1.0,50.0,0),
('done-without-event','00000000-0000-4000-8000-000000000001','Done without event','Feature','agent','done',1.0,40.0,1);
INSERT INTO tasks(id,project_id,title,category,assignee,status,created_at,updated_at,position,archived_at) VALUES
('done-by-hand','00000000-0000-4000-8000-000000000001','Archived by hand','Feature','user','done',1.0,30.0,2,35.0),
('open-stale','00000000-0000-4000-8000-000000000001','Open','Feature','user','todo',1.0,20.0,3,25.0);
INSERT INTO task_events VALUES('to-done-1','done-with-event','agent','status','done',10.0),('to-review','done-with-event','agent','status','review',12.0),('to-done-2','done-with-event','user','status','done',15.0),('hand-done','done-by-hand','user','status','done',28.0);").unwrap();
    drop(db);
    let store = Store::open(&path).unwrap();
    let archived = |id: &str| -> Option<f64> {
        store
            .db
            .query_row("SELECT archived_at FROM tasks WHERE id=?", [id], |r| {
                r.get(0)
            })
            .unwrap()
    };
    assert_eq!(archived("done-with-event"), Some(15.0));
    assert_eq!(archived("done-without-event"), Some(40.0));
    assert_eq!(archived("done-by-hand"), Some(28.0));
    assert_eq!(archived("open-stale"), None);
    assert_eq!(archived("00000000-0000-4000-8000-000000000002"), None);
    assert!(strings(
        &store.db,
        "SELECT name FROM sqlite_master WHERE type='trigger' AND name='tasks_unarchive'"
    )
    .is_empty());
}
