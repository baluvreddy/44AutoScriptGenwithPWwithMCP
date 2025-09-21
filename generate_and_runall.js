const axios = require("axios")
const fs = require("fs")
const path = require("path")
const { execSync } = require("child_process")

const GEMINI_API_KEY = "########################" // Replace with your API key
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent"

function getTimestamp() {
  return new Date().toISOString()
}

function logError(testCaseID, errorMsg, attempt, healingType, code, screenshotPath) {
  const errorLog = {
    testCaseID,
    error: errorMsg,
    attempt,
    healingType,
    code,
    screenshotPath,
    timestamp: getTimestamp(),
  }

  let errorLogs = []
  if (fs.existsSync("error_logs.json")) {
    try {
      errorLogs = JSON.parse(fs.readFileSync("error_logs.json", "utf8"))
    } catch (e) {
      errorLogs = []
    }
  }

  errorLogs.push(errorLog)
  fs.writeFileSync("error_logs.json", JSON.stringify(errorLogs, null, 2))

  console.log(
    JSON.stringify({
      event: "error_logged",
      testCaseID,
      errorLogPath: "error_logs.json",
      timestamp: getTimestamp(),
    }),
  )
  process.stdout.write("")
}

// Remove block and line comments that appear at the very top of the code
function cleanLeadingComments(code) {
  code = code.replace(/^\/\*[\s\S]*?\*\/\s*/g, "")
  code = code.replace(/^(\/\/.*\n)+/g, "")
  return code.trim()
}

// Extract code between markdown fences or by simply removing leading/trailing fences if present
function extractCodeBlock(text) {
  const match = text.match(/```(?:\w+)?\n([\s\S]*?)```/)
  const code = match ? match[1] : null

  if (code) {
    return cleanLeadingComments(code.trim())
  }

  const lines = text.trim().split("\n")
  if (lines[0]?.startsWith("```")) lines.shift()
  if (lines[lines.length - 1]?.startsWith("```")) lines.pop()

  return cleanLeadingComments(lines.join("\n").trim())
}

function parseErrorMessage(error) {
  const match = error.message.match(/expect\$\$[^)]+\$$\.\w+\$\$[^)]+\$$(?:.*?\n\s*Expected:.*?\n\s*Received:.*?)?/)
  if (match) {
    return match[0].replace(/\x1B\[\d+m/g, "").trim()
  }
  return error.message
    .split("\n")[0]
    .replace(/\x1B\[\d+m/g, "")
    .trim()
}

function applyLocalFix(code, errorMsg) {
  let updatedCode = code

  const selectorMatch =
    errorMsg.match(/locator\$\$['"]([^'"]+)['"]\$$/) ||
    errorMsg.match(/selector '([^']+)'/) ||
    errorMsg.match(/waiting for selector "([^"]+)"/)

  if (selectorMatch) {
    const originalSelector = selectorMatch[1]

    // Try multiple fallback strategies
    const fallbackSelectors = [
      `page.getByRole('button', { name: /${originalSelector.replace(/[:#.[\]]/g, " ").trim()}/i })`,
      `page.getByText('${originalSelector.replace(/[:#.[\]]/g, " ").trim()}', { exact: false })`,
      `page.locator('[data-testid*="${originalSelector.replace(/[:#.[\]]/g, "")}"]')`,
      `page.locator('text=${originalSelector.replace(/[:#.[\]]/g, " ").trim() || "element"}')`,
    ]

    // Replace with the first fallback
    const fallbackSelector = fallbackSelectors[0]
    updatedCode = updatedCode.replace(
      new RegExp(`page\\.locator\\('${originalSelector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`, "g"),
      fallbackSelector,
    )
  } else {
    // Generic timeout and wait improvements
    updatedCode = updatedCode.replace(
      /await page\.waitForSelector\$\$([^,]+), \{ state: 'visible', timeout: \d+\}\$\$/g,
      `await page.waitForSelector($1, { state: 'visible', timeout: 20000 })`,
    )

    // Add more robust waiting
    updatedCode = updatedCode.replace(
      /await page\.goto$$'([^']+)'$$;/g,
      `await page.goto('$1');\n  await page.waitForLoadState('networkidle');\n  await page.waitForTimeout(2000);`,
    )
  }

  return updatedCode
}

