#![cfg(feature = "agent-cli")]
mod common;
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, BTreeSet},
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::mpsc::{self, Receiver},
    time::{Duration, Instant},
};
use trama_lib::{store::Store, workspaces::Registry};

fn binary() -> PathBuf {
    std::env::var_os("TRAMA_AGENT_BIN")
        .map(PathBuf::from)
        .unwrap_or_else(|| env!("CARGO_BIN_EXE_trama-agent").into())
}
struct Mcp {
    child: Child,
    input: Option<ChildStdin>,
    lines: Receiver<String>,
    reader: Option<std::thread::JoinHandle<()>>,
    next: i64,
    calls: BTreeSet<String>,
}
impl Mcp {
    fn start(database: Option<&Path>, project: Option<&str>, home: &Path) -> Self {
        let mut command = Command::new(binary());
        command
            .env_remove("TRAMA_DB")
            .env("TRAMA_HOME", home)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());
        if let Some(path) = database {
            command.arg("--database").arg(path);
        }
        if let Some(project) = project {
            command.args(["--project-id", project]);
        } else {
            command.arg("--workspace");
        }
        let mut child = command.spawn().unwrap();
        let input = child.stdin.take();
        let output = child.stdout.take().unwrap();
        let (tx, lines) = mpsc::channel();
        let reader = std::thread::spawn(move || {
            for line in BufReader::new(output).lines() {
                if tx.send(line.unwrap()).is_err() {
                    break;
                }
            }
        });
        Self {
            child,
            input,
            lines,
            reader: Some(reader),
            next: 0,
            calls: BTreeSet::new(),
        }
    }
    fn send(&mut self, value: Value) {
        writeln!(self.input.as_mut().unwrap(), "{value}").unwrap();
        self.input.as_mut().unwrap().flush().unwrap();
    }
    fn request(&mut self, method: &str, params: Value) -> Value {
        self.next += 1;
        let id = self.next;
        self.send(json!({"jsonrpc":"2.0","id":id,"method":method,"params":params}));
        let line = self
            .lines
            .recv_timeout(Duration::from_secs(30))
            .unwrap_or_else(|error| {
                panic!("MCP request {method} ({id}) timed out after 30 seconds: {error}")
            });
        let response: Value =
            serde_json::from_str(&line).expect("stdout must contain only JSON-RPC");
        assert_eq!(response["id"], id);
        response
    }
    fn call(&mut self, name: &str, args: Value) -> Value {
        self.calls.insert(name.into());
        self.request("tools/call", json!({"name":name,"arguments":args}))
    }
    fn ok(&mut self, name: &str, args: Value) -> Value {
        let response = self.call(name, args);
        assert!(response.get("error").is_none(), "{name}: {response}");
        assert_eq!(response["result"]["isError"], false, "{name}: {response}");
        response["result"]["structuredContent"].clone()
    }
}
impl Drop for Mcp {
    fn drop(&mut self) {
        self.input.take();
        let deadline = Instant::now() + Duration::from_secs(2);
        let graceful = loop {
            match self.child.try_wait() {
                Ok(Some(status)) => break status.success(),
                Ok(None) if Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(10));
                }
                _ => {
                    let _ = self.child.kill();
                    let _ = self.child.wait();
                    break false;
                }
            }
        };
        if let Some(reader) = self.reader.take() {
            let _ = reader.join();
        }
        if !std::thread::panicking() {
            assert!(graceful, "MCP must exit successfully after stdin closes");
        }
    }
}

