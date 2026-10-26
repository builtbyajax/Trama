import { store } from "../../lib/storage";

export const lastKey = (projectId: string) => `trama.note.${projectId}`;
export const followKey = "trama.notes.follow";
export const dualKey = "trama.notes.dual";
export const tabsKey = (projectId: string) => `trama.notes.tabs.${projectId}`;
export const remember = (projectId: string, path: string) =>
  store(lastKey(projectId), path);
