use rusqlite::Connection;
use trama_lib::{
    agent::Agent,
    store::{Store, SCHEMA_VERSION},
};

#[test]
fn existing_agent_refuses_tool_calls_after_database_is_migrated() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("workspace.sqlite");
    let store = Store::open(&path).unwrap();
    let project = store
        .save_project(None, "Workspace", None, None, None, None)
        .unwrap();
    let agent = Agent::new(store, &project.id).unwrap();
    let migrated_database = Connection::open(path).unwrap();
    migrated_database
        .execute_batch(&format!(
            "CREATE TABLE schema_v11_probe(id TEXT); PRAGMA user_version={};",
            SCHEMA_VERSION + 1
        ))
        .unwrap();

    let response = agent
        .handle(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": "create_task",
                "arguments": {"project_id": project.id, "title": "Must not be created"}
            }
        }))
        .unwrap();

    assert_eq!(response["result"]["isError"], true);
    assert_eq!(
        response["result"]["content"][0]["text"],
        "O Trama foi atualizado. Reinicie esta sessão do agente."
    );
    let task_count: i64 = migrated_database
        .query_row("SELECT COUNT(*) FROM tasks", [], |row| row.get(0))
        .unwrap();
    assert_eq!(task_count, 0);
}
