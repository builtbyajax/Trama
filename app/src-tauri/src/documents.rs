//! A project's notes folder (its vault): Markdown files the app lists, searches, reads and
//! edits, and that tasks attach. Every path is relative to the folder chosen for the project and
//! is resolved through the real
//! file system, so a link or `..` can never reach anything outside it. Hidden entries
//! (`.obsidian`, `.git`, `.trash`) and symbolic links are skipped.
use crate::store::Result;
use serde::Serialize;
use std::{
    fs,
    path::{Component, Path, PathBuf},
};

const MAX_NOTE: u64 = 2 * 1024 * 1024;
const MAX_IMAGE: u64 = 8 * 1024 * 1024;
const MAX_ENTRIES: usize = 10_000;
const IMAGES: [(&str, &str); 6] = [
    ("png", "image/png"),
    ("jpg", "image/jpeg"),
    ("jpeg", "image/jpeg"),
    ("gif", "image/gif"),
    ("webp", "image/webp"),
    ("svg", "image/svg+xml"),
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Listing {
    pub root: String,
    /// Markdown files, as paths relative to the root with `/` separators.
    pub notes: Vec<String>,
    /// Images, so `![[name.png]]` can be found by name like in Obsidian.
    pub images: Vec<String>,
    /// Every folder, so one without notes yet still shows in the tree.
    pub folders: Vec<String>,
    /// The notes changed last, newest first, in or out of the app.
    pub recent: Vec<Recent>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Recent {
    pub path: String,
    pub modified: f64,
}
const RECENT: usize = 20;
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteFile {
    pub path: String,
    pub text: String,
    /// Fingerprint of the content read; a save must name it, so changes made outside the app
    /// are never overwritten.
    pub version: String,
    pub modified: f64,
}

/// The folder as the app stores it: an existing directory, without symbolic links in its path.
/// A leading `~` means the home folder.
pub fn canonical_root(path: &str) -> Result<PathBuf> {
    let path = path.trim();
    let expanded = match path.strip_prefix('~') {
        Some(rest) if rest.is_empty() || rest.starts_with('/') => dirs::home_dir()
            .unwrap_or_default()
            .join(rest.trim_start_matches('/')),
        _ => PathBuf::from(path),
    };
    let root = fs::canonicalize(&expanded)
        .map_err(|_| format!("The folder {path} doesn't exist or isn't accessible."))?;
    if !root.is_dir() {
        return Err("Choose a folder, not a file.".into());
    }
    Ok(root)
}

/// Turns what a person or the agent typed into a path relative to `root`: absolute paths inside
/// the root, `./` and backslashes are accepted. The result is not checked against the disk.
pub fn relative(root: &Path, path: &str) -> Result<String> {
    let path = path.trim().replace('\\', "/");
    let candidate = Path::new(&path);
    let inside = if candidate.is_absolute() {
        let real = fs::canonicalize(candidate).unwrap_or_else(|_| candidate.to_path_buf());
        real.strip_prefix(root)
            .map(Path::to_path_buf)
            .map_err(|_| format!("The path is outside the notes folder ({}).", root.display()))?
    } else {
        candidate.to_path_buf()
    };
    let mut parts = vec![];
    for component in inside.components() {
        match component {
            Component::Normal(part) => {
                let part = part.to_string_lossy();
                if part.starts_with('.') {
                    return Err("Hidden files and folders aren't part of the notes.".into());
                }
                parts.push(part.into_owned());
            }
            Component::CurDir => {}
            _ => return Err("Use a path inside the notes folder.".into()),
        }
    }
    if parts.is_empty() {
        return Err("Give the path of a file in the notes folder.".into());
    }
    Ok(parts.join("/"))
}

/// The real location of `path` inside `root`, which must exist and stay inside the root.
fn resolve(root: &Path, path: &str) -> Result<PathBuf> {
    let relative = relative(root, path)?;
    let real = fs::canonicalize(root.join(&relative))
        .map_err(|_| format!("“{relative}” isn't in the notes folder."))?;
    if !real.starts_with(root) {
        return Err("The path is outside the notes folder.".into());
    }
    if real.strip_prefix(root).unwrap().components().any(
        |part| matches!(part, Component::Normal(name) if name.to_string_lossy().starts_with('.')),
    ) {
        return Err("Hidden files and folders aren't part of the notes.".into());
    }
    Ok(real)
}

fn is_markdown(path: &Path) -> bool {
    path.extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("md") || e.eq_ignore_ascii_case("markdown"))
}

/// A Markdown file inside the root, relative to it.
pub fn note_path(root: &Path, path: &str) -> Result<String> {
    let real = resolve(root, path)?;
    if !real.is_file() || !is_markdown(&real) {
        return Err("Only Markdown (.md) files can be opened or attached.".into());
    }
    Ok(slashed(real.strip_prefix(root).unwrap_or(&real)))
}

fn slashed(path: &Path) -> String {
    path.components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

pub fn list(root: &Path) -> Result<Listing> {
    let mut notes = vec![];
    let mut images = vec![];
    let mut folders = vec![];
    let mut recent = vec![];
    let mut pending = vec![root.to_path_buf()];
    let mut seen = 0;
    while let Some(dir) = pending.pop() {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            seen += 1;
            if seen > MAX_ENTRIES {
                return Err(format!(
                    "The notes folder has more than {MAX_ENTRIES} items. Choose a smaller folder."
                ));
            }
            if entry.file_name().to_string_lossy().starts_with('.') {
                continue;
            }
            // file_type does not follow links, so a link is never entered or listed.
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            let path = entry.path();
            if kind.is_dir() {
                folders.push(slashed(path.strip_prefix(root).unwrap_or(&path)));
                pending.push(path);
            } else if kind.is_file() {
                let rel = slashed(path.strip_prefix(root).unwrap_or(&path));
                if is_markdown(&path) {
                    if let Ok(meta) = entry.metadata() {
                        recent.push(Recent {
                            path: rel.clone(),
                            modified: modified(&meta),
                        });
                    }
                    notes.push(rel);
                } else if image_type(&path).is_some() {
                    images.push(rel);
                }
            }
        }
    }
    notes.sort_by_key(|p| p.to_lowercase());
    images.sort_by_key(|p| p.to_lowercase());
    folders.sort_by_key(|p| p.to_lowercase());
    recent.sort_by(|a, b| b.modified.total_cmp(&a.modified));
    recent.truncate(RECENT);
    Ok(Listing {
        root: root.display().to_string(),
        notes,
        images,
        folders,
        recent,
    })
}

pub fn read(root: &Path, path: &str) -> Result<NoteFile> {
    let rel = note_path(root, path)?;
    let real = resolve(root, &rel)?;
    let meta = fs::metadata(&real).map_err(|e| e.to_string())?;
    if meta.len() > MAX_NOTE {
        return Err("The note is over 2 MB and can't be opened in Trama.".into());
    }
    let bytes = fs::read(&real).map_err(|e| e.to_string())?;
    let text = String::from_utf8(bytes)
        .map_err(|_| "The note isn't UTF-8 and can't be opened.".to_string())?;
    Ok(NoteFile {
        path: rel,
        version: fingerprint(text.as_bytes()),
        text,
        modified: modified(&meta),
    })
}

/// Replaces an existing note, only if it still holds the version the editor started from.
pub fn write(root: &Path, path: &str, text: &str, version: &str) -> Result<NoteFile> {
    let current = read(root, path)?;
    if current.version != version {
        return Err(
            "The note changed outside Trama after you opened it. Reload to see the current version."
                .into(),
        );
    }
    if text.len() as u64 > MAX_NOTE {
        return Err("The note is over 2 MB.".into());
    }
    let real = resolve(root, &current.path)?;
    let name = real
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    // Written beside the note and renamed over it, so a crash never leaves half a file.
    let temporary = real.with_file_name(format!(".{name}.trama-{}", std::process::id()));
    fs::write(&temporary, text).map_err(|e| e.to_string())?;
    if let Err(e) = fs::rename(&temporary, &real) {
        let _ = fs::remove_file(&temporary);
        return Err(e.to_string());
    }
    read(root, &current.path)
}

/// Where a new note or folder goes: its folder must already exist inside the root, and the
/// name is a single part, so nothing is created along the way.
fn new_entry(root: &Path, path: &str) -> Result<(String, PathBuf)> {
    let rel = relative(root, path)?;
    let (folder, name) = rel.rsplit_once('/').unwrap_or(("", &rel));
    let parent = if folder.is_empty() {
        root.to_path_buf()
    } else {
        resolve(root, folder)?
    };
    if !parent.is_dir() {
        return Err(format!("“{folder}” isn't a folder."));
    }
    let real = parent.join(name);
    if real.symlink_metadata().is_ok() {
        return Err(format!("“{name}” already exists in this folder."));
    }
    Ok((rel.clone(), real))
}

/// Creates an empty note; `.md` is added when the name has no Markdown extension. An existing
/// file is never replaced.
pub fn create_note(root: &Path, path: &str) -> Result<NoteFile> {
    let mut path = path.trim().to_string();
    if !is_markdown(Path::new(&path)) {
        path.push_str(".md");
    }
    let (rel, real) = new_entry(root, &path)?;
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&real)
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::AlreadyExists => {
                "A note with that name already exists here.".into()
            }
            _ => e.to_string(),
        })?;
    read(root, &rel)
}

