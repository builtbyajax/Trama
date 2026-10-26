import { useEffect, useMemo, useRef, useState } from "react";
import {
  copyText,
  errorMessage,
  gitCommitDetails,
  gitRangeDiff,
  gitSnapshot,
  gitWorkingDiff,
  inTauri,
  listPullRequests,
  openUrl,
  revealLabel,
  revealPath,
} from "../../lib/api";
import {
  buildFronts,
  commitPr,
  reach as findReach,
  type Front,
} from "../../lib/fronts";
import { shortcutLabel, shortcuts } from "../../lib/shortcuts";
import {
  type FileDiff,
  type GitCommit,
  type GitFocus,
  type GitSnapshot,
  type Project,
  type PullRequests,
  type Task,
} from "../../lib/types";
import { DiffViewer, type DiffContext } from "../diff/DiffViewer";
import { Icon } from "../Icon";
import { ContextMenu, type MenuItem } from "../Sidebar";
import { MoreMenu } from "../Topbar";
import { HistoryDetail, type Selected } from "./HistoryDetail";
import { HistoryNav } from "./HistoryNav";
import { frontTitle, useLoad } from "./parts";
import { t } from "../../lib/i18n";

/**
 * Read-only history of the project's repository: on the left the local changes, the work still
 * open and every commit as a graph, in one list; on the right the selected one, where it is on
 * the way to main and the files it changed. Nothing here checks out, stages or writes.
 */
