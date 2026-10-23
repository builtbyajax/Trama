//! Workspaces: each one is a separate database file. The list and the open one live in
//! `workspaces.json`, beside the default database, so the window and the MCP read the same choice.
use crate::store::{Result, Store};
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

/// The list as saved, with the default workspace always in it, first.
fn load() -> Registry {
    let mut registry: Registry = std::fs::read(registry_path())
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default();
    let default = default_path();
    if !registry.workspaces.iter().any(|w| same(&w.path, &default)) {
        registry.workspaces.insert(
            0,
            Entry {
                name: String::new(),
                path: default.display().to_string(),
            },
        );
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
/// whose file went missing falls back to the default, instead of creating an empty file there.
pub fn active_path() -> PathBuf {
    if let Some(path) = pinned() {
        return path;
    }
    load()
        .active
        .map(PathBuf::from)
        .filter(|path| path.is_file())
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
            .map(|w| Workspace {
                // The default one is only created by its first use.
                missing: !Path::new(&w.path).is_file() && !same(&w.path, &default_path()),
                name: w.name,
                path: w.path,
            })
            .collect(),
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
pub fn create(name: &str, folder: &str) -> Result<Workspaces> {
    let mut registry = unpinned()?;
    let name = clean_name(name)?;
    if name.contains(['/', '\\', ':']) || name.starts_with('.') {
        return Err("The name can't have slashes, colons or start with a dot.".into());
    }
    let path = Path::new(folder).join(format!("{name}.sqlite"));
    if path.exists() {
        return Err("A file with that name already exists in the folder.".into());
    }
    Store::open(&path)?;
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

pub fn rename(path: &str, name: &str) -> Result<Workspaces> {
    let mut registry = unpinned()?;
    find(&mut registry, path)?.name = clean_name(name)?;
    save(&registry)?;
    Ok(list())
}

/// Takes a workspace off the list; its file stays where it is.
pub fn remove(path: &str) -> Result<Workspaces> {
    let mut registry = unpinned()?;
    if same(path, &active_path()) {
        return Err("Switch to another workspace before removing this one.".into());
    }
    if same(path, &default_path()) {
        return Err("The default workspace stays in the list.".into());
    }
    find(&mut registry, path)?;
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
