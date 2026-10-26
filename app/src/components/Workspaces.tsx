import { useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  chooseDatabase,
  createWorkspace,
  deleteWorkspace,
  errorMessage,
  openWorkspace,
  removeWorkspace,
} from "../lib/api";
import type { Workspace, Workspaces } from "../lib/types";
import { BrandMark } from "./BrandMark";
import { Field } from "./Field";
import { Icon, type IconName } from "./Icon";
import { Modal } from "./Modal";
import { ColorPicker, IconPicker } from "./ProjectComposer";
import { initialOf, projectIcons } from "./ProjectMark";
import { ContextMenu, projectHues, type MenuItem } from "./Sidebar";
import { t } from "../lib/i18n";

/** The workspace's name; the one Trama creates on its own has none saved. */
export const workspaceName = (workspace?: Workspace) =>
  workspace?.name || t("Personal");

export const activeWorkspace = (list: Workspaces | null) =>
  list?.workspaces.find((w) => w.path === list.active);

/**
 * Every workspace Trama makes is a `workspace.sqlite`, so opening one the list doesn't have asks
 * what it's called.
 */
export const needsName = (path: string, list: Workspaces | null) =>
  /(^|[\\/])workspace\.sqlite$/.test(path) &&
  !list?.workspaces.some((w) => w.path === path);

const known = new Set<string>(projectIcons.map((icon) => icon.name));
const hueOf = (color: number) => projectHues[color % projectHues.length];

/**
 * A workspace's icon or initial on a tile filled with its color. One without a color, like the
 * workspace Trama creates on its own, keeps the plain gray tile.
 */
function WorkspaceMark({
  name,
  color,
  icon,
}: {
  name: string;
  color: number | null;
  icon: string | null;
}) {
  return (
    <span
      className={`workspace-mark ${color === null ? "" : "tinted"}`}
      style={
        color === null
          ? undefined
          : ({ "--hue": hueOf(color) } as CSSProperties)
      }
      aria-hidden="true"
    >
      {icon && known.has(icon) ? (
        <Icon name={icon as IconName} size={12} />
      ) : (
        initialOf(name)
      )}
    </span>
  );
}

/** Workspaces the open one can send a project to. */
export const otherWorkspaces = (list: Workspaces | null) =>
  list?.workspaces.filter((w) => w.path !== list.active && !w.missing) ?? [];

/**
 * The open workspace at the top of the sidebar. Its menu switches to another one, edits the open
 * one, creates a new one, opens a database file or goes to the full list in Preferences.
 */
export function WorkspaceButton({
  list,
  rail,
  onSwitch,
  onEdit,
  onCreate,
  onOpen,
  onManage,
}: {
  list: Workspaces;
  rail: boolean;
  onSwitch: (workspace: Workspace) => void;
  onEdit: (workspace: Workspace) => void;
  onCreate: () => void;
  onOpen: () => void;
  /** Preferences, where every workspace can be edited, moved or removed. */
  onManage: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    width: number;
  } | null>(null);
  const active = activeWorkspace(list);
  const name = workspaceName(active);
  const items: MenuItem[] = [
    ...list.workspaces.map((workspace) => ({
      label: workspaceName(workspace),
      leading: (
        <WorkspaceMark
          name={workspaceName(workspace)}
          color={workspace.color}
          icon={workspace.icon}
        />
      ),
      checked: workspace.path === list.active,
      hint: workspace.missing ? t("Not found") : undefined,
      onSelect: () => workspace.path !== list.active && onSwitch(workspace),
    })),
    ...(active
      ? [
          {
            label: t("Edit workspace…"),
            icon: "rename" as const,
            separated: true,
            onSelect: () => onEdit(active),
          },
        ]
      : []),
    {
      label: t("New workspace…"),
      icon: "plus",
      separated: !active,
      onSelect: onCreate,
    },
    { label: t("Open workspace…"), icon: "folder", onSelect: onOpen },
    {
      label: t("Manage workspaces…"),
      icon: "gear",
      separated: true,
      onSelect: onManage,
    },
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
        <WorkspaceMark
          name={name}
          color={active?.color ?? null}
          icon={active?.icon ?? null}
        />
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

type Look = { name: string; color: number | null; icon: string | null };

/** A workspace's name, color and icon, as the composer and the first screen ask for them. */
function WorkspaceFields({
  look,
  onChange,
}: {
  look: Look;
  onChange: (look: Look) => void;
}) {
  const { name, color, icon } = look;
  return (
    <>
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
            onChange={(e) => onChange({ ...look, name: e.target.value })}
            placeholder={t("E.g. Work")}
          />
        )}
      </Field>
      <Field label={t("Color")}>
        {({ id, labelId }) => (
          <ColorPicker
            id={id}
            labelId={labelId}
            value={color}
            onChange={(color) => onChange({ ...look, color })}
          />
        )}
      </Field>
      <Field label={t("Icon")}>
        {({ id, labelId }) => (
          <IconPicker
            id={id}
            labelId={labelId}
            name={name}
            hue={color === null ? "var(--line)" : hueOf(color)}
            value={icon}
            onChange={(icon) => onChange({ ...look, icon })}
          />
        )}
      </Field>
    </>
  );
}

