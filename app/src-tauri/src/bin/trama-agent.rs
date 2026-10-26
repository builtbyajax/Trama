use std::{
    io::{self, BufRead, Write},
    path::PathBuf,
};
use trama_lib::{agent::Agent, store::Store};
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
    let agent = if follow {
        None
    } else {
        let path = match database {
            Some(path) => path,
            None => trama_lib::store::default_database_path()?,
        };
        let store = Store::open(&path)?;
        Some(if workspace {
            Agent::workspace(store)
        } else {
            let id = uuid::Uuid::parse_str(project.as_deref().unwrap()).map_err(|_| {
                "Uso: trama-agent --project-id UUID [--database CAMINHO]".to_string()
            })?;
            Agent::new(store, &id.to_string())?
        })
    };
    let stdin = io::stdin();
    let mut stdout = io::stdout().lock();
    for line in stdin.lock().lines() {
        let line = line.map_err(|e| e.to_string())?;
        let response = match serde_json::from_str(&line) {
            Ok(request) if follow => trama_lib::store::default_database_path()
                .and_then(|path| Store::open(&path))
                .map(Agent::workspace)
                .or_else(|reason| Agent::without_workspace(&reason))?
                .handle(request),
            Ok(request) => agent.as_ref().unwrap().handle(request),
            Err(_) => Some(
                serde_json::json!({"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Parse error"}}),
            ),
        };
        if let Some(response) = response {
            writeln!(stdout, "{response}").map_err(|e| e.to_string())?;
            stdout.flush().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
fn main() {
    if let Err(error) = run() {
        eprintln!("TramaAgent: {error}");
        std::process::exit(1);
    }
}
