import { test, expect, type Page } from "@playwright/test";

async function setTaskStatus(page: Page, status: string) {
  const label = status[0].toUpperCase() + status.slice(1);
  const button = page.getByRole("button", { name: /Task status/ });
  await button.click();
  await page.getByRole("option", { name: label, exact: true }).click();
  await expect(button).toHaveAttribute("aria-label", `Task status: ${label}`);
}
async function createTask(page: Page, title: string) {
  await page.goto("/tasks");
  await page
    .getByRole("button", { name: "New task", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("textbox", { name: "What would you like to achieve?" }),
  ).toBeFocused();
  await page
    .getByRole("textbox", { name: "What would you like to achieve?" })
    .fill(title);
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Document body", exact: true })
    .waitFor();
}
async function selectText(page: Page, text: string) {
  await page
    .getByRole("textbox", { name: "Document body" })
    .evaluate((element, text) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const start = node.textContent?.indexOf(text) ?? -1;
        if (start >= 0) {
          const range = document.createRange();
          range.setStart(node, start);
          range.setEnd(node, start + text.length);
          const selection = window.getSelection()!;
          selection.removeAllRanges();
          selection.addRange(range);
          element.focus();
          document.dispatchEvent(new Event("selectionchange"));
          return;
        }
      }
      throw new Error(`Text not found: ${text}`);
    }, text);
  await page.getByRole("button", { name: "Add comment", exact: true }).click();
}

test("tasks, comments, phase switching, and archiving", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await createTask(page, "Shape the agent workflow");
  await setTaskStatus(page, "focus");

  // Comment on the goal document, then resolve and re-reveal the thread.
  await selectText(page, "should this work achieve");
  const reply = page.getByRole("textbox", { name: "Comment reply" });
  const draftThread = page.getByRole("dialog", { name: "Comment thread" });
  const topBeforeFocus = (await draftThread.boundingBox())?.y;
  await reply.focus();
  await expect(reply).toBeFocused();
  await expect
    .poll(async () => (await draftThread.boundingBox())?.y)
    .toBe(topBeforeFocus);
  await reply.fill("Should this cover archived tasks too?");
  await expect
    .poll(async () => (await draftThread.boundingBox())?.y)
    .toBe(topBeforeFocus);
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  const dot = page.getByRole("button", {
    name: "Comment: Should this cover archived tasks too?",
  });
  await expect(dot).toBeVisible();
  await dot.click();
  const thread = page.getByRole("dialog", { name: "Comment thread" });
  await expect(thread).toBeVisible();
  // Resolved threads stay on the page and can be reopened in place.
  await thread.getByRole("button", { name: "Resolve thread" }).click();
  await expect(
    thread.getByRole("button", { name: "Reopen thread" }),
  ).toBeVisible();
  await expect(dot).toBeVisible();
  await expect(dot).toHaveClass(/resolved/);

  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Markdown source" }),
  ).toContainText("```cadence-comments");
  await expect(page.locator(".save-status.saved")).toContainText("Saved");
  await page.reload();
  await page.getByRole("button", { name: "Spec", exact: true }).click();
  await expect(dot).toBeVisible();
  await expect(dot).toHaveClass(/resolved/);
  await expect(
    page.getByRole("textbox", { name: "Document body", exact: true }),
  ).not.toContainText("cadence-comments");

  // Move to work and make it the current phase by
  // hovering/clicking its timeline number, which swaps to a clock icon.
  await page.getByRole("button", { name: /^Work/ }).click();
  const makeCurrent = page.getByRole("button", {
    name: "Make Work the current phase",
  });
  await makeCurrent.hover();
  await expect(makeCurrent.locator(".phase-step-hover")).toHaveCSS(
    "opacity",
    "1",
  );
  await makeCurrent.click();
  await expect(
    page.getByRole("button", {
      name: "Work: current phase",
    }),
  ).toBeVisible();

  // Archived is just a status — leaving it is an ordinary status change.
  await setTaskStatus(page, "archived");
  await setTaskStatus(page, "focus");

  expect(errors).toEqual([]);
});

test("subphases stay with their phase and show active agents", async ({
  page,
}) => {
  await createTask(page, "Parallel delivery");
  await expect(page.getByRole("button", { name: "Add document" })).toHaveCount(
    1,
  );
  await page
    .getByRole("button", { name: "Add subphase to Goal planning" })
    .click();
  await page.getByRole("textbox", { name: "Subphase name" }).fill("Research");
  await page.getByRole("button", { name: "Create subphase" }).click();
  await page
    .getByRole("button", { name: "Goal planning", exact: true })
    .click();

  const taskId = page.url().split("/tasks/")[1].split(/[/?#]/)[0];
  const taskResponse = await page.request.post(
    "/api/worker.v1.WorkspaceService/GetTask",
    { data: { taskId } },
  );
  const task = await taskResponse.json();
  await page.keyboard.press("s");
  await page.keyboard.press(String(task.subphases[0].number));
  await expect(
    page.getByRole("heading", { name: "Research", exact: true, level: 2 }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Goal planning", exact: true })
    .click();
  await page.request.post(
    "/api/worker.v1.WorkspaceService/UpsertAgentSession",
    {
      data: {
        taskId: task.id,
        sessionId: crypto.randomUUID(),
        name: "Codex",
        scope: "Research",
        subphaseNumber: task.subphases[0].number,
        status: "working",
        update: "Started research",
      },
    },
  );
  await page.reload();

  await expect(page.getByText("ACTIVE AGENTS", { exact: true })).toBeVisible();
  await expect(
    page
      .locator(".workspace-agents")
      .getByLabel("Agent status: working", { exact: true }),
  ).toBeVisible();
  await page.locator(".agent-nav-item", { hasText: "Codex" }).click();
  await expect(page).toHaveURL(/\/agents\//);
  const activity = page.locator(".agent-page");
  await expect(activity.getByRole("heading", { name: "Codex" })).toBeVisible();
  await expect(
    activity.getByLabel("Agent status: working", { exact: true }),
  ).toBeVisible();
  await expect(
    activity.getByText("Started research", { exact: true }),
  ).toBeVisible();
  await activity.getByRole("button", { name: "Back to task" }).click();
  await page.keyboard.press("a");
  const switcher = page.getByRole("dialog", { name: "Go to agent" });
  await expect(
    switcher.getByRole("combobox", { name: "Find agent" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/agents\//);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/documents\//);
  const subphase = page.locator(".inline-subphase", { hasText: "Research" });
  await expect(subphase).toBeVisible();
  await subphase.locator("summary").click();
  await expect(
    subphase.getByRole("textbox", { name: "Document body" }),
  ).toBeVisible();
  const subphaseEditor = subphase.getByRole("textbox", {
    name: "Document body",
  });
  await subphaseEditor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\nInline note");
  await expect(subphaseEditor).toContainText("Inline note");
  await expect(subphase.getByRole("button", { name: "Spec" })).toHaveCount(0);
  await expect(
    subphase.getByRole("button", { name: "Agent instructions" }),
  ).toHaveCount(0);
  await expect(subphase.getByRole("button", { name: "Source" })).toHaveCount(0);
  await page.setViewportSize({ width: 600, height: 800 });
  await expect(subphase).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
