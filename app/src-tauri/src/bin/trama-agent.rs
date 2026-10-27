use std::{
    io::{self, BufRead, Write},
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use trama_lib::{agent::Agent, store::Store};

/// What the background thread needs to keep the session's presence up to date.
struct Session {
    path: PathBuf,
    profile: Option<String>,
}

/// While the agent thinks between calls, says every minute that the process is alive.
fn watch(session: Arc<Mutex<Session>>) {
    std::thread::spawn(move || {
        let mut beat = Instant::now();
        loop {
            std::thread::sleep(Duration::from_secs(5));
            let (path, profile) = {
                let s = session.lock().unwrap_or_else(|e| e.into_inner());
                (s.path.clone(), s.profile.clone())
            };
            if beat.elapsed() >= Duration::from_secs(60) {
                beat = Instant::now();
                if let Some(profile) = profile {
                    let _ = trama_lib::store::heartbeat(&path, &profile);
                }
            }
        }
    });
}
fn run() -> Result<(), String> {
    let mut project = None;
    let mut workspace = false;
    let mut database = None;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--project-id" => project = Some(args.next().ok_or("Missing project ID.")?),
            "--workspace" => workspace = true,
            "--database" => {
                database = Some(PathBuf::from(args.next().ok_or("Missing database path.")?))
            }
            _ => {
                return Err(
                    "Uso: trama-agent (--project-id UUID | --workspace) [--database CAMINHO]"
                        .into(),
                )
            }
        }
    }
    if workspace == project.is_some() {
        return Err(
            "Uso: trama-agent (--project-id UUID | --workspace) [--database CAMINHO]".into(),
        );
    }
    // In workspace mode without --database, the agent follows the workspace open in the app. It
    // opens it for each request and closes it after, so the person can switch, or delete it even on
    // Windows, while the agent waits. With no workspace, or one it can't open, the tool calls say
    // why and the agent stays connected. A project-bound agent keeps the database of its project.
    let follow = workspace && database.is_none();
    let fixed = if follow {
        None
    } else {
        let path = match database {
            Some(path) => path,
            None => trama_lib::store::default_database_path()?,
        };
        let store = Store::open(&path)?;
        let agent = if workspace {
            Agent::workspace(store)
        } else {
            let id = uuid::Uuid::parse_str(project.as_deref().unwrap()).map_err(|_| {
                "Uso: trama-agent --project-id UUID [--database CAMINHO]".to_string()
            })?;
            Agent::new(store, &id.to_string())?
        };
        Some((path, agent))
    };
    // What a following agent carries from one request to the next, as it reopens the file.
    let mut client = String::new();
    let mut profile: Option<String> = None;
    let mut path = fixed.as_ref().map(|(path, _)| path.clone());
    let session = Arc::new(Mutex::new(Session {
        path: path.clone().unwrap_or_default(),
        profile: None,
    }));
    watch(session.clone());
    let stdin = io::stdin();
    let mut stdout = io::stdout().lock();
    for line in stdin.lock().lines() {
        let line = line.map_err(|e| e.to_string())?;
        let opened;
        let agent = match &fixed {
            Some((_, agent)) => agent,
            None => {
                let active = trama_lib::store::default_database_path();
                if active.as_ref().ok() != path.as_ref() {
                    // The session belongs to the database it started in: it ends there, and the
                    // next call starts one in the workspace the person opened.
                    end_session(path.as_deref(), profile.take());
                    path = active.as_ref().ok().cloned();
                }
                opened = match active.and_then(|path| Store::open(&path)) {
                    Ok(store) => Agent::workspace(store).with_session(&client, profile.clone()),
                    Err(reason) => Agent::without_workspace(&reason)?,
                };
                &opened
            }
        };
        let response = match serde_json::from_str::<serde_json::Value>(&line) {
            Ok(request) => {
                let response = agent.handle(request);
                client = agent.client();
                if fixed.is_none() && path.is_some() {
                    profile = agent.profile().or(profile);
                }
                let mut s = session.lock().unwrap_or_else(|e| e.into_inner());
                s.path = path.clone().unwrap_or_default();
                s.profile = if fixed.is_some() {
                    agent.profile()
                } else {
                    profile.clone()
                };
                response
            }
            Err(_) => Some(
                serde_json::json!({"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Parse error"}}),
            ),
        };
        if let Some(response) = response {
            writeln!(stdout, "{response}").map_err(|e| e.to_string())?;
            stdout.flush().map_err(|e| e.to_string())?;
        }
    }
    // The client closed the connection: the session ends and its work goes back to To do.
    match &fixed {
        Some((_, agent)) => agent.end_session(),
        None => {
            end_session(path.as_deref(), profile);
            Ok(())
        }
    }
}
/// Ends a following agent's session in the database it started in, reopened for that.
fn end_session(path: Option<&std::path::Path>, profile: Option<String>) {
    if let (Some(path), Some(profile)) = (path, profile) {
        if let Ok(store) = Store::open(path) {
            let _ = Agent::workspace(store)
                .with_session("", Some(profile))
                .end_session();
        }
    }
}
fn main() {
    if let Err(error) = run() {
        eprintln!("TramaAgent: {error}");
        std::process::exit(1);
    }
}
