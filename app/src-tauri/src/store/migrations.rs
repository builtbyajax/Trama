//! The database schema, one function per version. Each one runs only on a database older than
//! it, inside the transaction `Store::open` holds, and leaves `user_version` at its own number.
use super::*;

/// The version of the schema this build writes.
const LATEST: i64 = 9;

/// Brings the database up to `LATEST`; refuses one written by a newer build.
pub(super) fn migrate(tx: &Transaction) -> Result<()> {
    let version: i64 = sql(tx.query_row("PRAGMA user_version", [], |r| r.get(0)))?;
    if version > LATEST {
        return Err("This database uses a newer version of Trama. Update the app.".into());
    }
    let steps: [fn(&Transaction) -> Result<()>; LATEST as usize] =
        [v1, v2, v3, v4, v5, v6, v7, v8, v9];
    for step in &steps[version as usize..] {
        step(tx)?;
    }
    Ok(())
}

fn v1(tx: &Transaction) -> Result<()> {
    sql(tx.execute_batch("CREATE TABLE projects(id TEXT PRIMARY KEY NOT NULL,name TEXT NOT NULL,repository_path TEXT,created_at REAL NOT NULL);
CREATE TABLE tasks(id TEXT PRIMARY KEY NOT NULL,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,title TEXT NOT NULL,details TEXT NOT NULL DEFAULT '',category TEXT NOT NULL,assignee TEXT NOT NULL CHECK(assignee IN('user','agent')),status TEXT NOT NULL CHECK(status IN('todo','inProgress','review','done','preparing','reserved')),agent_summary TEXT,created_at REAL NOT NULL,updated_at REAL NOT NULL);
CREATE INDEX tasks_project_updated ON tasks(project_id,updated_at DESC); CREATE INDEX tasks_status ON tasks(status);
CREATE TABLE task_messages(id TEXT PRIMARY KEY NOT NULL,task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,author TEXT NOT NULL CHECK(author IN('user','agent')),body TEXT NOT NULL,created_at REAL NOT NULL);
CREATE INDEX task_messages_task_created ON task_messages(task_id,created_at);
CREATE TABLE task_checks(id TEXT PRIMARY KEY NOT NULL,task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,title TEXT NOT NULL,is_complete INTEGER NOT NULL DEFAULT 0 CHECK(is_complete IN(0,1))); PRAGMA user_version=1;"))?;
    Ok(())
}

fn v2(tx: &Transaction) -> Result<()> {
    sql(tx.execute_batch("ALTER TABLE tasks ADD COLUMN repository_branch TEXT; ALTER TABLE tasks ADD COLUMN commit_hash TEXT; ALTER TABLE tasks ADD COLUMN pull_request_url TEXT; ALTER TABLE tasks ADD COLUMN pull_request_number INTEGER; PRAGMA user_version=2;"))?;
    Ok(())
}

fn v3(tx: &Transaction) -> Result<()> {
    // Notes, manual order inside each column (seeded from the previous newest-first
    // order) and the per-project category list (defaults plus every category in use).
    sql(tx.execute_batch("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
UPDATE tasks SET position=(SELECT COUNT(*) FROM tasks o WHERE o.project_id=tasks.project_id AND o.status=tasks.status AND (o.updated_at>tasks.updated_at OR (o.updated_at=tasks.updated_at AND o.id<tasks.id)));
CREATE INDEX tasks_project_status_position ON tasks(project_id,status,position);
CREATE TABLE task_categories(project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,name TEXT NOT NULL COLLATE NOCASE,PRIMARY KEY(project_id,name));
INSERT OR IGNORE INTO task_categories(project_id,name) SELECT DISTINCT project_id,category FROM tasks;"))?;
    for name in DEFAULT_CATEGORIES {
        sql(tx.execute(
            "INSERT OR IGNORE INTO task_categories(project_id,name) SELECT id,? FROM projects",
            [name],
        ))?;
    }
    sql(tx.execute_batch("PRAGMA user_version=3;"))?;
    Ok(())
}

fn v4(tx: &Transaction) -> Result<()> {
    // Notes become separate entries and the task gains an activity log. Each note text
    // becomes one entry; existing tasks get their creation and the agent's delivery.
    sql(tx.execute_batch("CREATE TABLE task_notes(id TEXT PRIMARY KEY NOT NULL,task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,body TEXT NOT NULL,created_at REAL NOT NULL);
CREATE INDEX task_notes_task_created ON task_notes(task_id,created_at);
CREATE TABLE task_events(id TEXT PRIMARY KEY NOT NULL,task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,actor TEXT CHECK(actor IN('user','agent')),kind TEXT NOT NULL,value TEXT,created_at REAL NOT NULL);
CREATE INDEX task_events_task_created ON task_events(task_id,created_at);"))?;
    type Legacy = (
        String,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<i64>,
        f64,
        f64,
    );
    let rows: Vec<Legacy> = {
        let mut stmt = sql(tx.prepare("SELECT id,notes,agent_summary,repository_branch,commit_hash,pull_request_number,created_at,updated_at FROM tasks"))?;
        let rows = sql(stmt
            .query_map([], |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                    r.get(6)?,
                    r.get(7)?,
                ))
            })
            .and_then(|rows| rows.collect()))?;
        rows
    };
    for (task, notes, summary, branch, commit, pr, created, updated) in rows {
        if !notes.trim().is_empty() {
            sql(tx.execute(
                "INSERT INTO task_notes(id,task_id,body,created_at) VALUES(?,?,?,?)",
                params![id(), task, notes.trim(), updated],
            ))?;
        }
        let mut events = vec![(None, "created", None, created)];
        for (kind, value) in [
            ("summary", summary),
            ("branch", branch),
            ("commit", commit),
            ("pullRequest", pr.map(|n| n.to_string())),
        ] {
            if value.is_some() {
                events.push((Some("agent"), kind, value, updated));
            }
        }
        for (actor, kind, value, at) in events {
            sql(tx.execute(
                    "INSERT INTO task_events(id,task_id,actor,kind,value,created_at) VALUES(?,?,?,?,?,?)",
                    params![id(), task, actor, kind, value, at],
                ))?;
        }
    }
    sql(tx.execute_batch("ALTER TABLE tasks DROP COLUMN notes; PRAGMA user_version=4;"))?;
    Ok(())
}

fn v5(tx: &Transaction) -> Result<()> {
    // Projects keep a chosen color; existing ones keep the one their position gave them.
    sql(tx.execute_batch(&format!("ALTER TABLE projects ADD COLUMN color INTEGER NOT NULL DEFAULT 0;
UPDATE projects SET color=(SELECT COUNT(*) FROM projects o WHERE o.name<projects.name COLLATE NOCASE OR (o.name=projects.name COLLATE NOCASE AND o.id<projects.id))%{PROJECT_COLORS};
PRAGMA user_version=5;")))?;
    Ok(())
}

fn v6(tx: &Transaction) -> Result<()> {
    // App settings, each project's notes folder and the notes attached to tasks.
    sql(tx.execute_batch("CREATE TABLE settings(key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL);
ALTER TABLE projects ADD COLUMN documents_folder TEXT;
CREATE TABLE task_documents(task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,path TEXT NOT NULL,actor TEXT NOT NULL CHECK(actor IN('user','agent')),created_at REAL NOT NULL,PRIMARY KEY(task_id,path));
PRAGMA user_version=6;"))?;
    Ok(())
}

fn v7(tx: &Transaction) -> Result<()> {
    // An optional icon for each project, shown instead of its initial.
    sql(tx.execute_batch("ALTER TABLE projects ADD COLUMN icon TEXT; PRAGMA user_version=7;"))?;
    Ok(())
}

fn v8(tx: &Transaction) -> Result<()> {
    // A done task the person archived before the week passes. Leaving done, by any path, takes it
    // out of the archive, so the trigger clears it on every status change.
    sql(tx.execute_batch("ALTER TABLE tasks ADD COLUMN archived_at REAL;
CREATE TRIGGER tasks_unarchive AFTER UPDATE OF status ON tasks WHEN NEW.status<>OLD.status AND NEW.archived_at IS NOT NULL BEGIN UPDATE tasks SET archived_at=NULL WHERE id=NEW.id; END;
PRAGMA user_version=8;"))?;
    Ok(())
}

fn v9(tx: &Transaction) -> Result<()> {
    // Migração, Refatoração, Interface, Segurança and Desempenho joined the defaults; existing
    // projects get them too.
    for name in [
        "Migração",
        "Refatoração",
        "Interface",
        "Segurança",
        "Desempenho",
    ] {
        sql(tx.execute(
            "INSERT OR IGNORE INTO task_categories(project_id,name) SELECT id,? FROM projects",
            [name],
        ))?;
    }
    sql(tx.execute_batch("PRAGMA user_version=9;"))?;
    Ok(())
}
