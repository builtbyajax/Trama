//! The categories each project offers for its tasks.
use super::*;

impl Store {
    pub(super) fn remember_category(&self, project_id: &str, name: &str) -> Result<()> {
        let name = name.trim();
        if !name.is_empty() {
            sql(self.db.execute(
                "INSERT OR IGNORE INTO task_categories(project_id,name) VALUES(?,?)",
                params![project_id, name],
            ))?;
        }
        Ok(())
    }
    /// The category a task gets when none is given: "Feature", or "Funcionalidade" in projects
    /// created while the default categories were in Portuguese.
    pub fn default_category(&self, project_id: &str) -> Result<String> {
        let names: Vec<String> = self
            .categories()?
            .into_iter()
            .filter(|c| c.project_id == project_id)
            .map(|c| c.name)
            .collect();
        let has = |name: &str| names.iter().any(|n| n.eq_ignore_ascii_case(name));
        Ok(if !has("Feature") && has("Funcionalidade") {
            "Funcionalidade".into()
        } else {
            DEFAULT_CATEGORIES[0].into()
        })
    }
    /// Known categories of every project with how many tasks (drafts included) use each one.
    pub fn categories(&self) -> Result<Vec<Category>> {
        let mut stmt = sql(self.db.prepare("SELECT c.project_id,c.name,(SELECT COUNT(*) FROM tasks t WHERE t.project_id=c.project_id AND t.category=c.name COLLATE NOCASE) FROM task_categories c ORDER BY c.project_id,c.name"))?;
        let result = sql(stmt
            .query_map([], |r| {
                Ok(Category {
                    project_id: r.get(0)?,
                    name: r.get(1)?,
                    task_count: r.get(2)?,
                })
            })
            .and_then(|rows| rows.collect()));
        result
    }
    /// Adds a category to a project's list before any task uses it. Names are compared without
    /// regard to case, as everywhere else.
    pub fn create_category(&self, project_id: &str, name: &str) -> Result<Category> {
        let project = self.project(project_id)?;
        let name = name.trim();
        if name.is_empty() {
            return Err("Give the category a name.".into());
        }
        if name.chars().count() > 80 {
            return Err("The category name can be up to 80 characters.".into());
        }
        let added = sql(self.db.execute(
            "INSERT OR IGNORE INTO task_categories(project_id,name) VALUES(?,?)",
            params![project.id, name],
        ))?;
        if added == 0 {
            return Err(format!("“{name}” already exists in this project."));
        }
        Ok(Category {
            project_id: project.id,
            name: name.into(),
            task_count: 0,
        })
    }
    /// Removes a category from a project. Tasks that use it keep every other field and move to
    /// `replacement`, which is required while any task uses the category.
    pub fn delete_category(
        &self,
        project_id: &str,
        name: &str,
        replacement: Option<&str>,
    ) -> Result<CategoryDeletion> {
        self.delete_category_as(project_id, name, replacement, "user")
    }
    pub fn delete_category_as(
        &self,
        project_id: &str,
        name: &str,
        replacement: Option<&str>,
        actor: &str,
    ) -> Result<CategoryDeletion> {
        validate_actor(actor)?;
        let project = self.project(project_id)?;
        let tx = sql(Transaction::new_unchecked(
            &self.db,
            TransactionBehavior::Immediate,
        ))?;
        let removed = sql(tx.execute(
            "DELETE FROM task_categories WHERE project_id=? AND name=?",
            params![project.id, name],
        ))?;
        let used: i64 = sql(tx.query_row(
            "SELECT COUNT(*) FROM tasks WHERE project_id=? AND category=? COLLATE NOCASE",
            params![project.id, name],
            |r| r.get(0),
        ))?;
        if removed == 0 && used == 0 {
            return Err("The category doesn't exist in this project.".into());
        }
        if used > 0 {
            let replacement = replacement
                .map(str::trim)
                .filter(|r| !r.is_empty() && !r.eq_ignore_ascii_case(name.trim()))
                .ok_or("Choose which category the tasks will move to.")?;
            sql(tx.execute(
                "INSERT OR IGNORE INTO task_categories(project_id,name) VALUES(?,?)",
                params![project.id, replacement],
            ))?;
            if replacement.chars().count() > 80 {
                return Err("The category name can be up to 80 characters.".into());
            }
            let at = now();
            for task in self
                .tasks(Some(&project.id))?
                .iter()
                .filter(|t| t.category.eq_ignore_ascii_case(name))
            {
                self.record(&task.id, actor, "category", Some(replacement), at)?;
            }
            sql(tx.execute(
                "UPDATE tasks SET category=?,updated_at=? WHERE project_id=? AND category=? COLLATE NOCASE",
                params![replacement, at, project.id, name],
            ))?;
        }
        sql(tx.commit())?;
        Ok(CategoryDeletion { moved: used })
    }
}