async function captureScreenshot(testCaseID, attempt) {
  try {
    const screenshotPath = `screenshots/${testCaseID}_attempt_${attempt}_${Date.now()}.png`

    // Ensure screenshots directory exists
    if (!fs.existsSync("screenshots")) {
      fs.mkdirSync("screenshots", { recursive: true })
    }

    const screenshotScript = `
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();
  
  try {
    // Try to navigate to the last known URL or a default
    await page.goto('about:blank', { waitUntil: 'networkidle' });
    await page.screenshot({ path: '${screenshotPath}', fullPage: true });
    console.log('Screenshot captured: ${screenshotPath}');
  } catch (error) {
    console.error('Screenshot error:', error.message);
  } finally {
    await browser.close();
  }
})();
`

    fs.writeFileSync("temp_screenshot.js", screenshotScript)
    execSync("node temp_screenshot.js", { stdio: "pipe" })
    fs.unlinkSync("temp_screenshot.js")

    console.log(
      JSON.stringify({
        event: "screenshot_captured",
        testCaseID: testCaseID,
        attempt: attempt,
        screenshotPath: screenshotPath,
        timestamp: getTimestamp(),
      }),
    )
    process.stdout.write("")

    return screenshotPath
  } catch (error) {
    console.log(
      JSON.stringify({
        event: "error",
        message: `Failed to capture screenshot for ${testCaseID}: ${error.message}`,
        timestamp: getTimestamp(),
      }),
    )
    return null
  }
}

function imageToBase64(imagePath) {
  try {
    const imageBuffer = fs.readFileSync(imagePath)
    return imageBuffer.toString("base64")
  } catch (error) {
    console.log(
      JSON.stringify({
        event: "error",
        message: `Failed to convert image to base64: ${error.message}`,
        timestamp: getTimestamp(),
      }),
    )
    return null
  }
}

async function callGeminiAPI(promptText, imagePath = null) {
  try {
    const contents = [{ parts: [{ text: promptText }] }]

    // Add image if provided
    if (imagePath && fs.existsSync(imagePath)) {
      const base64Image = imageToBase64(imagePath)
      if (base64Image) {
        contents[0].parts.push({
          inline_data: {
            mime_type: "image/png",
            data: base64Image,
          },
        })
        console.log(
          JSON.stringify({
            event: "info",
            message: `Screenshot included in Gemini API call: ${imagePath}`,
            timestamp: getTimestamp(),
          }),
        )
        process.stdout.write("")
      }
    }

    const response = await axios.post(
      GEMINI_API_URL,
      { contents },
      {
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": GEMINI_API_KEY,
        },
      },
    )

    const rawText = response.data.candidates[0].content.parts[0].text
    console.log("=== Gemini API Raw Output Start ===")
    console.log(rawText)
    console.log("=== Gemini API Raw Output End ===")
    process.stdout.write("") // Flush output

    const code = extractCodeBlock(rawText)
    return code
  } catch (error) {
    console.log(
      JSON.stringify({
        event: "error",
        message: `Gemini API Error: ${error.response?.data?.error?.message || error.message}`,
        timestamp: getTimestamp(),
      }),
    )
    process.stdout.write("") // Flush output
    return null
  }
}

function createLocatorMapping(locatorsData, url, stepInfo) {
  if (!locatorsData || !Array.isArray(locatorsData)) {
    return "No locator data available"
  }

  const urlLocators = locatorsData.filter((loc) => loc.url === url)
  if (urlLocators.length === 0) {
    return `No locators found for URL: ${url}`
  }

  return urlLocators
    .map((loc) => {
      return `Element: ${loc.element || "Unknown"}\nSelectors (priority order):\n${
        loc.selectors ? loc.selectors.map((sel, idx) => `  ${idx + 1}. ${sel}`).join("\n") : "  No selectors available"
      }\n`
    })
    .join("\n---\n")
}

