use super::*;
use std::fs;

/// The folder beside a database that holds its backups.
pub const FOLDER: &str = "Backups";

/// Where `database`'s backups go: a `Backups` folder beside it, which a workspace's own folder
/// keeps inside it.
pub fn folder(database: &Path) -> PathBuf {
    database
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."))
        .join(FOLDER)
}

/// Saves the database as it is, before a migration from `version`. The name says which app made it
/// and the schema it holds: `workspace.sqlite.v0.3.1.schema-12.bak`.
///
/// The immediate migration transaction holds off other writers. VACUUM INTO uses a
/// second, read-only connection because SQLite refuses VACUUM inside a transaction.
pub(super) fn create(path: &Path, version: i64) -> Result<()> {
    let result = || -> Result<()> {
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or("The database filename must be valid UTF-8.")?;
        let folder = folder(path);
        fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
        let stem = format!("{name}.v{}.schema-{version}", env!("CARGO_PKG_VERSION"));
        let mut destination = folder.join(format!("{stem}.bak"));
        if destination.symlink_metadata().is_ok() {
            destination = folder.join(format!("{stem}.{}.bak", id()));
        }
        let partial = folder.join(format!("{stem}.{}.partial", id()));
        let copy = || -> Result<()> {
            let file = fs::File::create_new(&partial).map_err(|e| e.to_string())?;
            file.set_permissions(fs::metadata(path).map_err(|e| e.to_string())?.permissions())
                .map_err(|e| e.to_string())?;
            drop(file);
            let source = sql(Connection::open_with_flags(
                path,
                rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
            ))?;
            sql(source.execute_batch("PRAGMA synchronous=FULL;"))?;
            sql(source.execute(
                "VACUUM main INTO ?1",
                [partial.to_str().ok_or("Invalid backup path.")?],
            ))?;
            fs::rename(&partial, &destination).map_err(|e| e.to_string())?;
            retain_latest(path, &destination)
        };
        let result = copy();
        if result.is_err() {
            let _ = fs::remove_file(&partial);
        }
        result
    };
    result().map_err(|e| {
        format!(
            "Could not save the backup beside {}. The database was not migrated. Check free space and folder permissions: {e}",
            path.display()
        )
    })
}

/// The backups saved for `database`, by the name `create` gives them.
pub fn files(database: &Path) -> Result<Vec<PathBuf>> {
    let prefix = format!(
        "{}.v",
        database
            .file_name()
            .ok_or("Invalid database path.")?
            .to_string_lossy()
    );
    let mut files = Vec::new();
    let entries = match fs::read_dir(folder(database)) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(files),
        entries => entries.map_err(|e| e.to_string())?,
    };
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().map_err(|e| e.to_string())?.is_file()
            && is_backup(&entry.file_name().to_string_lossy(), &prefix)
        {
            files.push(entry.path());
        }
    }
    Ok(files)
}

fn retain_latest(database: &Path, latest: &Path) -> Result<()> {
    let mut older = Vec::new();
    for path in files(database)? {
        if path.file_name() == latest.file_name() {
            continue;
        }
        let modified = fs::metadata(&path)
            .and_then(|m| m.modified())
            .map_err(|e| e.to_string())?;
        older.push((modified, path));
    }
    older.sort();
    let remove = older.len().saturating_sub(2);
    for (_, path) in older.into_iter().take(remove) {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// `<prefix><app version>.schema-<n>.bak`, with an optional `.<uuid>` before `.bak`.
fn is_backup(name: &str, prefix: &str) -> bool {
    let Some((app, rest)) = name
        .strip_prefix(prefix)
        .and_then(|s| s.strip_suffix(".bak"))
        .and_then(|s| s.split_once(".schema-"))
    else {
        return false;
    };
    let (schema, suffix) = rest.split_once('.').unwrap_or((rest, ""));
    !app.is_empty()
        && app.split('.').all(|part| part.parse::<u32>().is_ok())
        && schema.parse::<u32>().is_ok()
        && (suffix.is_empty() || uuid::Uuid::parse_str(suffix).is_ok())
}
