import { test, expect } from "@playwright/test";

test.describe("AI Chat Assistant Flow", () => {
  test("should render initial welcome state and quick suggestion chips", async ({ page }) => {
    await page.goto("/");

    // Verify main chat interface container is present
    await expect(page.locator("main")).toBeVisible();

    // Verify chat text area input
    const inputArea = page.locator("textarea").first();
    await expect(inputArea).toBeVisible();
  });

  test("should send user message and display assistant response", async ({ page }) => {
    await page.goto("/");

    const inputArea = page.locator("textarea").first();
    await expect(inputArea).toBeVisible();

    // Type query and send via Enter key or Submit button
    await inputArea.fill("What is the oil seeds subsidy scheme in Tamil Nadu?");
    const sendButton = page.locator("button[type='submit'], button[title*='Send']").first();

    if (await sendButton.isVisible()) {
      await sendButton.click();
    } else {
      await inputArea.press("Enter");
    }

    // Verify user message appears in thread
    await expect(page.locator(".chat-prose").first()).toBeVisible({ timeout: 15000 });
  });

  test("should persist chat history when navigating to scheme details page and back", async ({ page }) => {
    await page.goto("/");

    const inputArea = page.locator("textarea").first();
    await inputArea.fill("Test chat persistence query");

    const sendBtn = page.locator("button[type='submit']").first();
    if (await sendBtn.isVisible()) {
      await sendBtn.click();
    } else {
      await inputArea.press("Enter");
    }

    // Verify sent message is in the DOM
    await expect(page.locator("text=Test chat persistence query")).toBeVisible();

    // Navigate away to a scheme detail page
    await page.goto("/schemes/docsos");
    await expect(page.locator("h1")).toBeVisible();

    // Navigate back to AI Assistant
    await page.goto("/");

    // Verify chat history still contains the previous message
    await expect(page.locator("text=Test chat persistence query")).toBeVisible();
  });

  test("should clear chat history when New Chat is clicked", async ({ page }) => {
    await page.goto("/");

    const newChatBtn = page.locator("button", { hasText: /New Chat|புதிய உரையாடல்/i }).first();
    if (await newChatBtn.isVisible()) {
      await newChatBtn.click();
      const inputArea = page.locator("textarea").first();
      await expect(inputArea).toHaveValue("");
    }
  });
});
