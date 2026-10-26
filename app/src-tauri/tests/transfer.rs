mod common;
use common::{project, task};
use std::{fs, path::Path};
use trama_lib::store::{Store, TaskPatch};

fn seeded(store: &Store, folder: &Path) -> (String, String) {
    fs::write(folder.join("attached.md"), "Public document").unwrap();
    let p = store
        .save_project(
            None,
            "Move me",
            None,
            Some(2),
            Some(folder.canonicalize().unwrap().display().to_string()),
            Some(Some("terminal".into())),
        )
        .unwrap();
    let goal = store
        .save_goal(None, &p.id, "Synthetic goal", "Outcome", Some("2027-01-01"))
        .unwrap();
    let t = task(store, &p.id, "Transferred task", "todo");
    store
        .edit_task(
            &t.id,
            TaskPatch {
                project_id: p.id.clone(),
                goal_id: Some(Some(goal.id)),
                ..Default::default()
            },
        )
        .unwrap();
    store
        .add_note(&t.id, &p.id, "Private synthetic note")
        .unwrap();
    store
        .add_message(&t.id, &p.id, "agent", "Public progress")
        .unwrap();
    store.add_check(&t.id, &p.id, "A check").unwrap();
    store
        .attach_document(&t.id, &p.id, "attached.md", "user")
        .unwrap();
    store.create_category(&p.id, "Custom").unwrap();
    (p.id, t.id)
}

#[test]
fn project_transfer_preserves_all_related_data_and_removes_the_source() {
    let dir = tempfile::tempdir().unwrap();
    let source = Store::open(&dir.path().join("source.sqlite")).unwrap();
    let target = dir.path().join("target.sqlite");
    Store::open(&target).unwrap();
    let (p, t) = seeded(&source, dir.path());
    let before = serde_json::to_value(source.task_details(&t, &p).unwrap()).unwrap();
    source.move_project_to(&p, &target).unwrap();
    assert!(source.project(&p).is_err());
    assert!(source.task(&t, &p).is_err());
    let target = Store::open(&target).unwrap();
    assert_eq!(
        serde_json::to_value(target.task_details(&t, &p).unwrap()).unwrap(),
        before
    );
    assert_eq!(target.goals(Some(&p)).unwrap()[0].name, "Synthetic goal");
    assert!(target
        .categories()
        .unwrap()
        .iter()
        .any(|c| c.project_id == p && c.name == "Custom"));
    assert_eq!(
        target.project(&p).unwrap().icon.as_deref(),
        Some("terminal")
    );
    assert!(target
        .db
        .prepare("PRAGMA foreign_key_check")
        .unwrap()
        .query([])
        .unwrap()
        .next()
        .unwrap()
        .is_none());
}

#[test]
fn duplicate_project_is_rejected_without_changes() {
    let dir = tempfile::tempdir().unwrap();
    let source = Store::open(&dir.path().join("source.sqlite")).unwrap();
    let (p, t) = seeded(&source, dir.path());
    let target = dir.path().join("target.sqlite");
    rusqlite::Connection::open(dir.path().join("source.sqlite"))
        .unwrap()
        .execute("VACUUM INTO ?1", [target.to_str().unwrap()])
        .unwrap();
    let before = serde_json::to_value(source.task_details(&t, &p).unwrap()).unwrap();
    assert!(source
        .move_project_to(&p, &target)
        .unwrap_err()
        .contains("already has"));
    assert_eq!(
        serde_json::to_value(source.task_details(&t, &p).unwrap()).unwrap(),
        before
    );
    assert_eq!(
        serde_json::to_value(Store::open(&target).unwrap().task_details(&t, &p).unwrap()).unwrap(),
        before
    );
}

#[test]
fn mid_copy_failure_rolls_back_and_detaches_the_target() {
    let dir = tempfile::tempdir().unwrap();
    let source = Store::open(&dir.path().join("source.sqlite")).unwrap();
    let target = dir.path().join("target.sqlite");
    let db = Store::open(&target).unwrap();
    db.db.execute_batch("CREATE TRIGGER fail_transfer BEFORE INSERT ON task_messages BEGIN SELECT RAISE(ABORT,'Injected failure'); END;").unwrap();
    drop(db);
    let (p, t) = seeded(&source, dir.path());
    assert!(source
        .move_project_to(&p, &target)
        .unwrap_err()
        .contains("Injected failure"));
    assert_eq!(source.task(&t, &p).unwrap().title, "Transferred task");
    let db = Store::open(&target).unwrap();
    assert!(db.project(&p).is_err());
    assert!(db.tasks(None).unwrap().is_empty());
    db.db.execute_batch("DROP TRIGGER fail_transfer;").unwrap();
    drop(db);
    source.move_project_to(&p, &target).unwrap();
    assert!(source.project(&p).is_err());
}

#[test]
fn old_target_is_migrated_and_existing_projects_survive() {
    let dir = tempfile::tempdir().unwrap();
    let source = Store::open(&dir.path().join("source.sqlite")).unwrap();
    let target = dir.path().join("target.sqlite");
    rusqlite::Connection::open(&target)
        .unwrap()
        .execute_batch(include_str!("fixtures/schema-v1.sql"))
        .unwrap();
    let p = project(&source, "New");
    task(&source, &p.id, "New task", "todo");
    source.move_project_to(&p.id, &target).unwrap();
    let target = Store::open(&target).unwrap();
    assert_eq!(target.projects().unwrap().len(), 2);
    assert_eq!(target.tasks(None).unwrap().len(), 2);
}
