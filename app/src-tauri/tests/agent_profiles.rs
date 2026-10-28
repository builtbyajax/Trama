mod common;
use common::{project, task};
use serde_json::{json, Value};
use std::path::Path;
use trama_lib::{agent::Agent, store::Store};

/// An agent session over `path`, initialized as `client`.
fn session(path: &Path, client: &str) -> Agent {
    let agent = Agent::workspace(Store::open(path).unwrap());
    agent.handle(json!({"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-06-18","clientInfo":{"name":client}}}));
    agent
}
fn call(agent: &Agent, name: &str, args: Value) -> Value {
    let reply = agent
        .handle(json!({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":name,"arguments":args}}))
        .unwrap();
    assert_eq!(reply["result"]["isError"], false, "{name}: {reply}");
    reply["result"]["structuredContent"].clone()
}
fn refused(agent: &Agent, name: &str, args: Value) -> String {
    let reply = agent
        .handle(json!({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":name,"arguments":args}}))
        .unwrap();
    assert_eq!(reply["result"]["isError"], true, "{name}: {reply}");
    reply["result"]["content"][0]["text"]
        .as_str()
        .unwrap()
        .into()
}

#[test]
fn each_session_is_its_own_profile_named_by_its_client_until_the_agent_names_it() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("t.sqlite");
    let store = Store::open(&path).unwrap();
    let p = project(&store, "Profiles");
    let first = session(&path, "claude-code");
    let second = session(&path, "claude-code");
    // Connecting alone leaves nothing behind.
    assert!(store.agent_profiles().unwrap().is_empty());
    let a = call(&first, "get_context", json!({"project_id":p.id}))["session_profile"].clone();
    let b = call(&second, "get_context", json!({"project_id":p.id}))["session_profile"].clone();
    assert_ne!(a["profile_id"], b["profile_id"]);
    assert_eq!(a["name"], "Claude Code");
    assert_ne!(
        a["color"], b["color"],
        "connected sessions get different colors"
    );
    let named = call(
        &first,
        "set_profile",
        json!({"name":"Reviewer","color":4,"shape":"ghost","eyes":"happy"}),
    );
    assert_eq!(
        (
            named["name"].as_str(),
            named["color"].as_i64(),
            named["shape"].as_str(),
            named["eyes"].as_str()
        ),
        (Some("Reviewer"), Some(4), Some("ghost"), Some("happy"))
    );
    assert!(refused(&first, "set_profile", json!({"shape":"owl"})).contains("shape"));
    // Changing only the eyes keeps the shape.
    let eyes = call(&first, "set_profile", json!({"eyes":"wink"}));
    assert_eq!(
        (eyes["shape"].as_str(), eyes["eyes"].as_str()),
        (Some("ghost"), Some("wink"))
    );
    assert!(refused(&first, "set_profile", json!({"name":"x".repeat(41)})).contains("40"));
}

#[test]
fn starting_an_any_agent_task_gives_it_to_the_session_and_ending_returns_it_to_do() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("t.sqlite");
    let store = Store::open(&path).unwrap();
    let p = project(&store, "Claim");
    let t = task(&store, &p.id, "Work", "todo");
    assert_eq!(t.agent_profile_id, None);
    let agent = session(&path, "codex-mcp-client");
    let moved = call(
        &agent,
        "move_task",
        json!({"project_id":p.id,"task_id":t.id,"status":"inProgress"}),
    );
    let profile = agent.profile().unwrap();
    assert_eq!(moved["agent_profile_id"], profile.as_str());
    call(
        &agent,
        "add_task_message",
        json!({"project_id":p.id,"task_id":t.id,"body":"A decision"}),
    );
    let messages = store.messages(&t.id, &p.id).unwrap();
    assert_eq!(
        messages[0].agent_profile_id.as_deref(),
        Some(profile.as_str())
    );
    agent.end_session().unwrap();
    let back = store.task(&t.id, &p.id).unwrap();
    assert_eq!(
        (back.status.as_str(), back.agent_profile_id.as_deref()),
        ("todo", Some(profile.as_str()))
    );
    let ended = store.agent_profile(&profile).unwrap();
    assert_eq!(ended.presence, "offline");
    assert_eq!(ended.display_name, "Codex");
    let events = store.events(&t.id, &p.id).unwrap();
    let last = events.last().unwrap();
    assert_eq!(
        (
            last.kind.as_str(),
            last.value.as_deref(),
            last.agent_profile_id.as_deref()
        ),
        ("status", Some("todo"), Some(profile.as_str()))
    );
    // The person's own tasks are left alone, and a profile that left nothing goes away.
    let reader = session(&path, "claude-code");
    call(&reader, "list_projects", json!({}));
    let reader_profile = reader.profile().unwrap();
    reader.end_session().unwrap();
    assert!(store.agent_profile(&reader_profile).is_err());
}

#[test]
fn a_resumed_session_takes_back_its_profile_only_when_nobody_else_has_it() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("t.sqlite");
    let store = Store::open(&path).unwrap();
    let p = project(&store, "Resume");
    let t = task(&store, &p.id, "Long work", "todo");
    let before = session(&path, "claude-code");
    call(&before, "set_profile", json!({"name":"Builder"}));
    call(
        &before,
        "move_task",
        json!({"project_id":p.id,"task_id":t.id,"status":"inProgress"}),
    );
    let id = before.profile().unwrap();
    let other = session(&path, "claude-code");
    assert!(refused(&other, "set_profile", json!({"profile_id":id})).contains("in use"));
    before.end_session().unwrap();
    let resumed = call(&other, "set_profile", json!({"profile_id":id}));
    assert_eq!(
        (resumed["name"].as_str(), resumed["presence"].as_str()),
        (Some("Builder"), Some("active"))
    );
    assert_eq!(other.profile().as_deref(), Some(id.as_str()));
    assert_eq!(
        store
            .task(&t.id, &p.id)
            .unwrap()
            .agent_profile_id
            .as_deref(),
        Some(id.as_str())
    );
    // Only the resumed profile remains: the one this process started had nothing.
    assert_eq!(store.agent_profiles().unwrap().len(), 1);
}

#[test]
fn the_persons_edit_wins_and_a_dead_process_ends_its_session() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("t.sqlite");
    let store = Store::open(&path).unwrap();
    let p = project(&store, "Edits");
    let t = task(&store, &p.id, "Abandoned", "todo");
    let agent = session(&path, "claude-code");
    call(
        &agent,
        "move_task",
        json!({"project_id":p.id,"task_id":t.id,"status":"inProgress"}),
    );
    let id = agent.profile().unwrap();
    let edited = store
        .edit_agent_profile(&id, Some("Mine"), 1, "slime", "angry")
        .unwrap();
    assert!(edited.edited_by_user);
    assert!(refused(&agent, "set_profile", json!({"name":"Theirs"})).contains("person edited"));
    assert_eq!(store.agent_profile(&id).unwrap().display_name, "Mine");
    // The process stops saying it's alive, as when it's killed.
    store
        .db
        .execute(
            "UPDATE agent_profiles SET alive_at=alive_at-600,active_at=active_at-600",
            [],
        )
        .unwrap();
    assert_eq!(store.agent_profile(&id).unwrap().presence, "offline");
    store.end_stale_sessions().unwrap();
    assert!(store.agent_profile(&id).unwrap().ended_at.is_some());
    assert_eq!(store.task(&t.id, &p.id).unwrap().status, "todo");
    // The process wakes up and calls again: the same profile is back, its task stays in To do.
    call(&agent, "list_projects", json!({}));
    assert_eq!(agent.profile().unwrap(), id);
    let back = store.agent_profile(&id).unwrap();
    assert!(back.ended_at.is_none());
    assert_eq!(back.presence, "active");
    assert_eq!(store.task(&t.id, &p.id).unwrap().status, "todo");
}

#[test]
fn the_person_assigns_a_profile_and_handing_it_over_clears_it() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("t.sqlite");
    let store = Store::open(&path).unwrap();
    let p = project(&store, "Assign");
    let t = task(&store, &p.id, "Specific", "todo");
    let agent = session(&path, "claude-code");
    call(&agent, "list_projects", json!({}));
    let id = agent.profile().unwrap();
    let assigned = store
        .edit_task(
            &t.id,
            trama_lib::store::TaskPatch {
                project_id: p.id.clone(),
                agent_profile_id: Some(Some(id.clone())),
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(assigned.agent_profile_id.as_deref(), Some(id.as_str()));
    let mine = call(
        &agent,
        "list_tasks",
        json!({"project_id":p.id,"agent_profile_id":id}),
    );
    assert_eq!(mine["total"], 1);
    let handed = store
        .edit_task(
            &t.id,
            trama_lib::store::TaskPatch {
                project_id: p.id.clone(),
                assignee: Some("user".into()),
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(handed.agent_profile_id, None);
    assert!(store
        .events(&t.id, &p.id)
        .unwrap()
        .iter()
        .any(|e| e.kind == "agentProfile" && e.value.as_deref() == Some(id.as_str())));
}

#[test]
fn a_deleted_profile_lets_go_of_its_tasks_and_its_session_gets_a_new_one() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("t.sqlite");
    let store = Store::open(&path).unwrap();
    let p = project(&store, "Delete");
    let t = task(&store, &p.id, "Work", "todo");
    let agent = session(&path, "claude-code");
    call(
        &agent,
        "move_task",
        json!({"project_id":p.id,"task_id":t.id,"status":"inProgress"}),
    );
    let old = agent.profile().unwrap();
    store.delete_agent_profile(&old).unwrap();
    let back = store.task(&t.id, &p.id).unwrap();
    assert_eq!(
        (back.status.as_str(), back.agent_profile_id.as_deref()),
        ("todo", None)
    );
    // The history still has its name, but it's gone from the page and can't be edited.
    let gone = store.agent_profile(&old).unwrap();
    assert!(gone.deleted && gone.presence == "offline");
    assert!(store
        .edit_agent_profile(&old, Some("Again"), 1, "blob", "dots")
        .is_err());
    // Its session goes on, as a new profile.
    let next = call(&agent, "get_context", json!({"project_id":p.id}))["session_profile"].clone();
    assert_ne!(next["profile_id"], old.as_str());
    assert_eq!(agent.profile().as_deref(), next["profile_id"].as_str());
    // One that left no history goes for good.
    let reader = session(&path, "codex");
    call(&reader, "list_projects", json!({}));
    let reader_profile = reader.profile().unwrap();
    store.delete_agent_profile(&reader_profile).unwrap();
    assert!(store.agent_profile(&reader_profile).is_err());
}
