//! MCP JSON-RPC dispatcher, with explicit project or whole-workspace scope.
mod schema;
mod tools;
use crate::store::{Result, Store};
use serde_json::{json, Value};
pub const PROTOCOL: &str = "2026-07-28";
const LEGACY: [&str; 4] = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const INSTRUCTIONS: &str = "Manage the local Trama through these tools. Read get_context/get_task_details before editing. Send only the fields you want to change; null removes optional metadata. Flow: the agent's queue is assignee=agent and status=todo; when you start, move the task to inProgress (the person sees you're working on it); post decisions, blockers and questions with add_task_message; when you deliver, fill in agent_summary and the branch/commit/PR references and move it to review, where it waits for the person. Ideas and work not yet prioritized wait in backlog (Pendências); they are not your queue. Never move a task to done unless asked: done concludes it and takes it off the board to the Archive. Plans, reports and other Markdown documents go in the project's notes folder (notes_folder in get_context) and are attached to the task with attach_document. Personal annotations are private and never accessible. The activity is a history, not a queue that starts agents. Git/PR tools only read; use external tools to run code or publish deliveries. Goals group a project's tasks toward one outcome: set goal_id on a task to count it toward one; concluding a goal is the person's decision. In workspace mode, list projects first and pass project_id to project operations. Each connection is its own agent profile, shown to the person on the tasks it holds and in the activity: at the start, call set_profile with a short name for your role (color, shape and eyes are optional) and keep its profile_id; after a context reset or in a resumed session, call set_profile with that profile_id to continue as the same profile. A task you move to inProgress becomes yours; when your session ends, the tasks you had in progress go back to To do, still yours.";
pub struct Agent {
    store: Store,
    project_id: Option<String>,
    /// Why there is no database to work on: every tool call answers with it.
    unavailable: Option<String>,
    /// The MCP client's name from `initialize`, the default name of the session's profile.
    client: std::cell::RefCell<String>,
}
impl Agent {
    pub fn new(store: Store, project_id: &str) -> Result<Self> {
        let project = store.project(project_id)?;
        Ok(Self {
            store,
            project_id: Some(project.id),
            unavailable: None,
            client: Default::default(),
        })
    }
    pub fn workspace(store: Store) -> Self {
        Self {
            store,
            project_id: None,
            unavailable: None,
            client: Default::default(),
        }
    }
    /// Connects and lists the tools without a workspace to work on; each tool call says `reason`.
    pub fn without_workspace(reason: &str) -> Result<Self> {
        Ok(Self {
            store: Store::open(std::path::Path::new(":memory:"))?,
            project_id: None,
            unavailable: Some(reason.into()),
            client: Default::default(),
        })
    }
    /// Carries the client's name and the session's profile into an agent that reopened the file.
    pub fn with_session(self, client: &str, profile: Option<String>) -> Self {
        *self.client.borrow_mut() = client.into();
        self.store.adopt_session(profile);
        self
    }
    pub fn client(&self) -> String {
        self.client.borrow().clone()
    }
    /// The session's profile, once a tool was called.
    pub fn profile(&self) -> Option<String> {
        self.store.session_profile()
    }
    /// The process is closing: its session ends, and its work in progress goes back to To do.
    pub fn end_session(&self) -> Result<()> {
        self.store.end_session()
    }
    /// The first tool call starts the session; connecting and listing tools alone doesn't.
    fn session(&self) -> Result<()> {
        // None yet, or the person deleted it in the app: a new one.
        if !self.store.touch_session()? {
            self.store.start_session(&self.client.borrow())?;
        }
        Ok(())
    }
    pub fn handle(&self, request: Value) -> Option<Value> {
        let id = request.get("id").cloned().unwrap_or(Value::Null);
        if !request.is_object() || request["jsonrpc"] != "2.0" || !request["method"].is_string() {
            return Some(error(Value::Null, -32600, "Invalid Request"));
        }
        // MCP notifications cannot invoke request-only operations or trigger mutations.
        request.get("id")?;
        if !(id.is_string() || id.as_i64().is_some()) {
            return Some(error(Value::Null, -32600, "Invalid request ID"));
        }
        let method = request["method"].as_str().unwrap();
        if request.get("params").is_some_and(|p| !p.is_object()) {
            return Some(error(id, -32602, "Params must be an object"));
        }
        let version =
            request["params"]["_meta"]["io.modelcontextprotocol/protocolVersion"].as_str();
        if let Some(v) = request["params"]["_meta"].get("io.modelcontextprotocol/protocolVersion") {
            if !v.is_string() {
                return Some(error(id, -32602, "Protocol version must be a string"));
            }
        }
        if version.is_some_and(|v| v != PROTOCOL && !LEGACY.contains(&v)) {
            let mut e = error(id, -32022, "Unsupported protocol version");
            e["error"]["data"] = json!({"requested":version,"supported":supported()});
            return Some(e);
        }
        let modern = version == Some(PROTOCOL) || method == "server/discover";
        // Without initialize, the modern protocol names the client on each request.
        if let Some(name) =
            request["params"]["_meta"]["io.modelcontextprotocol/clientInfo"]["name"].as_str()
        {
            *self.client.borrow_mut() = name.chars().take(80).collect();
        }
        let mut result = match method {
            "server/discover" => {
                json!({"supportedVersions":supported(),"capabilities":{"tools":{"listChanged":false}},"instructions":INSTRUCTIONS,"ttlMs":0,"cacheScope":"private"})
            }
            "initialize" => {
                let Some(requested) = request["params"]["protocolVersion"].as_str() else {
                    return Some(error(id, -32602, "Protocol version is required"));
                };
                if let Some(name) = request["params"]["clientInfo"]["name"].as_str() {
                    *self.client.borrow_mut() = name.chars().take(80).collect();
                }
                let negotiated = if LEGACY.contains(&requested) {
                    requested
                } else {
                    LEGACY[0]
                };
                json!({"protocolVersion":negotiated,"capabilities":{"tools":{"listChanged":false}},"serverInfo":server_info(),"instructions":INSTRUCTIONS})
            }
            "ping" => json!({}),
            "tools/list" => {
                if request["params"].get("cursor").is_some() {
                    return Some(error(id, -32602, "No further tool pages"));
                }
                let mut value = json!({"tools":schema::tools(self.project_id.is_none())});
                if modern {
                    value["ttlMs"] = json!(0);
                    value["cacheScope"] = json!("private");
                }
                value
            }
            "tools/call" => {
                let Some(name) = request["params"]["name"].as_str() else {
                    return Some(error(id, -32602, "Tool name is required"));
                };
                let definitions = schema::tools(self.project_id.is_none());
                let Some(definition) = definitions.iter().find(|t| t["name"] == name) else {
                    return Some(error(id, -32602, "Unknown tool"));
                };
                let empty = json!({});
                let arguments = request["params"].get("arguments").unwrap_or(&empty);
                if !arguments.is_object() {
                    return Some(error(id, -32602, "Arguments must be an object"));
                }
                let outcome = self
                    .unavailable
                    .clone()
                    .map_or(Ok(()), Err)
                    .and_then(|_| self.store.check_supported_schema())
                    .and_then(|_| schema::validate(arguments, &definition["inputSchema"]))
                    .and_then(|_| self.session())
                    .and_then(|_| self.execute(name, arguments.as_object().unwrap()));
                match outcome {
                    Ok(value) => {
                        json!({"content":[{"type":"text","text":value.to_string()}],"structuredContent":value,"isError":false})
                    }
                    Err(message) => {
                        json!({"content":[{"type":"text","text":message}],"isError":true})
                    }
                }
            }
            _ => return Some(error(id, -32601, "Method not found")),
        };
        if modern {
            result["resultType"] = json!("complete");
            result["_meta"] = json!({"io.modelcontextprotocol/serverInfo":server_info()});
        }
        Some(json!({"jsonrpc":"2.0","id":id,"result":result}))
    }
}
fn server_info() -> Value {
    json!({"name":"trama-agent-bridge","version":env!("CARGO_PKG_VERSION")})
}
fn supported() -> Vec<&'static str> {
    std::iter::once(PROTOCOL).chain(LEGACY).collect()
}
fn error(id: Value, code: i64, message: &str) -> Value {
    json!({"jsonrpc":"2.0","id":id,"error":{"code":code,"message":message}})
}
