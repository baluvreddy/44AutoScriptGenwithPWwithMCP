import { test, expect } from '@playwright/test';

test('TC002: Verify the system shows an error for invalid login credentials.', async ({ page }) => {
  
  // Given the user is on the OrangeHRM login page
  await page.goto('https://opensource-demo.orangehrmlive.com/web/index.php/auth/login');
  
  // Wait for the main content to be loaded, ensuring the login form is ready.
  await page.waitForSelector('.orangehrm-login-form');
  
  // When the user enters an invalid username
  // TestData: Admin111111
  await page.getByPlaceholder('Username').fill('Admin111111');
  await page.getByPlaceholder('Password').fill('any_password');
  
  // And clicks the login button
  await page.getByRole('button', { name: 'Login' }).click();
  
  // Then an "Invalid credentials" error message should be displayed
  const errorMessage = page.locator('.oxd-alert-content-text');
  await expect(errorMessage).toBeVisible();
  await expect(errorMessage).toHaveText('Invalid credentials');
  
});