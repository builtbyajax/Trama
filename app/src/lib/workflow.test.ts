import { describe, it, expect } from "vitest";
import { task, project, commit, pr, snapshot } from "../test/fixtures";
import { isSettled, SETTLE_AFTER } from "./settled";
import { nextBoardStatus } from "./boardKeyboard";
import { goalProgress, type Goal, type TaskEvent } from "./types";
import { weave, holding, rank, DAY, weekDays, rhythm } from "./handoffs";
import { pairLines, changedRange, splitPath, totals } from "./diff";
import { matchesCommit, matchesPullRequest } from "./delivery";
import { commitGraph } from "./graph";
import { reach, buildFronts } from "./fronts";

describe("board lifecycle", () => {
  it("settles only eligible done tasks and waits for known branch state", () => {
    const now = 100 + SETTLE_AFTER;
    const done = task({ status: "done" });
    expect(isSettled(done, project(), null, now - 1)).toBe(false);
    expect(isSettled(done, project(), null, now)).toBe(true);
    const branched = { ...done, repositoryBranch: "feat/example" };
    expect(isSettled(branched, project(), null, now)).toBe(false);
    expect(isSettled(branched, project(), ["feat/example"], now)).toBe(false);
    expect(isSettled(branched, project(), [], now)).toBe(true);
    expect(isSettled(task({ status: "todo" }), project(), [], now)).toBe(false);
    expect(
      isSettled(branched, project({ repositoryPath: null }), null, now),
    ).toBe(true);
  });
  it("clamps keyboard moves and counts the backlog but not unrelated goals in progress", () => {
    expect(nextBoardStatus("backlog", -1)).toBe("backlog");
    expect(nextBoardStatus("todo", -1)).toBe("backlog");
    expect(nextBoardStatus("review", 1)).toBe("review");
    expect(nextBoardStatus("todo", 1)).toBe("inProgress");
    expect(nextBoardStatus("review", -1)).toBe("inProgress");
    const goal: Goal = {
      id: "goal",
      projectId: "project",
      name: "Goal",
      description: "",
      targetDate: null,
      completedAt: null,
      createdAt: 1,
    };
    expect(
      goalProgress(goal, [
        task({ goalId: "goal", status: "done" }),
        task({ goalId: "goal" }),
        task({ goalId: "goal", status: "backlog" }),
        task({ goalId: "other", status: "done" }),
      ]),
    ).toEqual({ total: 3, done: 1 });
  });
  it("reconstructs queue, work, review and completion at fixed timestamps", () => {
    const event = (value: string, createdAt: number): TaskEvent => ({
      id: value,
      taskId: "task",
      kind: "status",
      actor: "agent",
      value,
      createdAt,
      agentProfileId: null,
    });
    const events = [
      event("inProgress", 200),
      event("review", 400),
      event("done", 500),
    ];
    const thread = weave(task({ status: "done", updatedAt: 500 }), events);
    expect(thread.segments).toEqual([
      { holder: "agent", phase: "queue", from: 100, to: 200 },
      { holder: "agent", phase: "work", from: 200, to: 400 },
      { holder: "user", phase: "wait", from: 400, to: 500 },
    ]);
    expect(thread.doneAt).toBe(500);
    expect(thread.current).toBeNull();
    expect(rank(thread)[0]).toBe(4);
    const waiting = weave(task({ status: "review" }), events.slice(0, 2));
    expect(holding(waiting, 400 + DAY + 1).tone).toBe("late");
    expect(rank(waiting)[0]).toBe(0);
    const days = weekDays(1700000000);
    expect(days).toHaveLength(7);
    expect(days.every((d, i) => i === 0 || d > days[i - 1])).toBe(true);
    expect(
      rhythm(
        [thread],
        [0, DAY, 2 * DAY, 3 * DAY, 4 * DAY, 5 * DAY, 6 * DAY],
        7 * DAY,
      ),
    ).toMatchObject({
      agent: 200,
      review: 100,
      delivered: 1,
      returned: 0,
      lastReturned: null,
    });
  });
});

describe("Git presentation", () => {
  it("aligns replacement lines and retains Unicode character boundaries", () => {
    const line = (kind: "addition" | "deletion" | "context", text: string) => ({
      kind,
      text,
      oldNumber: null,
      newNumber: null,
      missingNewline: false,
    });
    const old = line("deletion", "old"),
      next = line("addition", "new"),
      extra = line("addition", "extra"),
      context = line("context", "same");
    expect(pairLines([old, next, extra, context])).toEqual([
      { left: old, right: next },
      { left: null, right: extra },
      { left: context, right: context },
    ]);
    expect(changedRange("a😀z", "a😎z")).toEqual({
      before: "a",
      changed: "😀",
      after: "z",
    });
    expect(changedRange("same", "same").changed).toBe("");
    expect(splitPath("a/b.ts")).toEqual({ folder: "a/", name: "b.ts" });
    expect(splitPath("README")).toEqual({ folder: "", name: "README" });
    expect(totals([])).toEqual({ additions: 0, deletions: 0 });
  });
  it("matches recorded delivery references without matching sibling branches", () => {
    expect(matchesCommit(task({ commitHash: "ABC" }), commit("abcdef"))).toBe(
      true,
    );
    expect(
      matchesCommit(
        task({ repositoryBranch: "feat/example" }),
        commit("a", [], ["origin/feat/example"]),
      ),
    ).toBe(true);
    expect(
      matchesCommit(
        task({ repositoryBranch: "feat/example" }),
        commit("a", [], ["feat/examples"]),
      ),
    ).toBe(false);
    expect(matchesPullRequest(task({ pullRequestNumber: 1 }), pr())).toBe(true);
    expect(matchesPullRequest(task(), pr())).toBe(false);
  });
  it("draws merges and linear history without mutating commits", () => {
    const commits = [
      commit("merge", ["a", "b"]),
      commit("a", ["root"]),
      commit("b", ["root"]),
      commit("root"),
    ];
    const before = structuredClone(commits);
    const graph = commitGraph(commits);
    expect(graph).toHaveLength(4);
    expect(graph[0].outgoing).toHaveLength(2);
    expect(graph[0].laneCount).toBe(2);
    expect(graph.at(-1)?.outgoing).toEqual([]);
    expect(commits).toEqual(before);
    expect(
      commitGraph([commit("a", ["b"]), commit("b")]).every(
        (r) => r.laneCount === 1,
      ),
    ).toBe(true);
  });
  it("resolves reachable ancestors and task branches independently from main", () => {
    const branch = (name: string, commitId: string) => ({
      name,
      commitId,
      upstream: null,
      aheadOfMain: null,
      behindMain: null,
    });
    const data = snapshot({
      commits: [
        commit("feature", ["base"], ["origin/feat/example"]),
        commit("base", [], ["main"]),
      ],
      branches: [branch("main", "base"), branch("feat/example", "feature")],
    });
    const reachable = reach(data);
    expect([...reachable.inMain]).toEqual(["base"]);
    expect([...reachable.pushed].sort()).toEqual(["base", "feature"]);
    const fronts = buildFronts(data, [pr()], project(), [
      task({ repositoryBranch: "feat/example" }),
    ]);
    const linked = fronts.groups.flatMap((g) => g.fronts).find((f) => f.task);
    expect(linked).toMatchObject({
      branch: "feat/example",
      inMain: false,
      gone: false,
      ahead: 1,
    });
    expect(linked?.commits.map((c) => c.id)).toEqual(["feature"]);
    expect(linked?.pr?.number).toBe(1);
    expect(fronts.taskOf.get("feature")?.id).toBe("task");
  });
});
