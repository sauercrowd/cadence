import { test, expect } from "@playwright/test";

test("the shared property picker sets task creation defaults, filters, and header edits", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  // Create a task, overriding priority and status via the "/" picker.
  await page.goto("/tasks");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  const title = page.getByRole("textbox", {
    name: "What would you like to achieve?",
  });
  await expect(title).toBeFocused();
  await title.fill("Ship the release notes");
  await title.press("/");
  const picker = page.getByRole("combobox", { name: "Change task property" });
  await expect(picker).toBeVisible();
  // No intermediate category step: values are offered directly.
  await page.getByRole("option", { name: "P0", exact: true }).click();
  await title.press("/");
  await page.getByRole("option", { name: "Focus", exact: true }).click();
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Document body", exact: true })
    .waitFor();
  await expect(
    page.getByRole("button", { name: "Task priority", exact: true }),
  ).toHaveText("P0");
  await expect(
    page.getByRole("button", { name: "Task status", exact: true }),
  ).toHaveText("Focus");

  // The workflow's goal-phase instructions travel with the document and get
  // their own editing tab, collapsed out of the way of the main spec.
  await expect(
    page.getByRole("textbox", { name: "Document body" }),
  ).not.toContainText("Ask focused questions");
  await page
    .getByRole("button", { name: "Agent instructions", exact: true })
    .click();
  await expect(page.locator(".source-editor .cm-content")).toContainText(
    "Ask focused questions",
  );
  await page.getByRole("button", { name: "Spec", exact: true }).click();

  // The same picker filters the task overview, via a dedicated popup rather
  // than text embedded in the search field, and again with no category step.
  await page.getByRole("button", { name: "Back to tasks" }).click();
  // No filter chips before anything is selected.
  await expect(page.locator(".filter-token")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Filter tasks" }).press("/");
  await expect(
    page.getByRole("combobox", { name: "Change task property" }),
  ).toBeVisible();
  await page.getByRole("option", { name: "Focus", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Remove Status: Focus" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Filter tasks" })).toHaveValue(
    "",
  );
  await expect(
    page.getByRole("main").getByText("Ship the release notes"),
  ).toBeVisible();

  // Workflow settings expose a single merged template field per phase.
  await page.getByRole("button", { name: "Phases", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Workflow phases" })
    .getByRole("button", { name: "Goal planning", exact: false })
    .click();
  await expect(page.getByText("Agent prompt", { exact: true })).toHaveCount(
    0,
  );
  const template = page.getByLabel("Template", { exact: false });
  await expect(template).toBeVisible();
  await expect(template).toHaveValue(/<agent-instructions>/);
  await expect(page.locator(".field-hint code")).toContainText(
    "agent-instructions",
  );

  expect(errors).toEqual([]);
});
