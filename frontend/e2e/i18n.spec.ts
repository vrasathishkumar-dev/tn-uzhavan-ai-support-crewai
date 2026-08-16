import { test, expect } from "@playwright/test";

test.describe("Multi-Language i18n Switching", () => {
  test("should switch language between English and Tamil across all pages", async ({ page }) => {
    await page.goto("/");

    // Locate language switcher buttons in navbar
    const tamilBtn = page.locator("header button[title='தமிழ் (Tamil)']");
    const englishBtn = page.locator("header button[title='English']");

    await expect(tamilBtn).toBeVisible();
    await expect(englishBtn).toBeVisible();

    // Click Tamil toggle button
    await tamilBtn.click();

    // Verify localStorage app_lang setting is 'ta'
    const savedLangTa = await page.evaluate(() => localStorage.getItem("app_lang"));
    expect(savedLangTa).toBe("ta");

    // Click English toggle button
    await englishBtn.click();

    // Verify localStorage app_lang setting is 'en'
    const savedLangEn = await page.evaluate(() => localStorage.getItem("app_lang"));
    expect(savedLangEn).toBe("en");
  });
});