/// Creates an empty folder and returns its path relative to the root.
pub fn create_folder(root: &Path, path: &str) -> Result<String> {
    let (rel, real) = new_entry(root, path)?;
    fs::create_dir(&real).map_err(|e| match e.kind() {
        std::io::ErrorKind::AlreadyExists => "A folder with that name already exists here.".into(),
        _ => e.to_string(),
    })?;
    Ok(rel)
}

/// An existing note or folder inside the root, as itself: a symbolic link is never followed, so
/// renaming or trashing one can only touch the vault.
fn entry(root: &Path, path: &str) -> Result<(String, PathBuf)> {
    let rel = relative(root, path)?;
    let (folder, name) = rel.rsplit_once('/').unwrap_or(("", &rel));
    let parent = if folder.is_empty() {
        root.to_path_buf()
    } else {
        resolve(root, folder)?
    };
    let real = parent.join(name);
    let kind = real
        .symlink_metadata()
        .map_err(|_| format!("“{rel}” isn't in the notes folder."))?
        .file_type();
    if !(kind.is_dir() || kind.is_file() && is_markdown(&real)) {
        return Err("Only notes and folders can be renamed or deleted.".into());
    }
    Ok((rel, real))
}

/// Gives a note or folder a new name in the same folder and returns its new path. A note keeps
/// being Markdown: `.md` is added when the new name has no Markdown extension.
pub fn rename(root: &Path, path: &str, name: &str) -> Result<String> {
    let (rel, real) = entry(root, path)?;
    let mut name = name.trim().to_string();
    if name.is_empty() || name.starts_with('.') || name.contains(['/', '\\']) {
        return Err("Use a name without slashes that doesn't start with a dot.".into());
    }
    if real.is_file() && !is_markdown(Path::new(&name)) {
        name.push_str(".md");
    }
    let target = real.with_file_name(&name);
    // A change only in letter case is the same entry on a case-insensitive disk.
    let same = fs::canonicalize(&target).ok() == fs::canonicalize(&real).ok();
    if target.symlink_metadata().is_ok() && !same {
        return Err(format!("“{name}” already exists in this folder."));
    }
    fs::rename(&real, &target).map_err(|e| e.to_string())?;
    Ok(match rel.rsplit_once('/') {
        Some((folder, _)) => format!("{folder}/{name}"),
        None => name,
    })
}