/** Names a new workspace, which Trama keeps in a folder of its own, or edits one's name, color and icon. */
export function WorkspaceComposer({
  workspace,
  workspaces,
  onClose,
  onSubmit,
}: {
  /** Present when editing. */
  workspace?: Workspace;
  /** All of them, so a new one gets the color fewest use. */
  workspaces: Workspace[];
  onClose: () => void;
  onSubmit: (
    name: string,
    color: number | null,
    icon: string | null,
  ) => Promise<unknown>;
}) {
  const [look, setLook] = useState<Look>(() => {
    const use = projectHues.map(
      (_, hue) => workspaces.filter((w) => w.color === hue).length,
    );
    return {
      name: workspace ? workspaceName(workspace) : "",
      color: workspace?.color ?? use.indexOf(Math.min(...use)),
      icon: workspace?.icon ?? null,
    };
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    // The last error stays until the next result: clearing it first moves the form while waiting.
    setBusy(true);
    try {
      await onSubmit(look.name, look.color, look.icon);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <Modal
      title={workspace ? t("Edit workspace") : t("New workspace")}
      onClose={onClose}
      className="project-modal"
    >
      <form className="modal-form" onSubmit={submit}>
        <div className="modal-body scroll">
          <WorkspaceFields look={look} onChange={setLook} />
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
                : t("Save workspace")
              : busy
                ? t("Creating…")
                : t("Create workspace")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

/**
 * The whole window until there is a workspace: the person names the first one, with nothing
 * filled in for them, or opens a database they already have.
 */
export function FirstWorkspace({
  onEnter,
}: {
  onEnter: (list: Workspaces) => void;
}) {
  const [look, setLook] = useState<Look>({ name: "", color: null, icon: null });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  async function run(action: () => Promise<Workspaces | null>) {
    if (busy) return;
    setBusy(true);
    try {
      const list = await action();
      if (list) return onEnter(list);
    } catch (e) {
      setError(errorMessage(e));
    }
    setBusy(false);
  }
  return (
    <main className="first-workspace" data-tauri-drag-region>
      <form
        className="first-workspace-form"
        aria-labelledby="first-workspace-title"
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => createWorkspace(look.name, look.color, look.icon));
        }}
      >
        <BrandMark size={40} />
        <h1 id="first-workspace-title">{t("Create your first workspace")}</h1>
        <p className="first-workspace-lead">
          {t(
            "A workspace holds your projects and tasks. You can create others later.",
          )}
        </p>
        <WorkspaceFields look={look} onChange={setLook} />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="first-workspace-actions">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const path = await chooseDatabase();
                if (path && needsName(path, null)) setNaming(path);
                else if (path) return openWorkspace(path);
                return null;
              })
            }
          >
            <Icon name="folder" size={14} />
            {t("Open existing workspace…")}
          </button>
          <button className="button primary" disabled={busy} aria-busy={busy}>
            {t("Create workspace")}
          </button>
        </div>
      </form>
      {naming && (
        <WorkspaceNaming
          onClose={() => setNaming(null)}
          onSubmit={async (name) => onEnter(await openWorkspace(naming, name))}
        />
      )}
    </main>
  );
}

/** Asks for the name of a workspace file being opened, since its file name says nothing. */
export function WorkspaceNaming({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (name: string) => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await onSubmit(name);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <Modal title={t("Name the workspace")} onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <div className="modal-body">
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
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="modal-footer">
          <span className="footer-hint">
            {t("Its projects, tasks, color and icon stay as they are.")}
          </span>
          <button type="button" className="button" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="button primary" disabled={busy} aria-busy={busy}>
            {busy ? t("Opening…") : t("Open workspace")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

/**
 * Confirmation before a workspace leaves the list, keeping its file, or is deleted with it.
 * Deleting asks for its name. The open one can go too: Trama then opens `fallback`, or, with no
 * other workspace, asks for a new one.
 */
export function WorkspaceLeave({
  workspace,
  mode,
  fallback,
  last,
  onClose,
  onDone,
}: {
  workspace: Workspace;
  mode: "remove" | "delete";
  /** The workspace that opens next, present when `workspace` is the open one. */
  fallback?: Workspace;
  /** The open one with no other to switch to. */
  last?: boolean;
  onClose: () => void;
  onDone: (list: Workspaces) => void;
}) {
  const name = workspaceName(workspace);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const armed = mode === "remove" || typed.trim() === name;
  return (
    <Modal
      title={
        mode === "remove" ? t("Remove from list?") : t("Delete workspace?")
      }
      className="confirm-modal"
      onClose={onClose}
    >
      <form
        className="modal-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy || !armed) return;
          setBusy(true);
          (mode === "remove"
            ? removeWorkspace(workspace.path)
            : deleteWorkspace(workspace.path)
          )
            .then(onDone)
            .catch((e) => {
              setError(errorMessage(e));
              setBusy(false);
            });
        }}
      >
        <div className="modal-body">
          <p className="modal-text">
            {mode === "remove"
              ? t(
                  "“{0}” leaves the list. Its file stays in the folder, and Open workspace… brings it back.",
                  [name],
                )
              : t(
                  "“{0}” and every project and task in it are deleted from this computer, along with its file and backups. This can't be undone.",
                  [name],
                )}
            {fallback &&
              " " + t("Trama then opens “{0}”.", [workspaceName(fallback)])}
            {last &&
              " " +
                t(
                  "It's your only workspace, so Trama then asks you to create a new one.",
                )}
          </p>
          {mode === "delete" && (
            <Field label={t("Type “{0}” to confirm", [name])}>
              {({ id }) => (
                <input
                  id={id}
                  autoFocus
                  data-autofocus
                  autoComplete="off"
                  spellCheck={false}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                />
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
          <span className="footer-hint" />
          <button type="button" className="button" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button
            className="button danger"
            disabled={busy || !armed}
            aria-busy={busy}
          >
            {mode === "remove"
              ? busy
                ? t("Removing…")
                : t("Remove from list")
              : busy
                ? t("Deleting…")
                : t("Delete workspace")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
