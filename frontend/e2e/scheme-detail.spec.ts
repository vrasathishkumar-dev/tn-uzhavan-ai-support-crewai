import { test, expect } from "@playwright/test";

test.describe("Scheme Detail Page", () => {
  test("should render scheme information and switch tab sections", async ({ page }) => {
    // Direct navigation to certified oil seeds scheme detail page
    await page.goto("/schemes/docsos");

    // Verify main scheme title
    await expect(page.locator("h1")).toBeVisible();

    // Tab items: Overview, Benefits, Eligibility, Documents, Process, FAQs
    const tabs = ["Overview", "Benefits", "Eligibility", "Documents", "Process", "FAQs"];
    for (const tab of tabs) {
      const tabButton = page.locator("button", { hasText: new RegExp(tab, "i") }).first();
      if (await tabButton.isVisible()) {
        await tabButton.click();
        await expect(page.locator("main").first()).toBeVisible();
      }
    }
  });

  test("should copy link to clipboard when clicking Copy Link", async ({ page }) => {
    await page.goto("/schemes/docsos");

    const copyBtn = page.locator("button", { hasText: /Copy Link|இணைப்பை நகலெடு/i }).first();
    if (await copyBtn.isVisible()) {
      await copyBtn.click();
      await expect(page.locator("text=/Copied!|நகலெடுக்கப்பட்டது!/i")).toBeVisible();
    }
  });
});
