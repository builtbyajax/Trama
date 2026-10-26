use std::{
    io::{self, BufRead, Write},
    path::PathBuf,
};
use trama_lib::{agent::Agent, store::Store};
fn run() -> Result<(), String> {
    let mut project = None;
    let mut workspace = false;
    let mut path = trama_lib::store::default_database_path();
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--project-id" => project = Some(args.next().ok_or("Missing project ID.")?),
            "--workspace" => workspace = true,
            "--database" => path = PathBuf::from(args.next().ok_or("Missing database path.")?),
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
    let store = Store::open(&path)?;
    let agent = if workspace {
        Agent::workspace(store)
    } else {
        let id = uuid::Uuid::parse_str(project.as_deref().unwrap())
            .map_err(|_| "Uso: trama-agent --project-id UUID [--database CAMINHO]".to_string())?;
        Agent::new(store, &id.to_string())?
    };
    let stdin = io::stdin();
    let mut stdout = io::stdout().lock();
    for line in stdin.lock().lines() {
        let line = line.map_err(|e| e.to_string())?;
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
fn main() {
    if let Err(error) = run() {
        eprintln!("TramaAgent: {error}");
        std::process::exit(1);
    }
}
