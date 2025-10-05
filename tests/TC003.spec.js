import { test, expect } from '@playwright/test';

test.describe('Password Reset Functionality', () => {
  test('TC003: Verify a user can initiate the password reset process', async ({ page }) => {
    
    // Step: Given the user is on the OrangeHRM login page
    await test.step('Navigate to the OrangeHRM login page', async () => {
      await page.goto('https://opensource-demo.orangehrmlive.com/web/index.php/auth/login');
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
    });

    // Step: When the user clicks on "Forgot your Password?"
    await test.step('Click on the "Forgot your Password?" link', async () => {
      await page.getByText('Forgot your password?').click();
      await expect(page.getByRole('heading', { name: 'Reset Password' })).toBeVisible();
    });

    // Step: And enters their username
    await test.step('Enter the username', async () => {
      const username = 'Admin';
      await page.getByPlaceholder('Username').fill(username);
    });

    // Step: And clicks the "Reset Password" button
    await test.step('Click the "Reset Password" button', async () => {
      await page.getByRole('button', { name: 'Reset Password' }).click();
    });

    // Step: Then a password reset link should be sent successfully
    await test.step('Verify the password reset link was sent successfully', async () => {
      const successMessage = page.getByRole('heading', { name: 'Reset Password link sent successfully' });
      await expect(successMessage).toBeVisible({ timeout: 10000 });
      await expect(successMessage).toHaveText('Reset Password link sent successfully');
    });
  });
});