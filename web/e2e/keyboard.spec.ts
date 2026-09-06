import { test, expect, type Page } from "@playwright/test";

async function makeTask(page: Page, title: string) {
  await page.goto("/tasks");
  await page
    .getByRole("main")
    .getByRole("button", { name: "New task", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "What would you like to achieve?" })
    .fill(title);
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Document body", exact: true })
    .waitFor();
}

test("keyboard navigation across the app", async ({ page }, testInfo) => {
  await makeTask(page, "Add CSV export to the reporting view");
  await makeTask(page, "Investigate slow dashboard queries");
  await makeTask(page, "Rewrite onboarding copy");

  // t returns to the list; j/k move the cursor; Enter opens.
  await page.keyboard.press("t");
  await expect(page.locator(".task-row").first()).toHaveClass(/cursor/);
  await page.keyboard.press("j");
  await expect(page.locator(".task-row").nth(1)).toHaveClass(/cursor/);
  await page.keyboard.press("k");
  await expect(page.locator(".task-row").first()).toHaveClass(/cursor/);

  // Hold Alt: hints appear over the controls, without moving anything.
  const before = await page.locator(".sidebar-new").boundingBox();
  await page.keyboard.down("Alt");
  await expect(page.locator(".sidebar-new .key-hint")).toBeVisible();
  const after = await page.locator(".sidebar-new").boundingBox();
  expect(after).toEqual(before);
  await page.keyboard.up("Alt");
  await expect(page.locator(".sidebar-new .key-hint")).toBeHidden();

  await page.keyboard.press("Enter");
  await page
    .getByRole("textbox", { name: "Document body", exact: true })
    .waitFor();

  // Numbers address the numbered phases.
  await page.keyboard.press("3");
  await expect(
    page.getByRole("heading", {
      name: "Implementation",
      level: 2,
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("1");
  await expect(
    page.getByRole("heading", { name: "Goal planning" }),
  ).toBeVisible();

  // ] steps through the navigator, m makes the viewed phase current.
  await page.keyboard.press("]");
  await expect(
    page.getByRole("heading", { name: "Implementation planning" }),
  ).toBeVisible();
  await page.keyboard.press("m");
  await expect(
    page.getByRole("button", {
      name: "Implementation planning: current phase",
    }),
  ).toBeVisible();

  await page.keyboard.down("Alt");
  await page.keyboard.up("Alt");

  // Escape goes back; ? opens the sheet.
  await page.keyboard.press("Escape");
  await expect(page.locator(".task-table")).toBeVisible();
  await page.keyboard.press("?");
  const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(sheet).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("shortcuts-desktop.png") });
  await page.setViewportSize({ width: 600, height: 800 });
  await expect(sheet).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("shortcuts-compact.png") });
  const close = sheet.getByRole("button", { name: "Close dialog" });
  await close.focus();
  await expect(close).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(sheet).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.keyboard.press("?");

  // p reaches Phases; numbers select the numbered phase there too.
  await page.keyboard.press("Escape");
  await page.keyboard.press("p");
  await expect(page.getByRole("heading", { name: "Phases" })).toBeVisible();
  const third = page
    .getByRole("navigation", { name: "Workflow phases" })
    .getByRole("button", { name: "3 Implementation", exact: true });
  // The heading renders before the workflow loads; wait for the list itself.
  await expect(third).toBeVisible();
  await page.keyboard.press("3");
  await expect(third).toHaveClass(/active/);
});
