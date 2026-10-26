//! Optional PR provider, independent of the local Git history.
use crate::store::Result;
use serde::Serialize;
use serde_json::Value;
use std::path::Path;
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequest {
    pub number: i64,
    pub title: String,
    pub state: String,
    pub url: String,
    pub head_branch: String,
    pub base_branch: String,
    pub review_decision: Option<String>,
    pub checks: Vec<String>,
    /// The commit the merge left on the base branch: the squash, the merge commit or the last
    /// rebased commit.
    pub merge_commit: Option<String>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequests {
    pub items: Vec<PullRequest>,
    pub unavailable: Option<String>,
}

pub fn parse_pull_requests(raw: &str) -> Result<Vec<PullRequest>> {
    let values: Vec<Value> =
        serde_json::from_str(raw).map_err(|_| "The PR provider's response couldn't be read.")?;
    values
        .into_iter()
        .map(|v| {
            let text = |k: &str| {
                v[k].as_str()
                    .map(String::from)
                    .ok_or_else(|| "Invalid PR response.".to_string())
            };
            let state = text("state")?.to_lowercase();
            if !["open", "closed", "merged"].contains(&state.as_str()) {
                return Err("Invalid PR state.".into());
            }
            let url = text("url")?;
            if !url.starts_with("https://") {
                return Err("Invalid PR URL.".into());
            }
            Ok(PullRequest {
                number: v["number"]
                    .as_i64()
                    .filter(|n| *n > 0)
                    .ok_or("Invalid PR number.")?,
                title: text("title")?,
                state,
                url,
                head_branch: text("headRefName")?,
                base_branch: text("baseRefName")?,
                review_decision: v["reviewDecision"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .map(String::from),
                checks: v["statusCheckRollup"]
                    .as_array()
                    .map(|checks| {
                        checks
                            .iter()
                            .filter_map(|c| {
                                let name = c["name"].as_str().or_else(|| c["context"].as_str())?;
                                let status = ["conclusion", "state", "status"]
                                    .iter()
                                    .find_map(|k| c[k].as_str().filter(|s| !s.is_empty()));
                                Some(
                                    status
                                        .map(|s| format!("{name}: {s}"))
                                        .unwrap_or_else(|| name.into()),
                                )
                            })
                            .collect()
                    })
                    .unwrap_or_default(),
                merge_commit: v["mergeCommit"]["oid"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .map(String::from),
            })
        })
        .collect()
}

pub struct CommandResult {
    pub output: Vec<u8>,
    pub error: String,
    pub success: bool,
}
pub trait PRCommandRunning {
    fn run(&self, args: &[&str], repository: &Path) -> Result<CommandResult>;
}
pub struct SystemPRCommandRunner;
impl PRCommandRunning for SystemPRCommandRunner {
    fn run(&self, args: &[&str], repository: &Path) -> Result<CommandResult> {
        let mut command = std::process::Command::new(crate::process::program("gh"));
        command
            .args(args)
            .current_dir(repository)
            .env("GH_PROMPT_DISABLED", "1")
            .env("GIT_TERMINAL_PROMPT", "0");
        let output = crate::process::output(&mut command).map_err(|error| -> String {
            if error.kind() == std::io::ErrorKind::NotFound {
                "GitHub CLI isn't installed on this computer.".into()
            } else {
                "The PR provider didn't respond.".into()
            }
        })?;
        Ok(CommandResult {
            output: output.stdout,
            error: String::from_utf8_lossy(&output.stderr).into(),
            success: output.status.success(),
        })
    }
}
pub trait PullRequestProvider {
    fn list(&self, repository: &Path) -> PullRequests;
}
pub struct GitHubCLIProvider<R: PRCommandRunning> {
    pub runner: R,
}
impl<R: PRCommandRunning> PullRequestProvider for GitHubCLIProvider<R> {
    fn list(&self, repository: &Path) -> PullRequests {
        let result = self.runner.run(
            &[
                "pr",
                "list",
                "--state",
                "all",
                "--limit",
                "100",
                "--json",
                "number,title,state,url,headRefName,baseRefName,reviewDecision,statusCheckRollup,mergeCommit",
            ],
            repository,
        );
        let items = match result {
            Err(error) => Err(error),
            Ok(out) if !out.success => Err(explain(&out.error)),
            Ok(out) => parse_pull_requests(&String::from_utf8_lossy(&out.output)),
        };
        match items {
            Ok(items) => PullRequests {
                items,
                unavailable: None,
            },
            Err(error) => PullRequests {
                items: vec![],
                unavailable: Some(error),
            },
        }
    }
}
fn explain(error: &str) -> String {
    let error = error.to_lowercase();
    if error.contains("gh auth login") || error.contains("not logged") {
        "Connect GitHub CLI with gh auth login to see PRs."
    } else if error.contains("no git remotes") || error.contains("could not determine") {
        "This repository has no GitHub remote set up."
    } else {
        "Couldn't load PRs. Check the GitHub CLI connection and the repository's remote."
    }
    .into()
}
pub fn pull_requests(path: &Path) -> PullRequests {
    GitHubCLIProvider {
        runner: SystemPRCommandRunner,
    }
    .list(path)
}
