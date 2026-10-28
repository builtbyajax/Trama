//! Agent profiles: each MCP session is one, named by the agent itself or, until then, by its
//! client. The profile outlives the session, so the history keeps who did what.
use super::*;

/// Size of the app's agent palette; none of them is the person's blue or the any-agent purple.
pub const PROFILE_COLORS: i64 = 6;
/// The shapes the app draws a profile's character with, filled in its color.
pub const PROFILE_SHAPES: [&str; 8] = [
    "blob", "ghost", "cat", "square", "drop", "triangle", "slime", "star",
];
/// The character's eyes. Sleepy ones aren't among them: the app draws them on an idle agent.
pub const PROFILE_EYES: [&str; 8] = [
    "dots",
    "tall",
    "happy",
    "wink",
    "focused",
    "visor",
    "angry",
    "suspicious",
];
/// A session is active while it called a tool in the last 15 minutes, and idle after that.
pub const ACTIVE_SECONDS: f64 = 15.0 * 60.0;
/// A live process says so every minute; past this it ended without closing its input.
pub const ALIVE_SECONDS: f64 = 3.0 * 60.0;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProfile {
    pub id: String,
    /// The MCP client's own name, from the initialization, such as `claude-code`.
    pub client: String,
    /// What the agent or the person called it; without one it shows as `display_name`.
    pub name: Option<String>,
    pub display_name: String,
    /// Index into the agent palette.
    pub color: i64,
    /// The character's shape and eyes. Until someone picks them, they come from the id, so each
    /// session starts out different.
    pub shape: &'static str,
    pub eyes: &'static str,
    /// The person changed it in the app, so the agent can no longer change it.
    pub edited_by_user: bool,
    pub created_at: f64,
    /// The last tool call.
    pub active_at: f64,
    /// The last sign of life from its process.
    pub alive_at: f64,
    pub ended_at: Option<f64>,
    /// The person deleted it: it's off the page, but the history still shows it.
    pub deleted: bool,
    /// `active`, `idle` (connected, no call for 15 minutes) or `offline` (ended).
    pub presence: &'static str,
}

/// How a client presents itself when the agent hasn't named its session.
fn client_label(client: &str) -> String {
    let lower = client.to_lowercase();
    if lower.contains("claude") {
        return "Claude Code".into();
    }
    if lower.contains("codex") {
        return "Codex".into();
    }
    if client.trim().is_empty() {
        return "Agent".into();
    }
    client.trim().into()
}

/// The character stored as `shape:eyes`, or the one the id picks.
fn look(id: &str, avatar: Option<&str>) -> (&'static str, &'static str) {
    let seed = id
        .bytes()
        .fold(0usize, |n, b| n.wrapping_mul(31).wrapping_add(b as usize));
    let mut shape = PROFILE_SHAPES[seed % PROFILE_SHAPES.len()];
    let mut eyes = PROFILE_EYES[seed / PROFILE_SHAPES.len() % PROFILE_EYES.len()];
    if let Some((s, e)) = avatar.and_then(|a| a.split_once(':')) {
        if let Some(s) = PROFILE_SHAPES.iter().find(|&&x| x == s) {
            shape = s;
        }
        if let Some(e) = PROFILE_EYES.iter().find(|&&x| x == e) {
            eyes = e;
        }
    }
    (shape, eyes)
}

fn map_profile(r: &Row) -> rusqlite::Result<AgentProfile> {
    let client: String = r.get(1)?;
    let name: Option<String> = r.get(2)?;
    let active_at: f64 = r.get(7)?;
    let alive_at: f64 = r.get(8)?;
    let ended_at: Option<f64> = r.get(9)?;
    let deleted = r.get::<_, Option<f64>>(10)?.is_some();
    let id: String = r.get(0)?;
    let avatar: Option<String> = r.get(4)?;
    let (shape, eyes) = look(&id, avatar.as_deref());
    let now = now();
    let presence = if ended_at.is_some() || now - alive_at > ALIVE_SECONDS {
        "offline"
    } else if now - active_at <= ACTIVE_SECONDS {
        "active"
    } else {
        "idle"
    };
    Ok(AgentProfile {
        id,
        display_name: name.clone().unwrap_or_else(|| client_label(&client)),
        client,
        name,
        color: r.get(3)?,
        shape,
        eyes,
        edited_by_user: r.get(5)?,
        created_at: r.get(6)?,
        active_at,
        alive_at,
        ended_at,
        deleted,
        presence,
    })
}
const PROFILE_COLUMNS: &str =
    "id,client,name,color,avatar,edited_by_user,created_at,active_at,alive_at,ended_at,deleted_at";

