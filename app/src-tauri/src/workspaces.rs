//! Workspaces: each one is a separate database file. The list and the open one live in
//! `workspaces.json`, in Trama's folder, so the window and the MCP read the same choice.
//! A workspace Trama creates gets a folder of its own, `Workspaces/<id>/workspace.sqlite`, which
//! also holds its backups; a file opened from elsewhere stays where it is. Names live only in the
//! list, so renaming touches no file. Color and icon live in the database, so they travel with it.
use crate::store::{Result, Store};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// The folder in Trama's folder that holds a folder for each workspace Trama created.
const FOLDER: &str = "Workspaces";
/// A workspace's database, inside its folder.
const FILE: &str = "workspace.sqlite";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Entry {
    /// Empty for the workspace Trama creates on its own; the interface names it.
    name: String,
    path: String,
}
#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SavedRegistry {
    active: Option<String>,
    workspaces: Vec<Entry>,
    /// `organize` moved workspaces and the app hasn't told the person to reconnect the agents yet.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    organized: bool,
    /// Whether an active agent keeps the computer awake: `always` or `power` (only on AC power).
    /// Kept here, beside the list, because it's about this computer and every workspace, and the
    /// MCP reads it with the app closed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    keep_awake: Option<String>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub name: String,
    pub path: String,
    /// The file isn't where the list says: moved or deleted outside Trama, or on a drive that
    /// isn't connected.
    pub missing: bool,
    /// Index into the project palette; none shows the plain mark.
    pub color: Option<i64>,
    pub icon: Option<String>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspaces {
    pub active: String,
    /// `TRAMA_DB` chose the database, so there's nothing to switch.
    pub pinned: bool,
    /// The app moved workspaces into their folders when it started: connected agents must reconnect.
    pub organized: bool,
    pub workspaces: Vec<Workspace>,
}

/// Trama's own folder: the workspace list and the workspaces' folders. `TRAMA_HOME` moves it, for
/// trying the app without touching the real one.
fn home() -> PathBuf {
    std::env::var_os("TRAMA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| dirs::data_dir().unwrap_or_default().join("Trama"))
}

fn same(a: &str, b: &Path) -> bool {
    Path::new(a) == b
}

const COLOR: &str = "workspace.color";
const ICON: &str = "workspace.icon";

/// The color and icon saved in a workspace's file. Opened without the create flag and without
/// migrating, so listing never makes or changes a database; a missing or older file has neither.
/// Not read-only: a WAL file with no `-shm` beside it can't be opened that way.
fn look(path: &Path) -> (Option<i64>, Option<String>) {
    let flags = OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    let Ok(db) = Connection::open_with_flags(path, flags) else {
        return (None, None);
    };
    let read = |key: &str| -> Option<String> {
        db.query_row("SELECT value FROM settings WHERE key=?", [key], |r| {
            r.get(0)
        })
        .optional()
        .ok()
        .flatten()
    };
    (read(COLOR).and_then(|v| v.parse().ok()), read(ICON))
}
fn clean_icon(icon: Option<&str>) -> Option<&str> {
    icon.map(str::trim).filter(|i| !i.is_empty())
}

impl Store {
    /// Saves the workspace's color and icon in this database; none clears them.
    fn set_look(&self, color: Option<i64>, icon: Option<&str>) -> Result<()> {
        for (key, value) in [
            (COLOR, color.map(|c| c.to_string())),
            (ICON, clean_icon(icon).map(String::from)),
        ] {
            match value {
                Some(value) => self.db.execute(
                    "INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=?2",
                    params![key, value],
                ),
                None => self.db.execute("DELETE FROM settings WHERE key=?", [key]),
            }
            .map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

fn find<'a>(registry: &'a mut SavedRegistry, path: &str) -> Result<&'a mut Entry> {
    registry
        .workspaces
        .iter_mut()
        .find(|w| w.path == path)
        .ok_or_else(|| "The workspace isn't in the list.".into())
}
fn clean_name(name: &str) -> Result<String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("The workspace needs a name.".into());
    }
    Ok(name.into())
}

