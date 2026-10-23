//! Copies between database files: a whole workspace, or one project into another workspace.
use super::*;

/// Every table that holds a project's data, parents first, with the rows that belong to it.
const PROJECT_TABLES: [(&str, &str); 8] = [
    ("projects", "id=?1"),
    ("task_categories", "project_id=?1"),
    ("tasks", "project_id=?1"),
    (
        "task_messages",
        "task_id IN(SELECT id FROM main.tasks WHERE project_id=?1)",
    ),
    (
        "task_checks",
        "task_id IN(SELECT id FROM main.tasks WHERE project_id=?1)",
    ),
    (
        "task_notes",
        "task_id IN(SELECT id FROM main.tasks WHERE project_id=?1)",
    ),
    (
        "task_events",
        "task_id IN(SELECT id FROM main.tasks WHERE project_id=?1)",
    ),
    (
        "task_documents",
        "task_id IN(SELECT id FROM main.tasks WHERE project_id=?1)",
    ),
];

impl Store {
    /// Moves a project, with its tasks, activity, checklist, private notes, categories and
    /// attachments, into the workspace at `target`. Both files are written in one transaction, so
    /// the project ends up in exactly one of them.
    pub fn move_project_to(&self, project_id: &str, target: &Path) -> Result<()> {
        let project = self.project(project_id)?;
        if target == self.path.as_path() {
            return Err("The project is already in this workspace.".into());
        }
        if !target.is_file() {
            return Err("The workspace file doesn't exist.".into());
        }
        // Opening it brings the other file to this schema, so the columns line up.
        drop(Store::open(target)?);
        sql(self.db.execute(
            "ATTACH DATABASE ? AS target",
            [target.display().to_string()],
        ))?;
        let moved = self.write(|| {
            let taken: bool = sql(self.db.query_row(
                "SELECT EXISTS(SELECT 1 FROM target.projects WHERE id=?)",
                [&project.id],
                |r| r.get(0),
            ))?;
            if taken {
                return Err("The other workspace already has this project.".into());
            }
            for (table, rows) in PROJECT_TABLES {
                let columns = {
                    let mut stmt = sql(self
                        .db
                        .prepare(&format!("SELECT name FROM pragma_table_info('{table}')")))?;
                    let names: Vec<String> =
                        sql(stmt.query_map([], |r| r.get(0)).and_then(|r| r.collect()))?;
                    names.join(",")
                };
                sql(self.db.execute(
                    &format!("INSERT INTO target.{table}({columns}) SELECT {columns} FROM main.{table} WHERE {rows}"),
                    [&project.id],
                ))?;
            }
            sql(self
                .db
                .execute("DELETE FROM main.projects WHERE id=?", [&project.id]))?;
            Ok(())
        });
        let detached = sql(self.db.execute("DETACH DATABASE target", []));
        moved.and(detached.map(|_| ()))
    }
}