function applyAdvancedSelfHealing(code, errorMsg, testCaseData) {
  let healedCode = code

  healedCode = healedCode.replace(
    /page\.locator\$\$'([^']+)'\$\$\.click\$\$\$/g,
    `page.getByRole('button', { name: /$1/i }).first().click()`,
  )

  healedCode = healedCode.replace(
    /(await page\.[^;]+;)/g,
    `try {\n    $1\n  } catch (e) {\n    console.log('[v0] Action failed, trying alternative approach:', e.message);\n    await page.waitForTimeout(1000);\n    // Try alternative selector strategy\n    const altSelector = e.message.includes('locator') ? 'text=' + e.message.split("'")[1] : null;\n    if (altSelector) await page.locator(altSelector).click();\n  }`,
  )

  // Strategy 3: Add dynamic waiting
  healedCode = healedCode.replace(
    /await page\.goto$$'([^']+)'$$;/g,
    `await page.goto('$1', { waitUntil: 'networkidle', timeout: 30000 });\n  await page.waitForTimeout(3000);`,
  )

  // Strategy 4: Replace specific selectors with more generic ones
  if (errorMsg.includes("locator")) {
    healedCode = healedCode.replace(
      /page\.locator$$'([^']+)'$$/g,
      `page.locator('$1').or(page.getByText('$1')).or(page.getByRole('button', { name: /$1/i }))`,
    )
  }

  return healedCode
}