/// An isolated registry. Only `from_env` reads process configuration; operations and tests
/// use explicit paths so parallel registries cannot modify each other's data.
pub struct Registry {
    home: PathBuf,
    pinned: Option<PathBuf>,
}
impl Registry {
    pub fn at(home: PathBuf, pinned: Option<PathBuf>) -> Self {
        Self { home, pinned }
    }
    fn from_env() -> Self {
        Self::at(home(), std::env::var_os("TRAMA_DB").map(PathBuf::from))
    }
    fn registry_path(&self) -> PathBuf {
        self.home.join("workspaces.json")
    }
    /// Where Trama 0.3.0 and earlier kept the workspace they created on their own.
    fn legacy_path(&self) -> PathBuf {
        self.home.join("trama.sqlite")
    }
    /// A new, empty folder for a workspace, named by a short id that never changes.
    fn new_folder(&self) -> Result<PathBuf> {
        let parent = self.home.join(FOLDER);
        std::fs::create_dir_all(&parent).map_err(|e| e.to_string())?;
        loop {
            let folder = parent.join(crate::store::id()[..8].to_lowercase());
            match std::fs::create_dir(&folder) {
                Ok(()) => return Ok(folder),
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(e) => return Err(e.to_string()),
            }
        }
    }
    /// The list as saved. Before Trama 0.3.1 there was no list until the person made a second
    /// workspace, only the one Trama created; that one still counts until `organize` moves it.
    fn load(&self) -> SavedRegistry {
        let mut registry: SavedRegistry = std::fs::read(self.registry_path())
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        if registry.workspaces.is_empty() && self.legacy_path().is_file() {
            registry.workspaces.push(Entry {
                name: String::new(),
                path: self.legacy_path().display().to_string(),
            });
        }
        registry
    }
    fn save(&self, registry: &SavedRegistry) -> Result<()> {
        let path = self.registry_path();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let bytes = serde_json::to_vec_pretty(registry).map_err(|e| e.to_string())?;
        // Written beside and renamed over, so a reader never sees half a list.
        let partial = path.with_extension("json.partial");
        std::fs::write(&partial, bytes).map_err(|e| e.to_string())?;
        std::fs::rename(&partial, &path).map_err(|e| e.to_string())
    }
    pub fn keep_awake(&self) -> String {
        self.load().keep_awake.unwrap_or_else(|| "off".into())
    }
    pub fn set_keep_awake(&self, mode: &str) -> Result<String> {
        if !["off", "always", "power"].contains(&mode) {
            return Err("Unknown keep-awake option.".into());
        }
        let mut registry = self.load();
        registry.keep_awake = (mode != "off").then(|| mode.into());
        self.save(&registry)?;
        Ok(mode.into())
    }
    /// The database the app and the MCP open: `TRAMA_DB` when set, otherwise the open workspace. One
    /// whose file went missing falls back to the first one in the list that exists, instead of
    /// creating an empty file there. None until the person creates or opens a workspace.
    pub fn active_path(&self) -> Option<PathBuf> {
        if let Some(path) = self.pinned.clone() {
            return Some(path);
        }
        let registry = self.load();
        registry
            .active
            .iter()
            .chain(registry.workspaces.iter().map(|w| &w.path))
            .map(PathBuf::from)
            .find(|path| path.is_file())
    }
    pub fn list(&self) -> Workspaces {
        let registry = self.load();
        Workspaces {
            active: self
                .active_path()
                .map(|p| p.display().to_string())
                .unwrap_or_default(),
            pinned: self.pinned.is_some(),
            organized: registry.organized,
            workspaces: registry
                .workspaces
                .into_iter()
                .map(|w| {
                    let (color, icon) = look(Path::new(&w.path));
                    Workspace {
                        missing: !Path::new(&w.path).is_file(),
                        name: w.name,
                        path: w.path,
                        color,
                        icon,
                    }
                })
                .collect(),
        }
    }
    fn unpinned(&self) -> Result<SavedRegistry> {
        if self.pinned.is_some() {
            return Err("TRAMA_DB chooses the database, so workspaces can't be changed.".into());
        }
        Ok(self.load())
    }
    /// Creates the workspace in a folder of its own, `Workspaces/<id>/workspace.sqlite`, and opens it.
    pub fn create(&self, name: &str, color: Option<i64>, icon: Option<&str>) -> Result<Workspaces> {
        let mut registry = self.unpinned()?;
        let name = clean_name(name)?;
        let folder = self.new_folder()?;
        let path = folder.join(FILE);
        if let Err(e) = Store::open(&path).and_then(|store| store.set_look(color, icon)) {
            let _ = std::fs::remove_dir_all(&folder);
            return Err(e);
        }
        let path = path.display().to_string();
        registry.workspaces.push(Entry {
            name,
            path: path.clone(),
        });
        registry.active = Some(path);
        self.save(&registry)?;
        Ok(self.list())
    }
    /// Opens an existing database file, adding it to the list the first time as `name`, or else as
    /// its file is named. A workspace Trama made is always `workspace.sqlite`, which names nothing,
    /// so that one needs `name`. Opening brings an older file up to date, and refuses one from a
    /// newer Trama.
    pub fn open(&self, path: &str, name: Option<&str>) -> Result<Workspaces> {
        let mut registry = self.unpinned()?;
        let file = Path::new(path);
        if !file.is_file() {
            return Err("The workspace file doesn't exist.".into());
        }
        if !registry.workspaces.iter().any(|w| w.path == path) {
            let name = match name {
                Some(name) => clean_name(name)?,
                None if file.file_name() == Some(FILE.as_ref()) => {
                    return Err("The workspace needs a name.".into())
                }
                None => file
                    .file_stem()
                    .map(|s| s.to_string_lossy().into_owned())
                    .unwrap_or_default(),
            };
            Store::open(file)?;
            registry.workspaces.push(Entry {
                name,
                path: path.into(),
            });
        } else {
            Store::open(file)?;
        }
        registry.active = Some(path.into());
        self.save(&registry)?;
        Ok(self.list())
    }
    pub fn switch(&self, path: &str) -> Result<Workspaces> {
        let mut registry = self.unpinned()?;
        find(&mut registry, path)?;
        if !Path::new(path).is_file() {
            return Err("The workspace file doesn't exist.".into());
        }
        registry.active = Some(path.into());
        self.save(&registry)?;
        Ok(self.list())
    }
    /// Renames a workspace in the list and saves its color and icon in its file.
    pub fn edit(
        &self,
        path: &str,
        name: &str,
        color: Option<i64>,
        icon: Option<&str>,
    ) -> Result<Workspaces> {
        let mut registry = self.unpinned()?;
        let name = clean_name(name)?;
        find(&mut registry, path)?;
        if !Path::new(path).is_file() {
            return Err("The workspace file doesn't exist.".into());
        }
        Store::open(Path::new(path))?.set_look(color, icon)?;
        find(&mut registry, path)?.name = name;
        self.save(&registry)?;
        Ok(self.list())
    }
    /// Takes a workspace off the list; its file stays where it is. The open one can go too.
    pub fn remove(&self, path: &str) -> Result<Workspaces> {
        let mut registry = self.unpinned()?;
        self.leave(&mut registry, path)?;
        self.save(&registry)?;
        Ok(self.list())
    }
    /// Removes a workspace from the list and deletes its file with its journal files and its backups,
    /// then its folder once empty: its projects and tasks are gone. The open one too, like removing.
    pub fn delete(&self, path: &str) -> Result<Workspaces> {
        let mut registry = self.unpinned()?;
        self.leave(&mut registry, path)?;
        let backups = crate::store::backups::files(Path::new(path))?;
        for file in [
            PathBuf::from(path),
            PathBuf::from(format!("{path}-wal")),
            PathBuf::from(format!("{path}-shm")),
        ]
        .into_iter()
        .chain(backups)
        {
            match std::fs::remove_file(&file) {
                Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e.to_string()),
                _ => {}
            }
        }
        // Only empty folders go: a Backups folder beside a file opened from elsewhere may hold other
        // databases' backups, and a workspace's folder may hold something the person put there.
        let _ = std::fs::remove_dir(crate::store::backups::folder(Path::new(path)));
        if let Some(folder) = self.own_folder(Path::new(path)) {
            let _ = std::fs::remove_dir(folder);
        }
        self.save(&registry)?;
        Ok(self.list())
    }
    /// Takes `path` off the list. When it is the open one, the first other workspace that exists
    /// opens instead; with none, the list waits for a new one.
    fn leave(&self, registry: &mut SavedRegistry, path: &str) -> Result<()> {
        find(registry, path)?;
        if self.is_active(path) {
            registry.active = registry
                .workspaces
                .iter()
                .find(|w| w.path != path && Path::new(&w.path).is_file())
                .map(|w| w.path.clone());
        }
        registry.workspaces.retain(|w| w.path != path);
        Ok(())
    }
    fn is_active(&self, path: &str) -> bool {
        self.active_path().is_some_and(|active| same(path, &active))
    }
    /// The folder Trama made for the workspace at `path`; none for a file opened from elsewhere.
    fn own_folder<'a>(&self, path: &'a Path) -> Option<&'a Path> {
        let folder = path.parent()?;
        (path.file_name()? == FILE && folder.parent()? == self.home.join(FOLDER)).then_some(folder)
    }
    /// Moves the workspaces Trama 0.3.0 and earlier left loose in its folder each into a folder of
    /// its own, with its journal files, and saves the list. Files opened from elsewhere stay put. One
    /// that can't move now, such as a file in use on Windows, stays where it is, and the next start
    /// tries again. True when something moved, so connected agents must reconnect.
    pub fn organize(&self) -> Result<bool> {
        if self.pinned.is_some() {
            return Ok(false);
        }
        let mut registry = self.load();
        let mut moved = false;
        for entry in &mut registry.workspaces {
            let file = PathBuf::from(&entry.path);
            if file.parent() != Some(self.home.as_path()) || !file.is_file() {
                continue;
            }
            let Ok(target) = self.move_into_folder(&file) else {
                continue;
            };
            let target = target.display().to_string();
            if registry.active.as_deref() == Some(entry.path.as_str()) {
                registry.active = Some(target.clone());
            }
            entry.path = target;
            moved = true;
        }
        if moved {
            registry.organized = true;
            self.save(&registry)?;
        }
        Ok(moved)
    }
    /// The app told the person to reconnect the agents.
    pub fn dismiss_organized(&self) -> Result<Workspaces> {
        let mut registry = self.unpinned()?;
        if registry.organized {
            registry.organized = false;
            self.save(&registry)?;
        }
        Ok(self.list())
    }
    /// Renames the database and its journal files into a new folder, all or none.
    fn move_into_folder(&self, file: &Path) -> Result<PathBuf> {
        let folder = self.new_folder()?;
        let target = folder.join(FILE);
        let mut done: Vec<(PathBuf, PathBuf)> = Vec::new();
        for suffix in ["", "-wal", "-shm"] {
            let from = PathBuf::from(format!("{}{suffix}", file.display()));
            let to = PathBuf::from(format!("{}{suffix}", target.display()));
            if suffix.is_empty() || from.exists() {
                if let Err(e) = std::fs::rename(&from, &to) {
                    for (from, to) in done.iter().rev() {
                        let _ = std::fs::rename(to, from);
                    }
                    let _ = std::fs::remove_dir(&folder);
                    return Err(e.to_string());
                }
                done.push((from, to));
            }
        }
        Ok(target)
    }
}

