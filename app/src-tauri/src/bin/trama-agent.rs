use std::{
    io::{self, BufRead, Write},
    path::PathBuf,
};
type Database = Result<PathBuf, String>;
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
    // In workspace mode without --database, the agent follows the workspace open in the app: the
    // file is checked before each request and reopened when the person switched. A project-bound
    // agent stays with the database that holds its project.
    // Following the app, it connects even while there is no workspace: tool calls then say to create
    // one, and the request after the person does finds it.
    let follow = workspace && database.is_none();
    let mut path: Database = match database {
        Some(path) => Ok(path),
        None if follow => trama_lib::store::default_database_path(),
        None => Ok(trama_lib::store::default_database_path()?),
    };
    let mut agent = if workspace {
        workspace_agent(&path)?
    } else {
        let id = uuid::Uuid::parse_str(project.as_deref().unwrap())
            .map_err(|_| "Uso: trama-agent --project-id UUID [--database CAMINHO]".to_string())?;
        Agent::new(Store::open(path.as_ref()?)?, &id.to_string())?
    };
    let stdin = io::stdin();
    let mut stdout = io::stdout().lock();
    for line in stdin.lock().lines() {
        let line = line.map_err(|e| e.to_string())?;
        if follow {
            let active = trama_lib::store::default_database_path();
            if active != path {
                agent = workspace_agent(&active)?;
                path = active;
            }
        }
        let response = match serde_json::from_str(&line) {
            Ok(request) => agent.handle(request),
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
fn workspace_agent(path: &Database) -> Result<Agent, String> {
    match path {
        Ok(path) => Ok(Agent::workspace(Store::open(path)?)),
        Err(reason) => Agent::without_workspace(reason),
    }
}
fn main() {
    if let Err(error) = run() {
        eprintln!("TramaAgent: {error}");
        std::process::exit(1);
    }
}
