#![allow(dead_code)]
use trama_lib::store::{Project, Store, Task, TaskInput};
pub fn git(root: &std::path::Path, args: &[&str]) -> String {
    let output = std::process::Command::new("git")
        .current_dir(root)
        .args([
            "-c",
            "user.name=Trama test",
            "-c",
            "user.email=tests@example.invalid",
            "-c",
            "commit.gpgsign=false",
            "-c",
            "core.hooksPath=disabled-test-hooks",
        ])
        .env("GIT_AUTHOR_DATE", "2026-01-01T00:00:00Z")
        .env("GIT_COMMITTER_DATE", "2026-01-01T00:00:00Z")
        .args(args)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout).unwrap().trim().into()
}
pub fn repository(root: &std::path::Path) -> String {
    std::fs::create_dir_all(root).unwrap();
    git(root, &["init", "-q", "-b", "main"]);
    std::fs::write(root.join("fixture.md"), "Synthetic Git fixture\n").unwrap();
    git(root, &["add", "fixture.md"]);
    git(root, &["commit", "-qm", "Initial fixture"]);
    git(root, &["branch", "test/contract"]);
    git(root, &["rev-parse", "HEAD"])
}
pub fn project(store: &Store, name: &str) -> Project {
    store
        .save_project(None, name, None, None, None, None)
        .unwrap()
}
pub fn task(store: &Store, project: &str, title: &str, status: &str) -> Task {
    store
        .save_task(
            None,
            TaskInput {
                project_id: project.into(),
                title: title.into(),
                details: "Public briefing".into(),
                category: "Feature".into(),
                assignee: "agent".into(),
                status: status.into(),
                ..Default::default()
            },
        )
        .unwrap()
}
