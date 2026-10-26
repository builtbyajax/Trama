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
