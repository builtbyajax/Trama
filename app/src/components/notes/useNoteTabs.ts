import { useEffect, useState } from "react";
import type { DocumentListing } from "../../lib/types";
import { store, stored } from "../../lib/storage";
import { tabsKey } from "./noteStorage";

/** The open notes, kept per project; tabs of notes gone from the folder close on their own. */
export function useNoteTabs(
  projectId: string,
  listing: DocumentListing | null,
) {
  const [tabs, setTabs] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(stored(tabsKey(projectId)) ?? "[]");
      return Array.isArray(saved)
        ? saved.filter((t): t is string => typeof t === "string")
        : [];
    } catch {
      return [];
    }
  });
  // Tabs of notes deleted or moved outside the app close on their own.
  useEffect(() => {
    if (!listing) return;
    setTabs((current) => {
      const kept = current.filter((t) => listing.notes.includes(t));
      return kept.length === current.length ? current : kept;
    });
  }, [listing]);
  useEffect(
    () => store(tabsKey(projectId), JSON.stringify(tabs)),
    [projectId, tabs],
  );
  return { tabs, setTabs };
}
