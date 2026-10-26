//! Tasks: saving, editing and moving them, and the activity log each change leaves.
use super::*;

impl Store {
    pub fn tasks(&self, project_id: Option<&str>) -> Result<Vec<Task>> {
        let mut stmt = sql(self.db.prepare(&format!("SELECT {TASK_COLUMNS} FROM tasks t WHERE (?1 IS NULL OR t.project_id=?1 COLLATE NOCASE) ORDER BY t.updated_at DESC")))?;
        let result = sql(stmt
            .query_map([project_id], map_task)
            .map_err(|e| e.to_string())?
            .collect());
        result
    }
    pub fn task(&self, task_id: &str, project_id: &str) -> Result<Task> {
        let result = sql(self.db.query_row(&format!("SELECT {TASK_COLUMNS} FROM tasks t WHERE t.id=?1 COLLATE NOCASE AND t.project_id=?2 COLLATE NOCASE"), params![task_id,project_id], map_task).optional())?;
        result.ok_or_else(|| "The task doesn't exist or isn't available in this project.".into())
    }
    /// Creates or updates a task on behalf of the person.
    pub fn save_task(&self, task_id: Option<&str>, input: TaskInput) -> Result<Task> {
        self.save_task_as(task_id, input, "user")
    }
    /// Creates or updates a task, recording what `actor` (`user` or `agent`) changed.
    pub fn save_task_as(
        &self,
        task_id: Option<&str>,
        input: TaskInput,
        actor: &str,
    ) -> Result<Task> {
        let tx = sql(Transaction::new_unchecked(
            &self.db,
            TransactionBehavior::Immediate,
        ))?;
        let task = self.save_task_inner(task_id, input, actor)?;
        sql(tx.commit())?;
        Ok(task)
    }
    // Called only while holding the write transaction, before any reads of mutable data.
    fn save_task_inner(
        &self,
        task_id: Option<&str>,
        mut input: TaskInput,
        actor: &str,
    ) -> Result<Task> {
        validate_actor(actor)?;
        input.title = input.title.trim().into();
        input.category = input.category.trim().into();
        if input.title.is_empty() {
            return Err("The task needs a title.".into());
        }
        if input.category.is_empty() {
            return Err("The task needs a category.".into());
        }
        if input.category.chars().count() > 80 {
            return Err("The category name can be up to 80 characters.".into());
        }
        validate_status(&input.status)?;
        if !["user", "agent"].contains(&input.assignee.as_str()) {
            return Err("Invalid assignee.".into());
        }
        if input.pull_request_number.is_some_and(|n| n <= 0) {
            return Err("The PR number must be positive.".into());
        }
        let project = self.project(&input.project_id)?;
        let is_update = task_id.is_some();
        let task_id = if let Some(t) = task_id {
            self.task(t, &project.id)?.id
        } else {
            id()
        };
        let timestamp = now();
        if task_id.is_empty() {
            return Err("Invalid ID.".into());
        }
        let previous = if is_update {
            Some(self.task(&task_id, &project.id)?)
        } else {
            None
        };
        if let Some(previous) = &previous {
            sql(self.db.execute("UPDATE tasks SET title=?,details=?,category=?,assignee=?,status=?,agent_summary=?,repository_branch=?,commit_hash=?,pull_request_url=?,pull_request_number=?,updated_at=? WHERE id=? AND project_id=?",params![input.title,input.details,input.category,input.assignee,input.status,input.agent_summary,input.repository_branch,input.commit_hash,input.pull_request_url,input.pull_request_number,timestamp,task_id,project.id]))?;
            if previous.status != input.status {
                self.place_on_top(&task_id, &project.id, &input.status)?;
            }
            let mut changes = vec![
                ("status", Some(&previous.status), Some(&input.status)),
                ("assignee", Some(&previous.assignee), Some(&input.assignee)),
                ("category", Some(&previous.category), Some(&input.category)),
                (
                    "summary",
                    previous.agent_summary.as_ref(),
                    input.agent_summary.as_ref(),
                ),
                (
                    "branch",
                    previous.repository_branch.as_ref(),
                    input.repository_branch.as_ref(),
                ),
                (
                    "commit",
                    previous.commit_hash.as_ref(),
                    input.commit_hash.as_ref(),
                ),
            ];
            // The person's own title and briefing edits would only repeat what they typed.
            if actor == "agent" {
                changes.push(("title", Some(&previous.title), Some(&input.title)));
                changes.push(("details", Some(&previous.details), Some(&input.details)));
            }
            for (kind, before, after) in changes {
                if before != after {
                    let value = if kind == "details" {
                        None
                    } else {
                        after.map(String::as_str)
                    };
                    self.record(&task_id, actor, kind, value, timestamp)?;
                }
            }
            if previous.pull_request_number != input.pull_request_number
                || previous.pull_request_url != input.pull_request_url
            {
                let value = input
                    .pull_request_number
                    .map(|n| n.to_string())
                    .or_else(|| input.pull_request_url.clone());
                self.record(&task_id, actor, "pullRequest", value.as_deref(), timestamp)?;
            }
        } else {
            let position = self.top_position(&project.id, &input.status)?;
            sql(self.db.execute("INSERT INTO tasks(id,project_id,title,details,category,assignee,status,position,agent_summary,repository_branch,commit_hash,pull_request_url,pull_request_number,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",params![task_id,project.id,input.title,input.details,input.category,input.assignee,input.status,position,input.agent_summary,input.repository_branch,input.commit_hash,input.pull_request_url,input.pull_request_number,timestamp,timestamp]))?;
            self.record(&task_id, actor, "created", None, timestamp)?;
        }
        self.remember_category(&project.id, &input.category)?;
        self.task(&task_id, &project.id)
    }
    /// Applies only the fields requested, after acquiring the writer lock. This protects
    /// both human and agent edits from overwriting unrelated simultaneous changes.
    pub fn edit_task(&self, task_id: &str, patch: impl Into<TaskPatch>) -> Result<Task> {
        self.edit_task_as(task_id, patch.into(), "user")
    }
    pub fn edit_task_as(&self, task_id: &str, patch: TaskPatch, actor: &str) -> Result<Task> {
        let tx = sql(Transaction::new_unchecked(
            &self.db,
            TransactionBehavior::Immediate,
        ))?;
        let task = self.task(task_id, &patch.project_id)?;
        let mut input = TaskInput::from(&task);
        if let Some(v) = patch.title {
            input.title = v;
        }
        if let Some(v) = patch.details {
            input.details = v;
        }
        if let Some(v) = patch.category {
            input.category = v;
        }
        if let Some(v) = patch.assignee {
            input.assignee = v;
        }
        if let Some(v) = patch.status {
            input.status = v;
        }
        if let Some(v) = patch.agent_summary {
            input.agent_summary = v;
        }
        if let Some(v) = patch.repository_branch {
            input.repository_branch = v;
        }
        if let Some(v) = patch.commit_hash {
            input.commit_hash = v;
        }
        if let Some(v) = patch.pull_request_url {
            input.pull_request_url = v;
        }
        if let Some(v) = patch.pull_request_number {
            input.pull_request_number = v;
        }
        let task = self.save_task_inner(Some(&task.id), input, actor)?;
        sql(tx.commit())?;
        Ok(task)
    }
    /// Moves a task to `status`, right after `after_id` in that column, or to the top when
    /// `after_id` is absent or no longer in the column. The column is renumbered from zero.
    pub fn move_task(
        &self,
        task_id: &str,
        project_id: &str,
        status: &str,
        after_id: Option<&str>,
    ) -> Result<Task> {
        self.move_task_as(task_id, project_id, status, after_id, "user")
    }
    pub fn move_task_as(
        &self,
        task_id: &str,
        project_id: &str,
        status: &str,
        after_id: Option<&str>,
        actor: &str,
    ) -> Result<Task> {
        validate_actor(actor)?;
        validate_status(status)?;
        let tx = sql(Transaction::new_unchecked(
            &self.db,
            TransactionBehavior::Immediate,
        ))?;
        let task = self.task(task_id, project_id)?;
        let mut order: Vec<String> = {
            let mut stmt = sql(tx.prepare("SELECT id FROM tasks WHERE project_id=? AND status=? AND id<>? ORDER BY position,updated_at DESC,id"))?;
            let rows = sql(stmt
                .query_map(params![task.project_id, status, task.id], |r| r.get(0))
                .and_then(|rows| rows.collect::<rusqlite::Result<Vec<String>>>()))?;
            rows
        };
        let index = after_id
            .and_then(|after| order.iter().position(|id| id.eq_ignore_ascii_case(after)))
            .map_or(0, |i| i + 1);
        order.insert(index, task.id.clone());
        let timestamp = now();
        if task.status != status {
            sql(tx.execute(
                "UPDATE tasks SET status=?,updated_at=? WHERE id=? AND project_id=?",
                params![status, timestamp, task.id, task.project_id],
            ))?;
            sql(tx.execute(
                "INSERT INTO task_events(id,task_id,actor,kind,value,created_at) VALUES(?,?,?,'status',?,?)",
                params![id(), task.id, actor, status, timestamp],
            ))?;
        }
        for (position, id) in order.iter().enumerate() {
            sql(tx.execute(
                "UPDATE tasks SET position=? WHERE id=? AND project_id=?",
                params![position as i64, id, task.project_id],
            ))?;
        }
        sql(tx.commit())?;
        self.task(&task.id, &task.project_id)
    }
    pub(super) fn record(
        &self,
        task_id: &str,
        actor: &str,
        kind: &str,
        value: Option<&str>,
        at: f64,
    ) -> Result<()> {
        sql(self.db.execute(
            "INSERT INTO task_events(id,task_id,actor,kind,value,created_at) VALUES(?,?,?,?,?,?)",
            params![id(), task_id, actor, kind, value, at],
        ))?;
        Ok(())
    }
    fn top_position(&self, project_id: &str, status: &str) -> Result<i64> {
        sql(self.db.query_row(
            "SELECT COALESCE(MIN(position),1)-1 FROM tasks WHERE project_id=? AND status=?",
            params![project_id, status],
            |r| r.get(0),
        ))
    }
    fn place_on_top(&self, task_id: &str, project_id: &str, status: &str) -> Result<()> {
        let position = self.top_position(project_id, status)?;
        sql(self.db.execute(
            "UPDATE tasks SET position=? WHERE id=? AND project_id=?",
            params![position, task_id, project_id],
        ))?;
        Ok(())
    }
    pub fn promote_draft(&self, task_id: &str, project_id: &str) -> Result<Task> {
        let task = self.task(task_id, project_id)?;
        if !["preparing", "reserved"].contains(&task.status.as_str()) {
            return Err("Only a draft can be promoted to the board.".into());
        }
        self.move_task(task_id, project_id, "todo", None)
    }
    pub fn delete_task(&self, task_id: &str, project_id: &str) -> Result<()> {
        let task = self.task(task_id, project_id)?;
        sql(self.db.execute(
            "DELETE FROM tasks WHERE id=? AND project_id=?",
            params![task.id, task.project_id],
        ))?;
        Ok(())
    }
    /// Archives a done task now, or brings one archived by hand back to the board.
    pub fn archive_task(&self, task_id: &str, project_id: &str, archived: bool) -> Result<Task> {
        let task = self.task(task_id, project_id)?;
        if archived && task.status != "done" {
            return Err("Only a completed task can be archived.".into());
        }
        sql(self.db.execute(
            "UPDATE tasks SET archived_at=? WHERE id=? AND project_id=?",
            params![archived.then(now), task.id, task.project_id],
        ))?;
        self.task(&task.id, &task.project_id)
    }
    pub fn events(&self, task_id: &str, project_id: &str) -> Result<Vec<Event>> {
        let task = self.task(task_id, project_id)?;
        let mut stmt = sql(self.db.prepare(
            "SELECT id,task_id,actor,kind,value,created_at FROM task_events WHERE task_id=? ORDER BY created_at,rowid",
        ))?;
        let result = sql(stmt
            .query_map([task.id], |r| {
                Ok(Event {
                    id: r.get(0)?,
                    task_id: r.get(1)?,
                    actor: r.get(2)?,
                    kind: r.get(3)?,
                    value: r.get(4)?,
                    created_at: r.get(5)?,
                })
            })
            .and_then(|rows| rows.collect()));
        result
    }
    /// Who held each task and when, for the overview: creation, status and assignee events of
    /// every task still open or touched since `since`, oldest first.
    pub fn handoff_events(&self, since: f64) -> Result<Vec<Event>> {
        let mut stmt = sql(self.db.prepare(
            "SELECT e.id,e.task_id,e.actor,e.kind,e.value,e.created_at FROM task_events e JOIN tasks t ON t.id=e.task_id \
             WHERE e.kind IN('created','status','assignee') AND (t.updated_at>=? OR t.status<>'done') \
             ORDER BY e.created_at,e.rowid",
        ))?;
        let result = sql(stmt
            .query_map([since], |r| {
                Ok(Event {
                    id: r.get(0)?,
                    task_id: r.get(1)?,
                    actor: r.get(2)?,
                    kind: r.get(3)?,
                    value: r.get(4)?,
                    created_at: r.get(5)?,
                })
            })
            .and_then(|rows| rows.collect()));
        result
    }
}
