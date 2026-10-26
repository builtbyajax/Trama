import { test, expect, type APIRequestContext } from "@playwright/test";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Snapshot, Workspaces } from "../src/lib/types";
async function command<T>(
  request: APIRequestContext,
  command: string,
  args = {},
): Promise<T> {
  const response = await request.post("/api/command", {
    data: { command, args },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.error).toBeUndefined();
  return body.result;
}
test("workspace, board, goals, transfer and note conflicts persist through the real backend", async ({
  page,
  request,
}, info) => {
  const { home } = JSON.parse(
    await readFile("../.trama-local/e2e-state.json", "utf8"),
  );
  const run = `${info.project.name}-${info.repeatEachIndex}`;
  const name = `Flow ${run}`;
  await page.goto("/");
  await page.getByRole("button", { name: /^Workspace:/ }).click();
  await page
    .getByRole("menuitem", { name: "New workspace…", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Workspace name", { exact: true })
    .fill(name);
  await Promise.all([
    page.waitForEvent("load"),
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Create workspace", exact: true })
      .click(),
  ]);
  await expect(
    page.getByRole("button", { name: `Workspace: ${name}`, exact: true }),
  ).toBeVisible();
  const spaces = await command<Workspaces>(request, "list_workspaces");
  expect(spaces.active.startsWith(home)).toBeTruthy();
  await page
    .getByRole("button", { name: "Add project", exact: true })
    .first()
    .click();
  await page.getByLabel("Project name", { exact: true }).fill("Flow Project");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await page.getByRole("button", { name: "New goal", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("Release test");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create goal", exact: true })
    .click();
  for (const title of ["First task", "Second task"]) {
    await page.getByRole("button", { name: "New task", exact: true }).click();
    await page
      .getByLabel("What needs to be done?", { exact: true })
      .fill(title);
    await page
      .getByRole("dialog")
      .getByRole("combobox", { name: "Goal", exact: true })
      .click();
    await page
      .getByRole("option", { name: "Release test", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Create task", exact: true })
      .click();
  }
  const cards = page.locator(".card[data-task-id]");
  await expect(cards).toHaveCount(2);
  await cards.filter({ hasText: "First task" }).click();
  await page.getByRole("combobox", { name: "Status", exact: true }).click();
  await page.getByRole("option", { name: "In progress", exact: true }).click();
  await page
    .getByRole("button", { name: "Close task", exact: true })
    .last()
    .click();
  await page.reload();
  let data = await command<Snapshot>(request, "load_snapshot");
  expect(data.tasks.find((t) => t.title === "First task")?.status).toBe(
    "inProgress",
  );
  expect(data.goals[0].name).toBe("Release test");
  expect(data.tasks.every((t) => t.goalId === data.goals[0].id)).toBe(true);
  // Keyboard pickup and drop must persist order without relying on drag coordinates.
  const second = page
    .locator("[data-task-id]")
    .filter({ hasText: "Second task" });
  await second.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Space");
  await page.reload();
  data = await command<Snapshot>(request, "load_snapshot");
  expect(data.tasks.find((t) => t.title === "Second task")?.status).toBe(
    "inProgress",
  );
  expect(
    data.tasks
      .filter((t) => t.status === "inProgress")
      .sort((a, b) => a.position - b.position)
      .map((t) => t.title),
  ).toEqual(["Second task", "First task"]);
  const dragged = page
    .locator(".card[data-task-id]")
    .filter({ hasText: "First task" });
  const reviewColumn = page.locator(".column").filter({
    has: page.getByRole("heading", { name: "In review", exact: true }),
  });
  const from = await dragged.boundingBox();
  const to = await reviewColumn.locator(".column-body").boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    from!.x + from!.width / 2 + 12,
    from!.y + from!.height / 2,
    { steps: 3 },
  );
  await page.mouse.move(to!.x + to!.width / 2, to!.y + 30, { steps: 15 });
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        (await command<Snapshot>(request, "load_snapshot")).tasks.find(
          (t) => t.title === "First task",
        )?.status,
    )
    .toBe("review");
  await page.reload();
  await expect(
    reviewColumn.locator(".card").filter({ hasText: "First task" }),
  ).toBeVisible();
  const project = data.projects[0];
  const note = join(home, `note-${run}.md`);
  await writeFile(note, "# Original\n");
  await command(request, "save_project", {
    projectId: project.id,
    name: project.name,
    documentsFolder: home,
  });
  await page.reload();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page.getByRole("button", { name: `note-${run}`, exact: true }).click();
  await page.getByRole("button", { name: /^Edit / }).click();
  const editor = page.getByRole("textbox", { name: "Note text in Markdown" });
  await expect(editor).toBeVisible();
  await editor.click();
  await editor.press("ControlOrMeta+a");
  await page.keyboard.insertText("# My unsaved change\n");
  await expect(editor).toHaveValue("# My unsaved change\n");
  await writeFile(note, "# External change\n");
  await expect(
    page.getByText(
      "This note was changed outside Trama while you were editing.",
    ),
  ).toBeVisible();
  expect(await readFile(note, "utf8")).toBe("# External change\n");
  await page
    .getByRole("button", { name: "Discard and reload", exact: true })
    .click();
  await expect(editor).toHaveValue("# External change\n");
  await editor.fill("# Saved edit\n");
  await expect.poll(() => readFile(note, "utf8")).toBe("# Saved edit\n");
  await page.getByRole("button", { name: "Board", exact: true }).click();
  for (const title of ["First task", "Second task"]) {
    await page
      .locator(".card[data-task-id]")
      .filter({ hasText: title })
      .click();
    await page.getByRole("combobox", { name: "Status", exact: true }).click();
    await page.getByRole("option", { name: "Done", exact: true }).click();
    await page
      .getByRole("button", { name: "Close task", exact: true })
      .last()
      .click();
  }
  await page
    .getByRole("button", { name: "Release test, 2 of 2 done", exact: true })
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Conclude goal…", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Conclude goal", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "1 concluded", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "1 concluded", exact: true }).click();
  const concludedMenu = page.getByRole("menu", {
    name: "Concluded",
    exact: true,
  });
  const menuBox = await concludedMenu.boundingBox();
  const triggerBox = await page
    .getByRole("button", { name: "1 concluded", exact: true })
    .boundingBox();
  expect(menuBox!.x).toBeGreaterThan(triggerBox!.x);
  await concludedMenu
    .getByRole("menuitemradio", { name: /Release test/ })
    .click();
  await page.getByRole("button", { name: "Reopen goal", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Release test, 2 of 2 done",
      exact: true,
    }),
  ).toBeVisible();
  data = await command<Snapshot>(request, "load_snapshot");
  expect(data.goals[0].completedAt).toBeNull();
  const source = spaces.active;
  const destination = await command<Workspaces>(request, "create_workspace", {
    name: `Destination ${run}`,
    folder: home,
  });
  await command(request, "switch_workspace", { path: source });
  await page.reload();
  await page
    .getByRole("navigation", { name: "Navigation", exact: true })
    .getByRole("button", { name: /^Flow Project/ })
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Move to another workspace…", exact: true })
    .click();
  await page
    .getByRole("radio", {
      name: `Destination ${run}`,
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Move project", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (await command<Snapshot>(request, "load_snapshot")).projects,
  ).toHaveLength(0);
  await page.getByRole("button", { name: /^Workspace:/ }).click();
  await Promise.all([
    page.waitForEvent("load"),
    page
      .getByRole("menuitemradio", {
        name: `Destination ${run}`,
        exact: true,
      })
      .click(),
  ]);
  await expect(
    page.getByRole("button", {
      name: `Workspace: Destination ${run}`,
      exact: true,
    }),
  ).toBeVisible();
  const moved = await command<Snapshot>(request, "load_snapshot");
  expect(moved.tasks.map((t) => t.title).sort()).toEqual([
    "First task",
    "Second task",
  ]);
  expect(moved.goals[0].name).toBe("Release test");
  expect(moved.projects[0].id).toBe(project.id);
  expect(
    moved.tasks.map((t) => [t.id, t.position, t.status, t.goalId]),
  ).toEqual(data.tasks.map((t) => [t.id, t.position, t.status, t.goalId]));
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page
    .getByRole("button", { name: `Actions for ${name}`, exact: true })
    .click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove from list", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await access(source);
  expect(
    (await command<Workspaces>(request, "list_workspaces")).workspaces.some(
      (w) => w.path === source,
    ),
  ).toBe(false);
  await command(request, "open_workspace", { path: source });
  await command(request, "switch_workspace", { path: destination.active });
  await page.reload();
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page
    .getByRole("button", { name: `Actions for ${name}`, exact: true })
    .click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Delete workspace", exact: true }),
  ).toBeDisabled();
  await page.getByRole("dialog").getByRole("textbox").fill(name);
  await page
    .getByRole("button", { name: "Delete workspace", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(async () => {
      try {
        await access(source);
        return true;
      } catch {
        return false;
      }
    })
    .toBe(false);

  await page
    .getByRole("button", {
      name: `Actions for Destination ${run}`,
      exact: true,
    })
    .click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await Promise.all([
    page.waitForEvent("load"),
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Remove from list", exact: true })
      .click(),
  ]);
  await access(destination.active);
  expect(
    (await command<Workspaces>(request, "list_workspaces")).active,
  ).not.toBe(destination.active);
  await command(request, "open_workspace", { path: destination.active });
  await page.reload();
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page
    .getByRole("button", {
      name: `Actions for Destination ${run}`,
      exact: true,
    })
    .click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page
    .getByRole("dialog")
    .getByRole("textbox")
    .fill(`Destination ${run}`);
  await Promise.all([
    page.waitForEvent("load"),
    page.getByRole("button", { name: "Delete workspace", exact: true }).click(),
  ]);
  expect(
    (await command<Workspaces>(request, "list_workspaces")).active,
  ).not.toBe(destination.active);
  await expect(access(destination.active)).rejects.toThrow();
});
