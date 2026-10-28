//! Goals: what a group of a project's tasks is for.
use super::*;

fn map_goal(r: &Row) -> rusqlite::Result<Goal> {
    Ok(Goal {
        id: r.get(0)?,
        project_id: r.get(1)?,
        name: r.get(2)?,
        description: r.get(3)?,
        target_date: r.get(4)?,
        version: r.get(5)?,
        position: r.get(6)?,
        completed_at: r.get(7)?,
        created_at: r.get(8)?,
    })
}

impl Store {
    /// Goals of one project, or of every project, in the order the person gave them.
    pub fn goals(&self, project_id: Option<&str>) -> Result<Vec<Goal>> {
        let mut stmt = sql(self.db.prepare("SELECT id,project_id,name,description,target_date,version,position,completed_at,created_at FROM goals WHERE (?1 IS NULL OR project_id=?1 COLLATE NOCASE) ORDER BY position,created_at,id"))?;
        let result = sql(stmt
            .query_map([project_id], map_goal)
            .and_then(|rows| rows.collect()));
        result
    }
    pub fn goal(&self, goal_id: &str, project_id: &str) -> Result<Goal> {
        let result = sql(self.db.query_row("SELECT id,project_id,name,description,target_date,version,position,completed_at,created_at FROM goals WHERE id=?1 COLLATE NOCASE AND project_id=?2 COLLATE NOCASE", params![goal_id, project_id], map_goal).optional())?;
        result.ok_or_else(|| "The goal doesn't exist or isn't in this project.".into())
    }
    /// Creates a goal at the end of the list, or edits one when `goal_id` is given. `target_date`
    /// is a day, `YYYY-MM-DD`; `version` is free text, such as `0.4.1`.
    pub fn save_goal(
        &self,
        goal_id: Option<&str>,
        project_id: &str,
        name: &str,
        description: &str,
        target_date: Option<&str>,
        version: Option<&str>,
    ) -> Result<Goal> {
        let project = self.project(project_id)?;
        let name = name.trim();
        if name.is_empty() {
            return Err("The goal needs a name.".into());
        }
        if name.chars().count() > 80 {
            return Err("The goal name can be up to 80 characters.".into());
        }
        let target_date = target_date.map(str::trim).filter(|d| !d.is_empty());
        if target_date.is_some_and(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").is_err()) {
            return Err("The target date must be a day, as YYYY-MM-DD.".into());
        }
        let version = version.map(str::trim).filter(|v| !v.is_empty());
        if version.is_some_and(|v| v.chars().count() > 24) {
            return Err("The version can be up to 24 characters.".into());
        }
        let description = description.trim();
        self.write(|| {
            let id = match goal_id {
                Some(goal_id) => {
                    let goal = self.goal(goal_id, &project.id)?;
                    sql(self.db.execute(
                        "UPDATE goals SET name=?,description=?,target_date=?,version=? WHERE id=?",
                        params![name, description, target_date, version, goal.id],
                    ))?;
                    goal.id
                }
                None => {
                    let goal = id();
                    sql(self.db.execute(
                        "INSERT INTO goals(id,project_id,name,description,target_date,version,position,created_at) VALUES(?,?,?,?,?,?,(SELECT COALESCE(MAX(position),-1)+1 FROM goals WHERE project_id=?),?)",
                        params![goal, project.id, name, description, target_date, version, project.id, now()],
                    ))?;
                    goal
                }
            };
            self.goal(&id, &project.id)
        })
    }
    /// Puts a goal right after `after_id` in the project's list, or at the top without it.
    pub fn move_goal(
        &self,
        goal_id: &str,
        project_id: &str,
        after_id: Option<&str>,
    ) -> Result<Vec<Goal>> {
        let goal = self.goal(goal_id, project_id)?;
        self.write(|| {
            let mut order: Vec<String> = self
                .goals(Some(&goal.project_id))?
                .into_iter()
                .map(|g| g.id)
                .filter(|id| *id != goal.id)
                .collect();
            let index = after_id
                .and_then(|after| order.iter().position(|id| id.eq_ignore_ascii_case(after)))
                .map_or(0, |i| i + 1);
            order.insert(index, goal.id.clone());
            for (position, id) in order.iter().enumerate() {
                sql(self.db.execute(
                    "UPDATE goals SET position=? WHERE id=?",
                    params![position as i64, id],
                ))?;
            }
            self.goals(Some(&goal.project_id))
        })
    }
    /// Concludes a goal, taking it out of the open list, or reopens it.
    pub fn complete_goal(&self, goal_id: &str, project_id: &str, completed: bool) -> Result<Goal> {
        let goal = self.goal(goal_id, project_id)?;
        sql(self.db.execute(
            "UPDATE goals SET completed_at=? WHERE id=?",
            params![completed.then(now), goal.id],
        ))?;
        self.goal(&goal.id, &goal.project_id)
    }
    /// Deletes a goal; its tasks stay, without one.
    pub fn delete_goal(&self, goal_id: &str, project_id: &str) -> Result<()> {
        let goal = self.goal(goal_id, project_id)?;
        sql(self.db.execute("DELETE FROM goals WHERE id=?", [&goal.id]))?;
        Ok(())
    }
}
