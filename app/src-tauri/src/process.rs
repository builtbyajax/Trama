//! Bounded CLI execution shared by the read-only Git and optional PR adapters.
use std::{
    ffi::OsString,
    io::{self, Read},
    process::{Command, Output, Stdio},
    time::{Duration, Instant},
};
pub fn program(name: &str) -> OsString {
    #[cfg(target_os = "macos")]
    {
        if let Some(path) = std::env::var_os("PATH") {
            for directory in std::env::split_paths(&path) {
                let candidate = directory.join(name);
                if candidate.is_file() {
                    return candidate.into_os_string();
                }
            }
        }
        for directory in ["/opt/homebrew/bin", "/usr/local/bin"] {
            let candidate = std::path::Path::new(directory).join(name);
            if candidate.is_file() {
                return candidate.into_os_string();
            }
        }
    }
    name.into()
}
pub fn output(command: &mut Command) -> io::Result<Output> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    let mut stdout = child.stdout.take().unwrap();
    let mut stderr = child.stderr.take().unwrap();
    let out = std::thread::spawn(move || {
        let mut bytes = vec![];
        stdout.read_to_end(&mut bytes).map(|_| bytes)
    });
    let err = std::thread::spawn(move || {
        let mut bytes = vec![];
        stderr.read_to_end(&mut bytes).map(|_| bytes)
    });
    let deadline = Instant::now() + Duration::from_secs(30);
    let mut timeout = false;
    let status = loop {
        if let Some(status) = child.try_wait()? {
            break status;
        }
        if Instant::now() >= deadline {
            timeout = true;
            let _ = child.kill();
            break child.wait()?;
        }
        std::thread::sleep(Duration::from_millis(5));
    };
    let stdout = out
        .join()
        .map_err(|_| io::Error::other("stdout reader failed"))??;
    let stderr = err
        .join()
        .map_err(|_| io::Error::other("stderr reader failed"))??;
    if timeout {
        return Err(io::Error::new(
            io::ErrorKind::TimedOut,
            "CLI response timed out",
        ));
    }
    Ok(Output {
        status,
        stdout,
        stderr,
    })
}

/// Checks whether the bundled MCP executable is still open by an agent client on Windows.
pub fn agent_is_running() -> Result<bool, String> {
    #[cfg(windows)]
    {
        let output = output(Command::new("tasklist").args([
            "/FI",
            "IMAGENAME eq trama-agent.exe",
            "/FO",
            "CSV",
            "/NH",
        ]))
        .map_err(|_| "couldn't inspect running agent processes".to_string())?;
        if !output.status.success() {
            return Err("couldn't inspect running agent processes".into());
        }
        Ok(task_list_has_agent(&String::from_utf8_lossy(
            &output.stdout,
        )))
    }
    #[cfg(not(windows))]
    {
        Ok(false)
    }
}

#[cfg(any(windows, test))]
fn task_list_has_agent(output: &str) -> bool {
    output.lines().any(|line| {
        line.trim_start()
            .to_ascii_lowercase()
            .starts_with("\"trama-agent.exe\"")
    })
}

#[cfg(test)]
mod tests {
    use super::task_list_has_agent;

    #[test]
    fn detects_the_agent_process_in_tasklist_csv() {
        assert!(task_list_has_agent(
            "\"trama-agent.exe\",\"4312\",\"Console\",\"1\",\"12,340 K\"\n"
        ));
        assert!(!task_list_has_agent(
            "INFO: No tasks are running which match the specified criteria.\n"
        ));
        assert!(!task_list_has_agent(
            "\"Trama.exe\",\"4312\",\"Console\",\"1\",\"12,340 K\"\n"
        ));
    }
}
