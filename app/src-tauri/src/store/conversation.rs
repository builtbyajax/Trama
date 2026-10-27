//! What is said on a task: the messages between you and the agent, your private notes and
//! the agent's checklist.
use super::*;

impl Store {
    pub fn messages(&self, task_id: &str, project_id: &str) -> Result<Vec<Message>> {
        let task = self.task(task_id, project_id)?;
        let mut stmt=sql(self.db.prepare("SELECT id,task_id,author,body,created_at,agent_profile_id FROM task_messages WHERE task_id=? ORDER BY created_at,rowid"))?;
        let result = sql(stmt
            .query_map([task.id], |r| {
                Ok(Message {
                    id: r.get(0)?,
                    task_id: r.get(1)?,
                    author: r.get(2)?,
                    body: r.get(3)?,
                    created_at: r.get(4)?,
                    agent_profile_id: r.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect());
        result
    }
    pub fn add_message(
        &self,
        task_id: &str,
        project_id: &str,
        author: &str,
        body: &str,
    ) -> Result<Message> {
        self.write(|| {
            let task = self.task(task_id, project_id)?;
            let body = body.trim();
            if body.is_empty() {
                return Err("The message can't be empty.".into());
            }
            if !["user", "agent"].contains(&author) {
                return Err("Invalid author.".into());
            }
            let message = Message {
                id: id(),
                task_id: task.id.clone(),
                author: author.into(),
                body: body.into(),
                created_at: now(),
                agent_profile_id: (author == "agent")
                    .then(|| self.profile.borrow().clone())
                    .flatten(),
            };
            sql(self.db.execute(
                "INSERT INTO task_messages(id,task_id,author,body,created_at,agent_profile_id) VALUES(?,?,?,?,?,?)",
                params![
                    message.id,
                    message.task_id,
                    message.author,
                    message.body,
                    message.created_at,
                    message.agent_profile_id
                ],
            ))?;
            self.touch_task(&task.id)?;
            Ok(message)
        })
    }
    pub fn notes(&self, task_id: &str, project_id: &str) -> Result<Vec<Note>> {
        let task = self.task(task_id, project_id)?;
        let mut stmt = sql(self.db.prepare(
            "SELECT id,task_id,body,created_at FROM task_notes WHERE task_id=? ORDER BY created_at,rowid",
        ))?;
        let result = sql(stmt
            .query_map([task.id], |r| {
                Ok(Note {
                    id: r.get(0)?,
                    task_id: r.get(1)?,
                    body: r.get(2)?,
                    created_at: r.get(3)?,
                })
            })
            .and_then(|rows| rows.collect()));
        result
    }
    pub fn add_note(&self, task_id: &str, project_id: &str, body: &str) -> Result<Note> {
        let task = self.task(task_id, project_id)?;
        let body = body.trim();
        if body.is_empty() {
            return Err("The annotation can't be empty.".into());
        }
        let note = Note {
            id: id(),
            task_id: task.id,
            body: body.into(),
            created_at: now(),
        };
        sql(self.db.execute(
            "INSERT INTO task_notes(id,task_id,body,created_at) VALUES(?,?,?,?)",
            params![note.id, note.task_id, note.body, note.created_at],
        ))?;
        Ok(note)
    }
    pub fn delete_note(&self, note_id: &str, task_id: &str, project_id: &str) -> Result<()> {
        let task = self.task(task_id, project_id)?;
        let removed = sql(self.db.execute(
            "DELETE FROM task_notes WHERE id=? COLLATE NOCASE AND task_id=?",
            params![note_id, task.id],
        ))?;
        if removed != 1 {
            return Err("The annotation doesn't exist in this task.".into());
        }
        Ok(())
    }
    pub fn checks(&self, task_id: &str, project_id: &str) -> Result<Vec<Check>> {
        let task = self.task(task_id, project_id)?;
        let mut stmt = sql(self.db.prepare(
            "SELECT id,task_id,title,is_complete FROM task_checks WHERE task_id=? ORDER BY rowid",
        ))?;
        let result = sql(stmt
            .query_map([task.id], |r| {
                Ok(Check {
                    id: r.get(0)?,
                    task_id: r.get(1)?,
                    title: r.get(2)?,
                    is_complete: r.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect());
        result
    }
    pub fn add_check(&self, task_id: &str, project_id: &str, title: &str) -> Result<Check> {
        self.write(|| {
            let task = self.task(task_id, project_id)?;
            let title = title.trim();
            if title.is_empty() {
                return Err("The check needs a title.".into());
            }
            let check = Check {
                id: id(),
                task_id: task.id.clone(),
                title: title.into(),
                is_complete: false,
            };
            sql(self.db.execute(
                "INSERT INTO task_checks(id,task_id,title,is_complete) VALUES(?,?,?,0)",
                params![check.id, check.task_id, check.title],
            ))?;
            self.touch_task(&task.id)?;
            Ok(check)
        })
    }
}