/// Checks what a profile is called and how it looks. The name is trimmed; an empty one is none.
fn clean(name: Option<&str>, color: Option<i64>) -> Result<Option<String>> {
    let name = name.map(str::trim).filter(|n| !n.is_empty());
    if name.is_some_and(|n| n.chars().count() > 40) {
        return Err("The profile name can be up to 40 characters.".into());
    }
    if color.is_some_and(|c| !(0..PROFILE_COLORS).contains(&c)) {
        return Err(format!(
            "The profile color is an index from 0 to {}.",
            PROFILE_COLORS - 1
        ));
    }
    Ok(name.map(String::from))
}
/// The character as stored, with a shape and eyes the app draws.
fn avatar(shape: &str, eyes: &str) -> Result<String> {
    if !PROFILE_SHAPES.contains(&shape) {
        return Err(format!(
            "The shape is one of: {}.",
            PROFILE_SHAPES.join(", ")
        ));
    }
    if !PROFILE_EYES.contains(&eyes) {
        return Err(format!("The eyes are one of: {}.", PROFILE_EYES.join(", ")));
    }
    Ok(format!("{shape}:{eyes}"))
}

impl Store {
    /// Every profile, the sessions still connected first, then the newest.
    pub fn agent_profiles(&self) -> Result<Vec<AgentProfile>> {
        let mut stmt = sql(self.db.prepare(&format!(
            "SELECT {PROFILE_COLUMNS} FROM agent_profiles ORDER BY ended_at IS NOT NULL,created_at DESC"
        )))?;
        let result = sql(stmt
            .query_map([], map_profile)
            .and_then(|rows| rows.collect()));
        result
    }
    pub fn agent_profile(&self, id: &str) -> Result<AgentProfile> {
        let profile = sql(self
            .db
            .query_row(
                &format!("SELECT {PROFILE_COLUMNS} FROM agent_profiles WHERE id=?1 COLLATE NOCASE"),
                [id],
                map_profile,
            )
            .optional())?;
        profile.ok_or_else(|| "The agent profile doesn't exist.".into())
    }
    /// The profile this connection writes as, once its session started.
    pub fn session_profile(&self) -> Option<String> {
        self.profile.borrow().clone()
    }
    /// Takes over the session another connection to the same file started.
    pub fn adopt_session(&self, profile: Option<String>) {
        *self.profile.borrow_mut() = profile;
    }
    /// Starts a session for `client`: a new profile, in the least used color among the connected.
    pub fn start_session(&self, client: &str) -> Result<AgentProfile> {
        let profile = self.write(|| {
            let mut used = [0; PROFILE_COLORS as usize];
            for p in self.agent_profiles()? {
                if p.presence != "offline" {
                    used[p.color as usize] += 1;
                }
            }
            let color = (0..PROFILE_COLORS)
                .min_by_key(|&c| used[c as usize])
                .unwrap_or(0);
            let id = id();
            let at = now();
            sql(self.db.execute(
                "INSERT INTO agent_profiles(id,client,color,created_at,active_at,alive_at) VALUES(?,?,?,?,?,?)",
                params![id, client.trim(), color, at, at, at],
            ))?;
            Ok(id)
        })?;
        *self.profile.borrow_mut() = Some(profile.clone());
        self.agent_profile(&profile)
    }
    /// A tool call: the session is active now, even one the app ended while its process went
    /// quiet, as with the Mac asleep. False when the person deleted its profile, so the session
    /// needs a new one.
    pub fn touch_session(&self) -> Result<bool> {
        let Some(id) = self.session_profile() else {
            return Ok(false);
        };
        let at = now();
        let touched = sql(self.db.execute(
            "UPDATE agent_profiles SET ended_at=NULL,active_at=?,alive_at=? WHERE id=? AND deleted_at IS NULL",
            params![at, at, id],
        ))?;
        Ok(touched > 0)
    }
    /// The session's agent names its profile. What the person edited in the app stays theirs.
    pub fn set_session_profile(
        &self,
        name: Option<&str>,
        color: Option<i64>,
        shape: Option<&str>,
        eyes: Option<&str>,
    ) -> Result<AgentProfile> {
        let id = self
            .session_profile()
            .ok_or("This connection has no session yet.")?;
        let name = clean(name, color)?;
        let profile = self.agent_profile(&id)?;
        if profile.edited_by_user {
            return Err("The person edited this profile in Trama, so it keeps their name, color and character. Tell them if you want it changed.".into());
        }
        let look = avatar(shape.unwrap_or(profile.shape), eyes.unwrap_or(profile.eyes))?;
        sql(self.db.execute(
            "UPDATE agent_profiles SET name=COALESCE(?,name),color=COALESCE(?,color),avatar=? WHERE id=?",
            params![name, color, look, id],
        ))?;
        self.agent_profile(&id)
    }
    /// The person edits a profile; from then on the agent can't change it.
    pub fn edit_agent_profile(
        &self,
        id: &str,
        name: Option<&str>,
        color: i64,
        shape: &str,
        eyes: &str,
    ) -> Result<AgentProfile> {
        let name = clean(name, Some(color))?;
        let look = avatar(shape, eyes)?;
        let profile = self.agent_profile(id)?;
        if profile.deleted {
            return Err("The agent profile was deleted.".into());
        }
        sql(self.db.execute(
            "UPDATE agent_profiles SET name=?,color=?,avatar=?,edited_by_user=1 WHERE id=?",
            params![name, color, look, profile.id],
        ))?;
        self.agent_profile(&profile.id)
    }
    /// A resumed session takes back the profile it had. Only one process uses a profile at a time,
    /// so one still connected elsewhere is refused. The profile this process had started ends.
    pub fn resume_session(&self, id: &str) -> Result<AgentProfile> {
        let target = self.agent_profile(id)?;
        let current = self.session_profile();
        if current.as_deref() == Some(target.id.as_str()) {
            return Ok(target);
        }
        if target.deleted {
            return Err("The agent profile was deleted.".into());
        }
        if target.presence != "offline" {
            return Err("That profile is in use by another connected session.".into());
        }
        if let Some(current) = current {
            self.end_profile(&current)?;
        }
        let at = now();
        sql(self.db.execute(
            "UPDATE agent_profiles SET ended_at=NULL,active_at=?,alive_at=? WHERE id=?",
            params![at, at, target.id],
        ))?;
        *self.profile.borrow_mut() = Some(target.id.clone());
        self.agent_profile(&target.id)
    }
    /// The person deletes a profile. Its tasks not done go to any agent, the ones in progress
    /// back to the top of To do. The history keeps its name and character; one that left no
    /// history goes for good. A session still using it gets a new profile on its next call.
    pub fn delete_agent_profile(&self, id: &str) -> Result<()> {
        let profile = self.agent_profile(id)?;
        self.write(|| {
            let at = now();
            let held: Vec<(String, String, String)> = {
                let mut stmt = sql(self.db.prepare(
                    "SELECT id,project_id,status FROM tasks WHERE agent_profile_id=? AND status<>'done' ORDER BY position DESC",
                ))?;
                let rows = sql(stmt
                    .query_map([&profile.id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
                    .and_then(|rows| rows.collect()));
                rows?
            };
            for (task, project, status) in held {
                sql(self.db.execute(
                    "UPDATE tasks SET agent_profile_id=NULL,updated_at=? WHERE id=?",
                    params![at, task],
                ))?;
                self.record(&task, "user", "agentProfile", None, at)?;
                if status == "inProgress" {
                    let position = self.top_position(&project, "todo")?;
                    sql(self.db.execute(
                        "UPDATE tasks SET status='todo',position=? WHERE id=?",
                        params![position, task],
                    ))?;
                    self.record(&task, "user", "status", Some("todo"), at)?;
                }
            }
            sql(self.db.execute(
                "UPDATE agent_profiles SET deleted_at=?1,ended_at=COALESCE(ended_at,?1) WHERE id=?2",
                params![at, profile.id],
            ))?;
            sql(self.db.execute(
                "DELETE FROM agent_profiles WHERE id=?1 AND NOT EXISTS(SELECT 1 FROM tasks WHERE agent_profile_id=?1) AND NOT EXISTS(SELECT 1 FROM task_messages WHERE agent_profile_id=?1) AND NOT EXISTS(SELECT 1 FROM task_events WHERE agent_profile_id=?1)",
                [&profile.id],
            ))?;
            Ok(())
        })
    }
    /// The session's process is closing.
    pub fn end_session(&self) -> Result<()> {
        let id = self.profile.borrow_mut().take();
        if let Some(id) = id {
            self.end_profile(&id)?;
        }
        Ok(())
    }
    /// Ends the sessions whose process stopped saying it's alive, as when it was killed.
    pub fn end_stale_sessions(&self) -> Result<()> {
        let stale: Vec<String> = {
            let mut stmt = sql(self
                .db
                .prepare("SELECT id FROM agent_profiles WHERE ended_at IS NULL AND alive_at<?"))?;
            let rows = sql(stmt
                .query_map([now() - ALIVE_SECONDS], |r| r.get(0))
                .and_then(|rows| rows.collect()));
            rows?
        };
        for id in stale {
            self.end_profile(&id)?;
        }
        Ok(())
    }
    /// The profile leaves the connected ones; what it was working on goes back to To do, still
    /// with it, so a resumed session finds it there. A session that left nothing on the board,
    /// like one that only read, leaves no profile behind.
    fn end_profile(&self, id: &str) -> Result<()> {
        let previous = self.profile.replace(Some(id.into()));
        let result = self.write(|| {
            let at = now();
            sql(self.db.execute(
                "UPDATE agent_profiles SET ended_at=? WHERE id=? AND ended_at IS NULL",
                params![at, id],
            ))?;
            let working: Vec<(String, String)> = {
                let mut stmt = sql(self.db.prepare(
                    "SELECT id,project_id FROM tasks WHERE agent_profile_id=? AND assignee='agent' AND status='inProgress' ORDER BY position DESC",
                ))?;
                let rows = sql(stmt
                    .query_map([id], |r| Ok((r.get(0)?, r.get(1)?)))
                    .and_then(|rows| rows.collect()));
                rows?
            };
            for (task, project) in working {
                let position = self.top_position(&project, "todo")?;
                sql(self.db.execute(
                    "UPDATE tasks SET status='todo',position=?,updated_at=? WHERE id=?",
                    params![position, at, task],
                ))?;
                self.record(&task, "agent", "status", Some("todo"), at)?;
            }
            sql(self.db.execute(
                "DELETE FROM agent_profiles WHERE id=?1 AND NOT EXISTS(SELECT 1 FROM tasks WHERE agent_profile_id=?1) AND NOT EXISTS(SELECT 1 FROM task_messages WHERE agent_profile_id=?1) AND NOT EXISTS(SELECT 1 FROM task_events WHERE agent_profile_id=?1)",
                [id],
            ))?;
            Ok(())
        });
        *self.profile.borrow_mut() = previous;
        result
    }
}

/// The process behind `profile` is alive. Opens the file on its own, from the thread that keeps
/// the session's presence while the agent thinks, without migrating it.
pub fn heartbeat(path: &Path, profile: &str) -> Result<()> {
    let db = sql(Connection::open_with_flags(
        path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    ))?;
    sql(db.busy_timeout(std::time::Duration::from_secs(5)))?;
    sql(db.execute(
        "UPDATE agent_profiles SET alive_at=? WHERE id=? AND ended_at IS NULL",
        params![now(), profile],
    ))?;
    Ok(())
}