struct Normalize {
    root: String,
    canonical: String,
    ids: BTreeMap<String, String>,
}
impl Normalize {
    fn value(&mut self, value: Value, key: &str) -> Value {
        match value {
            Value::Object(object) => Value::Object(
                object
                    .into_iter()
                    .map(|(k, v)| {
                        let v = self.value(v, &k);
                        (k, v)
                    })
                    .collect(),
            ),
            Value::Array(items) => {
                Value::Array(items.into_iter().map(|v| self.value(v, key)).collect())
            }
            Value::Number(_) if key == "id" => json!("<request-id>"),
            Value::String(s) => {
                if let Ok(parsed) = serde_json::from_str::<Value>(&s) {
                    if parsed.is_object() || parsed.is_array() {
                        return json!(self.value(parsed, key).to_string());
                    }
                }
                if uuid::Uuid::parse_str(&s).is_ok() {
                    let next = self.ids.len() + 1;
                    return json!(self
                        .ids
                        .entry(s)
                        .or_insert_with(|| format!("<uuid-{next}>")));
                }
                if chrono::DateTime::parse_from_rfc3339(&s).is_ok() {
                    return json!("<timestamp>");
                }
                if (s.len() == 40 || s.len() == 64) && s.chars().all(|c| c.is_ascii_hexdigit()) {
                    return json!("<commit>");
                }
                if key == "version" {
                    return json!("<app-version>");
                }
                // Optional gh availability is host-specific; its concrete errors are tested
                // with the PR adapter's fake runner rather than this transport snapshot.
                if key == "unavailable" {
                    return json!("<provider unavailable>");
                }
                let mut normalized = s;
                for root in [&self.canonical, &self.root] {
                    // Git drops Windows' verbatim prefix and uses forward slashes.
                    let plain = if let Some(unc) = root.strip_prefix(r"\\?\UNC\") {
                        format!(r"\\{unc}")
                    } else {
                        root.strip_prefix(r"\\?\").unwrap_or(root).to_string()
                    };
                    for form in [root.as_str(), plain.as_str()] {
                        normalized = normalized
                            .replace(form, "<temp>")
                            .replace(&form.replace('\\', "/"), "<temp>");
                    }
                }
                json!(if normalized.contains("<temp>") {
                    normalized.replace('\\', "/")
                } else {
                    normalized
                })
            }
            other => other,
        }
    }
}

#[test]
fn snapshot_normalization_handles_windows_verbatim_and_git_paths() {
    for (root, path) in [
        (r"\\?\C:\Temp\scope", "C:/Temp/scope/repo"),
        (r"\\?\C:\Temp\scope", r"C:\Temp\scope\repo"),
        (r"\\?\C:\Temp\scope", r"\\?\C:\Temp\scope\repo"),
        (r"\\?\UNC\server\share\scope", "//server/share/scope/repo"),
        (r"\\?\UNC\server\share\scope", r"\\server\share\scope\repo"),
    ] {
        let mut normalize = Normalize {
            root: root.into(),
            canonical: root.into(),
            ids: BTreeMap::new(),
        };
        assert_eq!(normalize.value(json!(path), "root"), "<temp>/repo");
        assert_eq!(
            normalize.value(json!({"root":path}).to_string().into(), "text"),
            json!({"root":"<temp>/repo"}).to_string()
        );
        assert_eq!(normalize.value(json!("unchanged"), "title"), "unchanged");
    }
}
fn first_difference(actual: &Value, expected: &Value, path: &str) -> Option<String> {
    if actual == expected {
        return None;
    }
    match (actual, expected) {
        (Value::Object(a), Value::Object(b)) => {
            let keys = a.keys().chain(b.keys()).collect::<BTreeSet<_>>();
            keys.into_iter().find_map(|key| {
                let path = format!("{path}/{key}");
                match (a.get(key), b.get(key)) {
                    (Some(a), Some(b)) => first_difference(a, b, &path),
                    _ => Some(format!("{path}: field presence differs")),
                }
            })
        }
        (Value::Array(a), Value::Array(b)) if a.len() == b.len() => a
            .iter()
            .zip(b)
            .enumerate()
            .find_map(|(i, (a, b))| first_difference(a, b, &format!("{path}/{i}"))),
        (Value::Array(a), Value::Array(b)) => Some(format!(
            "{path}: array lengths differ ({} versus {})",
            a.len(),
            b.len()
        )),
        _ => Some(format!("{path}: actual={actual}; expected={expected}")),
    }
}

#[test]
fn snapshot_diagnostics_locate_nested_contract_changes() {
    let actual = json!({"tools":[{"name":"changed"}]});
    let expected = json!({"tools":[{"name":"original"}]});
    let difference = first_difference(&actual, &expected, "").unwrap();
    assert!(difference.starts_with("/tools/0/name:"));
    assert!(difference.contains("changed") && difference.contains("original"));
    assert!(first_difference(&expected, &expected, "").is_none());
}

fn snapshot(name: &str, value: Value, root: &Path) {
    let mut normalize = Normalize {
        root: root.display().to_string(),
        canonical: root.canonicalize().unwrap().display().to_string(),
        ids: BTreeMap::new(),
    };
    let value = normalize.value(value, "");
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(name);
    if std::env::var("UPDATE_SNAPSHOTS").as_deref() == Ok("1") {
        std::fs::write(
            &path,
            format!("{}\n", serde_json::to_string_pretty(&value).unwrap()),
        )
        .unwrap();
    }
    let expected: Value = serde_json::from_str(
        &std::fs::read_to_string(&path)
            .expect("Create the initial reviewed snapshot with UPDATE_SNAPSHOTS=1"),
    )
    .unwrap();
    if let Some(difference) = first_difference(&value, &expected, "") {
        let output = Path::new(env!("CARGO_MANIFEST_DIR")).join("target/test-results");
        std::fs::create_dir_all(&output).unwrap();
        std::fs::write(
            output.join(format!("{name}.actual.json")),
            serde_json::to_string_pretty(&value).unwrap(),
        )
        .unwrap();
        panic!("MCP contract changed at {difference}; review the actual artifact, skill and site before accepting a snapshot update");
    }
}

#[test]
fn every_tool_has_a_blackbox_contract_and_private_notes_never_leave_the_process() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("contract.sqlite");
    let repo = dir.path().join("repo");
    let commit = common::repository(&repo);
    let notes = dir.path().join("notes");
    std::fs::create_dir(&notes).unwrap();
    std::fs::write(notes.join("note.md"), "Public note").unwrap();
    let store = Store::open(&path).unwrap();
    let p = store
        .save_project(
            None,
            "Contract",
            Some(repo.display().to_string()),
            None,
            Some(notes.canonicalize().unwrap().display().to_string()),
            None,
        )
        .unwrap();
    let t = common::task(&store, &p.id, "Public task", "todo");
    store
        .add_note(&t.id, &p.id, "PRIVATE-SENTINEL-7391")
        .unwrap();
    let other = common::project(&store, "Other");
    let foreign = common::task(&store, &other.id, "Foreign", "todo");
    drop(store);
    let mut m = Mcp::start(Some(&path), None, dir.path());
    let mut replies = BTreeMap::<String, Value>::new();
    replies.insert(
        "initialize".into(),
        m.request("initialize", json!({"protocolVersion":"2025-11-25"})),
    );
    replies.insert(
        "legacy-initialize".into(),
        m.request("initialize", json!({"protocolVersion":"2024-11-05"})),
    );
    replies.insert("discover".into(), m.request("server/discover", json!({})));
    replies.insert("ping".into(), m.request("ping", json!({})));
    let unknown = m.request("unknown", json!({}));
    assert_eq!(unknown["error"]["code"], -32601);
    replies.insert("unknown-method".into(), unknown);
    let inventory = m.request("tools/list", json!({}));
    let tools = inventory["result"]["tools"].as_array().unwrap().clone();
    assert!(tools.iter().all(|t| t["inputSchema"].is_object()));
    replies.insert("workspace-tools".into(), inventory);
    m.send(json!({"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_task","arguments":{"project_id":p.id,"title":"Must not be created"}}}));
    assert_eq!(m.ok("list_tasks", json!({"project_id":p.id}))["total"], 1);
    for (label, args) in [
        ("missing", json!({})),
        ("extra", json!({"project_id":p.id,"extra":1})),
        ("type", json!({"project_id":p.id,"limit":"wrong"})),
        ("enum", json!({"project_id":p.id,"status":"wrong"})),
        ("minimum", json!({"project_id":p.id,"limit":0})),
        ("maximum", json!({"project_id":p.id,"limit":201})),
        ("uuid", json!({"project_id":"invalid"})),
    ] {
        let response = m.call("list_tasks", args);
        assert_eq!(response["result"]["isError"], true);
        replies.insert(format!("invalid-{label}"), response);
    }
    let goal=m.ok("create_goal",json!({"project_id":p.id,"name":"Outcome","description":"Synthetic","target_date":"2026-12-01"}));
    let goal_id = goal["id"].as_str().unwrap();
    replies.insert("create-goal".into(), goal.clone());
    replies.insert("update-goal".into(),m.ok("update_goal",json!({"project_id":p.id,"goal_id":goal_id,"name":"Renamed outcome","target_date":null})));
    let created = m.ok(
        "create_task",
        json!({"project_id":p.id,"title":"Lifecycle","goal_id":goal_id}),
    );
    assert_eq!(created["category"], "Feature");
    let task_id = created["id"].as_str().unwrap();
    replies.insert("create-task".into(), created.clone());
    replies.insert(
        "start-task".into(),
        m.ok(
            "move_task",
            json!({"project_id":p.id,"task_id":task_id,"status":"inProgress"}),
        ),
    );
    let message = m.ok(
        "add_task_message",
        json!({"project_id":p.id,"task_id":task_id,"body":"Progress"}),
    );
    let message_id = message["id"].as_str().unwrap();
    replies.insert("add-message".into(), message.clone());
    replies.insert("update-message".into(),m.ok("update_task_message",json!({"project_id":p.id,"task_id":task_id,"message_id":message_id,"body":"Updated progress"})));
    replies.insert(
        "delete-message".into(),
        m.ok(
            "delete_task_message",
            json!({"project_id":p.id,"task_id":task_id,"message_id":message_id}),
        ),
    );
    let check = m.ok(
        "add_task_check",
        json!({"project_id":p.id,"task_id":task_id,"title":"Verified"}),
    );
    let check_id = check["id"].as_str().unwrap();
    replies.insert("add-check".into(), check.clone());
    replies.insert(
        "update-check".into(),
        m.ok(
            "update_task_check",
            json!({"project_id":p.id,"task_id":task_id,"check_id":check_id,"is_complete":true}),
        ),
    );
    replies.insert(
        "delete-check".into(),
        m.ok(
            "delete_task_check",
            json!({"project_id":p.id,"task_id":task_id,"check_id":check_id}),
        ),
    );
    replies.insert(
        "attach-document".into(),
        m.ok(
            "attach_document",
            json!({"project_id":p.id,"task_id":task_id,"path":"note.md"}),
        ),
    );
    replies.insert(
        "list-attached-documents".into(),
        m.ok(
            "list_task_documents",
            json!({"project_id":p.id,"task_id":task_id}),
        ),
    );
    replies.insert(
        "detach-document".into(),
        m.ok(
            "detach_document",
            json!({"project_id":p.id,"task_id":task_id,"path":"note.md"}),
        ),
    );
    replies.insert("deliver-task".into(),m.ok("update_task",json!({"project_id":p.id,"task_id":task_id,"agent_summary":"Delivered","repository_branch":"test/contract","commit_hash":commit,"pull_request_url":"https://github.com/example/repository/pull/1","pull_request_number":1})));
    replies.insert(
        "review-task".into(),
        m.ok(
            "move_task",
            json!({"project_id":p.id,"task_id":task_id,"status":"review"}),
        ),
    );
    let events = m.ok(
        "read_task_events",
        json!({"project_id":p.id,"task_id":task_id}),
    );
    assert!(events["events"]
        .as_array()
        .unwrap()
        .iter()
        .all(|e| e["actor"] == "agent"));
    replies.insert("agent-events".into(), events);
    let first = m.ok("list_tasks", json!({"project_id":p.id,"limit":1}));
    assert_eq!(first["next_offset"], 1);
    let second = m.ok(
        "list_tasks",
        json!({"project_id":p.id,"limit":1,"offset":1}),
    );
    assert!(second["next_offset"].is_null());
    replies.insert("first-page".into(), first);
    replies.insert("last-page".into(), second);
    for tool in &tools {
        if tool["annotations"]["readOnlyHint"] != true {
            continue;
        }
        let name = tool["name"].as_str().unwrap();
        let properties = tool["inputSchema"]["properties"].as_object().unwrap();
        let mut args = serde_json::Map::new();
        for (key, value) in [
            ("project_id", json!(p.id)),
            ("task_id", json!(t.id)),
            ("query", json!("PRIVATE-SENTINEL-7391")),
            ("commit_id", json!(commit)),
        ] {
            if properties.contains_key(key) {
                args.insert(key.into(), value);
            }
        }
        let response = m.call(name, Value::Object(args));
        assert!(
            !response.to_string().contains("PRIVATE-SENTINEL-7391"),
            "{name} leaked private notes"
        );
        assert_eq!(response["result"]["isError"], false, "{name}: {response}");
        replies.insert(format!("read-{name}"), response);
    }
    replies.insert("clear-delivery".into(),m.ok("update_task",json!({"project_id":p.id,"task_id":task_id,"agent_summary":null,"repository_branch":null,"commit_hash":null,"pull_request_url":null,"pull_request_number":null})));
    let draft = m.ok(
        "create_task",
        json!({"project_id":p.id,"title":"Idea","status":"backlog"}),
    );
    let draft_id = draft["id"].as_str().unwrap();
    replies.insert(
        "backlog-to-todo".into(),
        m.ok(
            "move_task",
            json!({"project_id":p.id,"task_id":draft_id,"status":"todo"}),
        ),
    );
    let retired = m.call(
        "move_task",
        json!({"project_id":p.id,"task_id":draft_id,"status":"reserved"}),
    );
    assert_eq!(retired["result"]["isError"], true);
    replies.insert("retired-status".into(), retired);
    replies.insert(
        "delete-task".into(),
        m.ok("delete_task", json!({"project_id":p.id,"task_id":draft_id})),
    );
    replies.insert(
        "create-category".into(),
        m.ok(
            "create_category",
            json!({"project_id":p.id,"name":"Synthetic"}),
        ),
    );
    replies.insert(
        "rename-category".into(),
        m.ok(
            "rename_category",
            json!({"project_id":p.id,"name":"Synthetic","new_name":"Renamed"}),
        ),
    );
    replies.insert(
        "delete-category".into(),
        m.ok(
            "delete_category",
            json!({"project_id":p.id,"name":"Renamed"}),
        ),
    );
    let disposable = m.ok("create_project", json!({"name":"Disposable"}));
    let disposable_id = disposable["id"].as_str().unwrap();
    replies.insert("create-project".into(), disposable.clone());
    replies.insert(
        "update-project".into(),
        m.ok(
            "update_project",
            json!({"project_id":disposable_id,"name":"Updated disposable"}),
        ),
    );
    replies.insert(
        "delete-project".into(),
        m.ok("delete_project", json!({"project_id":disposable_id})),
    );
    assert_eq!(
        m.calls,
        tools
            .iter()
            .map(|t| t["name"].as_str().unwrap().to_string())
            .collect(),
        "Every tool must have a contract exercise"
    );
    let mut scoped = Mcp::start(Some(&path), Some(&p.id), dir.path());
    let scoped_tools = scoped.request("tools/list", json!({}));
    assert_eq!(
        scoped_tools["result"]["tools"].as_array().unwrap().len() + 2,
        tools.len()
    );
    replies.insert("project-tools".into(), scoped_tools);
    let denied = scoped.call("get_context", json!({"project_id":other.id}));
    assert_eq!(denied["result"]["isError"], true);
    replies.insert("project-argument-denied".into(), denied);
    let hidden = scoped.call("get_task", json!({"task_id":foreign.id}));
    assert_eq!(hidden["result"]["isError"], true);
    replies.insert("foreign-task-hidden".into(), hidden);
    snapshot("mcp-contract.json", json!(replies), dir.path());
}

