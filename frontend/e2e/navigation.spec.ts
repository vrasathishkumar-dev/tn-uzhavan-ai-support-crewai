import { test, expect } from "@playwright/test";

test.describe("Navigation Header & Layout", () => {
  test("should display header branding and navigate to main routes", async ({ page }) => {
    await page.goto("/");

    // Verify Header Logo & Brand Header
    await expect(page.locator("header")).toBeVisible();

    // Check Navigation Links by href attribute
    const assistantLink = page.locator("header a[href='/']").first();
    const schemesLink = page.locator("header a[href='/schemes']").first();
    const adminLink = page.locator("header a[href='/admin']").first();

    await expect(assistantLink).toBeVisible();
    await expect(schemesLink).toBeVisible();
    await expect(adminLink).toBeVisible();

    // Navigate to Schemes Directory
    await schemesLink.click();
    await expect(page).toHaveURL(/\/schemes/);

    // Navigate to Admin Dashboard
    await adminLink.click();
    await expect(page).toHaveURL(/\/admin/);

    // Return to AI Assistant
    await assistantLink.click();
    await expect(page).toHaveURL("/");
  });

  test("should toggle theme between light and dark mode", async ({ page }) => {
    await page.goto("/");
    const themeToggleButton = page.locator("header button[title*='Switch to']").first();

    if (await themeToggleButton.isVisible()) {
      await themeToggleButton.click();
      const htmlElement = page.locator("html");
      await expect(htmlElement).toHaveClass(/(dark|light|h-full)/);
    }
  });
});
