//! Operations shared by MCP and desktop storage. Every multi-step write holds one
//! immediate transaction, so validation and activity refer to the same state.
use super::*;
use crate::documents;

impl Store {
    pub(crate) fn write<T>(&self, operation: impl FnOnce() -> Result<T>) -> Result<T> {
        let tx = sql(Transaction::new_unchecked(
            &self.db,
            TransactionBehavior::Immediate,
        ))?;
        let result = operation()?;
        sql(tx.commit())?;
        Ok(result)
    }
    pub fn edit_project(
        &self,
        project_id: &str,
        name: Option<&str>,
        repository_path: Option<Option<String>>,
    ) -> Result<Project> {
        self.write(|| {
            let mut p = self.project(project_id)?;
            if let Some(name) = name {
                if name.trim().is_empty() {
                    return Err("The project needs a name.".into());
                }
                p.name = name.trim().into();
            }
            if let Some(path) = repository_path {
                p.repository_path = path;
            }
            sql(self.db.execute(
                "UPDATE projects SET name=?,repository_path=? WHERE id=?",
                params![p.name, p.repository_path, p.id],
            ))?;
            Ok(p)
        })
    }
    pub fn delete_project(&self, project_id: &str) -> Result<()> {
        let p = self.project(project_id)?;
        sql(self.db.execute("DELETE FROM projects WHERE id=?", [p.id]))?;
        Ok(())
    }
    pub fn rename_category(
        &self,
        project_id: &str,
        name: &str,
        new_name: &str,
        actor: &str,
    ) -> Result<Category> {
        validate_actor(actor)?;
        let new_name = new_name.trim();
        if new_name.is_empty() || new_name.chars().count() > 80 {
            return Err("The category needs between 1 and 80 characters.".into());
        }
        self.write(|| {
            let p = self.project(project_id)?;
            let changed = sql(self.db.execute("UPDATE task_categories SET name=? WHERE project_id=? AND name=? COLLATE NOCASE", params![new_name,p.id,name.trim()]))?;
            if changed != 1 { return Err("The category doesn't exist in this project.".into()); }
            let at = now();
            for t in self.tasks(Some(&p.id))?.iter().filter(|t| t.category.eq_ignore_ascii_case(name.trim())) {
                self.record(&t.id, actor, "category", Some(new_name), at)?;
            }
            sql(self.db.execute("UPDATE tasks SET category=?,updated_at=? WHERE project_id=? AND category=? COLLATE NOCASE", params![new_name,at,p.id,name.trim()]))?;
            self.categories()?.into_iter().find(|c| c.project_id==p.id && c.name==new_name).ok_or_else(|| "Category unavailable.".into())
        })
    }
    pub(super) fn touch_task(&self, task_id: &str) -> Result<()> {
        sql(self.db.execute(
            "UPDATE tasks SET updated_at=? WHERE id=?",
            params![now(), task_id],
        ))?;
        Ok(())
    }
    pub fn edit_message(
        &self,
        task_id: &str,
        project_id: &str,
        message_id: &str,
        body: &str,
    ) -> Result<Message> {
        self.write(|| {
            let task = self.task(task_id, project_id)?;
            if body.trim().is_empty() {
                return Err("The message can't be empty.".into());
            }
            let mut m = self
                .messages(&task.id, &task.project_id)?
                .into_iter()
                .find(|m| m.id.eq_ignore_ascii_case(message_id))
                .ok_or("The message doesn't exist in this task.")?;
            sql(self.db.execute(
                "UPDATE task_messages SET body=? WHERE id=? AND task_id=?",
                params![body.trim(), m.id, task.id],
            ))?;
            self.touch_task(&task.id)?;
            m.body = body.trim().into();
            Ok(m)
        })
    }
    pub fn delete_message(&self, task_id: &str, project_id: &str, message_id: &str) -> Result<()> {
        self.write(|| {
            let task = self.task(task_id, project_id)?;
            let changed = sql(self.db.execute(
                "DELETE FROM task_messages WHERE id=? COLLATE NOCASE AND task_id=?",
                params![message_id, task.id],
            ))?;
            if changed != 1 {
                return Err("The message doesn't exist in this task.".into());
            }
            self.touch_task(&task.id)
        })
    }
    pub fn edit_check(
        &self,
        task_id: &str,
        project_id: &str,
        check_id: &str,
        title: Option<&str>,
        is_complete: Option<bool>,
    ) -> Result<Check> {
        self.write(|| {
            let task = self.task(task_id, project_id)?;
            let mut c = self
                .checks(&task.id, &task.project_id)?
                .into_iter()
                .find(|c| c.id.eq_ignore_ascii_case(check_id))
                .ok_or("Check unavailable in this project.")?;
            if let Some(title) = title {
                if title.trim().is_empty() {
                    return Err("The check needs a title.".into());
                }
                c.title = title.trim().into();
            }
            if let Some(v) = is_complete {
                c.is_complete = v;
            }
            sql(self.db.execute(
                "UPDATE task_checks SET title=?,is_complete=? WHERE id=? AND task_id=?",
                params![c.title, c.is_complete, c.id, task.id],
            ))?;
            self.touch_task(&task.id)?;
            Ok(c)
        })
    }
    pub fn delete_check(&self, task_id: &str, project_id: &str, check_id: &str) -> Result<()> {
        self.write(|| {
            let task = self.task(task_id, project_id)?;
            let changed = sql(self.db.execute(
                "DELETE FROM task_checks WHERE id=? COLLATE NOCASE AND task_id=?",
                params![check_id, task.id],
            ))?;
            if changed != 1 {
                return Err("Check unavailable in this project.".into());
            }
            self.touch_task(&task.id)
        })
    }
    /// The project's notes folder, checked on disk. Errors when none was chosen or it moved.
    pub fn documents_root(&self, project_id: &str) -> Result<std::path::PathBuf> {
        let folder = self
            .project(project_id)?
            .documents_folder
            .ok_or("Choose the project's notes folder in Trama's Notes tab.")?;
        documents::canonical_root(&folder)
    }
    /// Attached notes of one task, or of every task, oldest first.
    pub fn documents(&self, task: Option<(&str, &str)>) -> Result<Vec<Document>> {
        let task_id = match task {
            Some((task_id, project_id)) => Some(self.task(task_id, project_id)?.id),
            None => None,
        };
        let mut stmt = sql(self.db.prepare(
            "SELECT task_id,path,actor,created_at FROM task_documents WHERE ?1 IS NULL OR task_id=?1 ORDER BY created_at,rowid",
        ))?;
        let result = sql(stmt
            .query_map([task_id], |r| {
                Ok(Document {
                    task_id: r.get(0)?,
                    path: r.get(1)?,
                    actor: r.get(2)?,
                    created_at: r.get(3)?,
                })
            })
            .and_then(|rows| rows.collect()));
        result
    }
    /// Attaches a Markdown file of the project's notes folder. `path` is relative to that
    /// folder or absolute inside it.
    pub fn attach_document(
        &self,
        task_id: &str,
        project_id: &str,
        path: &str,
        actor: &str,
    ) -> Result<Document> {
        validate_actor(actor)?;
        let project = self.project(project_id)?;
        let path = documents::note_path(&self.documents_root(&project.id)?, path)?;
        self.write(|| {
            let task = self.task(task_id, &project.id)?;
            let at = now();
            let added = sql(self.db.execute(
                "INSERT OR IGNORE INTO task_documents(task_id,path,actor,created_at) VALUES(?,?,?,?)",
                params![task.id, path, actor, at],
            ))?;
            if added == 1 {
                self.record(&task.id, actor, "document", Some(&path), at)?;
                self.touch_task(&task.id)?;
            }
            self.documents(Some((&task.id, &project.id)))?
                .into_iter()
                .find(|d| d.path == path)
                .ok_or_else(|| "Attachment unavailable.".into())
        })
    }
    /// Removes an attachment; the file itself is not touched.
    pub fn detach_document(
        &self,
        task_id: &str,
        project_id: &str,
        path: &str,
        actor: &str,
    ) -> Result<()> {
        validate_actor(actor)?;
        self.write(|| {
            let task = self.task(task_id, project_id)?;
            let path = path.trim().replace('\\', "/");
            let removed = sql(self.db.execute(
                "DELETE FROM task_documents WHERE task_id=? AND path=?",
                params![task.id, path],
            ))?;
            if removed != 1 {
                return Err("That note isn't attached to this task.".into());
            }
            let at = now();
            self.record(&task.id, actor, "documentRemoved", Some(&path), at)?;
            self.touch_task(&task.id)
        })
    }
    /// Renames a note or folder of the project's notes folder; the tasks it is attached to,
    /// directly or through a note inside the folder, follow the new path.
    pub fn rename_document(&self, project_id: &str, path: &str, name: &str) -> Result<String> {
        let project = self.project(project_id)?;
        let root = self.documents_root(&project.id)?;
        let old = documents::relative(&root, path)?;
        let new = documents::rename(&root, &old, name)?;
        self.write(|| {
            sql(self.db.execute(
                "UPDATE task_documents SET path=?2||substr(path,length(?1)+1)
                 WHERE (path=?1 OR substr(path,1,length(?1)+1)=?1||'/')
                 AND task_id IN (SELECT id FROM tasks WHERE project_id=?3)",
                params![old, new, project.id],
            ))?;
            Ok(new)
        })
    }
    /// Agent search deliberately excludes private notes, including their match/excerpt.
    pub fn search_public(&self, project_id: &str, query: &str) -> Result<Vec<SearchResult>> {
        let p = self.project(project_id)?;
        let needle = fold(query.trim());
        if needle.is_empty() {
            return Ok(vec![]);
        }
        let mut results = vec![];
        for t in self.tasks(Some(&p.id))? {
            let context = format!(
                "{} — {} — {} — {}",
                t.title,
                t.details,
                t.category,
                t.agent_summary.as_deref().unwrap_or("")
            );
            if fold(&context).contains(&needle) {
                results.push(SearchResult {
                    id: format!("task:{}", t.id),
                    kind: if ["preparing", "reserved"].contains(&t.status.as_str()) {
                        "draft"
                    } else {
                        "task"
                    },
                    project_id: p.id.clone(),
                    task_id: t.id.clone(),
                    title: t.title.clone(),
                    excerpt: excerpt(&context, &needle),
                });
            }
            for m in self.messages(&t.id, &p.id)? {
                if fold(&m.body).contains(&needle) {
                    results.push(SearchResult {
                        id: format!("message:{}", m.id),
                        kind: "message",
                        project_id: p.id.clone(),
                        task_id: t.id.clone(),
                        title: t.title.clone(),
                        excerpt: excerpt(&m.body, &needle),
                    });
                }
            }
        }
        Ok(results)
    }
}
