//! Development/test transport. Not bundled with the desktop app.
use std::io::{self, Read};
fn main() {
    // Like the app's start, before anything opens a database.
    let _ = trama_lib::workspaces::organize();
    let mut input = String::new();
    let response = match io::stdin().read_to_string(&mut input) {
        Ok(_) => match serde_json::from_str::<serde_json::Value>(&input) {
            Ok(request) => match trama_lib::commands::execute(
                request["command"].as_str().unwrap_or(""),
                request["args"].clone(),
            ) {
                Ok(result) => serde_json::json!({"result":result}),
                Err(error) => serde_json::json!({"error":error}),
            },
            Err(error) => serde_json::json!({"error":error.to_string()}),
        },
        Err(error) => serde_json::json!({"error":error.to_string()}),
    };
    println!("{response}");
}
