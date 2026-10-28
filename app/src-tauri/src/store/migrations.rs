//! The database schema, one function per version. Each one runs only on a database older than
//! it, inside the transaction `Store::open` holds, and leaves `user_version` at its own number.
use super::*;

/// The version of the schema this build writes.
const LATEST: i64 = SCHEMA_VERSION;

pub(super) fn check_version(db: &Connection) -> Result<i64> {
    let version: i64 = sql(db.query_row("PRAGMA user_version", [], |r| r.get(0)))?;
    if version < 0 {
        return Err("The database has an invalid schema version.".into());
    }
    if version > LATEST {
        return Err("This database uses a newer version of Trama. Update the app.".into());
    }
    Ok(version)
}

/// Brings the database up to `LATEST`; refuses one written by a newer build.
pub(super) fn migrate(tx: &Transaction) -> Result<()> {
    let version = check_version(tx)?;
    let steps: [fn(&Transaction) -> Result<()>; LATEST as usize] =
        [v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11, v12, v13, v14];
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

fn v10(tx: &Transaction) -> Result<()> {
    // Goals: what a group of a project's tasks is for. A task belongs to at most one; deleting the
    // goal leaves its tasks on the board without one.
    sql(tx.execute_batch("CREATE TABLE goals(id TEXT PRIMARY KEY NOT NULL,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',target_date TEXT,completed_at REAL,created_at REAL NOT NULL);
CREATE INDEX goals_project ON goals(project_id,created_at);
ALTER TABLE tasks ADD COLUMN goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL;
CREATE INDEX tasks_goal ON tasks(goal_id);
PRAGMA user_version=10;"))?;
    Ok(())
}

fn v11(tx: &Transaction) -> Result<()> {
    // Done is the Archive: `archived_at` becomes when the task got there, kept by the database on
    // every path, and the hand-archiving of v8 goes away. Done tasks take the time of their last
    // move to done, or their last update when the history doesn't have it.
    sql(tx.execute_batch("DROP TRIGGER tasks_unarchive;
UPDATE tasks SET archived_at=NULL WHERE status<>'done';
UPDATE tasks SET archived_at=COALESCE((SELECT MAX(e.created_at) FROM task_events e WHERE e.task_id=tasks.id AND e.kind='status' AND e.value='done'),updated_at) WHERE status='done';
CREATE TRIGGER tasks_archive AFTER UPDATE OF status ON tasks WHEN NEW.status<>OLD.status AND (NEW.status='done' OR OLD.status='done') BEGIN UPDATE tasks SET archived_at=CASE WHEN NEW.status='done' THEN (julianday('now')-2440587.5)*86400.0 END WHERE id=NEW.id; END;
CREATE TRIGGER tasks_archive_new AFTER INSERT ON tasks WHEN NEW.status='done' AND NEW.archived_at IS NULL BEGIN UPDATE tasks SET archived_at=(julianday('now')-2440587.5)*86400.0 WHERE id=NEW.id; END;
CREATE INDEX tasks_archived ON tasks(archived_at) WHERE status='done';
PRAGMA user_version=11;"))?;
    Ok(())
}

fn v12(tx: &Transaction) -> Result<()> {
    // Drafts and Reserved become one status, backlog (Pendências on the board). Drafts go after the
    // reserved tasks of their project, each group keeping its order, and the history follows.
    //
    // Only the CHECK of `status` changes, so the schema text is edited in place, the way SQLite
    // documents for constraints: rebuilding the table would cascade-delete every message, check,
    // event and note, since foreign keys are on. Every row is moved off the old values first.
    sql(tx.execute_batch("CREATE TEMP TABLE draft_shift AS SELECT project_id,COALESCE((SELECT MAX(r.position) FROM tasks r WHERE r.project_id=d.project_id AND r.status='reserved'),-1)+1-MIN(d.position) AS shift FROM tasks d WHERE d.status='preparing' GROUP BY d.project_id;
UPDATE tasks SET position=position+(SELECT shift FROM draft_shift s WHERE s.project_id=tasks.project_id) WHERE status='preparing';
DROP TABLE draft_shift;"))?;
    const OLD: &str =
        "CHECK(status IN('todo','inProgress','review','done','preparing','reserved'))";
    const NEW: &str = "CHECK(status IN('backlog','todo','inProgress','review','done'))";
    let table: String = sql(tx.query_row(
        "SELECT sql FROM sqlite_schema WHERE type='table' AND name='tasks'",
        [],
        |r| r.get(0),
    ))?;
    let Some(check) = status_check(&table, OLD) else {
        return Err("The tasks table doesn't have the expected statuses.".into());
    };
    let version: i64 = sql(tx.query_row("PRAGMA schema_version", [], |r| r.get(0)))?;
    sql(tx.execute_batch("PRAGMA writable_schema=ON;"))?;
    sql(tx.execute(
        "UPDATE sqlite_schema SET sql=? WHERE type='table' AND name='tasks'",
        [format!(
            "{}{NEW}{}",
            &table[..check.start],
            &table[check.end..]
        )],
    ))?;
    sql(tx.execute_batch(&format!(
        "PRAGMA schema_version={}; PRAGMA writable_schema=OFF;",
        version + 1
    )))?;
    sql(tx.execute_batch(
        "UPDATE tasks SET status='backlog' WHERE status IN('preparing','reserved');
UPDATE task_events SET value='backlog' WHERE kind='status' AND value IN('preparing','reserved');
PRAGMA user_version=12;",
    ))?;
    Ok(())
}

fn v13(tx: &Transaction) -> Result<()> {
    // Agent profiles: each MCP session is one. A task with the agent may name the profile that
    // has it; without one it is for any agent, which is what every existing agent task becomes.
    // Messages and events keep the profile that wrote them; older ones have none and show as the
    // agent. Only columns are added, so the assignee CHECK and every row stay as they are.
    sql(tx.execute_batch("CREATE TABLE agent_profiles(id TEXT PRIMARY KEY NOT NULL,client TEXT NOT NULL DEFAULT '',name TEXT,color INTEGER NOT NULL DEFAULT 0,avatar TEXT,edited_by_user INTEGER NOT NULL DEFAULT 0 CHECK(edited_by_user IN(0,1)),created_at REAL NOT NULL,active_at REAL NOT NULL,alive_at REAL NOT NULL,ended_at REAL,deleted_at REAL);
ALTER TABLE tasks ADD COLUMN agent_profile_id TEXT REFERENCES agent_profiles(id) ON DELETE SET NULL;
ALTER TABLE task_messages ADD COLUMN agent_profile_id TEXT REFERENCES agent_profiles(id) ON DELETE SET NULL;
ALTER TABLE task_events ADD COLUMN agent_profile_id TEXT REFERENCES agent_profiles(id) ON DELETE SET NULL;
CREATE INDEX tasks_agent_profile ON tasks(agent_profile_id);
PRAGMA user_version=13;"))?;
    Ok(())
}

fn v14(tx: &Transaction) -> Result<()> {
    // Goals gain a version and a place in the sidebar's order. The version comes from the
    // "(vX.Y.Z)" at the end of the name, which stays as it is; the order is the creation one.
    sql(tx.execute_batch("ALTER TABLE goals ADD COLUMN version TEXT;
ALTER TABLE goals ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
UPDATE goals SET position=(SELECT COUNT(*) FROM goals o WHERE o.project_id=goals.project_id AND (o.created_at<goals.created_at OR (o.created_at=goals.created_at AND o.id<goals.id)));"))?;
    let names: Vec<(String, String)> = {
        let mut stmt = sql(tx.prepare("SELECT id,name FROM goals"))?;
        let rows = sql(stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .and_then(|rows| rows.collect()));
        rows?
    };
    for (goal, name) in names {
        if let Some(version) = version_in_name(&name) {
            sql(tx.execute(
                "UPDATE goals SET version=? WHERE id=?",
                params![version, goal],
            ))?;
        }
    }
    sql(tx.execute_batch("PRAGMA user_version=14;"))?;
    Ok(())
}

/// The `X.Y.Z` of a name ending in "(vX.Y.Z)".
fn version_in_name(name: &str) -> Option<&str> {
    let inner = name.trim_end().strip_suffix(')')?;
    let version = &inner[inner.rfind("(v")? + 2..];
    let parts: Vec<&str> = version.split('.').collect();
    let numeric = |p: &&str| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit());
    (parts.len() >= 2 && parts.iter().all(numeric)).then_some(version)
}

/// Where `check` is in the table's schema text, compared without spaces: databases created by the
/// first releases keep the text as it was typed, with `CHECK (status IN ('todo', …))`. `None`
/// when it isn't there exactly once.
fn status_check(table: &str, check: &str) -> Option<std::ops::Range<usize>> {
    let squeeze = |text: &str| text.split_whitespace().collect::<String>();
    let wanted = squeeze(check);
    let mut found = None;
    for (start, _) in table.match_indices("CHECK") {
        let mut depth = 0;
        let end = table[start..].char_indices().find_map(|(i, c)| {
            match c {
                '(' => depth += 1,
                ')' if depth == 1 => return Some(start + i + 1),
                ')' => depth -= 1,
                _ => {}
            }
            None
        })?;
        if squeeze(&table[start..end]) == wanted {
            if found.is_some() {
                return None;
            }
            found = Some(start..end);
        }
    }
    found
}
