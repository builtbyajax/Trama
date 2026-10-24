//! Shared SQLite core for the desktop app and the project-bound MCP process.
mod categories;
mod conversation;
mod goals;
mod migrations;
mod operations;
mod search;
mod tasks;
mod transfer;
use rusqlite::{params, Connection, OptionalExtension, Row, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use unicode_normalization::{char::is_combining_mark, UnicodeNormalization};

pub type Result<T> = std::result::Result<T, String>;
/// Latest database schema supported by this build, also advertised through MCP.
pub const SCHEMA_VERSION: i64 = 10;
pub const STATUSES: [&str; 6] = [
    "todo",
    "inProgress",
    "review",
    "done",
    "preparing",
    "reserved",
];
const TASK_COLUMNS: &str = "t.id,t.project_id,t.title,t.details,t.category,t.assignee,t.status,t.position,t.agent_summary,t.repository_branch,t.commit_hash,t.pull_request_url,t.pull_request_number,t.created_at,t.updated_at,(SELECT COUNT(*) FROM task_checks c WHERE c.task_id=t.id),(SELECT COUNT(*) FROM task_checks c WHERE c.task_id=t.id AND c.is_complete=1),(SELECT COUNT(*) FROM task_messages m WHERE m.task_id=t.id),(SELECT COUNT(*) FROM task_documents d WHERE d.task_id=t.id),t.archived_at,t.goal_id";
fn sql<T>(r: rusqlite::Result<T>) -> Result<T> {
    r.map_err(|e| e.to_string())
}
pub fn now() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64()
}
/// Suggestions every new project starts with; they can be deleted like any other category.
pub const DEFAULT_CATEGORIES: [&str; 12] = [
    "Feature",
    "Fix",
    "Tests",
    "Validation",
    "Investigation",
    "Documentation",
    "Infrastructure",
    "Migration",
    "Refactoring",
    "Interface",
    "Security",
    "Performance",
];
/// Size of the project palette in the app.
pub const PROJECT_COLORS: i64 = 6;
pub fn id() -> String {
    uuid::Uuid::new_v4().to_string().to_uppercase()
}
/// The open workspace's database, or the one `TRAMA_DB` names.
pub fn default_database_path() -> PathBuf {
    crate::workspaces::active_path()
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub repository_path: Option<String>,
    /// Index into the app's project palette.
    pub color: i64,
    /// The project's notes folder (its vault), as an absolute path.
    pub documents_folder: Option<String>,
    /// A glyph from the app's project icon set; without one the project shows its initial.
    pub icon: Option<String>,
    pub created_at: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub project_id: String,
    pub title: String,
    /// The briefing, in Markdown: what the agent receives.
    pub details: String,
    pub category: String,
    pub assignee: String,
    pub status: String,
    /// Order inside the task's column, ascending (0 is the top card).
    pub position: i64,
    pub agent_summary: Option<String>,
    pub repository_branch: Option<String>,
    pub commit_hash: Option<String>,
    pub pull_request_url: Option<String>,
    pub pull_request_number: Option<i64>,
    pub created_at: f64,
    pub updated_at: f64,
    /// When the person archived the task by hand, before the week a done task otherwise waits.
    pub archived_at: Option<f64>,
    /// The goal the task counts toward, in the same project.
    pub goal_id: Option<String>,
    pub checks_total: i64,
    pub checks_done: i64,
    pub message_count: i64,
    pub document_count: i64,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskInput {
    pub project_id: String,
    pub title: String,
    #[serde(default)]
    pub details: String,
    pub category: String,
    pub assignee: String,
    pub status: String,
    pub agent_summary: Option<String>,
    pub repository_branch: Option<String>,
    pub commit_hash: Option<String>,
    pub pull_request_url: Option<String>,
    pub pull_request_number: Option<i64>,
    #[serde(default)]
    pub goal_id: Option<String>,
}
/// A partial edit: omitted fields preserve the latest value; nullable delivery fields can be cleared.
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskPatch {
    pub project_id: String,
    pub title: Option<String>,
    pub details: Option<String>,
    pub category: Option<String>,
    pub assignee: Option<String>,
    pub status: Option<String>,
    #[serde(default, deserialize_with = "nullable_patch")]
    pub agent_summary: Option<Option<String>>,
    #[serde(default, deserialize_with = "nullable_patch")]
    pub repository_branch: Option<Option<String>>,
    #[serde(default, deserialize_with = "nullable_patch")]
    pub commit_hash: Option<Option<String>>,
    #[serde(default, deserialize_with = "nullable_patch")]
    pub pull_request_url: Option<Option<String>>,
    #[serde(default, deserialize_with = "nullable_patch")]
    pub pull_request_number: Option<Option<i64>>,
    #[serde(default, deserialize_with = "nullable_patch")]
    pub goal_id: Option<Option<String>>,
}
impl From<TaskInput> for TaskPatch {
    fn from(input: TaskInput) -> Self {
        Self {
            project_id: input.project_id,
            title: Some(input.title),
            details: Some(input.details),
            category: Some(input.category),
            assignee: Some(input.assignee),
            status: Some(input.status),
            goal_id: Some(input.goal_id),
            ..Default::default()
        }
    }
}
/// What a group of a project's tasks is for. Its progress is how many of them are done.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Goal {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub description: String,
    /// A day, `YYYY-MM-DD`.
    pub target_date: Option<String>,
    /// When the person concluded it; concluded goals leave the sidebar's list.
    pub completed_at: Option<f64>,
    pub created_at: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub task_id: String,
    pub author: String,
    pub body: String,
    pub created_at: f64,
}
/// A private note of the person on a task. The agent never reads or changes notes.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub task_id: String,
    pub body: String,
    pub created_at: f64,
}
/// Something that happened to a task, for its activity: `kind` is `created`, `status`,
/// `assignee`, `category`, `title`, `details`, `summary`, `branch`, `commit`, `pullRequest`,
/// `document`, `documentRemoved`, `goal` or `project`, with the new value (the note's path for
/// documents, the goal's or project's name for those, none when the task left its goal). `actor` is absent for events recorded before the activity existed.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub id: String,
    pub task_id: String,
    pub actor: Option<String>,
    pub kind: String,
    pub value: Option<String>,
    pub created_at: f64,
}
/// A note of the project's notes folder attached to a task, by its path relative to that
/// folder. Only the path is kept, so the task always shows the file as it is now.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub task_id: String,
    pub path: String,
    pub actor: String,
    pub created_at: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Check {
    pub id: String,
    pub task_id: String,
    pub title: String,
    pub is_complete: bool,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub project_id: String,
    pub name: String,
    pub task_count: i64,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryDeletion {
    pub moved: i64,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub source: &'static str,
    pub database_path: String,
    pub projects: Vec<Project>,
    pub tasks: Vec<Task>,
    pub categories: Vec<Category>,
    pub goals: Vec<Goal>,
    pub documents: Vec<Document>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskDetails {
    pub task: Task,
    pub messages: Vec<Message>,
    pub checks: Vec<Check>,
    pub notes: Vec<Note>,
    pub events: Vec<Event>,
    pub documents: Vec<Document>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub id: String,
    pub kind: &'static str,
    pub project_id: String,
    pub task_id: String,
    pub title: String,
    pub excerpt: String,
}

pub struct Store {
    pub db: Connection,
    path: PathBuf,
}
impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        if path != Path::new(":memory:") {
            if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
        }
        let mut db = sql(Connection::open(path))?;
        sql(db.busy_timeout(std::time::Duration::from_secs(5)))?;
        // Refuse a newer file before even changing its journal mode.
        migrations::check_version(&db)?;
        sql(db.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;"))?;
        // One immediate transaction for every step: a window and an agent opening an old
        // database together must not both migrate it.
        let tx = sql(db.transaction_with_behavior(TransactionBehavior::Immediate))?;
        migrations::migrate(&tx)?;
        sql(tx.commit())?;
        Ok(Self {
            db,
            path: path.into(),
        })
    }
    pub fn open_default() -> Result<Self> {
        Self::open(&default_database_path())
    }
    pub fn projects(&self) -> Result<Vec<Project>> {
        let mut stmt = sql(self.db.prepare(
            "SELECT id,name,repository_path,color,documents_folder,icon,created_at FROM projects ORDER BY name COLLATE NOCASE",
        ))?;
        let result = sql(stmt
            .query_map([], |r| {
                Ok(Project {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    repository_path: r.get(2)?,
                    color: r.get(3)?,
                    documents_folder: r.get(4)?,
                    icon: r.get(5)?,
                    created_at: r.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect());
        result
    }
    pub fn project(&self, id: &str) -> Result<Project> {
        self.projects()?
            .into_iter()
            .find(|p| p.id.eq_ignore_ascii_case(id))
            .ok_or_else(|| "The project doesn't exist or isn't available.".into())
    }
    /// Creates or updates a project. A new project without a color takes the least used one.
    /// `documents_folder` must already be a canonical folder path. `icon` is left alone when
    /// absent and cleared when `Some(None)`.
    pub fn save_project(
        &self,
        project_id: Option<&str>,
        name: &str,
        repository_path: Option<String>,
        color: Option<i64>,
        documents_folder: Option<String>,
        icon: Option<Option<String>>,
    ) -> Result<Project> {
        let name = name.trim();
        if name.is_empty() {
            return Err("The project needs a name.".into());
        }
        if color.is_some_and(|c| !(0..PROJECT_COLORS).contains(&c)) {
            return Err("Invalid project color.".into());
        }
        if icon.as_ref().is_some_and(|icon| {
            icon.as_ref().is_some_and(|i| {
                i.is_empty() || i.len() > 32 || !i.chars().all(|c| c.is_ascii_alphanumeric())
            })
        }) {
            return Err("Invalid project icon.".into());
        }
        self.write(|| {
            if let Some(project_id) = project_id {
                let mut p = self.project(project_id)?;
                p.name = name.into();
                p.repository_path = repository_path;
                p.color = color.unwrap_or(p.color);
                p.documents_folder = documents_folder;
                if let Some(icon) = icon {
                    p.icon = icon;
                }
                sql(self.db.execute(
                    "UPDATE projects SET name=?,repository_path=?,color=?,documents_folder=?,icon=? WHERE id=?",
                    params![p.name, p.repository_path, p.color, p.documents_folder, p.icon, p.id],
                ))?;
                return Ok(p);
            }
            let color = match color {
                Some(color) => color,
                None => {
                    let mut used = [0; PROJECT_COLORS as usize];
                    for p in self.projects()? {
                        used[p.color as usize] += 1;
                    }
                    (0..PROJECT_COLORS)
                        .min_by_key(|&c| used[c as usize])
                        .unwrap_or(0)
                }
            };
            let project = Project {
                id: id(),
                name: name.into(),
                repository_path,
                color,
                documents_folder,
                icon: icon.flatten(),
                created_at: now(),
            };
            sql(self.db.execute(
                "INSERT INTO projects(id,name,repository_path,color,documents_folder,icon,created_at) VALUES(?,?,?,?,?,?,?)",
                params![
                    project.id,
                    project.name,
                    project.repository_path,
                    project.color,
                    project.documents_folder,
                    project.icon,
                    project.created_at
                ],
            ))?;
            for name in DEFAULT_CATEGORIES {
                self.remember_category(&project.id, name)?;
            }
            Ok(project)
        })
    }
    pub fn task_details(&self, task_id: &str, project_id: &str) -> Result<TaskDetails> {
        Ok(TaskDetails {
            task: self.task(task_id, project_id)?,
            messages: self.messages(task_id, project_id)?,
            checks: self.checks(task_id, project_id)?,
            notes: self.notes(task_id, project_id)?,
            events: self.events(task_id, project_id)?,
            documents: self.documents(Some((task_id, project_id)))?,
        })
    }
    pub fn snapshot(&self) -> Result<Snapshot> {
        Ok(Snapshot {
            source: "database",
            database_path: self.path.display().to_string(),
            projects: self.projects()?,
            tasks: self.tasks(None)?,
            categories: self.categories()?,
            goals: self.goals(None)?,
            documents: self.documents(None)?,
        })
    }
}
impl From<&Task> for TaskInput {
    fn from(t: &Task) -> Self {
        Self {
            project_id: t.project_id.clone(),
            title: t.title.clone(),
            details: t.details.clone(),
            category: t.category.clone(),
            assignee: t.assignee.clone(),
            status: t.status.clone(),
            agent_summary: t.agent_summary.clone(),
            repository_branch: t.repository_branch.clone(),
            commit_hash: t.commit_hash.clone(),
            pull_request_url: t.pull_request_url.clone(),
            pull_request_number: t.pull_request_number,
            goal_id: t.goal_id.clone(),
        }
    }
}
fn validate_actor(actor: &str) -> Result<()> {
    if ["user", "agent"].contains(&actor) {
        Ok(())
    } else {
        Err("Invalid author.".into())
    }
}
pub fn validate_status(status: &str) -> Result<()> {
    if STATUSES.contains(&status) {
        Ok(())
    } else {
        Err("Unknown status.".into())
    }
}
fn map_task(r: &Row) -> rusqlite::Result<Task> {
    Ok(Task {
        id: r.get(0)?,
        project_id: r.get(1)?,
        title: r.get(2)?,
        details: r.get(3)?,
        category: r.get(4)?,
        assignee: r.get(5)?,
        status: r.get(6)?,
        position: r.get(7)?,
        agent_summary: r.get(8)?,
        repository_branch: r.get(9)?,
        commit_hash: r.get(10)?,
        pull_request_url: r.get(11)?,
        pull_request_number: r.get(12)?,
        created_at: r.get(13)?,
        updated_at: r.get(14)?,
        checks_total: r.get(15)?,
        checks_done: r.get(16)?,
        message_count: r.get(17)?,
        document_count: r.get(18)?,
        archived_at: r.get(19)?,
        goal_id: r.get(20)?,
    })
}
pub(crate) fn fold(text: &str) -> String {
    text.nfkd()
        .filter(|c| !is_combining_mark(*c))
        .flat_map(char::to_lowercase)
        .collect()
}
fn excerpt(text: &str, needle: &str) -> String {
    let chars: Vec<char> = text.trim().chars().collect();
    if chars.len() <= 140 {
        return text.trim().into();
    };
    let folded = fold(text);
    let offset = folded
        .find(needle)
        .map(|i| folded[..i].chars().count())
        .unwrap_or(0);
    let start = offset.saturating_sub(48).min(chars.len());
    let end = (start + 112).min(chars.len());
    format!(
        "{}{}{}",
        if start > 0 { "…" } else { "" },
        chars[start..end].iter().collect::<String>(),
        if end < chars.len() { "…" } else { "" }
    )
}

fn nullable_patch<'de, D, T>(deserializer: D) -> std::result::Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}
