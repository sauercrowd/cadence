import { test, expect, type Page } from "@playwright/test";

async function setTaskStatus(page: Page, status: string) {
  await page.getByRole("button", { name: "Task status", exact: true }).click();
  await page.getByRole("option", { name: status[0].toUpperCase() + status.slice(1), exact: true }).click();
  await expect(page.getByRole("button", { name: "Task status", exact: true })).toHaveText(status[0].toUpperCase() + status.slice(1));
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

test("tasks, comments, phase switching, and archiving", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await createTask(page, "Shape the agent workflow");
  await setTaskStatus(page, "focus");

  // Comment on the goal document, then resolve and re-reveal the thread.
  await selectText(page, "should this work achieve");
  await page
    .getByRole("textbox", { name: "Comment reply" })
    .fill("Should this cover archived tasks too?");
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  const dot = page.getByRole("button", {
    name: "Comment: Should this cover archived tasks too?",
  });
  await expect(dot).toBeVisible();
  await dot.click();
  const thread = page.getByRole("dialog", { name: "Comment thread" });
  await expect(thread).toBeVisible();
  await thread.getByRole("button", { name: "Resolve thread" }).click();
  await expect(dot).toBeHidden();
  await page.getByRole("button", { name: /Show all \d+ threads/ }).click();
  await expect(dot).toBeVisible();

  // Move to implementation planning and make it the current phase by
  // hovering/clicking its timeline number, which swaps to a clock icon.
  await page
    .getByRole("button", { name: "Implementation planning", exact: true })
    .click();
  const makeCurrent = page.getByRole("button", {
    name: "Make Implementation planning the current phase",
  });
  await makeCurrent.hover();
  await expect(makeCurrent.locator(".phase-step-hover")).toHaveCSS(
    "opacity",
    "1",
  );
  await makeCurrent.click();
  await expect(
    page.getByRole("button", { name: "Implementation planning: current phase" }),
  ).toBeVisible();

  // Archived is just a status — leaving it is an ordinary status change.
  await setTaskStatus(page, "archived");
  await setTaskStatus(page, "focus");

  expect(errors).toEqual([]);
});
