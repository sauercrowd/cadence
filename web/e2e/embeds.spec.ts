import { test, expect } from "@playwright/test";

// 1x1 transparent PNG.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("pasted images become attachments and iframes embed", async ({
  page,
}) => {
  await page.goto("/tasks");
  await page
    .getByRole("main")
    .getByRole("button", { name: "New task", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "What would you like to achieve?" })
    .fill("Embed check");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  const body = page.getByRole("textbox", {
    name: "Document body",
    exact: true,
  });
  await body.waitFor();

  // Drop an image file onto the editor: it uploads, then embeds by name.
  await body.click();
  await page.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const file = new File([bytes], "shot.png", { type: "image/png" });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const event = new DragEvent("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: transfer });
    document.querySelector(".rich-editor")!.dispatchEvent(event);
  }, PNG_BASE64);
  const image = page.locator(".rich-editor .embed img");
  await expect(image).toBeVisible();
  const src = (await image.getAttribute("src")) ?? "";
  expect(src).toMatch(/^\/api\/tasks\/[^/]+\/attachments\/.+\.png$/);
  const stored = await page.request.get(src);
  expect(stored.status()).toBe(200);
  expect(stored.headers()["content-type"]).toBe("image/png");

  // The iframe toolbar button embeds a URL behind a sandboxed frame.
  page.on("dialog", (dialog) => void dialog.accept("https://example.com/"));
  await page.getByRole("button", { name: "Embed iframe", exact: true }).click();
  const frame = page.locator('.rich-editor .embed iframe[src="https://example.com/"]');
  await expect(frame).toBeVisible();

  // Dropped videos preview with native controls; other files become links.
  async function drop(name: string, type: string, bytes: number[]) {
    await page.evaluate(
      ([fileName, fileType, content]) => {
        const file = new File([new Uint8Array(content)], fileName, {
          type: fileType,
        });
        const transfer = new DataTransfer();
        transfer.items.add(file);
        const event = new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
        });
        Object.defineProperty(event, "dataTransfer", { value: transfer });
        document.querySelector(".rich-editor")!.dispatchEvent(event);
      },
      [name, type, bytes] as const,
    );
  }
  await drop("clip.mp4", "video/mp4", [0, 0, 0, 24]);
  await expect(page.locator(".rich-editor .embed video")).toBeVisible();
  await drop("notes.txt", "text/plain", [104, 105]);
  await expect(page.locator(".rich-editor").getByText("notes.txt")).toBeVisible();

  // The file stays plain Markdown with relative references.
  await expect(page.locator(".save-status.saved")).toContainText("Saved");
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const source = page.getByRole("textbox", { name: "Markdown source" });
  await expect(source).toContainText(/!\[\]\(.+?\.png\)/);
  await expect(source).toContainText(
    '<iframe src="https://example.com/"></iframe>',
  );

  // Inline HTML embeds render their content in a sandboxed frame.
  const markdown = page.getByRole("textbox", { name: "Markdown source" });
  await expect(markdown).toContainText(/<video src=".+?\.mp4" controls>/);
  await expect(markdown).toContainText(/\[notes\.txt\]\(.+?\.txt\)/);
  await page.locator(".source-editor .cm-content").click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.type('<iframe srcdoc="<p>Hello srcdoc</p>"></iframe>');
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Spec", exact: true }).click();
  await expect(
    page
      .frameLocator(".rich-editor iframe[srcdoc]")
      .getByText("Hello srcdoc"),
  ).toBeVisible();

  // Attachments survive a reload.
  await page.reload();
  await page
    .getByRole("textbox", { name: "Document body", exact: true })
    .waitFor();
  await expect(page.locator(".rich-editor .embed img")).toBeVisible();
  await expect(
    page.locator('.rich-editor .embed iframe[src="https://example.com/"]'),
  ).toBeVisible();

  // The shield takes the first click (selecting the embed) and steps aside
  // for the second, so the live page stays interactive while editing.
  const live = page.locator(".rich-editor .embed-iframe");
  const shield = live.locator(".embed-shield");
  await expect(shield).toBeVisible();
  await live.click();
  await expect(shield).toBeHidden();
  await page.getByRole("heading", { name: "Goal", exact: true }).click();
  await expect(shield).toBeVisible();
});
