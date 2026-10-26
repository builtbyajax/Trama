//! The app's operations, called by the Tauri window and by the browser preview's bridge.
use crate::{
    documents, git,
    store::{self, Store},
    workspaces,
};
use serde_json::{json, Value};
fn text<'a>(args: &'a Value, name: &str) -> store::Result<&'a str> {
    args[name]
        .as_str()
        .ok_or_else(|| format!("Missing argument: {name}"))
}
fn encoded<T: serde::Serialize>(value: store::Result<T>) -> store::Result<Value> {
    serde_json::to_value(value?).map_err(|e| e.to_string())
}
pub fn execute(command: &str, args: Value) -> store::Result<Value> {
    // Workspace commands come before opening the database: they choose which one that is.
    let workspace = || text(&args, "path");
    match command {
        "list_workspaces" => return encoded(Ok(workspaces::list())),
        "create_workspace" => {
            return encoded(workspaces::create(
                text(&args, "name")?,
                text(&args, "folder")?,
                args["color"].as_i64(),
                args["icon"].as_str(),
            ))
        }
        "open_workspace" => return encoded(workspaces::open(workspace()?)),
        "switch_workspace" => return encoded(workspaces::switch(workspace()?)),
        "edit_workspace" => {
            return encoded(workspaces::edit(
                workspace()?,
                text(&args, "name")?,
                args["color"].as_i64(),
                args["icon"].as_str(),
            ))
        }
        "remove_workspace" => return encoded(workspaces::remove(workspace()?)),
        "delete_workspace" => return encoded(workspaces::delete(workspace()?)),
        "relocate_workspace" => {
            return encoded(workspaces::relocate(workspace()?, text(&args, "folder")?))
        }
        #[cfg(feature = "dev-bridge")]
        "choose_file" => {
            return encoded(choose_file(args["title"].as_str().unwrap_or("Choose file")))
        }
        _ => {}
    }
    let store = Store::open_default()?;
    let project = || text(&args, "projectId");
    let task = || text(&args, "taskId");
    let path = || {
        store
            .project(project()?)?
            .repository_path
            .map(std::path::PathBuf::from)
            .ok_or_else(|| "Connect a repository to see the Git history.".to_string())
    };
    match command {
        "load_snapshot" => encoded(store.snapshot()),
        "save_project" => {
            let folder = match args["documentsFolder"]
                .as_str()
                .filter(|f| !f.trim().is_empty())
            {
                Some(folder) => Some(documents::canonical_root(folder)?.display().to_string()),
                None => None,
            };
            encoded(store.save_project(
                args["projectId"].as_str(),
                text(&args, "name")?,
                args["repositoryPath"].as_str().map(String::from),
                args["color"].as_i64(),
                folder,
                args.get("icon").map(|icon| icon.as_str().map(String::from)),
            ))
        }
        "delete_project" => encoded(store.delete_project(project()?)),
        "move_project" => {
            encoded(store.move_project_to(project()?, std::path::Path::new(workspace()?)))
        }
        "save_task" => {
            let input: store::TaskInput =
                serde_json::from_value(args["input"].clone()).map_err(|e| e.to_string())?;
            if let Some(branch) = input.repository_branch.as_deref().filter(|b| !b.is_empty()) {
                let project = store.project(&input.project_id)?;
                git::require_local_branch(project.repository_path.as_deref(), branch)?;
            }
            encoded(store.save_task(args["taskId"].as_str(), input))
        }
        "edit_task" => {
            let patch: store::TaskPatch =
                serde_json::from_value(args["input"].clone()).map_err(|e| e.to_string())?;
            if let Some(branch) = patch
                .repository_branch
                .clone()
                .flatten()
                .filter(|b| !b.is_empty())
            {
                let project = store.project(&patch.project_id)?;
                git::require_local_branch(project.repository_path.as_deref(), &branch)?;
            }
            encoded(store.edit_task(task()?, patch))
        }
        "move_task" => encoded(store.move_task(
            task()?,
            project()?,
            text(&args, "status")?,
            args["afterId"].as_str(),
        )),
        "create_category" => encoded(store.create_category(project()?, text(&args, "name")?)),
        "delete_category" => encoded(store.delete_category(
            project()?,
            text(&args, "name")?,
            args["replacement"].as_str(),
        )),
        "save_goal" => encoded(store.save_goal(
            args["goalId"].as_str(),
            project()?,
            text(&args, "name")?,
            args["description"].as_str().unwrap_or(""),
            args["targetDate"].as_str(),
        )),
        "complete_goal" => encoded(
            store.complete_goal(
                text(&args, "goalId")?,
                project()?,
                args["completed"]
                    .as_bool()
                    .ok_or("Missing argument: completed")?,
            ),
        ),
        "delete_goal" => encoded(store.delete_goal(text(&args, "goalId")?, project()?)),
        "promote_draft" => encoded(store.promote_draft(task()?, project()?)),
        "delete_task" => encoded(store.delete_task(task()?, project()?)),
        "archive_task" => encoded(
            store.archive_task(
                task()?,
                project()?,
                args["archived"]
                    .as_bool()
                    .ok_or("Missing argument: archived")?,
            ),
        ),
        "task_details" => encoded(store.task_details(task()?, project()?)),
        "handoff_events" => {
            encoded(store.handoff_events(args["since"].as_f64().ok_or("Missing argument: since")?))
        }
        "add_note" => encoded(store.add_note(task()?, project()?, text(&args, "body")?)),
        "delete_note" => encoded(store.delete_note(text(&args, "noteId")?, task()?, project()?)),
        "list_documents" => encoded(documents::list(&store.documents_root(project()?)?)),
        "search_documents" => encoded(documents::search(
            &store.documents_root(project()?)?,
            text(&args, "query")?,
        )),
        "read_document" => encoded(documents::read(
            &store.documents_root(project()?)?,
            text(&args, "path")?,
        )),
        "write_document" => encoded(documents::write(
            &store.documents_root(project()?)?,
            text(&args, "path")?,
            text(&args, "text")?,
            text(&args, "version")?,
        )),
        "create_document" => encoded(documents::create_note(
            &store.documents_root(project()?)?,
            text(&args, "path")?,
        )),
        "create_document_folder" => encoded(documents::create_folder(
            &store.documents_root(project()?)?,
            text(&args, "path")?,
        )),
        "rename_document" => {
            encoded(store.rename_document(project()?, text(&args, "path")?, text(&args, "name")?))
        }
        "trash_document" => encoded(documents::trash(
            &store.documents_root(project()?)?,
            text(&args, "path")?,
        )),
        "document_image" => encoded(documents::image(
            &store.documents_root(project()?)?,
            text(&args, "path")?,
        )),
        #[cfg(feature = "dev-bridge")]
        "choose_directory" => encoded(choose_directory(
            args["title"].as_str().unwrap_or("Choose folder"),
            args["defaultPath"].as_str(),
        )),
        "attach_document" => {
            encoded(store.attach_document(task()?, project()?, text(&args, "path")?, "user"))
        }
        "detach_document" => {
            encoded(store.detach_document(task()?, project()?, text(&args, "path")?, "user"))
        }
        "search_tasks" => encoded(store.search(text(&args, "query")?)),
        "list_branches" => encoded(git::local_branches(&path()?)),
        "git_snapshot" => encoded(git::snapshot(&path()?, 100)),
        "git_commit_details" => encoded(git::commit_details(&path()?, text(&args, "commitId")?)),
        "git_working_diff" => encoded(git::working_diff(&path()?)),
        "git_range_diff" => encoded(git::range_diff(
            &path()?,
            text(&args, "base")?,
            text(&args, "head")?,
        )),
        "list_pull_requests" => {
            Ok(serde_json::to_value(git::pull_requests(&path()?)).map_err(|e| e.to_string())?)
        }
        "validate_repository" => {
            git::snapshot(std::path::Path::new(text(&args, "path")?), 1)?;
            Ok(json!(null))
        }
        _ => Err("Unknown command.".into()),
    }
}

