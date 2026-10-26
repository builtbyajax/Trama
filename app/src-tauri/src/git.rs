//! Repository inspection only. No checkout, staging, network Git or write commands.
pub use crate::diff::{parse_diff, unquote, untracked_file, DiffLine, FileDiff, Hunk};
pub use crate::pull_requests::{parse_pull_requests, pull_requests, PullRequest, PullRequests};
use crate::store::Result;
use serde::Serialize;
use std::{path::Path, process::Command};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub id: String,
    pub short_id: String,
    pub parents: Vec<String>,
    pub subject: String,
    pub body: String,
    pub author: String,
    pub date: f64,
    pub refs: Vec<String>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    pub commit_id: String,
    pub upstream: Option<String>,
    pub ahead_of_main: Option<i64>,
    pub behind_main: Option<i64>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkingChange {
    pub path: String,
    pub old_path: Option<String>,
    pub index_status: String,
    pub worktree_status: String,
    pub change: String,
    pub is_staged: bool,
    pub is_untracked: bool,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSnapshot {
    pub root: String,
    pub current_branch: Option<String>,
    pub main_branch: Option<String>,
    pub branches: Vec<Branch>,
    pub commits: Vec<Commit>,
    pub working_changes: Vec<WorkingChange>,
    /// The repository's page on GitHub, from the `origin` remote; none for other hosts.
    pub web_url: Option<String>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitDetails {
    pub file_diffs: Vec<FileDiff>,
    pub diff: String,
}
pub fn run_git(path: &Path, args: &[&str]) -> Result<String> {
    if !path.is_dir() {
        return Err("Couldn't read a Git repository in this folder.".into());
    }
    let mut command = Command::new(crate::process::program("git"));
    command
        .args([
            "--no-optional-locks",
            "-c",
            "core.quotePath=false",
            "-c",
            "core.fsmonitor=false",
            "-C",
        ])
        .arg(path)
        .args(args)
        .current_dir(path)
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_PAGER", "cat")
        .env("GIT_CONFIG_NOSYSTEM", "1");
    let out = crate::process::output(&mut command)
        .map_err(|_| "The Git executable isn't available.".to_string())?;
    if !out.status.success() {
        return Err(match args.first().copied() {
            Some("rev-parse") => "Couldn't read a Git repository in this folder.",
            Some("show") => "This commit isn't available in the repository.",
            _ => "Git couldn't read this repository's history.",
        }
        .into());
    }
    Ok(String::from_utf8_lossy(&out.stdout).into())
}
pub fn snapshot(path: &Path, limit: usize) -> Result<GitSnapshot> {
    let root = run_git(path, &["rev-parse", "--show-toplevel"])?
        .trim()
        .to_string();
    let current = run_git(path, &["branch", "--show-current"])?
        .trim()
        .to_string();
    let raw = run_git(
        path,
        &[
            "for-each-ref",
            "--format=%(refname:short)%1f%(objectname)%1f%(upstream:short)",
            "refs/heads",
        ],
    )?;
    let mut branches = vec![];
    for line in raw.lines() {
        let fields: Vec<&str> = line.split('\x1f').collect();
        if fields.len() != 3 || !valid_hash(fields[1]) {
            return Err("Invalid history.".into());
        }
        branches.push(Branch {
            name: fields[0].into(),
            commit_id: fields[1].into(),
            upstream: nonempty(fields[2]),
            ahead_of_main: None,
            behind_main: None,
        });
    }
    let main_branch = branches
        .iter()
        .find(|b| b.name == "main")
        .or_else(|| branches.iter().find(|b| b.name == "master"))
        .map(|b| b.name.clone());
    if let Some(main) = &main_branch {
        for branch in &mut branches {
            if &branch.name != main {
                let relation = format!("{main}...{}", branch.name);
                let counts = run_git(path, &["rev-list", "--left-right", "--count", &relation])?;
                let counts: Vec<&str> = counts.split_whitespace().collect();
                if counts.len() != 2 {
                    return Err("Invalid branch relation.".into());
                }
                branch.behind_main = counts[0].parse().ok();
                branch.ahead_of_main = counts[1].parse().ok();
            }
        }
    }
    let has_head = run_git(path, &["rev-parse", "--verify", "--quiet", "HEAD"]).is_ok();
    let commits = if !has_head && branches.is_empty() {
        vec![]
    } else {
        // Branches, remotes and tags only: `--all` would also draw the stash and the hidden refs
        // other tools keep (Codex snapshots, for one) as branches nobody made.
        let limit = limit.clamp(1, 500).to_string();
        let mut args = vec![
            "log",
            "--branches",
            "--remotes",
            "--tags",
            "--topo-order",
            "--decorate",
            "--format=%H%x1f%P%x1f%h%x1f%s%x1f%an%x1f%at%x1f%D%x1f%b%x1e",
            "-n",
            &limit,
        ];
        if has_head {
            args.push("HEAD");
        }
        parse_log(&run_git(path, &args)?)?
    };
    let working_changes = parse_status(&run_git(
        path,
        &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    )?);
    Ok(GitSnapshot {
        root,
        current_branch: nonempty(&current),
        main_branch,
        branches,
        commits,
        working_changes,
        web_url: run_git(path, &["remote", "get-url", "origin"])
            .ok()
            .and_then(|url| github_web(url.trim())),
    })
}
/// `https://github.com/owner/repo` from an HTTPS or SSH remote, without credentials or `.git`.
fn github_web(remote: &str) -> Option<String> {
    let rest = remote
        .strip_prefix("git@github.com:")
        .or_else(|| remote.strip_prefix("ssh://git@github.com/"))
        .or_else(|| {
            let url = remote.strip_prefix("https://")?;
            let host = url.find('/').map(|i| &url[..i])?;
            (host.rsplit('@').next() == Some("github.com")).then(|| &url[host.len() + 1..])
        })?;
    let rest = rest.trim_end_matches('/');
    let rest = rest.strip_suffix(".git").unwrap_or(rest);
    let mut parts = rest.split('/');
    let (owner, repo) = (parts.next()?, parts.next()?);
    let valid = |s: &str| {
        !s.is_empty()
            && s.chars()
                .all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
    };
    (parts.next().is_none() && valid(owner) && valid(repo))
        .then(|| format!("https://github.com/{owner}/{repo}"))
}
fn parse_log(raw: &str) -> Result<Vec<Commit>> {
    raw.split('\x1e')
        .filter(|s| !s.trim().is_empty())
        .map(|record| {
            let f: Vec<&str> = record.trim_matches(['\r', '\n']).split('\x1f').collect();
            if f.len() != 8 || !valid_hash(f[0]) || !f[1].split_whitespace().all(valid_hash) {
                return Err("Invalid history.".into());
            }
            Ok(Commit {
                id: f[0].into(),
                parents: f[1].split_whitespace().map(String::from).collect(),
                short_id: f[2].into(),
                subject: f[3].into(),
                author: f[4].into(),
                date: f[5].parse().map_err(|_| "Invalid commit date.")?,
                refs: f[6]
                    .split(',')
                    .map(str::trim)
                    .filter(|r| !r.is_empty())
                    .map(String::from)
                    .collect(),
                body: f[7].trim().into(),
            })
        })
        .collect()
}
pub fn parse_status(raw: &str) -> Vec<WorkingChange> {
    let mut entries = raw.split('\0').filter(|s| !s.is_empty());
    let mut result = vec![];
    while let Some(entry) = entries.next() {
        if entry.len() < 4 {
            continue;
        }
        let index = entry.as_bytes()[0] as char;
        let work = entry.as_bytes()[1] as char;
        let old_path = if ['R', 'C'].contains(&index) || ['R', 'C'].contains(&work) {
            entries.next().map(String::from)
        } else {
            None
        };
        let is_untracked = index == '?';
        let change = if is_untracked {
            "untracked"
        } else if index == 'R' || work == 'R' {
            "renamed"
        } else if index == 'D' || work == 'D' {
            "deleted"
        } else if index == 'A' || work == 'A' {
            "added"
        } else {
            "modified"
        };
        result.push(WorkingChange {
            path: entry[3..].into(),
            old_path,
            index_status: index.to_string(),
            worktree_status: work.to_string(),
            change: change.into(),
            is_staged: !is_untracked && index != ' ',
            is_untracked,
        });
    }
    result
}
/// Local branch names, most recently committed first.
pub fn local_branches(path: &Path) -> Result<Vec<String>> {
    Ok(run_git(
        path,
        &[
            "for-each-ref",
            "--sort=-committerdate",
            "--format=%(refname:short)",
            "refs/heads",
        ],
    )?
    .lines()
    .filter(|l| !l.is_empty())
    .map(String::from)
    .collect())
}
/// A task's branch must be a local branch of the project's repository.
pub fn require_local_branch(repository: Option<&str>, branch: &str) -> Result<()> {
    let repository = repository.ok_or("Connect a repository to the project to assign a branch.")?;
    let branches = local_branches(Path::new(repository))?;
    if branches.iter().any(|b| b == branch) {
        return Ok(());
    }
    let known = if branches.is_empty() {
        "nenhuma".to_string()
    } else {
        branches
            .iter()
            .take(20)
            .cloned()
            .collect::<Vec<_>>()
            .join(", ")
    };
    Err(format!(
        "The branch {branch} doesn't exist in the local repository. Local branches: {known}."
    ))
}
pub fn valid_hash(s: &str) -> bool {
    [40, 64].contains(&s.len()) && s.bytes().all(|c| c.is_ascii_hexdigit())
}
pub fn commit_details(path: &Path, hash: &str) -> Result<CommitDetails> {
    if !valid_hash(hash) {
        return Err("Invalid commit hash.".into());
    }
    run_git(path, &["rev-parse", "--show-toplevel"])?;
    let diff = run_git(
        path,
        &[
            "show",
            "--format=",
            "--patch",
            "--no-ext-diff",
            "--no-textconv",
            "--no-color",
            "--find-renames",
            "--unified=3",
            "--diff-merges=first-parent",
            hash,
            "--",
        ],
    )?;
    Ok(CommitDetails {
        file_diffs: parse_diff(&diff),
        diff,
    })
}
/// Everything a range of commits changed together: `base` (excluded) to `head`.
pub fn range_diff(path: &Path, base: &str, head: &str) -> Result<Vec<FileDiff>> {
    if !valid_hash(base) || !valid_hash(head) {
        return Err("Invalid commit hash.".into());
    }
    let diff = run_git(
        path,
        &[
            "diff",
            "--patch",
            "--no-ext-diff",
            "--no-textconv",
            "--no-color",
            "--find-renames",
            "--unified=3",
            base,
            head,
            "--",
        ],
    )?;
    Ok(parse_diff(&diff))
}
pub fn working_diff(path: &Path) -> Result<Vec<FileDiff>> {
    let root = run_git(path, &["rev-parse", "--show-toplevel"])?;
    let has_head = run_git(path, &["rev-parse", "--verify", "--quiet", "HEAD"]).is_ok();
    let mut files = if has_head {
        parse_diff(&run_git(
            path,
            &[
                "diff",
                "HEAD",
                "--patch",
                "--no-ext-diff",
                "--no-textconv",
                "--no-color",
                "--find-renames",
                "--unified=3",
                "--",
            ],
        )?)
    } else {
        let paths = run_git(path, &["ls-files", "-z"])?;
        paths
            .split('\0')
            .filter(|p| !p.is_empty())
            .filter_map(|name| {
                let file_path = Path::new(root.trim()).join(name);
                if !file_path.exists() && !file_path.is_symlink() {
                    return None;
                }
                let mut preview = preview_file(name, &file_path);
                preview.change = "added".into();
                Some(preview)
            })
            .collect()
    };
    let status = parse_status(&run_git(
        path,
        &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    )?);
    for change in status.iter().filter(|c| c.is_untracked) {
        let file_path = Path::new(root.trim()).join(&change.path);
        files.push(preview_file(&change.path, &file_path));
    }
    files.sort_by_key(|f| {
        status
            .iter()
            .position(|c| c.path == f.path)
            .unwrap_or(usize::MAX)
    });
    Ok(files)
}
fn nonempty(s: &str) -> Option<String> {
    if s.is_empty() {
        None
    } else {
        Some(s.into())
    }
}

fn preview_file(name: &str, path: &Path) -> FileDiff {
    let data = std::fs::symlink_metadata(path)
        .ok()
        .filter(|metadata| metadata.len() <= 1_000_000)
        .and_then(|metadata| {
            if metadata.file_type().is_symlink() {
                std::fs::read_link(path)
                    .ok()
                    .map(|target| target.to_string_lossy().as_bytes().to_vec())
            } else {
                std::fs::read(path).ok()
            }
        });
    untracked_file(name, data.as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn remotes_become_safe_github_links_without_credentials() {
        for remote in [
            "git@github.com:owner/repo.git",
            "ssh://git@github.com/owner/repo.git",
            "https://token@github.com/owner/repo.git",
        ] {
            assert_eq!(
                github_web(remote).as_deref(),
                Some("https://github.com/owner/repo")
            );
        }
        for remote in [
            "https://github.com.evil/owner/repo",
            "https://example.com/owner/repo",
            "git@github.com:owner/repo/extra",
            "",
        ] {
            assert!(github_web(remote).is_none());
        }
    }
    #[test]
    fn history_parser_rejects_corrupt_records_and_preserves_bodies() {
        let raw=format!("{}\x1f\x1faaaaaaa\x1fSubject\x1fSynthetic author\x1f123\x1fHEAD -> main, tag: v1\x1fSubject\n\nBody\x1e","a".repeat(40));
        let parsed = parse_log(&raw).unwrap();
        assert_eq!(parsed[0].date, 123.0);
        assert_eq!(parsed[0].refs, ["HEAD -> main", "tag: v1"]);
        assert_eq!(parsed[0].body, "Subject\n\nBody");
        assert!(parse_log("invalid").is_err());
        assert!(parse_log(&raw.replace("\x1f123\x1f", "\x1fnot-date\x1f")).is_err());
        assert!(parse_log(&raw.replacen(&"a".repeat(40), "invalid", 1)).is_err());
    }
}
