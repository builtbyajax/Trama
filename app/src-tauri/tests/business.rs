mod common;
use common::{project, task};
use std::path::Path;
use trama_lib::store::{Store, TaskInput, TaskPatch};

fn memory() -> Store {
    Store::open(Path::new(":memory:")).unwrap()
}
fn order(s: &Store, p: &str, status: &str) -> Vec<String> {
    let mut all = s
        .tasks(Some(p))
        .unwrap()
        .into_iter()
        .filter(|t| t.status == status)
        .collect::<Vec<_>>();
    all.sort_by_key(|t| t.position);
    all.into_iter().map(|t| t.title).collect()
}

#[test]
fn task_reordering_and_status_events_follow_board_rules() {
    let s = memory();
    let p = project(&s, "Board");
    let a = task(&s, &p.id, "A", "todo");
    let b = task(&s, &p.id, "B", "todo");
    let c = task(&s, &p.id, "C", "todo");
    s.move_task(&a.id, &p.id, "todo", None).unwrap();
    s.move_task(&b.id, &p.id, "todo", Some(&a.id)).unwrap();
    assert_eq!(order(&s, &p.id, "todo"), ["A", "B", "C"]);
    assert!(s
        .events(&a.id, &p.id)
        .unwrap()
        .iter()
        .all(|e| e.kind != "status"));
    s.move_task_as(&c.id, &p.id, "inProgress", Some(&a.id), "agent")
        .unwrap();
    let d = task(&s, &p.id, "D", "inProgress");
    s.move_task(&c.id, &p.id, "inProgress", Some(&d.id))
        .unwrap();
    assert_eq!(order(&s, &p.id, "inProgress"), ["D", "C"]);
    let events = s
        .events(&c.id, &p.id)
        .unwrap()
        .into_iter()
        .filter(|e| e.kind == "status")
        .collect::<Vec<_>>();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].actor.as_deref(), Some("agent"));
    assert_eq!(events[0].value.as_deref(), Some("inProgress"));
}