/// The browser preview has no Tauri dialog; the development bridge asks macOS for a folder.
#[cfg(feature = "dev-bridge")]
fn choose_directory(title: &str, default: Option<&str>) -> store::Result<Option<String>> {
    if !cfg!(target_os = "macos") {
        return Err("The browser's folder picker only exists on macOS.".into());
    }
    let quote = |s: &str| s.replace('\\', "\\\\").replace('"', "\\\"");
    let location = default
        .filter(|d| std::path::Path::new(d).is_dir())
        .map(|d| format!(" default location (POSIX file \"{}\")", quote(d)))
        .unwrap_or_default();
    let script = format!(
        "POSIX path of (choose folder with prompt \"{}\"{location})",
        quote(title)
    );
    let output = std::process::Command::new("osascript")
        .args(["-e", &script])
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        // Cancelling the dialog (error -128) chooses nothing.
        return Ok(None);
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok((!path.is_empty()).then(|| path.trim_end_matches('/').to_string()))
}

/// The browser preview's stand-in for the app's file dialog: a database file from Finder.
#[cfg(feature = "dev-bridge")]
fn choose_file(title: &str) -> store::Result<Option<String>> {
    if !cfg!(target_os = "macos") {
        return Err("The browser's file picker only exists on macOS.".into());
    }
    let script = format!(
        "POSIX path of (choose file with prompt \"{}\" of type {{\"sqlite\", \"db\"}})",
        title.replace('\\', "\\\\").replace('"', "\\\"")
    );
    let output = std::process::Command::new("osascript")
        .args(["-e", &script])
        .output()
        .map_err(|e| e.to_string())?;
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok((output.status.success() && !path.is_empty()).then_some(path))
}
