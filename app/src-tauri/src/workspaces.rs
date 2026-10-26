//! Workspaces: each one is a separate database file. The list and the open one live in
//! `workspaces.json`, beside the default database, so the window and the MCP read the same choice.
//! A workspace's color and icon live in its own database, so they travel with the file.
use crate::store::{Result, Store};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Entry {
    /// Empty for the workspace Trama creates on its own; the interface names it.
    name: String,
    path: String,
}
#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Registry {
    active: Option<String>,
    workspaces: Vec<Entry>,
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
    pub default_folder: String,
    pub workspaces: Vec<Workspace>,
}

/// Trama's own folder: the default database and the workspace list. `TRAMA_HOME` moves it, for
/// trying the app without touching the real one.
fn home() -> PathBuf {
    std::env::var_os("TRAMA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| dirs::data_dir().unwrap_or_default().join("Trama"))
}
fn registry_path() -> PathBuf {
    home().join("workspaces.json")
}
fn default_path() -> PathBuf {
    home().join("trama.sqlite")
}
fn pinned() -> Option<PathBuf> {
    std::env::var_os("TRAMA_DB").map(PathBuf::from)
}
fn same(a: &str, b: &Path) -> bool {
    Path::new(a) == b
}

/// The list as saved. The default workspace starts it on first use; after that it can leave like
/// any other, as long as one remains.
fn load() -> Registry {
    let mut registry: Registry = std::fs::read(registry_path())
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default();
    if registry.workspaces.is_empty() {
        registry.workspaces.push(Entry {
            name: String::new(),
            path: default_path().display().to_string(),
        });
    }
    registry
}
fn save(registry: &Registry) -> Result<()> {
    let path = registry_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let bytes = serde_json::to_vec_pretty(registry).map_err(|e| e.to_string())?;
    // Written beside and renamed over, so a reader never sees half a list.
    let partial = path.with_extension("json.partial");
    std::fs::write(&partial, bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&partial, &path).map_err(|e| e.to_string())
}

/// The database the app and the MCP open: `TRAMA_DB` when set, otherwise the open workspace. One
/// whose file went missing falls back to the first one in the list that exists, instead of
/// creating an empty file there; with none, to the first, which Trama then creates.
pub fn active_path() -> PathBuf {
    if let Some(path) = pinned() {
        return path;
    }
    let registry = load();
    let paths = || registry.workspaces.iter().map(|w| PathBuf::from(&w.path));
    registry
        .active
        .as_ref()
        .map(PathBuf::from)
        .filter(|path| path.is_file())
        .or_else(|| paths().find(|path| path.is_file()))
        .or_else(|| paths().next())
        .unwrap_or_else(default_path)
}

pub fn list() -> Workspaces {
    let registry = load();
    let active = active_path();
    Workspaces {
        active: active.display().to_string(),
        pinned: pinned().is_some(),
        default_folder: home().display().to_string(),
        workspaces: registry
            .workspaces
            .into_iter()
            .map(|w| {
                let (color, icon) = look(Path::new(&w.path));
                Workspace {
                    // The default one is only created by its first use.
                    missing: !Path::new(&w.path).is_file() && !same(&w.path, &default_path()),
                    name: w.name,
                    path: w.path,
                    color,
                    icon,
                }
            })
            .collect(),
    }
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

fn unpinned() -> Result<Registry> {
    if pinned().is_some() {
        return Err("TRAMA_DB chooses the database, so workspaces can't be changed.".into());
    }
    Ok(load())
}
fn find<'a>(registry: &'a mut Registry, path: &str) -> Result<&'a mut Entry> {
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

/// Creates `<folder>/<name>.sqlite` and opens it.
pub fn create(
    name: &str,
    folder: &str,
    color: Option<i64>,
    icon: Option<&str>,
) -> Result<Workspaces> {
    let mut registry = unpinned()?;
    let name = clean_name(name)?;
    if name.contains(['/', '\\', ':']) || name.starts_with('.') {
        return Err("The name can't have slashes, colons or start with a dot.".into());
    }
    let path = Path::new(folder).join(format!("{name}.sqlite"));
    if path.exists() {
        return Err("A file with that name already exists in the folder.".into());
    }
    Store::open(&path)?.set_look(color, icon)?;
    let path = path.display().to_string();
    registry.workspaces.push(Entry {
        name,
        path: path.clone(),
    });
    registry.active = Some(path);
    save(&registry)?;
    Ok(list())
}

/// Opens an existing database file, adding it to the list the first time. Opening it brings an
/// older file up to date, and refuses one from a newer Trama.
pub fn open(path: &str) -> Result<Workspaces> {
    let mut registry = unpinned()?;
    let file = Path::new(path);
    if !file.is_file() {
        return Err("The workspace file doesn't exist.".into());
    }
    Store::open(file)?;
    if !registry.workspaces.iter().any(|w| w.path == path) {
        registry.workspaces.push(Entry {
            name: file
                .file_stem()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_default(),
            path: path.into(),
        });
    }
    registry.active = Some(path.into());
    save(&registry)?;
    Ok(list())
}

pub fn switch(path: &str) -> Result<Workspaces> {
    let mut registry = unpinned()?;
    find(&mut registry, path)?;
    if !Path::new(path).is_file() && !same(path, &default_path()) {
        return Err("The workspace file doesn't exist.".into());
    }
    registry.active = Some(path.into());
    save(&registry)?;
    Ok(list())
}

/// Renames a workspace in the list and saves its color and icon in its file.
pub fn edit(path: &str, name: &str, color: Option<i64>, icon: Option<&str>) -> Result<Workspaces> {
    let mut registry = unpinned()?;
    let name = clean_name(name)?;
    find(&mut registry, path)?;
    if !Path::new(path).is_file() && !same(path, &default_path()) {
        return Err("The workspace file doesn't exist.".into());
    }
    Store::open(Path::new(path))?.set_look(color, icon)?;
    find(&mut registry, path)?.name = name;
    save(&registry)?;
    Ok(list())
}

/// Takes a workspace off the list; its file stays where it is.
pub fn remove(path: &str) -> Result<Workspaces> {
    let mut registry = unpinned()?;
    if same(path, &active_path()) {
        return Err("Switch to another workspace before removing this one.".into());
    }
    find(&mut registry, path)?;
    if registry.workspaces.len() == 1 {
        return Err("Trama needs at least one workspace.".into());
    }
    registry.workspaces.retain(|w| w.path != path);
    save(&registry)?;
    Ok(list())
}

/// Removes a workspace from the list and deletes its file with its journal files: its projects and
/// tasks are gone. Like removing, never the open one or the last.
pub fn delete(path: &str) -> Result<Workspaces> {
    let mut registry = unpinned()?;
    if same(path, &active_path()) {
        return Err("Switch to another workspace before deleting this one.".into());
    }
    find(&mut registry, path)?;
    if registry.workspaces.len() == 1 {
        return Err("Trama needs at least one workspace.".into());
    }
    for file in [
        path.to_string(),
        format!("{path}-wal"),
        format!("{path}-shm"),
    ] {
        match std::fs::remove_file(&file) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e.to_string()),
            _ => {}
        }
    }
    registry.workspaces.retain(|w| w.path != path);
    save(&registry)?;
    Ok(list())
}

