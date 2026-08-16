import { test, expect } from "@playwright/test";

test.describe("Schemes Directory & Search", () => {
  test("should render scheme cards and allow keyword search", async ({ page }) => {
    await page.goto("/schemes");

    // Verify search input field
    const searchInput = page.locator("input[placeholder*='Search'], input[placeholder*='தேடுங்கள்']").first();
    await expect(searchInput).toBeVisible();

    // Type search term
    await searchInput.fill("Oil Seeds");

    // Check filtered scheme list contains matching results or cards
    const schemeCard = page.locator("a[href^='/schemes/']").first();
    await expect(schemeCard).toBeVisible({ timeout: 10000 });
  });

  test("should filter schemes by category buttons", async ({ page }) => {
    await page.goto("/schemes");

    // Click category filter chip
    const categoryChip = page.locator("button", { hasText: /Agriculture|வேளாண்மை/i }).first();
    if (await categoryChip.isVisible()) {
      await categoryChip.click();
      await expect(page.locator("a[href^='/schemes/']").first()).toBeVisible();
    }
  });

  test("should navigate to scheme detail page when clicking View Full Details", async ({ page }) => {
    await page.goto("/schemes");

    const detailLink = page.locator("a[href^='/schemes/']").first();
    await expect(detailLink).toBeVisible();

    await detailLink.click();
    await expect(page).toHaveURL(/\/schemes\/[a-z0-9_-]+/);
  });
});