/// The open workspace's database. None exists until the person creates or opens one in the app.
pub fn active_path() -> Result<PathBuf> {
    Registry::from_env()
        .active_path()
        .ok_or_else(|| "Open Trama and create a workspace.".into())
}
pub fn organize() -> Result<bool> {
    Registry::from_env().organize()
}
pub fn dismiss_organized() -> Result<Workspaces> {
    Registry::from_env().dismiss_organized()
}
/// `off`, `always` or `power`.
pub fn keep_awake() -> String {
    Registry::from_env().keep_awake()
}
pub fn set_keep_awake(mode: &str) -> Result<String> {
    Registry::from_env().set_keep_awake(mode)
}
pub fn list() -> Workspaces {
    Registry::from_env().list()
}
pub fn create(name: &str, color: Option<i64>, icon: Option<&str>) -> Result<Workspaces> {
    Registry::from_env().create(name, color, icon)
}
pub fn open(path: &str, name: Option<&str>) -> Result<Workspaces> {
    Registry::from_env().open(path, name)
}
pub fn switch(path: &str) -> Result<Workspaces> {
    Registry::from_env().switch(path)
}
pub fn edit(path: &str, name: &str, color: Option<i64>, icon: Option<&str>) -> Result<Workspaces> {
    Registry::from_env().edit(path, name, color, icon)
}
pub fn remove(path: &str) -> Result<Workspaces> {
    Registry::from_env().remove(path)
}
pub fn delete(path: &str) -> Result<Workspaces> {
    Registry::from_env().delete(path)
}
