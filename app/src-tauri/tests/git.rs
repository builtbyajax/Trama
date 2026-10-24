mod common;
use std::{fs, path::Path};
use trama_lib::{
    diff, git,
    pull_requests::{
        self, CommandResult, GitHubCLIProvider, PRCommandRunning, PullRequestProvider,
    },
};

#[test]
fn complex_diff_preserves_changes_paths_and_line_numbers() {
    let files = diff::parse_diff(include_str!("fixtures/complex.diff"));
    assert_eq!(files.len(), 5);
    assert_eq!(
        (
            &files[0].path,
            files[0].old_path.as_deref(),
            files[0].change.as_str()
        ),
        (&"new.txt".to_string(), Some("old.txt"), "renamed")
    );
    assert!(files[1].is_binary);
    assert_eq!(files[2].change, "added");
    assert_eq!(files[2].additions, 1);
    assert!(files[2].hunks[0].lines[0].missing_newline);
    assert_eq!(files[3].change, "deleted");
    assert_eq!(files[3].deletions, 1);
    assert_eq!(files[4].path, "café space.md");
    assert_eq!(files[4].hunks[0].lines[0].old_number, Some(7));
    assert_eq!(files[4].hunks[0].lines[2].new_number, Some(9));
    assert_eq!(diff::unquote(r#""caf\303\251\tfile.md""#), "café\tfile.md");
    assert!(diff::parse_diff("not a patch").is_empty());
}

#[test]
fn nul_status_handles_renames_spaces_accents_and_untracked_files() {
    let rows = git::parse_status(
        "R  new é.md\0old name.md\0 M changed.txt\0?? untracked.txt\0D  deleted.txt\0bad\0",
    );
    assert_eq!(rows.len(), 4);
    assert_eq!(rows[0].old_path.as_deref(), Some("old name.md"));
    assert_eq!(rows[0].path, "new é.md");
    assert!(rows[0].is_staged);
    assert_eq!(rows[0].change, "renamed");
    assert!(!rows[1].is_staged);
    assert!(rows[2].is_untracked);
    assert_eq!(rows[3].change, "deleted");
}

#[test]
fn real_repository_queries_cover_history_ranges_and_working_changes() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let first = common::repository(root);
    fs::write(root.join("fixture.md"), "Changed fixture\n").unwrap();
    common::git(root, &["add", "fixture.md"]);
    common::git(root, &["commit", "-qm", "Second fixture"]);
    let second = common::git(root, &["rev-parse", "HEAD"]);
    common::git(
        root,
        &[
            "remote",
            "add",
            "origin",
            "git@github.com:example/synthetic.git",
        ],
    );
    let snapshot = git::snapshot(root, 10).unwrap();
    assert_eq!(snapshot.commits.len(), 2);
    assert_eq!(snapshot.current_branch.as_deref(), Some("main"));
    assert_eq!(
        snapshot.web_url.as_deref(),
        Some("https://github.com/example/synthetic")
    );
    let range = git::range_diff(root, &first, &second).unwrap();
    assert_eq!(range.len(), 1);
    assert_eq!((range[0].additions, range[0].deletions), (1, 1));
    assert_eq!(
        git::commit_details(root, &second).unwrap().file_diffs[0].path,
        "fixture.md"
    );
    fs::write(root.join("fixture.md"), "Working change\n").unwrap();
    fs::write(root.join("untracked é.txt"), "New text\n").unwrap();
    fs::write(root.join("binary.dat"), [0, 1, 2]).unwrap();
    let changes = git::working_diff(root).unwrap();
    assert_eq!(changes.len(), 3);
    assert!(changes
        .iter()
        .any(|f| f.path == "binary.dat" && f.is_binary));
    assert!(changes
        .iter()
        .any(|f| f.path == "untracked é.txt" && f.change == "untracked"));
    assert!(git::require_local_branch(Some(root.to_str().unwrap()), "main").is_ok());
    assert!(git::require_local_branch(Some(root.to_str().unwrap()), "test/contract").is_ok());
    assert!(git::require_local_branch(Some(root.to_str().unwrap()), "origin/main").is_err());
    assert!(git::require_local_branch(Some(root.to_str().unwrap()), "invented").is_err());
    assert!(git::commit_details(root, "--all").is_err());
    assert!(!git::valid_hash("abc"));
    assert!(git::valid_hash(&"a".repeat(40)));
    assert!(git::valid_hash(&"B".repeat(64)));
}

struct FakeRunner {
    success: bool,
    error: &'static str,
    output: &'static str,
}
impl PRCommandRunning for FakeRunner {
    fn run(&self, args: &[&str], _: &Path) -> Result<CommandResult, String> {
        assert_eq!(&args[..2], ["pr", "list"]);
        assert!(args.windows(2).any(|w| w == ["--state", "all"]));
        Ok(CommandResult {
            success: self.success,
            error: self.error.into(),
            output: self.output.as_bytes().to_vec(),
        })
    }
}
#[test]
fn pr_fixtures_and_provider_errors_are_handled_without_network() {
    let raw = include_str!("fixtures/gh-prs.json");
    let parsed = pull_requests::parse_pull_requests(raw).unwrap();
    assert_eq!(parsed.len(), 2);
    assert_eq!(parsed[0].state, "merged");
    assert_eq!(parsed[0].checks, ["Rust: SUCCESS", "legacy check: SUCCESS"]);
    assert!(parsed[1].merge_commit.is_none());
    assert!(parsed[1].review_decision.is_none());
    for (key, value) in [
        ("number", serde_json::json!(0)),
        ("state", serde_json::json!("unknown")),
        ("url", serde_json::json!("javascript:alert(1)")),
    ] {
        let mut v: serde_json::Value = serde_json::from_str(raw).unwrap();
        v[0][key] = value;
        assert!(pull_requests::parse_pull_requests(&v.to_string()).is_err());
    }
    assert!(pull_requests::parse_pull_requests("not JSON").is_err());
    let provider = GitHubCLIProvider {
        runner: FakeRunner {
            success: true,
            error: "",
            output: raw,
        },
    };
    assert_eq!(provider.list(Path::new(".")).items.len(), 2);
    for (error, expected) in [
        ("gh auth login required", "Connect GitHub CLI"),
        ("no git remotes found", "no GitHub remote"),
        ("timeout", "Couldn't load PRs"),
    ] {
        let provider = GitHubCLIProvider {
            runner: FakeRunner {
                success: false,
                error,
                output: "",
            },
        };
        let result = provider.list(Path::new("."));
        assert!(result.items.is_empty());
        assert!(result.unavailable.unwrap().contains(expected));
    }
}
