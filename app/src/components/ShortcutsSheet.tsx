import { Fragment } from "react";
import { keycaps, shortcutGroups } from "../lib/shortcuts";
import { Modal } from "./Modal";
import { t } from "../lib/i18n";

/** Keyboard reference, opened with ⌘/ (Ctrl+/ on Windows) or from the Help menu. */
export function ShortcutsSheet({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title={t("Keyboard shortcuts")}
      onClose={onClose}
      className="shortcuts-modal"
    >
      <div
        className="modal-body scroll shortcuts-body"
        tabIndex={-1}
        data-autofocus
      >
        {[false, true].map((second) => (
          <div key={String(second)} className="shortcut-column">
            {shortcutGroups.map(
              (group, index) =>
                Boolean(group.second) === second && (
                  <section
                    key={group.title}
                    className="shortcut-group"
                    // One column again on a narrow sheet, in the list's order.
                    style={{ order: index }}
                  >
                    <h3>{group.title}</h3>
                    <dl>
                      {group.items.map((item) => (
                        <div key={item.label} className="shortcut-row">
                          <dt>{item.label}</dt>
                          <dd>
                            {item.keys.map((combo, index) => (
                              <Fragment key={index}>
                                {index > 0 && (
                                  <span className="shortcut-or">{t("or")}</span>
                                )}
                                <span className="keycaps">
                                  {keycaps(combo).map((cap) => (
                                    <kbd key={cap} className="keycap">
                                      {cap}
                                    </kbd>
                                  ))}
                                </span>
                              </Fragment>
                            ))}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ),
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
