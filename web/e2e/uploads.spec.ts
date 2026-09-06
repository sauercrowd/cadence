import { test, expect } from "@playwright/test";

for (const destination of ["caret", "source", "document"] as const) {
  test(`delayed uploads preserve their location after moving to ${destination}`, async ({
    page,
  }) => {
    await page.goto("/tasks");
    await page
      .getByRole("main")
      .getByRole("button", { name: "New task", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "What would you like to achieve?" })
      .fill(`Upload ${destination}`);
    await page
      .getByRole("button", { name: "Create task", exact: true })
      .click();
    await page.getByRole("button", { name: "Source", exact: true }).click();
    const source = page.getByRole("textbox", { name: "Markdown source" });
    await source.fill("Before\n\nAfter");
    await page.getByRole("button", { name: "Spec", exact: true }).click();
    const body = page.getByRole("textbox", {
      name: "Document body",
      exact: true,
    });
    await body.evaluate((element) => {
      const paragraph = element.querySelector("p")!;
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      range.collapse(false);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      element.focus();
      document.dispatchEvent(new Event("selectionchange"));
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/tasks/*/attachments", async (route) => {
      const response = await route.fetch();
      await gate;
      await route.fulfill({ response });
    });
    await body.evaluate((element) => {
      const bytes = Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        ),
        (c) => c.charCodeAt(0),
      );
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([bytes], "delayed.png", { type: "image/png" }),
      );
      element.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        }),
      );
    });
    await expect(body).toContainText("Uploading delayed.png");
    if (destination === "caret") {
      await body.click();
      await page.keyboard.press("Control+End");
      await page.keyboard.insertText(" edited");
    } else if (destination === "source") {
      await page.getByRole("button", { name: "Source", exact: true }).click();
      await source.click();
      await page.keyboard.press("Control+End");
      await page.keyboard.insertText(" edited");
    } else {
      await page
        .getByRole("button", { name: "Implementation planning", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Implementation planning",
          exact: true,
        }),
      ).toBeVisible();
    }
    release();
    if (destination === "document") {
      // The original session must save even though a different document is mounted.
      await expect
        .poll(async () => {
          const response = await page.request.post(
            "/api/worker.v1.WorkspaceService/GetTask",
            {
              data: {
                taskId: page.url().split("/tasks/")[1].split(/[/?#]/)[0],
              },
            },
          );
          const task = await response.json();
          const doc = await page.request.post(
            "/api/worker.v1.WorkspaceService/GetDocument",
            {
              data: { taskId: task.id, documentId: task.phases[0].documentId },
            },
          );
          return (await doc.json()).content;
        })
        .toContain("![](assets/");
      await expect(body.locator("img")).toHaveCount(0);
      await page
        .getByRole("button", { name: "Goal planning", exact: true })
        .click();
    }
    await expect(page.locator(".rich-editor .embed img")).toBeVisible();
    await expect(page.locator(".save-status.saved")).toContainText("Saved");
    await page.reload();
    await page.getByRole("button", { name: "Source", exact: true }).click();
    const result = await source.innerText();
    expect(result).not.toContain("cadence-upload:");
    expect(result.indexOf("Before")).toBeLessThan(
      result.indexOf("![](assets/"),
    );
    expect(result.indexOf("![](assets/")).toBeLessThan(result.indexOf("After"));
    if (destination !== "document") expect(result).toContain("After edited");
  });
}
