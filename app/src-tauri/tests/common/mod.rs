#![allow(dead_code)]
use trama_lib::store::{Project, Store, Task, TaskInput};
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
