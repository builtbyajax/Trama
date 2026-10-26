import type { ProjectMode } from "../components/BoardFilters";
import type { Destination } from "../components/Sidebar";
import { useShortcuts } from "./useShortcuts";

/** What each shortcut and native menu item does; the window supplies the actions. */
type AppCommands = {
  newTask: () => void;
  newProject: () => void;
  navigate: (destination: Destination) => void;
  /** Opens the nth project of the sidebar, if there is one. */
  openProjectAt: (index: number) => void;
  setProjectMode: (mode: ProjectMode) => void;
  openShortcuts: () => void;
  openSearch: () => void;
  openSwitcher: () => void;
  toggleSidebar: () => void;
  reload: () => void;
  back: () => void;
  forward: () => void;
  toggleFullPage: () => void;
  closeDetails: () => void;
};

export function useAppCommands(commands: AppCommands) {
  useShortcuts((action) => {
    switch (action) {
      case "new_task":
        commands.newTask();
        break;
      case "new_project":
        commands.newProject();
        break;
      case "preferences":
        commands.navigate({ kind: "preferences" });
        break;
      case "shortcuts":
        commands.openShortcuts();
        break;
      case "search":
        commands.openSearch();
        break;
      case "toggle_sidebar":
        commands.toggleSidebar();
        break;
      case "reload":
        commands.reload();
        break;
      case "overview":
        commands.navigate({ kind: "overview" });
        break;
      case "archive":
        commands.navigate({ kind: "archive" });
        break;
      case "notes":
        commands.navigate({ kind: "notes" });
        break;
      case "project_page":
        commands.setProjectMode("project");
        break;
      case "board":
      case "git":
        commands.setProjectMode(action);
        break;
      case "project_notes":
        commands.setProjectMode("notes");
        break;
      case "switch_project":
        commands.openSwitcher();
        break;
      case "back":
        commands.back();
        break;
      case "forward":
        commands.forward();
        break;
      case "full_page":
        commands.toggleFullPage();
        break;
      case "close_details":
        commands.closeDetails();
        break;
      default:
        commands.openProjectAt(Number(action.slice("project_".length)));
    }
  });
}
