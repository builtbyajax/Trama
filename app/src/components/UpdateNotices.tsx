import { t } from "../lib/i18n";
import { Icon } from "./Icon";

export function UpdateNotices({
  availableVersion,
  installing,
  restartNotice,
  onDismissRestart,
  onDismissUpdate,
  onInstall,
  onReleaseNotes,
}: {
  availableVersion: string | null;
  installing: boolean;
  restartNotice: boolean;
  onDismissRestart: () => void;
  onDismissUpdate: () => void;
  onInstall: () => void;
  onReleaseNotes: () => void;
}) {
  return (
    <>
      {restartNotice && (
        <div className="update-notice restart-notice" role="status">
          <span>
            {t(
              "Restart agent sessions to reconnect them to the MCP included with this version of Trama.",
            )}
          </span>
          <button
            className="icon-button"
            type="button"
            aria-label={t("Dismiss restart notice")}
            onClick={onDismissRestart}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
      {availableVersion && (
        <div
          className="update-notice available-notice"
          role="region"
          aria-label={t("Updates")}
        >
          <span>{t("Version {0} is available.", [availableVersion])}</span>
          <button
            className="button small"
            type="button"
            onClick={onReleaseNotes}
            disabled={installing}
          >
            {t("View release notes")}
          </button>
          <button
            className="button small primary"
            type="button"
            onClick={onInstall}
            disabled={installing}
          >
            {installing ? t("Installing update…") : t("Update and restart")}
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label={t("Dismiss update notice")}
            disabled={installing}
            onClick={onDismissUpdate}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
    </>
  );
}
