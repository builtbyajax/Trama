import { useEffect, useId, useRef, useState } from "react";
import { searchTasks, errorMessage } from "../lib/api";
import type { SearchResult } from "../lib/types";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { t } from "../lib/i18n";

const kindLabel: Record<SearchResult["kind"], string> = {
  message: t("Message"),
  task: t("Task"),
};

export function SearchPanel({
  onClose,
  onOpen,
}: {
  onClose: () => void;
  onOpen: (result: SearchResult) => void;
}) {
  const listId = useId();
  const list = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(Boolean(query.trim()));
    setError("");
    const timer = window.setTimeout(() => {
      searchTasks(query)
        .then((items) => {
          if (active) {
            setResults(items);
            setSelected(0);
            setLoading(false);
          }
        })
        .catch((e) => {
          if (active) {
            setError(errorMessage(e));
            setLoading(false);
          }
        });
    }, 150);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query]);
  useEffect(() => {
    list.current
      ?.querySelector(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  const empty = !query.trim()
    ? t("Type to search all projects.")
    : loading
      ? t("Searching…")
      : t("No results.");
  return (
    <Modal title={t("Search")} onClose={onClose} className="search-modal">
      <div className="search-body">
        <div className="search-field">
          <Icon name="search" size={15} />
          <input
            autoFocus
            data-autofocus
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-activedescendant={
              results[selected] ? `${listId}-${selected}` : undefined
            }
            aria-label={t("Search tasks and annotations")}
            autoComplete="off"
            spellCheck={false}
            placeholder={t("Search tasks and annotations…")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelected((v) => Math.min(results.length - 1, v + 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelected((v) => Math.max(0, v - 1));
              }
              if (e.key === "Enter" && results[selected]) {
                e.preventDefault();
                onOpen(results[selected]);
              }
            }}
          />
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div
          ref={list}
          id={listId}
          className="search-results scroll"
          role="listbox"
          aria-busy={loading}
          aria-label={t("Search results")}
        >
          {results.map((item, index) => (
            <div
              key={item.id}
              id={`${listId}-${index}`}
              data-index={index}
              role="option"
              aria-selected={index === selected}
              className={`search-result ${index === selected ? "selected" : ""}`}
              onMouseMove={() => setSelected(index)}
              onClick={() => onOpen(item)}
            >
              <span className={`chip ${item.kind === "task" ? "" : "muted"}`}>
                {kindLabel[item.kind]}
              </span>
              <div className="search-text">
                <strong>{item.title}</strong>
                <span>{item.excerpt}</span>
              </div>
            </div>
          ))}
          {results.length === 0 && <p className="search-empty">{empty}</p>}
        </div>
      </div>
      <footer className="search-foot" aria-hidden="true">
        <span className="search-count">
          {results.length === 1
            ? "1 resultado"
            : results.length
              ? t("{0} results", [results.length])
              : ""}
        </span>
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> {t("navigate")}
        </span>
        <span>
          <kbd>↩</kbd> {t("open")}
        </span>
        <span>
          <kbd>{t("esc")}</kbd> {t("close")}
        </span>
      </footer>
    </Modal>
  );
}