#[test]
fn newer_database_exits_clearly_instead_of_waiting_for_the_client() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("future.sqlite");
    rusqlite::Connection::open(&path)
        .unwrap()
        .execute_batch(&format!(
            "PRAGMA user_version={};",
            trama_lib::store::SCHEMA_VERSION + 1
        ))
        .unwrap();
    let before = std::fs::read(&path).unwrap();
    let output = Command::new(binary())
        .args(["--workspace", "--database"])
        .arg(&path)
        .stdin(Stdio::null())
        .output()
        .unwrap();
    assert!(!output.status.success());
    assert!(output.stdout.is_empty());
    assert!(String::from_utf8_lossy(&output.stderr).contains("newer version of Trama"));
    assert_eq!(std::fs::read(&path).unwrap(), before);
}

#[test]
fn malformed_requests_and_unsupported_protocols_leave_the_process_usable() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("protocol.sqlite");
    let mut m = Mcp::start(Some(&path), None, dir.path());
    writeln!(m.input.as_mut().unwrap(), "not JSON").unwrap();
    m.input.as_mut().unwrap().flush().unwrap();
    let response: Value =
        serde_json::from_str(&m.lines.recv_timeout(Duration::from_secs(10)).unwrap()).unwrap();
    assert_eq!(response["error"]["code"], -32700);
    assert_eq!(
        m.request(
            "ping",
            json!({"_meta":{"io.modelcontextprotocol/protocolVersion":"unsupported"}})
        )["error"]["code"],
        -32022
    );
    assert_eq!(
        m.request(
            "ping",
            json!({"_meta":{"io.modelcontextprotocol/protocolVersion":42}})
        )["error"]["code"],
        -32602
    );
    assert_eq!(
        m.request("tools/call", json!({"name":"unknown"}))["error"]["code"],
        -32602
    );
    assert_eq!(
        m.request("tools/list", json!({"cursor":"unexpected"}))["error"]["code"],
        -32602
    );
    let modern = m.request(
        "ping",
        json!({"_meta":{"io.modelcontextprotocol/protocolVersion":trama_lib::agent::PROTOCOL}}),
    );
    assert_eq!(modern["result"]["resultType"], "complete");
    assert!(modern["result"]["_meta"].is_object());
}

#[test]
fn workspace_mode_follows_switches_but_explicit_database_remains_pinned() {
    let dir = tempfile::tempdir().unwrap();
    let home = dir.path().join("home");
    let a = dir.path().join("a.sqlite");
    let b = dir.path().join("b.sqlite");
    common::project(&Store::open(&a).unwrap(), "Alpha");
    common::project(&Store::open(&b).unwrap(), "Beta");
    let registry = Registry::at(home.clone(), None);
    registry.open(a.to_str().unwrap()).unwrap();
    registry.open(b.to_str().unwrap()).unwrap();
    registry.switch(a.to_str().unwrap()).unwrap();
    let mut following = Mcp::start(None, None, &home);
    let mut pinned = Mcp::start(Some(&a), None, &home);
    assert_eq!(
        following.ok("list_projects", json!({}))["projects"][0]["name"],
        "Alpha"
    );
    registry.switch(b.to_str().unwrap()).unwrap();
    assert_eq!(
        following.ok("list_projects", json!({}))["projects"][0]["name"],
        "Beta"
    );
    assert_eq!(
        pinned.ok("list_projects", json!({}))["projects"][0]["name"],
        "Alpha"
    );
}