/// Moves a note or folder, with everything inside it, to the system's trash, where it can
/// still be put back.
pub fn trash(root: &Path, path: &str) -> Result<()> {
    trash_using(root, path, system_trash)
}

fn trash_using(root: &Path, path: &str, recycle: impl FnOnce(&Path) -> Result<()>) -> Result<()> {
    let (_, real) = entry(root, path)?;
    recycle(&real)
}

fn system_trash(real: &Path) -> Result<()> {
    #[allow(unused_mut)]
    let mut trash = trash::TrashContext::default();
    // The file manager's own call, not Finder by AppleScript: no permission prompt, no sound.
    #[cfg(target_os = "macos")]
    {
        use trash::macos::{DeleteMethod, TrashContextExtMacos};
        trash.set_delete_method(DeleteMethod::NsFileManager);
    }
    trash
        .delete(real)
        .map_err(|e| format!("Couldn't move to Trash: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trash_delegates_a_validated_note_to_the_recycle_service() {
        let folder = tempfile::tempdir().unwrap();
        let root = folder.path().canonicalize().unwrap();
        let recycle = tempfile::tempdir().unwrap();
        fs::write(root.join("note.md"), "recoverable").unwrap();
        trash_using(&root, "note.md", |path| {
            assert_eq!(path, root.join("note.md"));
            fs::rename(path, recycle.path().join("note.md")).map_err(|e| e.to_string())
        })
        .unwrap();
        assert_eq!(
            fs::read_to_string(recycle.path().join("note.md")).unwrap(),
            "recoverable"
        );
        assert!(!root.join("note.md").exists());
        trash_using(&root, "../outside.md", |_| {
            panic!("An unsafe path reached the recycle service")
        })
        .unwrap_err();
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Hit {
    pub path: String,
    /// The line where the text was found, shortened around it.
    pub excerpt: String,
}

/// Notes whose text contains `query`, ignoring case and accents; at most 50, in tree order.
pub fn search(root: &Path, query: &str) -> Result<Vec<Hit>> {
    let needle = crate::store::fold(query.trim());
    if needle.chars().count() < 2 {
        return Ok(vec![]);
    }
    let mut hits = vec![];
    for path in list(root)?.notes {
        let Ok(real) = resolve(root, &path) else {
            continue;
        };
        if fs::metadata(&real).map_or(true, |m| m.len() > MAX_NOTE) {
            continue;
        }
        let Ok(text) = fs::read_to_string(&real) else {
            continue;
        };
        if let Some(line) = text
            .lines()
            .find(|line| crate::store::fold(line).contains(&needle))
        {
            hits.push(Hit {
                path,
                excerpt: around(line.trim(), &needle),
            });
            if hits.len() == 50 {
                break;
            }
        }
    }
    Ok(hits)
}

fn around(line: &str, needle: &str) -> String {
    let chars: Vec<char> = line.chars().collect();
    if chars.len() <= 120 {
        return line.into();
    }
    let folded = crate::store::fold(line);
    let at = folded
        .find(needle)
        .map(|i| folded[..i].chars().count())
        .unwrap_or(0);
    let start = at.saturating_sub(40).min(chars.len());
    let end = (start + 120).min(chars.len());
    format!(
        "{}{}{}",
        if start > 0 { "…" } else { "" },
        chars[start..end].iter().collect::<String>(),
        if end < chars.len() { "…" } else { "" }
    )
}

fn image_type(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_string_lossy().to_lowercase();
    IMAGES.iter().find(|(e, _)| *e == ext).map(|(_, t)| *t)
}

/// An image of the folder as a `data:` URL, which the window's content policy allows.
pub fn image(root: &Path, path: &str) -> Result<String> {
    let real = resolve(root, path)?;
    let kind = image_type(&real).ok_or("Only PNG, JPEG, GIF, WebP or SVG images.")?;
    let meta = fs::metadata(&real).map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.len() > MAX_IMAGE {
        return Err("The image is over 8 MB.".into());
    }
    let bytes = fs::read(&real).map_err(|e| e.to_string())?;
    Ok(format!("data:{kind};base64,{}", base64(&bytes)))
}

fn modified(meta: &fs::Metadata) -> f64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map_or(0.0, |d| d.as_secs_f64())
}

/// FNV-1a: stable across processes, enough to notice that a file changed.
fn fingerprint(bytes: &[u8]) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for b in bytes {
        hash ^= *b as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}-{}", bytes.len())
}

fn base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = (chunk[0] as u32) << 16
            | (*chunk.get(1).unwrap_or(&0) as u32) << 8
            | *chunk.get(2).unwrap_or(&0) as u32;
        for i in 0..4 {
            if i <= chunk.len() {
                out.push(TABLE[(n >> (18 - 6 * i) & 63) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}
