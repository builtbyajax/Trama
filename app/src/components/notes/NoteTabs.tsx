import type { MouseEvent } from "react";
import { errorMessage, revealLabel, revealPath } from "../../lib/api";
import { ariaKeys, shortcutLabel } from "../../lib/shortcuts";
import { noteName } from "../../lib/markdown";
import type { DocumentFile } from "../../lib/types";
import { Icon } from "../Icon";
import { saveText, type SaveState } from "./useNoteFile";
import { t } from "../../lib/i18n";

/** The open notes as tabs, with the save state and the reading actions at the right. */
export function NoteTabs({
  tabs,
  path,
  file,
  editing,
  save,
  root,
  onShowTree,
  onOpen,
  onClose,
  onMenu,
  onEdit,
  notify,
}: {
  tabs: string[];
  path: string | null;
  file: DocumentFile | null;
  editing: boolean;
  save: SaveState;
  root: string;
  onShowTree: () => void;
  onOpen: (note: string) => void;
  onClose: (note: string) => void;
  onMenu: (event: MouseEvent<HTMLElement>, note: string) => void;
  onEdit: () => void;
  notify: (text: string, error?: boolean) => void;
}) {
  return (
    <header className="note-tabs">
      <button
        type="button"
        className="icon-button tree-toggle"
        aria-label={t("Show notes")}
        onClick={() => onShowTree()}
      >
        <Icon name="sidebar" size={15} />
      </button>
      <div className="note-tablist" role="tablist" aria-label={t("Open notes")}>
        {tabs.map((tab) => {
          const on = tab === path;
          return (
            <div
              key={tab}
              className={`note-tab ${on ? "on" : ""}`}
              title={tab}
              onContextMenu={(event) => onMenu(event, tab)}
              onAuxClick={(event) => {
                if (event.button === 1) onClose(tab);
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={on}
                className="note-tab-name"
                onClick={() => onOpen(tab)}
              >
                <Icon name={on && editing ? "pencil" : "file"} size={13} />
                <span className="truncate">{noteName(tab)}</span>
              </button>
              <button
                type="button"
                className="note-tab-close"
                aria-label={t("Close {0}", [noteName(tab)])}
                onClick={() => onClose(tab)}
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="note-tabs-tail">
        {file && (editing || save !== "saved") && (
          <span className={`save-state note-save ${save}`} role="status">
            <span className="save-dot" aria-hidden="true" />
            {saveText[save]}
          </span>
        )}
        {file && !editing && (
          <>
            <button
              type="button"
              className="icon-button"
              aria-label={revealLabel()}
              data-tooltip={revealLabel()}
              onClick={() =>
                void revealPath(`${root}/${file.path}`).catch((e) =>
                  notify(errorMessage(e), true),
                )
              }
            >
              <Icon name="reveal" size={15} />
            </button>
            <button
              type="button"
              className="button small"
              aria-keyshortcuts={ariaKeys(["mod", "e"])}
              onClick={() => onEdit()}
            >
              <Icon name="pencil" size={13} />
              {t("Edit")}
              <kbd className="button-kbd">{shortcutLabel(["mod", "e"])}</kbd>
            </button>
          </>
        )}
      </div>
    </header>
  );
}