/// Moves a workspace's file into `folder`, keeping its name. The copy is written whole by SQLite
/// and checked before the original and its journal files are deleted.
pub fn relocate(path: &str, folder: &str) -> Result<Workspaces> {
    let mut registry = unpinned()?;
    if same(path, &default_path()) {
        return Err("The default workspace stays in Trama's folder.".into());
    }
    let source = PathBuf::from(path);
    let name = source.file_name().ok_or("Invalid workspace path.")?;
    let target = Path::new(folder).join(name);
    if target.exists() {
        return Err("A file with that name already exists in the folder.".into());
    }
    let store = Store::open(&source)?;
    store.copy_to(&target)?;
    drop(store);
    Store::open(&target)?;
    for suffix in ["", "-wal", "-shm"] {
        let file = PathBuf::from(format!("{path}{suffix}"));
        if file.exists() {
            std::fs::remove_file(file).map_err(|e| e.to_string())?;
        }
    }
    let target = target.display().to_string();
    find(&mut registry, path)?.path = target.clone();
    if registry.active.as_deref() == Some(path) {
        registry.active = Some(target);
    }
    save(&registry)?;
    Ok(list())
}

impl Store {
    /// Writes a consistent copy of the whole database to a new file.
    pub fn copy_to(&self, target: &Path) -> Result<()> {
        self.db
            .execute("VACUUM INTO ?", [target.display().to_string()])
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}
