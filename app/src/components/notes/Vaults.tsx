import { useEffect, useMemo, useRef, useState } from "react";
import { searchKey } from "../../hooks/usePopover";
import {
  errorMessage,
  listDocuments,
  readDocument,
  searchDocuments,
} from "../../lib/api";
import { folderOf, noteName, parseMarkdown } from "../../lib/markdown";
import { shortcutLabel } from "../../lib/shortcuts";
import { store, stored } from "../../lib/storage";
import type {
  DocumentFile,
  DocumentHit,
  DocumentListing,
  Project,
  TaskDocument,
  Task,
} from "../../lib/types";
import { ago } from "../../lib/types";
import { Icon } from "../Icon";
import { Markdown } from "../Markdown";
import { ProjectMark } from "../ProjectMark";
import { buildTree, TreeRows } from "./NoteTree";
import { Highlight, locate, type Rect } from "./textSearch";
import { t } from "../../lib/i18n";

type Listing = DocumentListing | { error: string };
type Selected = { projectId: string; path: string };

const lastKey = "trama.vaults.note";
const recall = (): Selected | null => {
  try {
    return JSON.parse(stored(lastKey) ?? "null");
  } catch {
    return null;
  }
};
const remember = (selected: Selected) =>
  store(lastKey, JSON.stringify(selected));

/**
 * Every project's vault in one tree, with the selected note read on the right without leaving
 * the page. The search goes through the names and text of all vaults at once; editing stays in
 * each project's Notas.
 */
