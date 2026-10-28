use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    AppHandle, Emitter, Manager,
};

/// The menu in English until the interface says which language it shows.
pub fn install(app: &tauri::App) -> tauri::Result<()> {
    set(app.handle(), "en")?;
    app.on_menu_event(|app, event| {
        let id = event.id().as_ref();
        if id == "compact_window" || id == "standard_window" {
            if let Some(window) = app.get_webview_window("main") {
                let (w, h) = if id == "compact_window" {
                    (900., 620.)
                } else {
                    (1240., 800.)
                };
                let _ = window.set_size(tauri::LogicalSize::new(w, h));
            }
        } else {
            let _ = app.emit("trama-menu", id);
        }
    });
    Ok(())
}

/// Rebuilds the menu in the interface's language: "pt-BR" or English for anything else.
pub fn set(app: &AppHandle, language: &str) -> tauri::Result<()> {
    let pt = language == "pt-BR";
    let text =
        |english: &'static str, portuguese: &'static str| if pt { portuguese } else { english };
    let item =
        |id: &str, title: &str, key: Option<&str>| MenuItem::with_id(app, id, title, true, key);
    let task = item(
        "new_task",
        text("New task…", "Nova tarefa…"),
        Some("CmdOrCtrl+N"),
    )?;
    let project = item(
        "new_project",
        text("New project…", "Novo projeto…"),
        Some("CmdOrCtrl+Shift+N"),
    )?;
    let file = Submenu::with_items(app, text("File", "Arquivo"), true, &[&task, &project])?;
    let edit = Submenu::with_items(
        app,
        text("Edit", "Editar"),
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;
    let search = item("search", text("Search…", "Buscar…"), Some("CmdOrCtrl+K"))?;
    let sidebar = item(
        "toggle_sidebar",
        text("Show/hide sidebar", "Mostrar/ocultar barra lateral"),
        Some("CmdOrCtrl+B"),
    )?;
    let reload = item("reload", text("Refresh", "Atualizar"), Some("CmdOrCtrl+R"))?;
    let overview = item(
        "overview",
        text("Overview", "Visão geral"),
        Some("CmdOrCtrl+Alt+1"),
    )?;
    let archive = item(
        "archive",
        text("Archive", "Arquivo"),
        Some("CmdOrCtrl+Alt+2"),
    )?;
    let notes = item("notes", text("Vaults", "Cofres"), Some("CmdOrCtrl+Alt+3"))?;
    let switch_project = item(
        "switch_project",
        text("Go to project…", "Ir para projeto…"),
        Some("CmdOrCtrl+T"),
    )?;
    // ⌘ and a number picks a project; the open project's tabs take ⌃.
    let tab = "Ctrl";
    let project_page = item(
        "project_page",
        text("Project page", "Página do projeto"),
        Some(&format!("{tab}+1")),
    )?;
    let board = item(
        "board",
        text("Project board", "Quadro do projeto"),
        Some(&format!("{tab}+2")),
    )?;
    let git = item(
        "git",
        text("Project Git history", "Histórico Git do projeto"),
        Some(&format!("{tab}+3")),
    )?;
    let project_notes = item(
        "project_notes",
        text("Project notes", "Notas do projeto"),
        Some(&format!("{tab}+4")),
    )?;
    let board_view = item(
        "board_view",
        text("Kanban or List", "Kanban ou Lista"),
        Some("CmdOrCtrl+Shift+L"),
    )?;
    let done = item(
        "toggle_done",
        text("Expand/fold Done", "Expandir/recolher Concluídas"),
        Some("CmdOrCtrl+Alt+B"),
    )?;
    let back = item("back", text("Back", "Voltar"), Some("CmdOrCtrl+["))?;
    let forward = item("forward", text("Forward", "Avançar"), Some("CmdOrCtrl+]"))?;
    let view = Submenu::with_items(
        app,
        text("View", "Visualizar"),
        true,
        &[
            &search,
            &sidebar,
            &reload,
            &PredefinedMenuItem::separator(app)?,
            &back,
            &forward,
            &PredefinedMenuItem::separator(app)?,
            &overview,
            &archive,
            &notes,
            &switch_project,
            &project_page,
            &board,
            &git,
            &project_notes,
            &PredefinedMenuItem::separator(app)?,
            &board_view,
            &done,
        ],
    )?;
    let compact = item(
        "compact_window",
        text("Compact size", "Tamanho compacto"),
        None,
    )?;
    let standard = item(
        "standard_window",
        text("Standard size", "Tamanho padrão"),
        None,
    )?;
    let window = Submenu::with_items(
        app,
        text("Window", "Janela"),
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &compact,
            &standard,
        ],
    )?;
    let preferences = item(
        "preferences",
        text("Preferences…", "Preferências…"),
        Some("CmdOrCtrl+,"),
    )?;
    let shortcuts = item(
        "shortcuts",
        text("Keyboard shortcuts", "Atalhos de teclado"),
        Some("CmdOrCtrl+/"),
    )?;
    let help = Submenu::with_items(app, text("Help", "Ajuda"), true, &[&shortcuts])?;
    let app_menu = Submenu::with_items(
        app,
        "Trama",
        true,
        &[
            &PredefinedMenuItem::about(app, Some(text("About Trama", "Sobre o Trama")), None)?,
            &PredefinedMenuItem::separator(app)?,
            &preferences,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, Some(text("Quit Trama", "Encerrar Trama")))?,
        ],
    )?;
    app.set_menu(Menu::with_items(
        app,
        &[&app_menu, &file, &edit, &view, &window, &help],
    )?)?;
    Ok(())
}
