const { defineConfig, devices } = require("@playwright/test")

module.exports = defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "json",
  use: {
    headless: false, // Run in head mode (visible browser)
    slowMo: 1000, // Add slow motion for better visibility
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        headless: false, // Ensure head mode for chromium
        slowMo: 1000,
      },
    },
  ],
})
