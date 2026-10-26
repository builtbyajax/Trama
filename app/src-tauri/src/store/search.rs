//! Search across tasks and messages, ignoring case and accents.
use super::*;

impl Store {
    pub fn search(&self, query: &str) -> Result<Vec<SearchResult>> {
        let needle = fold(query.trim());
        if needle.is_empty() {
            return Ok(vec![]);
        }
        let projects = self.projects()?;
        let tasks = self.tasks(None)?;
        let mut notes = std::collections::HashMap::<String, String>::new();
        {
            let mut stmt = sql(self
                .db
                .prepare("SELECT task_id,body FROM task_notes ORDER BY created_at,rowid"))?;
            let rows = sql(stmt
                .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
                .and_then(|rows| rows.collect::<rusqlite::Result<Vec<_>>>()))?;
            for (task, body) in rows {
                let text = notes.entry(task).or_default();
                if !text.is_empty() {
                    text.push('\n');
                }
                text.push_str(&body);
            }
        }
        let mut results = vec![];
        for task in &tasks {
            let prefix = projects
                .iter()
                .find(|p| p.id == task.project_id)
                .map(|p| format!("{} · ", p.name))
                .unwrap_or_default();
            let task_notes = notes.get(&task.id).map_or("", String::as_str);
            let notes_only =
                !fold(&task.title).contains(&needle) && !fold(&task.details).contains(&needle);
            if !notes_only || fold(task_notes).contains(&needle) {
                let kind = "task";
                results.push(SearchResult {
                    id: format!("task:{}", task.id),
                    kind,
                    project_id: task.project_id.clone(),
                    task_id: task.id.clone(),
                    title: task.title.clone(),
                    excerpt: format!(
                        "{}{}",
                        prefix,
                        if notes_only {
                            excerpt(task_notes, &needle)
                        } else {
                            excerpt(&format!("{} — {}", task.title, task.details), &needle)
                        }
                    ),
                });
            }
        }
        Ok(results)
    }
}
