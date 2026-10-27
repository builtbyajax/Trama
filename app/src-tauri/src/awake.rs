//! Keeps the computer from idle sleep while an agent session is active, as the person chose in
//! Preferences. Only macOS has it for now, through `caffeinate`; the lid still sleeps the Mac.
use std::process::Child;

#[derive(Default)]
pub struct KeepAwake {
    /// The running assertion and the mode it was made for.
    held: Option<(Child, String)>,
}
impl KeepAwake {
    /// Holds the assertion for `mode` (`always` or `power`) while `active`, and lets it go
    /// otherwise. `power` asks only while on AC power: `caffeinate -s` doesn't hold on battery.
    pub fn update(&mut self, mode: &str, active: bool) {
        let wanted = active && ["always", "power"].contains(&mode);
        if self
            .held
            .as_ref()
            .is_some_and(|(_, m)| !wanted || m != mode)
        {
            self.release();
        }
        if wanted && self.held.is_none() {
            self.held = hold(mode).map(|child| (child, mode.into()));
        }
    }
    pub fn is_held(&mut self) -> bool {
        // `caffeinate` may have been stopped from outside; then it's asked again next time.
        if let Some((child, _)) = &mut self.held {
            if !matches!(child.try_wait(), Ok(None)) {
                self.held = None;
            }
        }
        self.held.is_some()
    }
    pub fn release(&mut self) {
        if let Some((mut child, _)) = self.held.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}
impl Drop for KeepAwake {
    fn drop(&mut self) {
        self.release();
    }
}

#[cfg(target_os = "macos")]
fn hold(mode: &str) -> Option<Child> {
    // `-w` ties it to this process, so it ends with the MCP even if the MCP is killed.
    std::process::Command::new("/usr/bin/caffeinate")
        .args([
            if mode == "power" { "-s" } else { "-i" },
            "-w",
            &std::process::id().to_string(),
        ])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .ok()
}
#[cfg(not(target_os = "macos"))]
fn hold(_mode: &str) -> Option<Child> {
    None
}
