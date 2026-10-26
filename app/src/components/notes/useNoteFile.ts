import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, readDocument, writeDocument } from "../../lib/api";
import type { DocumentFile } from "../../lib/types";
import { t } from "../../lib/i18n";

export type SaveState = "saved" | "pending" | "saving" | "conflict" | "error";
export const saveText: Record<SaveState, string> = {
  saved: t("Saved"),
  pending: t("Saving…"),
  saving: t("Saving…"),
  conflict: t("Changed outside Trama"),
  error: t("Couldn't save"),
};

/**
 * The note on screen: its file, the draft being typed and the save that follows it. `latest`
 * holds the current values for saves and reloads that finish later.
 */
export function useNoteFile(projectId: string) {
  const [path, setPath] = useState<string | null>(null);
  const [file, setFile] = useState<DocumentFile | null>(null);
  const [fileError, setFileError] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState("");
  const timer = useRef<number | undefined>(undefined);
  // The latest file and draft, for saves and reloads that finish later.
  const latest = useRef({ file, draft, path });
  latest.current = { file, draft, path };

  const loadFile = useCallback(
    async (target: string) => {
      try {
        const loaded = await readDocument(projectId, target);
        if (latest.current.path !== target) return;
        const current = latest.current.file;
        // A newer version on disk replaces the note only when nothing is waiting to be saved.
        if (current?.version === loaded.version) return;
        if (latest.current.draft !== null && current?.path === target) {
          setSave("conflict");
          return;
        }
        setFile(loaded);
        setFileError("");
      } catch (e) {
        if (latest.current.path === target) setFileError(errorMessage(e));
      }
    },
    [projectId],
  );

  const flush = useCallback(async (): Promise<boolean> => {
    window.clearTimeout(timer.current);
    const { file, draft } = latest.current;
    if (!file || draft === null) return true;
    if (draft === file.text) {
      setDraft(null);
      setSave("saved");
      return true;
    }
    setSave("saving");
    try {
      const saved = await writeDocument(
        projectId,
        file.path,
        draft,
        file.version,
      );
      // Typing during the save keeps the newer text as the draft.
      const still = latest.current.draft;
      setFile(saved);
      if (still === draft) setDraft(null);
      setSave(still === draft ? "saved" : "pending");
      setSaveError("");
      if (still !== draft) schedule();
      return true;
    } catch (e) {
      const message = errorMessage(e);
      setSaveError(message);
      setSave(
        String(e instanceof Error ? e.message : e).includes(
          "changed outside Trama",
        )
          ? "conflict"
          : "error",
      );
      return false;
    }
  }, []);
  const schedule = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 800);
  };
  const change = (next: string) => {
    latest.current.draft = next;
    setDraft(next);
    setSave("pending");
    schedule();
  };
  // Leaving the notes writes what is still pending.
  useEffect(
    () => () => {
      void flush();
    },
    [flush],
  );

  return {
    path,
    setPath,
    file,
    setFile,
    fileError,
    setFileError,
    draft,
    setDraft,
    save,
    setSave,
    saveError,
    setSaveError,
    timer,
    latest,
    loadFile,
    flush,
    change,
  };
}
