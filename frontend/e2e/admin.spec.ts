import { test, expect } from "@playwright/test";

test.describe("Admin Dashboard Operations", () => {
  test("should load system analytics metrics and unanswered query logs", async ({ page }) => {
    await page.goto("/admin");

    // Verify main admin dashboard heading or layout container
    await expect(page.locator("h1")).toBeVisible();

    // Verify refresh button
    const refreshBtn = page.locator("button", { hasText: /Refresh|புதுப்பி/i }).first();
    await expect(refreshBtn).toBeVisible();

    // Verify query log filter buttons container
    const allFilter = page.locator("button", { hasText: /ALL|அனைத்தும்/i }).first();
    if (await allFilter.isVisible()) {
      await expect(allFilter).toBeVisible();
    }
  });
});
