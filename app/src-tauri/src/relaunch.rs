use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::os::unix::fs::OpenOptionsExt;
use std::os::unix::process::CommandExt;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;
use tauri::Manager;

pub fn restart(app: &tauri::AppHandle) -> Result<(), String> {
    let executable = tauri::process::current_binary(&app.env()).map_err(|e| e.to_string())?;
    let bundle = executable
        .ancestors()
        .nth(3)
        .filter(|path| path.extension().is_some_and(|ext| ext == "app"))
        .ok_or("Restarting after an update requires an installed app bundle.")?;
    if !bundle.join("Contents/Info.plist").is_file() {
        return Err("The updated app bundle could not be found.".into());
    }

    let log_dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;
    let log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_dir.join("relaunch.log"))
        .map_err(|e| e.to_string())?;

    let cache_dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    let helper_path = cache_dir.join(format!("trama-relaunch-{}", uuid::Uuid::new_v4()));
    let mut helper = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o700)
        .open(&helper_path)
        .map_err(|e| e.to_string())?;
    let written = helper.write_all(include_bytes!(concat!(env!("OUT_DIR"), "/trama-relaunch")));
    drop(helper);
    if let Err(error) = written {
        let _ = fs::remove_file(&helper_path);
        return Err(error.to_string());
    }

    // Embed the helper so it remains available after the updater replaces our bundle.
    let mut child = match Command::new(&helper_path)
        .arg(bundle)
        .arg(std::process::id().to_string())
        .args(std::env::args_os().skip(1))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(log)
        .process_group(0)
        .spawn()
    {
        Ok(child) => child,
        Err(error) => {
            let _ = fs::remove_file(&helper_path);
            return Err(format!("Couldn't start the app relaunch helper: {error}"));
        }
    };
    let stdout = child
        .stdout
        .take()
        .ok_or("The relaunch helper has no output pipe.")?;
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut ready = String::new();
        let result = BufReader::new(stdout).read_line(&mut ready);
        let _ = tx.send(result.is_ok() && ready.trim() == "READY");
    });
    if rx.recv_timeout(Duration::from_secs(5)) != Ok(true) {
        let _ = child.kill();
        let _ = child.wait();
        let _ = fs::remove_file(&helper_path);
        return Err(
            "The app relaunch helper could not start. See relaunch.log for details.".into(),
        );
    }

    app.exit(0);
    Ok(())
}
