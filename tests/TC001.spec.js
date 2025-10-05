import { test, expect } from '@playwright/test';

test.describe('Login Feature', () => {
  test('TC001: Verify a user with valid credentials can log in successfully.', async ({ page }) => {
    // Given the user is on the OrangeHRM login page
    await page.goto('https://opensource-demo.orangehrmlive.com/web/index.php/auth/login');
    await page.waitForLoadState('domcontentloaded');

    // Verify the login page is loaded
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();

    // When the user enters the username
    await page.getByPlaceholder('Username').fill('Admin');

    // And the user enters the password
    await page.getByPlaceholder('Password').fill('admin123');

    // And clicks the login button
    await page.getByRole('button', { name: 'Login' }).click();

    // Then the user should be redirected to the dashboard
    await expect(page).toHaveURL(/.*\/dashboard\/index/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });
});