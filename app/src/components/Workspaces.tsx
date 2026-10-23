import { useRef, useState, type FormEvent } from "react";
import {
  chooseDirectory,
  errorMessage,
  folderExample,
} from "../lib/api";
import type { Workspace, Workspaces } from "../lib/types";
import { Field } from "./Field";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { ContextMenu, type MenuItem } from "./Sidebar";
import { t } from "../lib/i18n";

/** The workspace's name; the one Trama creates on its own has none saved. */
export const workspaceName = (workspace?: Workspace) =>
  workspace?.name || t("Personal");

export const activeWorkspace = (list: Workspaces | null) =>
  list?.workspaces.find((w) => w.path === list.active);

/** A workspace's initial, the way the sidebar shows it. */
function WorkspaceMark({ name }: { name: string }) {
  return (
    <span className="workspace-mark" aria-hidden="true">
      {name.slice(0, 1).toLocaleUpperCase()}
    </span>
  );
}

/** Workspaces the open one can send a project to. */
export const otherWorkspaces = (list: Workspaces | null) =>
  list?.workspaces.filter((w) => w.path !== list.active && !w.missing) ?? [];

/**
 * The open workspace at the top of the sidebar. Its menu switches to another one, creates a new
 * one or opens a database file; renaming, moving and removing are in Preferences.
 */
export function WorkspaceButton({
  list,
  rail,
  onSwitch,
  onCreate,
  onOpen,
}: {
  list: Workspaces;
  rail: boolean;
  onSwitch: (workspace: Workspace) => void;
  onCreate: () => void;
  onOpen: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    width: number;
  } | null>(null);
  const name = workspaceName(activeWorkspace(list));
  const items: MenuItem[] = [
    ...list.workspaces.map((workspace) => ({
      label: workspaceName(workspace),
      leading: <WorkspaceMark name={workspaceName(workspace)} />,
      checked: workspace.path === list.active,
      hint: workspace.missing ? t("Not found") : undefined,
      onSelect: () => workspace.path !== list.active && onSwitch(workspace),
    })),
    {
      label: t("New workspace…"),
      icon: "plus",
      separated: true,
      onSelect: onCreate,
    },
    { label: t("Open workspace…"), icon: "folder", onSelect: onOpen },
  ];
  return (
    <>
      <button
        ref={button}
        type="button"
        className={`workspace-button ${menu ? "open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(menu)}
        aria-label={t("Workspace: {0}", [name])}
        data-tooltip={rail ? t("Workspace: {0}", [name]) : undefined}
        data-tooltip-side="right"
        disabled={list.pinned}
        onClick={() => {
          const rect = button.current!.getBoundingClientRect();
          setMenu(
            menu
              ? null
              : {
                  x: rect.left,
                  y: rect.bottom + 4,
                  width: Math.max(rect.width, 220),
                },
          );
        }}
      >
        <WorkspaceMark name={name} />
        <span className="workspace-name truncate">{name}</span>
        {!list.pinned && (
          <span className="workspace-chevron" aria-hidden="true">
            <Icon name="chevronDown" size={12} />
          </span>
        )}
      </button>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          width={menu.width}
          label={t("Workspaces")}
          heading={t("Workspaces")}
          className="workspace-menu"
          anchor={button}
          items={items}
          onClose={(restoreFocus) => {
            if (restoreFocus) button.current?.focus();
            setMenu(null);
          }}
        />
      )}
    </>
  );
}

/** Names a new workspace and chooses its folder, or renames one. */
export function WorkspaceComposer({
  workspace,
  defaultFolder,
  onClose,
  onSubmit,
}: {
  /** Present when renaming. */
  workspace?: Workspace;
  defaultFolder: string;
  onClose: () => void;
  onSubmit: (name: string, folder: string) => Promise<unknown>;
}) {
  const [name, setName] = useState(workspace ? workspaceName(workspace) : "");
  const [folder, setFolder] = useState(defaultFolder);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(name, folder.trim());
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <Modal
      title={workspace ? t("Rename workspace") : t("New workspace")}
      onClose={onClose}
      className="project-modal"
    >
      <form className="modal-form" onSubmit={submit}>
        <div className="modal-body scroll">
          <Field label={t("Workspace name")}>
            {({ id }) => (
              <input
                id={id}
                autoFocus
                data-autofocus
                required
                autoComplete="off"
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("E.g. Work")}
              />
            )}
          </Field>
          {!workspace && (
            <Field
              label={t("Folder")}
              hint={t(
                "The workspace is one file in this folder. Copy or move it like any other file.",
              )}
            >
              {({ id, describedBy }) => (
                <div className="input-row">
                  <input
                    id={id}
                    className="path-input"
                    aria-describedby={describedBy}
                    required
                    autoComplete="off"
                    spellCheck={false}
                    value={folder}
                    title={folder || undefined}
                    onChange={(e) => setFolder(e.target.value)}
                    placeholder={folderExample()}
                  />
                  <button
                    type="button"
                    className="button"
                    aria-label={t("Choose workspace folder")}
                    onClick={() =>
                      void chooseDirectory(t("Workspace folder"), folder)
                        .then((chosen) => chosen && setFolder(chosen))
                        .catch((e) => setError(errorMessage(e)))
                    }
                  >
                    <Icon name="folder" size={14} />
                    {t("Choose…")}
                  </button>
                </div>
              )}
            </Field>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="modal-footer">
          <span className="footer-hint">
            {workspace
              ? ""
              : t("Each workspace has its own projects and tasks.")}
          </span>
          <button type="button" className="button" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="button primary" disabled={busy} aria-busy={busy}>
            {workspace
              ? busy
                ? t("Saving…")
                : t("Rename")
              : busy
                ? t("Creating…")
                : t("Create workspace")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