export function GitProject({
  project,
  tasks,
  revision,
  focus,
  listHidden,
  diffOpen,
  diffFilesHidden,
  notify,
  onDiff,
  onEditProject,
  onOpenTask,
  onRefresh,
}: {
  project: Project;
  tasks: Task[];
  revision: number;
  focus: GitFocus | null;
  /** The sidebar button hides the list, leaving the selected work across the page. */
  listHidden: boolean;
  /** The diff shows while the app keeps it open: the topbar's Back closes it from there. */
  diffOpen: boolean;
  diffFilesHidden: boolean;
  notify: (text: string, error?: boolean) => void;
  /** Tells the app the title of the diff that opened, or null when it closed. */
  onDiff: (title: string | null) => void;
  onEditProject: () => void;
  onOpenTask: (task: Task) => void;
  onRefresh: () => void;
}) {
  const [data, setData] = useState<GitSnapshot | null>(null);
  const [prs, setPrs] = useState<PullRequests | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [selection, setSelection] = useState("");
  const [branch, setBranch] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [reveal, setReveal] = useState(0);
  const [diff, setDiff] = useState<{
    files: FileDiff[];
    initialFile?: string;
    title: string;
    context: DiffContext;
  } | null>(null);
  const appliedFocus = useRef<GitFocus | null>(null);
  const showDiff = (next: typeof diff) => {
    setDiff(next);
    onDiff(next?.title ?? null);
  };
  useEffect(() => {
    if (!diffOpen) setDiff(null);
  }, [diffOpen]);
  // Leaving the history (another project, another tab) leaves the diff behind too.
  useEffect(() => () => onDiff(null), []);
  useEffect(() => {
    if (!project.repositoryPath) return;
    let active = true;
    setRefreshing(true);
    gitSnapshot(project.id)
      .then((loaded) => {
        if (!active) return;
        setError("");
        setData(loaded);
        setBranch((current) =>
          current && loaded.branches.some((b) => b.name === current)
            ? current
            : null,
        );
      })
      .catch((e) => active && setError(errorMessage(e)))
      .finally(() => active && setRefreshing(false));
    listPullRequests(project.id)
      .then((loaded) => active && setPrs(loaded))
      .catch(
        (e) => active && setPrs({ items: [], unavailable: errorMessage(e) }),
      );
    return () => {
      active = false;
    };
  }, [project.id, project.repositoryPath, revision]);

  const projectTasks = useMemo(
    () => tasks.filter((t) => t.projectId === project.id),
    [tasks, project.id],
  );
  const fronts = useMemo(
    () =>
      data ? buildFronts(data, prs?.items ?? [], project, projectTasks) : null,
    [data, prs, project, projectTasks],
  );
  const reach = useMemo(() => (data ? findReach(data) : null), [data]);
  const all = useMemo(
    () => fronts?.groups.flatMap((g) => g.fronts) ?? [],
    [fronts],
  );
  const needle = query.trim().toLowerCase();
  // Work not finished: tasks still on the board and branches or PRs main does not have yet.
  const open = useMemo(
    () =>
      all.filter(
        (f) =>
          (f.task
            ? f.task.status !== "done"
            : f.branch !== fronts?.main &&
              f.branch !== fronts?.integration &&
              !f.inMain) &&
          (!needle ||
            [frontTitle(f), f.branch, f.pr && `#${f.pr.number}`].some((v) =>
              v?.toLowerCase().includes(needle),
            )),
      ),
    [all, fronts, needle],
  );
  const commits = useMemo(() => {
    if (!data || !fronts) return [];
    const list = filterByBranch(data, branch);
    if (!needle) return list;
    return list.filter(
      (c) =>
        [c.subject, c.author, fronts.taskOf.get(c.id)?.title, ...c.refs].some(
          (v) => v?.toLowerCase().includes(needle),
        ) || c.id.startsWith(needle),
    );
  }, [data, fronts, branch, needle]);

  // The first open line of work is selected until the person picks something.
  const commitId = selection.startsWith("commit:") ? selection.slice(7) : null;
  const commit = commitId
    ? data?.commits.find((c) => c.id === commitId)
    : undefined;
  const picked =
    selection === "working" || commit
      ? selection
      : (all.find((f) => f.key === selection)?.key ??
        open.find((f) => f.task)?.key ??
        "working");
  const front = all.find((f) => f.key === picked);
  const ownerOf = (id: string): Front | null => {
    const task = fronts?.taskOf.get(id);
    return task ? (all.find((f) => f.task?.id === task.id) ?? null) : null;
  };
  const selected: Selected = commit
    ? {
        kind: "commit",
        commit,
        task: fronts?.taskOf.get(commit.id) ?? null,
        front: ownerOf(commit.id),
      }
    : front
      ? { kind: "front", front }
      : { kind: "working" };
  const highlight = useMemo(
    () => new Set(front?.commits.map((c) => c.id) ?? []),
    [front],
  );

  // Files already read in this revision.
  const cache = useMemo(
    () => new Map<string, Promise<FileDiff[]>>(),
    [project.id, revision],
  );
  const remember = (key: string, load: () => Promise<FileDiff[]>) => {
    let request = cache.get(key);
    if (!request) {
      request = load();
      cache.set(key, request);
      request.catch(() => cache.delete(key));
    }
    return request;
  };
  // What the selection changed: the working tree, one commit or every commit of the work at once.
  const filesKey =
    selected.kind === "working"
      ? `working:${data?.workingChanges.map((c) => c.path).join("\n")}`
      : selected.kind === "commit"
        ? selected.commit.id
        : selected.front.commits.length
          ? `${selected.front.commits[selected.front.commits.length - 1].parents[0] ?? ""}..${selected.front.commits[0].id}`
          : null;
  const commitFiles = (id: string) =>
    remember(id, () =>
      gitCommitDetails(project.id, id).then((d) => d.fileDiffs),
    );
  const loadFiles = (): Promise<FileDiff[]> => {
    if (selected.kind === "working")
      return remember("working", () => gitWorkingDiff(project.id));
    if (selected.kind === "commit") {
      const id = selected.commit.id;
      return remember(id, () =>
        gitCommitDetails(project.id, id).then((d) => d.fileDiffs),
      );
    }
    if (!selected.front.commits.length) return Promise.resolve([]);
    const newest = selected.front.commits[0];
    const base =
      selected.front.commits[selected.front.commits.length - 1].parents[0];
    return base
      ? remember(`${base}..${newest.id}`, () =>
          gitRangeDiff(project.id, base, newest.id),
        )
      : remember(newest.id, () =>
          gitCommitDetails(project.id, newest.id).then((d) => d.fileDiffs),
        );
  };
  const files = useLoad(filesKey && `${revision}:${filesKey}`, loadFiles);
  const title =
    selected.kind === "working"
      ? t("Local changes")
      : selected.kind === "commit"
        ? selected.commit.subject
        : frontTitle(selected.front);
  const expand = (list: FileDiff[], path?: string) => {
    if (!list.length) return;
    const context: DiffContext =
      selected.kind === "commit"
        ? {
            project: project.name,
            commit: selected.commit,
            task: selected.task,
          }
        : selected.kind === "front"
          ? { project: project.name, task: selected.front.task }
          : { project: project.name };
    showDiff({ files: list, title, initialFile: path, context });
  };

  function select(key: string, scroll = false) {
    setSelection(key);
    if (scroll) {
      setQuery("");
      setReveal((n) => n + 1);
    }
  }
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    commit: GitCommit;
    trigger: HTMLElement;
  } | null>(null);
  // The commit a menu was opened from stays marked while the menu is open.
  useEffect(() => {
    const trigger = menu?.trigger;
    if (!trigger) return;
    trigger.dataset.menuOpen = "";
    return () => {
      delete trigger.dataset.menuOpen;
    };
  }, [menu?.trigger]);
  const openLink = (url: string) =>
    void openUrl(url).catch((e) => notify(errorMessage(e), true));
  /** The PR the commit came from and the commit itself on GitHub, then its hash. */
  function commitMenuItems(commit: GitCommit): MenuItem[] {
    const web = data?.webUrl;
    const found = fronts ? commitPr(commit, ownerOf(commit.id), fronts) : null;
    const prUrl =
      found?.pr?.url ?? (found && web ? `${web}/pull/${found.number}` : null);
    const items: MenuItem[] = [];
    if (found && prUrl)
      items.push({
        label: t("Open pull request #{0}", [found.number]),
        icon: "pullRequest",
        onSelect: () => openLink(prUrl),
      });
    // A commit only on this computer doesn't exist on GitHub yet.
    if (web && reach?.pushed.has(commit.id))
      items.push({
        label: t("Open commit on GitHub"),
        icon: "external",
        onSelect: () => openLink(`${web}/commit/${commit.id}`),
      });
    items.push({
      label: t("Copy hash"),
      icon: "copy",
      separated: true,
      onSelect: () => void copy(commit.id, t("Hash copied.")),
    });
    return items;
  }

  async function copy(value: string, label: string) {
    try {
      await copyText(value);
      notify(label);
    } catch {
      notify(t("Couldn't copy."), true);
    }
  }

  // Asked for from a task: a commit, a PR or the task itself.
  useEffect(() => {
    if (!data || !fronts || !focus || appliedFocus.current === focus) return;
    appliedFocus.current = focus;
    if (focus.kind === "commit") {
      const match = data.commits.find((c) =>
        c.id.toLowerCase().startsWith(focus.id.toLowerCase()),
      );
      if (match) {
        setBranch(null);
        select(`commit:${match.id}`, true);
      } else notify(t("This commit isn't in the loaded history."), true);
    } else {
      const target = all.find((f) =>
        focus.kind === "task"
          ? f.task?.id === focus.id
          : f.pr?.number === focus.number,
      );
      if (target) select(target.key, true);
    }
  }, [data, fronts, focus]);

  if (!project.repositoryPath)
    return (
      <div className="empty-state">
        <Icon name="branch" size={22} />
        <strong>{t("No repository connected")}</strong>
        <p>
          {t(
            "Connect a Git repository folder to look at branches, commits and changes.",
          )}
        </p>
        <button className="button primary" onClick={onEditProject}>
          {t("Connect repository")}
        </button>
      </div>
    );
  if (error && !data)
    return (
      <div className="empty-state">
        <Icon name="warning" size={22} />
        <strong>{t("Couldn't read the repository")}</strong>
        <p className="error" role="alert">
          {error}
        </p>
        <div className="empty-actions">
          <button className="button" onClick={onRefresh}>
            {t("Try again")}
          </button>
          <button className="button primary" onClick={onEditProject}>
            {t("Choose another repository")}
          </button>
        </div>
      </div>
    );
  if (!data || !fronts || !reach)
    return <div className="empty-state">{t("Loading Git history…")}</div>;

  const tools = (
    <>
      {error && (
        <span className="git-error" role="alert" title={error}>
          <Icon name="warning" size={13} />
        </span>
      )}
      <button
        type="button"
        className="icon-button"
        aria-label={t("Refresh")}
        data-tooltip={t("Refresh  {0}", [shortcutLabel(shortcuts.reload)])}
        onClick={onRefresh}
        disabled={refreshing}
        aria-busy={refreshing}
      >
        <Icon name="refresh" size={14} />
      </button>
      <MoreMenu
        label={t("Repository actions")}
        entries={[
          {
            label: t("Copy repository path"),
            onSelect: () =>
              void copy(project.repositoryPath!, t("Path copied.")),
          },
          ...(inTauri()
            ? [
                {
                  label: revealLabel(),
                  onSelect: () =>
                    void revealPath(project.repositoryPath!).catch((e) =>
                      notify(errorMessage(e), true),
                    ),
                },
              ]
            : []),
          { label: t("Change repository…"), onSelect: onEditProject },
        ]}
      />
    </>
  );
  // The history stays mounted under an open diff, so closing it returns to the same place.
  const reading = diff && diffOpen;
  return (
    <>
      <div className="git-page" hidden={Boolean(reading)}>
        <div className={`git-split ${listHidden ? "list-hidden" : ""}`}>
          {!listHidden && (
            <HistoryNav
              data={data}
              fronts={fronts}
              reach={reach}
              open={open}
              commits={commits}
              branch={branch}
              query={query}
              selection={picked}
              highlight={highlight}
              taskOf={fronts.taskOf}
              reveal={reveal}
              tools={tools}
              onQuery={setQuery}
              onBranch={setBranch}
              onSelect={(key) => select(key)}
              onCommitMenu={(event, commit) => {
                event.preventDefault();
                setMenu({
                  x: event.clientX,
                  y: event.clientY,
                  commit,
                  trigger: event.currentTarget,
                });
              }}
              commitFiles={commitFiles}
              onExpand={() =>
                void loadFiles().then(expand, (e) =>
                  notify(errorMessage(e), true),
                )
              }
            />
          )}
          <HistoryDetail
            key={picked}
            selected={selected}
            data={data}
            fronts={fronts}
            reach={reach}
            files={files}
            actions={{
              onExpand: expand,
              onOpenTask,
              onSelect: (key) => select(key, true),
              onOpenPullRequest: (pr) => openLink(pr.url),
              commitFiles,
            }}
          />
        </div>
      </div>
      {reading && (
        <DiffViewer
          {...diff}
          filesHidden={diffFilesHidden}
          notify={notify}
          onOpenTask={(task) => {
            showDiff(null);
            onOpenTask(task);
          }}
          onClose={() => showDiff(null)}
        />
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={t("Actions for {0}", [menu.commit.subject])}
          items={commitMenuItems(menu.commit)}
          onClose={(restoreFocus) => {
            if (restoreFocus) menu.trigger.focus();
            setMenu(null);
          }}
        />
      )}
    </>
  );
}

/** Commits reachable from `branch`, in the loaded order; every commit without one. */
function filterByBranch(data: GitSnapshot, branch: string | null) {
  if (!branch) return data.commits;
  const head = data.branches.find((b) => b.name === branch)?.commitId;
  const map = new Map(data.commits.map((c) => [c.id, c]));
  const reachable = new Set<string>();
  const pending = head ? [head] : [];
  while (pending.length) {
    const id = pending.pop()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    pending.push(...(map.get(id)?.parents ?? []));
  }
  return data.commits.filter((c) => reachable.has(c.id));
}
