---
name: trama-planning
description: Plan Trama work in small ordered tasks, from the first branch to the published release, and share one board with other agents. Optional, on top of the `trama` skill. Use when the person asks you to plan a goal or a version, split work into tasks, or when several agent sessions work on the same project.
---

# Planning and sharing a Trama board

This skill adds to the `trama` skill; follow that one for the tools, the workflow and how to write titles, briefings and summaries. Here: how to split and order work, and how to behave when other agents use the same board.

## Splitting work

- **One deliverable per task.** If the person could review, accept or send back two parts separately, they are two tasks. "Card: header" and "Card: task list" are separate; "Show the header" and "Fix the header spacing it introduced" are not.
- **Define before you build.** When the person hasn't decided how something looks or behaves, create a "Define …" task (listen, prototype, record the decision in the task) and a separate "Implement …" task that points to it. Don't implement while the definition is open.
- **Name what's undecided.** When a request is ambiguous, write the open questions in the briefing instead of guessing, and ask before the task starts.
- **Every step is a task.** The work isn't only code changes: the branch, docs, version bump, checks, review, commits, PR, CI, merge, tag, release and the closing steps are tasks too, so the goal's progress shows how far the release really is.
- **The person's steps are theirs.** Steps only the person can do or decide (merging, publishing, testing on their own machine, concluding the goal) are created with `assignee: "user"`.

## Goals

- **When.** For an outcome that takes several tasks, when the person asks or agrees. Not for a single task. Check `list_goals` first: reuse a goal that already covers the outcome.
- **Name.** The outcome, short, in the person's language: "Archive and backlog" or "Automatic updates", not "Improvements" or "Sprint 2". Put what's included in the description, and the target date (`YYYY-MM-DD`) when there is one.

## A version goal

For a release, create the goal with `version` set, then tasks in this order. Leave out a step the project doesn't have, and keep the project's own release process when it differs.

1. **Start:** create the branch from the main branch.
2. **Work:** the changes, each split as above, "Define" before "Implement".
3. **Docs:** README, screenshots, site or other public pages that must match the product.
4. **Prepare the version:**
   - changelog
   - bump the version in every file that carries it
   - run every local check the CI runs
   - QA in the app with an isolated database, including migrating a copy of the previous version's data
   - final review of the whole diff
5. **Ship:**
   - commits
   - push and PR
   - CI green
   - merge
   - tag
   - build the release
   - review the draft release (notes, update manifest, checksums, installers)
   - test the update from the previous version
   - publish
6. **Close:** publish the site, update the roadmap or notes, conclude the goal.

Commits, pushes, PRs, merges, tags, releases and publishing each need the person's authorization at the time, even when the task is yours. Write that in their briefings.

## Order

- **The column order is the execution order.** When the person asks you to order a goal's tasks, put them in `backlog` in the order they'll be done: the first with `move_task` and `after_id: null`, each next one after the previous. A "Define" task comes right before its "Implement" task.
- **Order isn't permission.** The order says what comes next. Moving a task out of `backlog` or starting it still follows the `trama` skill: only when the person asks.

## Several agents on one board

Each session is its own profile, with its name and character. The person sees who holds each task and who is working now.

- **Claim before you work.** Move the task to `inProgress` when you start: that makes an unassigned agent task yours and tells the others. Before claiming, read it again with `get_task`: if it's already `inProgress` or has another profile's `agent_profile_id`, pick another.
- **Don't take another agent's task.** A task with another profile's `agent_profile_id` stays with it, even when that agent is stopped, unless the person asks.
- **Separate branches.** Each agent works on its own branch, or its own worktree when the person uses worktrees. Record it on the task with `repository_branch`. Don't commit on another agent's branch.
- **Don't edit the same files at once.** If your task needs files another agent's task in progress is changing, post a message on your task saying which and wait, or ask the person who goes first.
- **Talk through the task.** Questions and decisions for another agent go as a message on the task they concern. Read a task's messages before you start it.
- **Hand off in the summary.** When your work feeds another task, say in your `agent_summary` what the next agent needs: the branch, what's ready, what's missing. Don't edit the other agent's briefing.
- **Reviewing someone else's work.** An agent asked to review gives its opinion as a message on the task. It doesn't move the task to `done` or back to `todo`: the person decides.
- **Leave a status when you stop.** If the session ends with a task unfinished, post one message with where it stands and what's next. The task goes back to To do, still yours.

Trama doesn't queue or lock tasks between agents: claiming by moving to `inProgress` is a convention, and two sessions can still race. When in doubt, ask the person.