// Extract first URL from test case data for navigation
function extractFirstUrl(testcase) {
  const urlRegex = /(https?:\/\/[^\s"'<>)\][]+)/i
  let url = null

  if (Array.isArray(testcase.TestData)) {
    const urlData = testcase.TestData.find((data) => data.match(urlRegex))
    if (urlData) {
      url = urlData.match(urlRegex)[0]
    }
  }

  if (!url && Array.isArray(testcase.Steps)) {
    const stepWithUrl = testcase.Steps.find((step) => step.ExpectedResult && step.ExpectedResult.match(urlRegex))
    if (stepWithUrl) {
      url = stepWithUrl.ExpectedResult.match(urlRegex)[0]
    }
  }

  return url
}

async function generateAndRunTests() {
  let jsonData
  try {
    jsonData = fs.readFileSync("testcases.json", "utf8")
  } catch (err) {
    console.log(
      JSON.stringify({
        event: "error",
        message: `Error reading testcases.json: ${err.message}`,
        timestamp: getTimestamp(),
      }),
    )
    process.stdout.write("") // Flush output
    return
  }

  let testcases
  try {
    testcases = JSON.parse(jsonData)
  } catch (err) {
    console.log(
      JSON.stringify({
        event: "error",
        message: `Error parsing testcases.json: ${err.message}`,
        timestamp: getTimestamp(),
      }),
    )
    process.stdout.write("") // Flush output
    return
  }

  let locatorsData = []
  try {
    if (fs.existsSync("locators.json")) {
      locatorsData = JSON.parse(fs.readFileSync("locators.json", "utf8"))
    }
  } catch (err) {
    console.log(
      JSON.stringify({
        event: "warning",
        message: `Could not load locators.json: ${err.message}`,
        timestamp: getTimestamp(),
      }),
    )
  }

  if (!Array.isArray(testcases)) {
    console.log(
      JSON.stringify({
        event: "error",
        message: "testcases.json must contain an array of test cases",
        timestamp: getTimestamp(),
      }),
    )
    process.stdout.write("") // Flush output
    return
  }

  if (testcases.length === 0) {
    console.log(
      JSON.stringify({ event: "error", message: "No test cases found in testcases.json", timestamp: getTimestamp() }),
    )
    process.stdout.write("") // Flush output
    return
  }

  for (let i = 0; i < testcases.length; i++) {
    if (fs.existsSync("stop.txt")) {
      console.log(
        JSON.stringify({ event: "info", message: "Test execution stopped by user.", timestamp: getTimestamp() }),
      )
      process.stdout.write("") // Flush output
      break
    }

    const tc = testcases[i]
    try {
      const testFileName = `${tc.TestCaseID}.spec.js`
      const testDataMap = {}

      if (Array.isArray(tc.TestData)) {
        tc.TestData.forEach((data) => {
          const [key, val] = data.split(":").map((s) => s.trim())
          if (key && val) testDataMap[key.toLowerCase()] = val
        })
      }

      const startUrl = extractFirstUrl(tc) || "about:blank"
      const loginUrl = i > 0 ? extractFirstUrl(testcases[0]) : startUrl

      const mostCommonLocatorType =
        locatorsData.length > 0
          ? locatorsData.reduce((acc, loc) => {
              if (loc.selectors && loc.selectors.length > 0) {
                const type = loc.selectors[0].includes("data-testid")
                  ? "data-testid"
                  : loc.selectors[0].includes("getByRole")
                    ? "role"
                    : loc.selectors[0].includes("getByText")
                      ? "text"
                      : "css"
                acc[type] = (acc[type] || 0) + 1
              }
              return acc
            }, {})
          : { text: 1 }

      const mostCommon = Object.keys(mostCommonLocatorType).reduce((a, b) =>
        mostCommonLocatorType[a] > mostCommonLocatorType[b] ? a : b,
      )

      console.log(
        JSON.stringify({
          event: "script_generation_started",
          testCaseID: tc.TestCaseID,
          description: tc.Description || "No description",
          status: "Generating Script",
          progress: `${i + 1}/${testcases.length}`,
          liveMessage: `Generating script for ${tc.TestCaseID}`,
          timestamp: getTimestamp(),
        }),
      )
      process.stdout.write("") // Flush output

      let prompt = `
You are an expert Playwright test automation engineer. Generate a robust, production-ready JavaScript test using @playwright/test.

**TEST CASE DETAILS:**
Test Case ID: ${tc.TestCaseID}
Description: ${tc.Description || "No description"}
Prerequisite: ${tc.Prerequisite || "None"}
Test Data: ${JSON.stringify(testDataMap)}
Starting URL: ${startUrl}

**AVAILABLE LOCATORS FOR ${startUrl}:**
${createLocatorMapping(locatorsData, startUrl, "Main Steps")}

**TEST STEPS:**
${
  Array.isArray(tc.Steps)
    ? tc.Steps.map((step) => {
        let stepText = `${step.StepNo}. ${step.Action} (Expected: ${step.ExpectedResult})`
        if (Array.isArray(step.TestData)) {
          stepText += ` (TestData: ${step.TestData.join(", ")})`
        }
        return stepText
      }).join("\n")
    : "No steps provided"
}

**CRITICAL REQUIREMENTS - FOLLOW EXACTLY:**

1. **LOCATOR USAGE PRIORITY** - Use ONLY from the provided locator mapping above:
   - ALWAYS use the FIRST locator from the mapping (highest priority)
   - If no mapping exists, use this priority: data-testid > role > text > placeholder > label > css
   - Most common locator type for this page: ${mostCommon}
   - NEVER invent selectors - only use what's provided

2. **ROBUST SELECTOR PATTERNS:**
   - data-testid: page.locator('[data-testid="login-button"]')
   - Role-based: page.getByRole('button', { name: 'Login' })
   - Text-based: page.getByText('Login', { exact: true })
   - Placeholder: page.getByPlaceholder('Enter username')
   - Label: page.getByLabel('Username')

3. **NAVIGATION & LOADING:**
   - Always start with: await page.goto('${startUrl}');
   - Wait for page load: await page.waitForLoadState('networkidle');
   - Add strategic waits: await page.waitForTimeout(2000);

4. **ELEMENT INTERACTIONS:**
   - Before every interaction: await page.waitForSelector(selector, { state: 'visible', timeout: 15000 });
   - For forms: await page.fill(selector, value);
   - For clicks: await page.click(selector);
   - For dropdowns: await page.selectOption(selector, value);

5. **ERROR HANDLING & ASSERTIONS:**
   - Wrap critical actions in try-catch blocks
   - Use specific assertions: expect(page).toHaveURL(), expect(element).toBeVisible()
   - Add timeout to assertions: expect(...).toBeVisible({ timeout: 10000 })

**TEST STRUCTURE TEMPLATE:**
\`\`\`javascript
const { test, expect } = require('@playwright/test');

test('${tc.TestCaseID} - ${tc.Description}', async ({ page }) => {
  // Navigation
  await page.goto('${startUrl}');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  
  // Test steps implementation using ONLY the provided locators
  // ... your code here ...
  
  // Final assertions
});
\`\`\`

Only return the complete test code inside \`\`\`javascript fences.
`

      if (i > 0 && tc.Prerequisite) {
        const firstTC = testcases[0]
        prompt += `

**PREREQUISITE HANDLING:**
Since prerequisite is "${tc.Prerequisite}", implement login first:

Reference Login URL: ${loginUrl}
Reference Login Steps:
${Array.isArray(firstTC.Steps) ? firstTC.Steps.map((step) => `${step.StepNo}. ${step.Action} (Expected: ${step.ExpectedResult || "N/A"}) (TestData: ${Array.isArray(step.TestData) ? step.TestData.join(", ") : "N/A"})`).join("\n") : "No reference steps available"}

Reference Login Test Data: ${JSON.stringify(firstTC.TestData || "None")}

**LOGIN LOCATORS:**
${createLocatorMapping(locatorsData, loginUrl, "Login Steps")}

Implement login steps first, then proceed with main test steps.
`
      }

      const testCode = await callGeminiAPI(prompt)

      if (testCode) {
        const filePath = path.join(__dirname, "tests", testFileName)
        try {
          fs.writeFileSync(filePath, testCode, { encoding: "utf-8" })
          console.log(
            JSON.stringify({
              event: "file_created",
              testCaseID: tc.TestCaseID,
              description: tc.Description || "No description",
              filePath,
              timestamp: getTimestamp(),
            }),
          )
          process.stdout.write("") // Flush output
          console.log(
            JSON.stringify({
              event: "code_generated",
              testCaseID: tc.TestCaseID,
              description: tc.Description || "No description",
              version: "initial",
              code: testCode,
              filePath,
              timestamp: getTimestamp(),
            }),
          )
          process.stdout.write("") // Flush output
        } catch (err) {
          console.log(
            JSON.stringify({
              event: "error",
              message: `Error saving test file ${testFileName}: ${err.message}`,
              timestamp: getTimestamp(),
            }),
          )
          process.stdout.write("") // Flush output
          continue
        }

        let attempt = 0
        const maxAttempts = 4
        let success = false

        while (attempt < maxAttempts && !success) {
          attempt++
          let runMessage
          let healingType = ""
          let liveMessage = ""

          if (attempt === 1) {
            runMessage = "Initial generated code is running"
            healingType = "initial"
            liveMessage = `Initial ${tc.TestCaseID} is running`
          } else if (attempt === 2) {
            runMessage = "Locally modified code is running"
            healingType = "local"
            liveMessage = `Local ${tc.TestCaseID} is healing`
          } else if (attempt === 3) {
            runMessage = "Gemini healed code is running"
            healingType = "gemini"
            liveMessage = `Gemini ${tc.TestCaseID} is healing`
          } else if (attempt === 4) {
            runMessage = "Advanced self-healed code is running"
            healingType = "advanced"
            liveMessage = `Advanced ${tc.TestCaseID} is healing`
          }

          console.log(
            JSON.stringify({
              event: "test_execution_started",
              message: runMessage,
              testCaseID: tc.TestCaseID,
              attempt: attempt,
              healingType: healingType,
              liveMessage: liveMessage,
              status: "Running",
              timestamp: getTimestamp(),
            }),
          )
          process.stdout.write("") // Flush output

          try {
            execSync(`npx playwright test tests/${testFileName} --headed --reporter=json > playwright-output.json`, {
              stdio: "pipe",
              timeout: 30000,
            })
            success = true
            console.log(
              JSON.stringify({
                event: "test_passed",
                testCaseID: tc.TestCaseID,
                description: tc.Description || "No description",
                attempt: attempt,
                healingType: healingType,
                status: "Passed",
                liveMessage: `${tc.TestCaseID} passed successfully`,
                timestamp: getTimestamp(),
              }),
            )
            process.stdout.write("") // Flush output
          } catch (err) {
            const errorMsg = parseErrorMessage(err)
            const screenshotPath = await captureScreenshot(tc.TestCaseID, attempt)

            const currentCode = fs.readFileSync(filePath, "utf8")
            logError(tc.TestCaseID, errorMsg, attempt, healingType, currentCode, screenshotPath)

            console.log(
              JSON.stringify({
                event: "test_failed",
                testCaseID: tc.TestCaseID,
                description: tc.Description || "No description",
                error: errorMsg,
                attempt: attempt,
                healingType: healingType,
                screenshotPath: screenshotPath,
                status: "Failed",
                liveMessage: `${tc.TestCaseID} failed - attempt ${attempt}`,
                timestamp: getTimestamp(),
              }),
            )
            process.stdout.write("") // Flush output

            if (attempt === maxAttempts) break

            const nextHealingType = attempt === 1 ? "local" : attempt === 2 ? "gemini" : "advanced"
            const nextLiveMessage = `${nextHealingType.charAt(0).toUpperCase() + nextHealingType.slice(1)} ${tc.TestCaseID} is healing`

            console.log(
              JSON.stringify({
                event: "self_healing_started",
                testCaseID: tc.TestCaseID,
                description: tc.Description || "No description",
                attempt: attempt,
                type: nextHealingType,
                status: "Self-healing",
                liveMessage: nextLiveMessage,
                timestamp: getTimestamp(),
              }),
            )
            process.stdout.write("") // Flush output

            let updatedCode = fs.readFileSync(filePath, "utf8")

            if (attempt === 1) {
              // Local fix
              updatedCode = applyLocalFix(updatedCode, errorMsg)
              console.log(
                JSON.stringify({
                  event: "local_fix_applied",
                  message: `Applied local fix for ${tc.TestCaseID} (attempt ${attempt})`,
                  testCaseID: tc.TestCaseID,
                  liveMessage: `Local healing applied to ${tc.TestCaseID}`,
                  timestamp: getTimestamp(),
                }),
              )
              process.stdout.write("") // Flush output
            } else if (attempt === 2) {
              const failingStepNo = errorMsg.match(/step (\d+)/i) ? errorMsg.match(/step (\d+)/i)[1] : "unknown"
              const failingUrl = startUrl
              const testCasePrettyJSON = JSON.stringify(tc, null, 2)

              const enhancedPrompt = `
HEALING ATTEMPT - Previous failure: ${errorMsg}

Failing step (estimated): Step ${failingStepNo} (URL: ${failingUrl || "unknown"})

Locator Mapping for Failing URL:
${createLocatorMapping(locatorsData, failingUrl || "No URL", failingStepNo)}

Using the Dynamic Locators for URL ${failingUrl || "unknown"}, fix the failing selector by:
1. Analyzing the error message to identify the failing selector
2. Finding alternative selectors from the Dynamic Locators JSON for the same element
3. Replacing the failing selector with the highest priority alternative
4. If no suitable locator is found or there's ambiguity, use the most common locator type: ${mostCommon}
5. Ensuring proper Playwright syntax

Focus on the failing step and use robust locators from the provided mapping.

Original test case data:
${testCasePrettyJSON}

Failing step (estimated): Step ${failingStepNo} (URL: ${failingUrl || "unknown"})

Locator Mapping for Failing URL:
${createLocatorMapping(locatorsData, failingUrl || "No URL", failingStepNo)}

Most common locator type for this page: ${mostCommon}

CRITICAL HEALING INSTRUCTIONS:
1. Analyze the error to identify the exact failure point
2. Use ONLY the locators provided in the Dynamic Locators JSON for URL ${failingUrl || "unknown"}
3. Replace ALL unreliable selectors with robust alternatives from the mapping
4. If no suitable locator is found or there's ambiguity (e.g., multiple equally valid locators), use the most common locator type: ${mostCommon}
5. Ensure proper error handling and waiting strategies
6. Validate that all locators exist in the provided mapping
7. If element not found in mapping, use the most specific available selector based on ${mostCommon}
8. Use proper Playwright syntax and await for all actions
9. Only return the code inside \`\`\`javascript fences

${screenshotPath ? "SCREENSHOT ANALYSIS: A screenshot of the failure has been provided. Analyze the visual state to understand what went wrong and identify correct selectors based on visible elements." : ""}
`

              updatedCode = await callGeminiAPI(enhancedPrompt, screenshotPath)

              if (updatedCode) {
                console.log(
                  JSON.stringify({
                    event: "gemini_fix_applied",
                    message: `Applied enhanced Gemini fix for ${tc.TestCaseID} (attempt ${attempt}) with screenshot analysis`,
                    testCaseID: tc.TestCaseID,
                    screenshotUsed: !!screenshotPath,
                    liveMessage: `Gemini healing applied to ${tc.TestCaseID}`,
                    timestamp: getTimestamp(),
                  }),
                )
                process.stdout.write("") // Flush output
              }
            } else if (attempt === 3) {
              updatedCode = applyAdvancedSelfHealing(updatedCode, errorMsg, tc)
              console.log(
                JSON.stringify({
                  event: "advanced_fix_applied",
                  message: `Applied advanced self-healing for ${tc.TestCaseID} (attempt ${attempt})`,
                  testCaseID: tc.TestCaseID,
                  liveMessage: `Advanced healing applied to ${tc.TestCaseID}`,
                  timestamp: getTimestamp(),
                }),
              )
              process.stdout.write("") // Flush output
            }

            if (updatedCode) {
              fs.writeFileSync(filePath, updatedCode, { encoding: "utf-8" })
              console.log(
                JSON.stringify({
                  event: "code_generated",
                  testCaseID: tc.TestCaseID,
                  description: tc.Description || "No description",
                  version: healingType,
                  code: updatedCode,
                  filePath,
                  timestamp: getTimestamp(),
                }),
              )
              process.stdout.write("") // Flush output
            } else {
              console.log(
                JSON.stringify({
                  event: "error",
                  message: `No updated code generated for ${tc.TestCaseID} (attempt ${attempt})`,
                  timestamp: getTimestamp(),
                }),
              )
              process.stdout.write("") // Flush output
              break
            }
          }
        }

        if (!success) {
          console.log(
            JSON.stringify({
              event: "test_final_failure",
              message: `Test ${tc.TestCaseID} failed after ${maxAttempts} attempts.`,
              testCaseID: tc.TestCaseID,
              healingType: "final_failure",
              status: "Failed",
              liveMessage: `${tc.TestCaseID} failed after all attempts`,
              timestamp: getTimestamp(),
            }),
          )
          process.stdout.write("") // Flush output
        }
      } else {
        console.log(
          JSON.stringify({
            event: "error",
            message: `No code block found in Gemini response for ${tc.TestCaseID}.`,
            timestamp: getTimestamp(),
          }),
        )
        process.stdout.write("") // Flush output
      }
    } catch (err) {
      console.log(
        JSON.stringify({
          event: "error",
          message: `Error processing test case ${tc.TestCaseID}: ${err.message}`,
          timestamp: getTimestamp(),
          stack: err.stack,
        }),
      )
      process.stdout.write("") // Flush output
    }
  }

  console.log(
    JSON.stringify({
      event: "all_tests_completed",
      message: "All test cases processed.",
      timestamp: getTimestamp(),
    }),
  )
  process.stdout.write("") // Flush output
}

generateAndRunTests()
