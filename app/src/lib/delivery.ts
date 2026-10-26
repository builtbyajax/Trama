import type { GitCommit, PullRequest, Task } from "./types";
export function matchesCommit(task: Task, commit: GitCommit): boolean {
  const hash = task.commitHash?.toLowerCase();
  const id = commit.id.toLowerCase();
  if (hash && (id.startsWith(hash) || hash.startsWith(id))) return true;
  return Boolean(
    task.repositoryBranch &&
    commit.refs.some((ref) => {
      const name = ref.replace("HEAD -> ", "");
      return (
        name === task.repositoryBranch ||
        name.endsWith(`/${task.repositoryBranch}`)
      );
    }),
  );
}
export function matchesPullRequest(task: Task, pr: PullRequest): boolean {
  return (
    task.pullRequestNumber === pr.number ||
    task.repositoryBranch === pr.headBranch ||
    task.pullRequestUrl === pr.url
  );
}