#[test]
fn backlog_and_the_archive_follow_the_task_lifecycle() {
    let s = memory();
    let p = project(&s, "Lifecycle");
    let idea = task(&s, &p.id, "Idea", "backlog");
    assert_eq!(
        s.move_task(&idea.id, &p.id, "todo", None).unwrap().status,
        "todo"
    );
    for status in ["preparing", "reserved"] {
        let error = s
            .move_task(&idea.id, &p.id, status, None)
            .unwrap_err()
            .to_string();
        assert!(
            error.contains("no longer exists") && error.contains("backlog"),
            "{error}"
        );
    }
    let t = task(&s, &p.id, "Archive", "todo");
    assert!(t.archived_at.is_none());
    let before = trama_lib::store::now();
    let done = s.move_task(&t.id, &p.id, "done", None).unwrap();
    let archived = done.archived_at.expect("done goes to the Archive");
    assert!((archived - before).abs() < 5.0);
    let edited = s
        .edit_task(
            &t.id,
            TaskPatch {
                project_id: p.id.clone(),
                title: Some("Renamed in the Archive".into()),
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(edited.archived_at, Some(archived));
    assert!(s
        .move_task(&t.id, &p.id, "todo", None)
        .unwrap()
        .archived_at
        .is_none());
}

#[test]
fn title_autosave_preserves_agent_status_and_nullable_delivery_can_be_cleared() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("race.sqlite");
    let user = Store::open(&path).unwrap();
    let agent = Store::open(&path).unwrap();
    let p = project(&user, "Concurrent");
    let t = task(&user, &p.id, "Original", "todo");
    agent
        .move_task_as(&t.id, &p.id, "inProgress", None, "agent")
        .unwrap();
    let result = user
        .edit_task(
            &t.id,
            TaskPatch {
                project_id: p.id.clone(),
                title: Some("New title".into()),
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(
        (&result.title, &result.status),
        (&"New title".to_string(), &"inProgress".to_string())
    );
    user.edit_task(
        &t.id,
        TaskPatch {
            project_id: p.id.clone(),
            agent_summary: Some(Some("Summary".into())),
            repository_branch: Some(Some("test/branch".into())),
            commit_hash: Some(Some("a".repeat(40))),
            pull_request_url: Some(Some("https://github.com/example/repo/pull/1".into())),
            pull_request_number: Some(Some(1)),
            ..Default::default()
        },
    )
    .unwrap();
    let patch:TaskPatch=serde_json::from_value(serde_json::json!({"projectId":p.id,"agentSummary":null,"repositoryBranch":null,"commitHash":null,"pullRequestUrl":null,"pullRequestNumber":null})).unwrap();
    let cleared = user.edit_task(&t.id, patch).unwrap();
    assert!(
        cleared.agent_summary.is_none()
            && cleared.repository_branch.is_none()
            && cleared.commit_hash.is_none()
            && cleared.pull_request_url.is_none()
            && cleared.pull_request_number.is_none()
    );
    for field in ["title", "details", "category", "assignee", "status"] {
        let mut value = serde_json::json!({"projectId":p.id});
        value[field] = serde_json::Value::Null;
        assert!(
            serde_json::from_value::<TaskPatch>(value).is_err(),
            "{field} must refuse explicit null"
        );
    }
}

#[test]
fn invalid_task_input_rolls_back_without_leaving_events() {
    let s = memory();
    let p = project(&s, "Validation");
    let base = TaskInput {
        project_id: p.id.clone(),
        title: "Valid".into(),
        category: "Feature".into(),
        assignee: "agent".into(),
        status: "todo".into(),
        ..Default::default()
    };
    for field in ["title", "category", "assignee", "status", "pr", "actor"] {
        let mut input = base.clone();
        let actor = if field == "actor" {
            "intruder"
        } else {
            "agent"
        };
        match field {
            "title" => input.title = " ".into(),
            "category" => input.category = " ".into(),
            "assignee" => input.assignee = "intruder".into(),
            "status" => input.status = "unknown".into(),
            "pr" => input.pull_request_number = Some(0),
            _ => {}
        }
        assert!(s.save_task_as(None, input, actor).is_err(), "{field}");
    }
    assert!(s.tasks(Some(&p.id)).unwrap().is_empty());
}

#[test]
fn deleting_a_goal_unlinks_tasks_and_cross_project_assignments_are_rejected() {
    let s = memory();
    let p = project(&s, "Goals");
    let other = project(&s, "Other");
    let t = task(&s, &p.id, "Task", "todo");
    let goal = s
        .save_goal(
            None,
            &p.id,
            " Goal ",
            " Description ",
            Some("2026-12-01"),
            None,
        )
        .unwrap();
    assert_eq!(
        (&goal.name, &goal.description),
        (&"Goal".to_string(), &"Description".to_string())
    );
    let edited = s
        .save_goal(Some(&goal.id), &p.id, "Updated", "New", None, None)
        .unwrap();
    assert!(edited.target_date.is_none());
    assert!(s
        .complete_goal(&goal.id, &p.id, true)
        .unwrap()
        .completed_at
        .is_some());
    assert!(s
        .complete_goal(&goal.id, &p.id, false)
        .unwrap()
        .completed_at
        .is_none());
    s.edit_task(
        &t.id,
        TaskPatch {
            project_id: p.id.clone(),
            goal_id: Some(Some(goal.id.clone())),
            ..Default::default()
        },
    )
    .unwrap();
    let foreign = s
        .save_goal(None, &other.id, "Foreign", "", None, None)
        .unwrap();
    assert!(s
        .edit_task(
            &t.id,
            TaskPatch {
                project_id: p.id.clone(),
                goal_id: Some(Some(foreign.id)),
                ..Default::default()
            }
        )
        .is_err());
    s.delete_goal(&goal.id, &p.id).unwrap();
    assert!(s.task(&t.id, &p.id).unwrap().goal_id.is_none());
    assert!(s.save_goal(None, &p.id, "", "", None, None).is_err());
    assert!(s
        .save_goal(None, &p.id, "Invalid date", "", Some("2026-02-30"), None)
        .is_err());
}

#[test]
fn goals_keep_a_version_and_the_order_the_person_gives_them() {
    let s = memory();
    let p = project(&s, "Goals");
    let first = s
        .save_goal(None, &p.id, "First", "", None, Some(" 0.4.1 "))
        .unwrap();
    let second = s.save_goal(None, &p.id, "Second", "", None, None).unwrap();
    let third = s
        .save_goal(None, &p.id, "Third", "", None, Some(""))
        .unwrap();
    assert_eq!(first.version.as_deref(), Some("0.4.1"));
    assert!(third.version.is_none());
    assert!(s
        .save_goal(None, &p.id, "Long", "", None, Some(&"9".repeat(25)))
        .is_err());
    let names =
        |goals: Vec<trama_lib::store::Goal>| goals.into_iter().map(|g| g.name).collect::<Vec<_>>();
    assert_eq!(
        names(s.goals(Some(&p.id)).unwrap()),
        ["First", "Second", "Third"]
    );
    assert_eq!(
        names(s.move_goal(&third.id, &p.id, None).unwrap()),
        ["Third", "First", "Second"]
    );
    assert_eq!(
        names(s.move_goal(&third.id, &p.id, Some(&second.id)).unwrap()),
        ["First", "Second", "Third"]
    );
    let edited = s
        .save_goal(Some(&first.id), &p.id, "First", "", None, None)
        .unwrap();
    assert!(edited.version.is_none());
    let other = project(&s, "Other");
    assert!(s.move_goal(&first.id, &other.id, None).is_err());
}

#[test]
fn category_changes_are_atomic_and_preserve_tasks() {
    let s = memory();
    let p = project(&s, "Categories");
    let a = task(&s, &p.id, "A", "todo");
    let b = task(&s, &p.id, "B", "todo");
    s.rename_category(&p.id, "Feature", "Functionality", "agent")
        .unwrap();
    assert_eq!(s.task(&a.id, &p.id).unwrap().category, "Functionality");
    assert_eq!(s.task(&b.id, &p.id).unwrap().category, "Functionality");
    assert!(s.delete_category(&p.id, "Functionality", None).is_err());
    assert_eq!(s.task(&a.id, &p.id).unwrap().category, "Functionality");
    assert_eq!(
        s.delete_category(&p.id, "Functionality", Some("Fix"))
            .unwrap()
            .moved,
        2
    );
    assert_eq!(s.task(&a.id, &p.id).unwrap().title, "A");
    assert_eq!(s.task(&a.id, &p.id).unwrap().category, "Fix");
    assert_eq!(s.default_category(&p.id).unwrap(), "Feature");
    s.create_category(&p.id, "Funcionalidade").unwrap();
    assert_eq!(s.default_category(&p.id).unwrap(), "Funcionalidade");
    assert!(s.create_category(&p.id, "fix").is_err());
}

#[test]
fn public_search_ignores_case_accents_and_private_notes() {
    let s = memory();
    let p = project(&s, "Search");
    let t = task(&s, &p.id, "Prevenção", "todo");
    s.add_note(&t.id, &p.id, "PRIVATE-SENTINEL-7391").unwrap();
    assert_eq!(s.search_public(&p.id, "PREVENCAO").unwrap().len(), 1);
    assert!(s
        .search_public(&p.id, "PRIVATE-SENTINEL-7391")
        .unwrap()
        .is_empty());
    let details = format!(
        "{}Decisão importante {}",
        "before ".repeat(40),
        "after ".repeat(40)
    );
    s.edit_task(
        &t.id,
        TaskPatch {
            project_id: p.id.clone(),
            details: Some(details),
            ..Default::default()
        },
    )
    .unwrap();
    let hits = s.search_public(&p.id, "DECISAO").unwrap();
    assert!(hits
        .iter()
        .any(|h| h.excerpt.contains("Decisão importante") && h.excerpt.len() < 250));
}

#[test]
fn desktop_search_finds_private_annotations_and_backlog_without_crossing_public_boundary() {
    let s = memory();
    let p = project(&s, "Search");
    let t = task(&s, &p.id, "Ordinary title", "backlog");
    s.add_note(&t.id, &p.id, "First annotation").unwrap();
    s.add_note(&t.id, &p.id, "Anotação particular de prevenção")
        .unwrap();
    let results = s.search("PREVENCAO").unwrap();
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].task_id, t.id);
    assert_eq!(results[0].kind, "task");
    assert!(results[0].excerpt.contains("prevenção"));
    assert!(s.search("   ").unwrap().is_empty());
    assert!(s.search("not present").unwrap().is_empty());
    assert!(s.search_public(&p.id, "PREVENCAO").unwrap().is_empty());
}