export function Vaults({
  projects,
  tasks,
  documents,
  revision,
  onOpen,
}: {
  projects: Project[];
  tasks: Task[];
  documents: TaskDocument[];
  revision: number;
  /** Opens a project's notes, on a note and the text searched when given. */
  onOpen: (
    projectId: string,
    path?: string,
    find?: string,
    edit?: boolean,
  ) => void;
}) {
  const vaults = projects.filter((p) => p.documentsFolder);
  const without = projects.filter((p) => !p.documentsFolder);
  const [listings, setListings] = useState<Record<string, Listing>>({});
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Record<string, DocumentHit[]> | null>(null);
  const [selected, setSelected] = useState<Selected | null>(recall);
  const [find, setFind] = useState<{ text: string; at: number } | null>(null);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const key = vaults.map((p) => `${p.id}:${p.documentsFolder}`).join("|");

  useEffect(() => {
    let active = true;
    for (const project of projects.filter((p) => p.documentsFolder))
      void listDocuments(project.id).then(
        (listing) =>
          active && setListings((all) => ({ ...all, [project.id]: listing })),
        (e) =>
          active &&
          setListings((all) => ({
            ...all,
            [project.id]: { error: errorMessage(e) },
          })),
      );
    return () => {
      active = false;
    };
    // The folders, not the project objects, decide what to read.
  }, [key, revision]);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setHits(null);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void Promise.all(
        projects
          .filter((p) => p.documentsFolder)
          .map((p) =>
            searchDocuments(p.id, text).then(
              (found) => [p.id, found] as const,
              () => [p.id, [] as DocumentHit[]] as const,
            ),
          ),
      ).then((all) => active && setHits(Object.fromEntries(all)));
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [key, query]);

  const notesOf = (projectId: string) => {
    const listing = listings[projectId];
    return listing && "notes" in listing ? listing.notes : [];
  };
  const attachedTo = (projectId: string) =>
    documents.filter((d) =>
      tasks.some((t) => t.id === d.taskId && t.projectId === projectId),
    );
  // A note remembered from before stays selected only while it still exists.
  const shown =
    selected &&
    vaults.some((p) => p.id === selected.projectId) &&
    (!listings[selected.projectId] ||
      notesOf(selected.projectId).includes(selected.path))
      ? selected
      : null;

  function select(projectId: string, path: string, text?: string) {
    const next = { projectId, path };
    setSelected(next);
    remember(next);
    setFind(text ? { text, at: Date.now() } : null);
  }

  const needle = searchKey(query);
  const searching = needle.length > 0;
  const results = vaults
    .map((project) => {
      const named = notesOf(project.id).filter((n) =>
        searchKey(noteName(n)).includes(needle),
      );
      const inText = (hits?.[project.id] ?? []).filter(
        (h) => !named.includes(h.path),
      );
      return { project, named, inText };
    })
    .filter((r) => r.named.length || r.inText.length);

  return (
    <div className="notes vaults">
      <nav className="notes-tree" aria-label={t("Vaults")}>
        <label className="notes-search">
          <Icon name="search" size={13} />
          <input
            autoFocus
            aria-label={t("Search all vaults")}
            placeholder={t("Search all vaults")}
            value={query}
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                const first = results[0];
                if (first?.named[0]) select(first.project.id, first.named[0]);
                else if (first?.inText[0])
                  select(first.project.id, first.inText[0].path, query.trim());
              }
              if (event.key === "Escape" && query) {
                event.stopPropagation();
                setQuery("");
              }
            }}
          />
        </label>
        {searching ? (
          results.length ? (
            results.map(({ project, named, inText }) => (
              <div key={project.id} role="group" aria-label={project.name}>
                <p className="tree-label vault-label">
                  <ProjectMark project={project} />
                  <span className="truncate">{project.name}</span>
                </p>
                {named.map((n) => {
                  const on =
                    shown?.projectId === project.id && shown.path === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      className={`tree-row ${on ? "on" : ""}`}
                      aria-current={on ? "page" : undefined}
                      onClick={() => select(project.id, n)}
                    >
                      <Icon name="file" size={13} />
                      <span className="truncate">
                        <Highlight text={noteName(n)} query={query} />
                      </span>
                      <span className="tree-folder truncate">
                        {folderOf(n)}
                      </span>
                    </button>
                  );
                })}
                {inText.map((hit) => {
                  const on =
                    shown?.projectId === project.id && shown.path === hit.path;
                  return (
                    <button
                      key={hit.path}
                      type="button"
                      className={`tree-row hit ${on ? "on" : ""}`}
                      aria-current={on ? "page" : undefined}
                      onClick={() => select(project.id, hit.path, query.trim())}
                    >
                      <span className="tree-hit-name">
                        <Icon name="file" size={13} />
                        <span className="truncate">{noteName(hit.path)}</span>
                      </span>
                      <span className="tree-excerpt">
                        <Highlight text={hit.excerpt} query={query} />
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          ) : (
            <p className="tree-empty">
              {hits === null && query.trim().length >= 2
                ? t("Searching…")
                : t("No notes with that name or text.")}
            </p>
          )
        ) : (
          <>
            {vaults.map((project) => {
              const listing = listings[project.id];
              const isClosed = closed[project.id];
              return (
                <div key={project.id} role="group" aria-label={project.name}>
                  <button
                    type="button"
                    className="tree-row vault-row"
                    aria-expanded={!isClosed}
                    onClick={() =>
                      setClosed((c) => ({ ...c, [project.id]: !c[project.id] }))
                    }
                  >
                    <span className={`tree-chevron ${isClosed ? "" : "open"}`}>
                      <Icon name="chevronRight" size={12} />
                    </span>
                    <ProjectMark project={project} />
                    <span className="truncate">{project.name}</span>
                    {listing && "notes" in listing && (
                      <span className="vault-count">
                        {listing.notes.length}
                      </span>
                    )}
                  </button>
                  {!isClosed &&
                    (!listing ? (
                      <p className="tree-empty vault-note">
                        {t("Reading the folder…")}
                      </p>
                    ) : "error" in listing ? (
                      <p
                        className="tree-empty vault-note"
                        title={listing.error}
                      >
                        {t("The folder didn't open.")}
                      </p>
                    ) : listing.notes.length ? (
                      <TreeRows
                        node={buildTree(listing.notes, listing.folders)}
                        depth={1}
                        path={
                          shown?.projectId === project.id ? shown.path : null
                        }
                        closed={Object.fromEntries(
                          Object.entries(closed)
                            .filter(([k]) => k.startsWith(`${project.id}/`))
                            .map(([k, v]) => [
                              k.slice(project.id.length + 1),
                              v,
                            ]),
                        )}
                        attached={attachedTo(project.id)}
                        onToggle={(folder) =>
                          setClosed((c) => ({
                            ...c,
                            [`${project.id}/${folder}`]:
                              !c[`${project.id}/${folder}`],
                          }))
                        }
                        onOpen={(n) => select(project.id, n)}
                      />
                    ) : (
                      <p className="tree-empty vault-note">
                        {t("No .md notes in this folder.")}
                      </p>
                    ))}
                </div>
              );
            })}
            {without.length > 0 && (
              <div role="group" aria-label={t("No vault")}>
                <p className="tree-label">{t("No vault")}</p>
                {without.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    className="tree-row vault-row off"
                    onClick={() => onOpen(project.id)}
                  >
                    <span className="tree-chevron" aria-hidden="true" />
                    <ProjectMark project={project} />
                    <span className="truncate">{project.name}</span>
                    <span className="vault-count">{t("Choose folder")}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </nav>
      {shown ? (
        <Preview
          key={`${shown.projectId}:${shown.path}`}
          project={projects.find((p) => p.id === shown.projectId)!}
          path={shown.path}
          listing={listings[shown.projectId]}
          tasks={tasks.filter((t) =>
            documents.some(
              (d) =>
                d.taskId === t.id &&
                d.path === shown.path &&
                t.projectId === shown.projectId,
            ),
          )}
          find={find}
          revision={revision}
          onFound={() => setFind(null)}
          onSelect={(path) => select(shown.projectId, path)}
          onOpen={(edit) =>
            onOpen(shown.projectId, shown.path, undefined, edit)
          }
        />
      ) : (
        <section className="note-pane">
          <div className="empty-state">
            <Icon name="vault" size={22} />
            <strong>
              {vaults.length ? t("Choose a note") : t("No project has a vault")}
            </strong>
            <p>
              {vaults.length
                ? t("It shows up here to read. To edit, open it in Notes.")
                : t(
                    "Each project can point to a folder of .md notes. Choose a project's folder on the left.",
                  )}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

/** The selected note, read-only, with the searched text marked for a moment. */
function Preview({
  project,
  path,
  listing,
  tasks,
  find,
  revision,
  onFound,
  onSelect,
  onOpen,
}: {
  project: Project;
  path: string;
  listing: Listing | undefined;
  tasks: Task[];
  find: { text: string; at: number } | null;
  revision: number;
  onFound: () => void;
  onSelect: (path: string) => void;
  onOpen: (edit?: boolean) => void;
}) {
  const reader = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<DocumentFile | null>(null);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState<{ at: number; rects: Rect[] } | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    readDocument(project.id, path).then(
      (next) => active && setFile(next),
      (e) => active && setError(errorMessage(e)),
    );
    return () => {
      active = false;
    };
  }, [project.id, path, revision]);
  const doc = useMemo(() => file && parseMarkdown(file.text), [file]);
  // ⌘E edits, as in Notas: the note opens there already in the editor.
  useEffect(() => {
    const edit = (event: globalThis.KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "e"
      ) {
        event.preventDefault();
        onOpen(true);
      }
    };
    window.addEventListener("keydown", edit);
    return () => window.removeEventListener("keydown", edit);
  }, [onOpen]);

  // Same as in Notas: scroll to the first place the text appears and mark it in blue.
  useEffect(() => {
    const box = reader.current;
    if (!find || !box || !doc) return;
    const frame = requestAnimationFrame(() => {
      onFound();
      const page = box.querySelector(".note-page");
      const range = page && locate(page, find.text);
      if (!range) return;
      const outer = box.getBoundingClientRect();
      const rects = [...range.getClientRects()].map((r) => ({
        top: r.top - outer.top + box.scrollTop,
        left: r.left - outer.left + box.scrollLeft,
        width: r.width,
        height: r.height,
      }));
      if (!rects.length) return;
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      box.scrollTo({
        top: Math.max(0, rects[0].top - box.clientHeight / 3),
        behavior: reduce ? "auto" : "smooth",
      });
      setFlash({ at: find.at, rects });
    });
    return () => cancelAnimationFrame(frame);
  }, [find, doc, onFound]);

  const folder = folderOf(path);
  return (
    <section className="note-pane" aria-label={noteName(path)}>
      <header className="note-bar">
        <div className="note-crumbs">
          <span className="note-crumb">
            <ProjectMark project={project} />
            {project.name}
          </span>
          {folder &&
            folder.split("/").map((part, i) => (
              <span key={i} className="note-crumb">
                <Icon name="chevronRight" size={12} />
                {part}
              </span>
            ))}
          <Icon name="chevronRight" size={12} />
          <b>{noteName(path)}</b>
        </div>
        <button
          type="button"
          className="button small"
          data-tooltip={t("Edit in Notes  {0}", [shortcutLabel(["mod", "e"])])}
          onClick={() => onOpen(true)}
        >
          <Icon name="pencil" size={13} />
          {t("Open in Notes")}
        </button>
      </header>
      <div ref={reader} className="note-reader scroll">
        {flash && (
          <div
            key={flash.at}
            className="find-flash"
            aria-hidden="true"
            onAnimationEnd={() => setFlash(null)}
          >
            {flash.rects.map((r, i) => (
              <span key={i} style={r} />
            ))}
          </div>
        )}
        {error ? (
          <div className="empty-state">
            <Icon name="warning" size={22} />
            <strong>{t("The note didn't open")}</strong>
            <p>{error}</p>
          </div>
        ) : !doc || !file ? (
          <p className="note-page note-empty">{t("Reading…")}</p>
        ) : (
          <article className="note-page">
            <div className="vault-meta">
              <span>
                {t("Edited")} {ago(file.modified)}
              </span>
              {tasks.map((t) => (
                <span key={t.id} className="vault-task">
                  <Icon name="clip" size={11} />
                  <span className="truncate">{t.title}</span>
                </span>
              ))}
            </div>
            <Markdown
              doc={doc}
              context={{
                projectId: project.id,
                path,
                notes: listing && "notes" in listing ? listing.notes : [],
                images: listing && "images" in listing ? listing.images : [],
                onOpenNote: (target) => onSelect(target),
              }}
            />
          </article>
        )}
      </div>
    </section>
  );
}
