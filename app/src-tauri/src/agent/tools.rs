//! App operations exposed through MCP. No UI dependency or private-note access.
use super::Agent;
use crate::{
    git,
    store::{Category, Goal, Message, Project, Result, Task, TaskInput, TaskPatch, STATUSES},
};
use serde::Serialize;
use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};
impl Agent {
    fn scope(&self, args: &Map<String, Value>) -> Result<String> {
        match &self.project_id {
            Some(id) => Ok(self.store.project(id)?.id),
            None => Ok(self.store.project(required(args, "project_id")?)?.id),
        }
    }
    fn repository(&self, project: &str) -> Result<PathBuf> {
        self.store
            .project(project)?
            .repository_path
            .map(Into::into)
            .ok_or_else(|| "Connect a repository to see the Git history.".into())
    }
    fn validate_branch(&self, project: &str, args: &Map<String, Value>) -> Result<()> {
        match text(args, "repository_branch").filter(|s| !s.is_empty()) {
            Some(branch) => git::require_local_branch(
                self.store.project(project)?.repository_path.as_deref(),
                branch,
            ),
            None => Ok(()),
        }
    }
    pub(super) fn execute(&self, name: &str, args: &Map<String, Value>) -> Result<Value> {
        // Workspace-only operations are also gated by tools/list's schemas.
        match name {
            "list_projects" => {
                let projects = if let Some(id) = &self.project_id {
                    vec![self.store.project(id)?]
                } else {
                    self.store.projects()?
                };
                return Ok(
                    json!({"projects":projects.iter().map(project_value).collect::<Vec<_>>()}),
                );
            }
            "create_project" => {
                let path = nullable_text(args, "repository_path").flatten();
                validate_repository(path.as_deref())?;
                return Ok(project_value(&self.store.save_project(
                    None,
                    required(args, "name")?,
                    path,
                    None,
                    None,
                    None,
                )?));
            }
            "delete_project" => {
                self.store.delete_project(required(args, "project_id")?)?;
                return Ok(json!({"deleted":true}));
            }
            _ => {}
        }
        let project = self.scope(args)?;
        let task = || required(args, "task_id");
        match name {
            "get_context" => Ok(
                json!({"project":project_value(&self.store.project(&project)?),"categories":self.categories(&project)?,"statuses":STATUSES,"assignees":["user","agent"],"private_notes_accessible":false,"schema_version":crate::store::SCHEMA_VERSION,"scope":if self.project_id.is_some(){"project"}else{"workspace"},"briefing_field":"details","agent_execution":"external","working_indicator":"assignee=agent and status=inProgress"}),
            ),
            "update_project" => {
                require_changes(args, &["project_id"])?;
                let path = nullable_text(args, "repository_path");
                if let Some(value) = &path {
                    validate_repository(value.as_deref())?;
                }
                Ok(project_value(&self.store.edit_project(
                    &project,
                    text(args, "name"),
                    path,
                )?))
            }
            "list_categories" => Ok(json!({"categories":self.categories(&project)?})),
            "create_category" => Ok(category_value(
                &self
                    .store
                    .create_category(&project, required(args, "name")?)?,
            )),
            "rename_category" => Ok(category_value(&self.store.rename_category(
                &project,
                required(args, "name")?,
                required(args, "new_name")?,
                "agent",
            )?)),
            "delete_category" => encoded(self.store.delete_category_as(
                &project,
                required(args, "name")?,
                text(args, "replacement"),
                "agent",
            )),
            "list_tasks" => {
                let mut tasks: Vec<Task> = self
                    .store
                    .tasks(Some(&project))?
                    .into_iter()
                    .filter(|t| {
                        text(args, "status").is_none_or(|v| t.status == v)
                            && text(args, "category")
                                .is_none_or(|v| t.category.eq_ignore_ascii_case(v))
                            && text(args, "assignee").is_none_or(|v| t.assignee == v)
                            && text(args, "goal_id").is_none_or(|v| {
                                t.goal_id
                                    .as_deref()
                                    .is_some_and(|g| g.eq_ignore_ascii_case(v))
                            })
                    })
                    .collect();
                // The board's order: column by column, top card first.
                let column = |t: &Task| STATUSES.iter().position(|s| *s == t.status);
                tasks.sort_by(|a, b| {
                    column(a)
                        .cmp(&column(b))
                        .then(a.position.cmp(&b.position))
                        .then(b.updated_at.total_cmp(&a.updated_at))
                });
                let tasks = tasks.iter().map(task_value).collect();
                Ok(page("tasks", tasks, args))
            }
            "search_tasks" => {
                let results=self.store.search_public(&project,required(args,"query")?)?.iter().map(|r|json!({"id":r.id,"kind":r.kind,"project_id":r.project_id,"task_id":r.task_id,"title":r.title,"excerpt":r.excerpt})).collect();
                Ok(page("results", results, args))
            }
            "get_task" => Ok(task_value(&self.store.task(task()?, &project)?)),
            "get_task_details" => {
                // Do not call task_details: it reads private notes. Return public data only.
                Ok(
                    json!({"task":task_value(&self.store.task(task()?,&project)?),"messages":self.store.messages(task()?,&project)?.iter().map(message_value).collect::<Vec<_>>(),"checks":self.checks(task()?,&project)?,"events":self.events(task()?,&project)?,"documents":self.documents(task()?,&project)?}),
                )
            }
            "create_task" => {
                validate_delivery(args)?;
                self.validate_branch(&project, args)?;
                let category = match text(args, "category") {
                    Some(category) => category.into(),
                    None => self.store.default_category(&project)?,
                };
                let input = TaskInput {
                    project_id: project,
                    title: required(args, "title")?.into(),
                    details: text(args, "details").unwrap_or("").into(),
                    category,
                    assignee: text(args, "assignee").unwrap_or("agent").into(),
                    status: text(args, "status").unwrap_or("todo").into(),
                    agent_summary: nullable_text(args, "agent_summary").flatten(),
                    repository_branch: nullable_text(args, "repository_branch").flatten(),
                    commit_hash: nullable_text(args, "commit_hash").flatten(),
                    pull_request_url: nullable_text(args, "pull_request_url").flatten(),
                    pull_request_number: args.get("pull_request_number").and_then(Value::as_i64),
                    goal_id: nullable_text(args, "goal_id").flatten(),
                };
                Ok(task_value(&self.store.save_task_as(None, input, "agent")?))
            }
            "update_task" => {
                require_changes(args, &["task_id", "project_id"])?;
                validate_delivery(args)?;
                self.validate_branch(&project, args)?;
                let patch = TaskPatch {
                    project_id: project,
                    title: owned(args, "title"),
                    details: owned(args, "details"),
                    category: owned(args, "category"),
                    assignee: owned(args, "assignee"),
                    status: owned(args, "status"),
                    agent_summary: nullable_text(args, "agent_summary"),
                    repository_branch: nullable_text(args, "repository_branch"),
                    commit_hash: nullable_text(args, "commit_hash"),
                    pull_request_url: nullable_text(args, "pull_request_url"),
                    pull_request_number: args.get("pull_request_number").map(Value::as_i64),
                    goal_id: nullable_text(args, "goal_id"),
                };
                Ok(task_value(&self.store.edit_task_as(
                    task()?,
                    patch,
                    "agent",
                )?))
            }
            "move_task" => {
                if let Some(after) = text(args, "after_id") {
                    let previous = self.store.task(after, &project)?;
                    if previous.id.eq_ignore_ascii_case(task()?)
                        || previous.status != required(args, "status")?
                    {
                        return Err("after_id must be another task in the target column.".into());
                    }
                }
                Ok(task_value(&self.store.move_task_as(
                    task()?,
                    &project,
                    required(args, "status")?,
                    text(args, "after_id"),
                    "agent",
                )?))
            }
            "list_goals" => {
                let tasks = self.store.tasks(Some(&project))?;
                let goals = self.store.goals(Some(&project))?;
                Ok(json!({"goals":goals.iter().map(|g| goal_value(g, &tasks)).collect::<Vec<_>>()}))
            }
            "create_goal" => {
                let goal = self.store.save_goal(
                    None,
                    &project,
                    required(args, "name")?,
                    text(args, "description").unwrap_or(""),
                    text(args, "target_date"),
                )?;
                Ok(goal_value(&goal, &[]))
            }
            "update_goal" => {
                require_changes(args, &["project_id", "goal_id"])?;
                let goal = self.store.goal(required(args, "goal_id")?, &project)?;
                let target_date = match args.get("target_date") {
                    Some(value) => value.as_str(),
                    None => goal.target_date.as_deref(),
                };
                let goal = self.store.save_goal(
                    Some(&goal.id),
                    &project,
                    text(args, "name").unwrap_or(&goal.name),
                    text(args, "description").unwrap_or(&goal.description),
                    target_date,
                )?;
                Ok(goal_value(&goal, &self.store.tasks(Some(&project))?))
            }
            "promote_draft" => {
                let t = self.store.task(task()?, &project)?;
                if !["preparing", "reserved"].contains(&t.status.as_str()) {
                    return Err("Only a draft can be promoted to the board.".into());
                }
                Ok(task_value(
                    &self
                        .store
                        .move_task_as(&t.id, &project, "todo", None, "agent")?,
                ))
            }
            "delete_task" => {
                self.store.delete_task(task()?, &project)?;
                Ok(json!({"deleted":true}))
            }
            "read_task_messages" => Ok(page(
                "messages",
                self.store
                    .messages(task()?, &project)?
                    .iter()
                    .map(message_value)
                    .collect(),
                args,
            )),
            "add_task_message" => Ok(message_value(&self.store.add_message(
                task()?,
                &project,
                "agent",
                required(args, "body")?,
            )?)),
            "update_task_message" => Ok(message_value(&self.store.edit_message(
                task()?,
                &project,
                required(args, "message_id")?,
                required(args, "body")?,
            )?)),
            "delete_task_message" => {
                self.store
                    .delete_message(task()?, &project, required(args, "message_id")?)?;
                Ok(json!({"deleted":true}))
            }
            "list_task_checks" => Ok(json!({"checks":self.checks(task()?,&project)?})),
            "add_task_check" => {
                let check = self
                    .store
                    .add_check(task()?, &project, required(args, "title")?)?;
                Ok(
                    json!({"id":check.id,"task_id":check.task_id,"title":check.title,"is_complete":check.is_complete}),
                )
            }
            "update_task_check" => {
                require_changes(args, &["project_id", "task_id", "check_id"])?;
                let check = self.store.edit_check(
                    task()?,
                    &project,
                    required(args, "check_id")?,
                    text(args, "title"),
                    args.get("is_complete").and_then(Value::as_bool),
                )?;
                Ok(
                    json!({"id":check.id,"task_id":check.task_id,"title":check.title,"is_complete":check.is_complete}),
                )
            }
            "delete_task_check" => {
                self.store
                    .delete_check(task()?, &project, required(args, "check_id")?)?;
                Ok(json!({"deleted":true}))
            }
            "attach_document" => {
                let d = self.store.attach_document(
                    task()?,
                    &project,
                    required(args, "path")?,
                    "agent",
                )?;
                Ok(
                    json!({"task_id":d.task_id,"path":d.path,"actor":d.actor,"created_at":timestamp(d.created_at)}),
                )
            }
            "detach_document" => {
                self.store
                    .detach_document(task()?, &project, required(args, "path")?, "agent")?;
                Ok(json!({"detached":true}))
            }
            "list_task_documents" => Ok(json!({"documents":self.documents(task()?,&project)?})),
            "read_task_events" => Ok(page("events", self.events(task()?, &project)?, args)),
            "git_snapshot" => encoded(git::snapshot(
                &self.repository(&project)?,
                args.get("limit").and_then(Value::as_u64).unwrap_or(100) as usize,
            )),
            "git_commit_details" => encoded(git::commit_details(
                &self.repository(&project)?,
                required(args, "commit_id")?,
            )),
            "git_working_diff" => {
                Ok(json!({"file_diffs":git::working_diff(&self.repository(&project)?)?}))
            }
            "list_pull_requests" => encoded(Ok(git::pull_requests(&self.repository(&project)?))),
            _ => Err("Unknown tool.".into()),
        }
    }
    fn categories(&self, project: &str) -> Result<Vec<Value>> {
        Ok(self
            .store
            .categories()?
            .into_iter()
            .filter(|c| c.project_id == project)
            .map(|c| json!({"project_id":c.project_id,"name":c.name,"task_count":c.task_count}))
            .collect())
    }
    fn checks(&self, task: &str, project: &str) -> Result<Vec<Value>> {
        Ok(self.store.checks(task,project)?.iter().map(|c|json!({"id":c.id,"task_id":c.task_id,"title":c.title,"is_complete":c.is_complete})).collect())
    }
    fn documents(&self, task: &str, project: &str) -> Result<Vec<Value>> {
        Ok(self
            .store
            .documents(Some((task, project)))?
            .iter()
            .map(|d| json!({"path":d.path,"actor":d.actor,"created_at":timestamp(d.created_at)}))
            .collect())
    }
    fn events(&self, task: &str, project: &str) -> Result<Vec<Value>> {
        Ok(self.store.events(task,project)?.iter().map(|e|json!({"id":e.id,"task_id":e.task_id,"actor":e.actor,"kind":e.kind,"value":e.value,"created_at":timestamp(e.created_at)})).collect())
    }
}
fn text<'a>(args: &'a Map<String, Value>, key: &str) -> Option<&'a str> {
    args.get(key).and_then(Value::as_str)
}
fn owned(args: &Map<String, Value>, key: &str) -> Option<String> {
    text(args, key).map(Into::into)
}
fn nullable_text(args: &Map<String, Value>, key: &str) -> Option<Option<String>> {
    args.get(key)
        .map(|v| v.as_str().filter(|s| !s.trim().is_empty()).map(Into::into))
}
fn required<'a>(args: &'a Map<String, Value>, key: &str) -> Result<&'a str> {
    text(args, key).ok_or_else(|| format!("{key} is required."))
}
fn require_changes(args: &Map<String, Value>, identifiers: &[&str]) -> Result<()> {
    if args.keys().any(|k| !identifiers.contains(&k.as_str())) {
        Ok(())
    } else {
        Err("Give at least one field to update.".into())
    }
}
fn encoded<T: Serialize>(value: Result<T>) -> Result<Value> {
    serde_json::to_value(value?).map_err(|e| e.to_string())
}
fn page(key: &str, values: Vec<Value>, args: &Map<String, Value>) -> Value {
    let limit = args.get("limit").and_then(Value::as_u64).unwrap_or(200) as usize;
    let offset = args.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let total = values.len();
    let next = (offset.saturating_add(limit) < total).then_some(offset.saturating_add(limit));
    let mut value = json!({"total":total,"next_offset":next});
    value[key] = json!(values
        .into_iter()
        .skip(offset)
        .take(limit)
        .collect::<Vec<_>>());
    value
}
fn timestamp(value: f64) -> String {
    let seconds = value.floor() as i64;
    let nanos = ((value - seconds as f64) * 1e9)
        .round()
        .clamp(0.0, 999_999_999.0) as u32;
    chrono::DateTime::from_timestamp(seconds, nanos)
        .map(|d| d.to_rfc3339_opts(chrono::SecondsFormat::Micros, true))
        .unwrap_or_default()
}
fn project_value(p: &Project) -> Value {
    json!({"id":p.id,"name":p.name,"repository_path":p.repository_path,"notes_folder":p.documents_folder,"created_at":timestamp(p.created_at)})
}
fn task_value(t: &Task) -> Value {
    json!({"id":t.id,"project_id":t.project_id,"title":t.title,"details":t.details,"category":t.category,"assignee":t.assignee,"status":t.status,"position":t.position,"agent_summary":t.agent_summary,"repository_branch":t.repository_branch,"commit_hash":t.commit_hash,"pull_request_url":t.pull_request_url,"pull_request_number":t.pull_request_number,"goal_id":t.goal_id,"checks_total":t.checks_total,"checks_done":t.checks_done,"message_count":t.message_count,"document_count":t.document_count,"created_at":timestamp(t.created_at),"updated_at":timestamp(t.updated_at)})
}
/// A goal with its progress among `tasks`: drafts aren't on the board yet, so they don't count.
fn goal_value(g: &Goal, tasks: &[Task]) -> Value {
    let counted: Vec<&Task> = tasks
        .iter()
        .filter(|t| {
            t.goal_id.as_deref() == Some(g.id.as_str())
                && !["preparing", "reserved"].contains(&t.status.as_str())
        })
        .collect();
    let done = counted.iter().filter(|t| t.status == "done").count();
    json!({"id":g.id,"project_id":g.project_id,"name":g.name,"description":g.description,"target_date":g.target_date,"completed_at":g.completed_at.map(timestamp),"tasks_total":counted.len(),"tasks_done":done,"created_at":timestamp(g.created_at)})
}
fn message_value(m: &Message) -> Value {
    json!({"id":m.id,"task_id":m.task_id,"author":m.author,"body":m.body,"created_at":timestamp(m.created_at)})
}
fn validate_repository(path: Option<&str>) -> Result<()> {
    if let Some(path) = path {
        git::snapshot(Path::new(path), 1)?;
    }
    Ok(())
}
fn validate_delivery(args: &Map<String, Value>) -> Result<()> {
    if let Some(hash) = text(args, "commit_hash").filter(|s| !s.is_empty()) {
        if !git::valid_hash(hash) {
            return Err(
                "commit_hash must be a full Git hash (40 or 64 hexadecimal characters).".into(),
            );
        }
    }
    if let Some(branch) = text(args, "repository_branch").filter(|s| !s.is_empty()) {
        if branch.starts_with('-')
            || branch.starts_with('/')
            || branch.ends_with('/')
            || branch.ends_with('.')
            || branch == "@"
            || branch.contains("..")
            || branch.contains("@{")
            || branch.contains("//")
            || branch
                .split('/')
                .any(|p| p.starts_with('.') || p.ends_with(".lock"))
            || branch
                .chars()
                .any(|c| c.is_whitespace() || c.is_control() || "~^:?*[\\".contains(c))
        {
            return Err("repository_branch must be a valid Git branch name.".into());
        }
    }
    if let Some(raw) = text(args, "pull_request_url").filter(|s| !s.is_empty()) {
        let url = url::Url::parse(raw)
            .map_err(|_| "pull_request_url must be a valid HTTP(S) URL.".to_string())?;
        if !["http", "https"].contains(&url.scheme())
            || url.host_str().is_none()
            || !url.username().is_empty()
            || url.password().is_some()
        {
            return Err("pull_request_url must be an HTTP(S) URL without credentials.".into());
        }
    }
    Ok(())
}

fn category_value(c: &Category) -> Value {
    json!({"project_id":c.project_id,"name":c.name,"task_count":c.task_count})
}
