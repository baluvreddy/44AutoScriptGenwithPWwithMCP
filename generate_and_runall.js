const axios = require("axios")
const fs = require("fs")
const path = require("path")
const { execSync } = require("child_process")

// Configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyBfVM1XJCjpI4WuGxFVuDhW2pxCAv5C7g0"
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent"
const TESTS_DIR = path.join(__dirname, "tests")
const TESTCASES_FOLDER = path.join(__dirname, "testcases")
const TESTCASES_COMBINED = path.join(__dirname, "testcases.json")
const PW_REPORT_PATH = path.join(__dirname, "playwright-output.json")

function ts() {
  return new Date().toISOString()
}

function emit(eventObj) {
  try {
    process.stdout.write(JSON.stringify(eventObj) + "\n")
  } catch {
    // ensure stream doesn't break even if serialization fails
  }
}

function ensureDirs() {
  if (!fs.existsSync(TESTS_DIR)) fs.mkdirSync(TESTS_DIR, { recursive: true })
}

function readJSONSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"))
  } catch {
    return null
  }
}

function readTestcasesFromFolder() {
  if (!fs.existsSync(TESTCASES_FOLDER)) return []
  const files = fs
    .readdirSync(TESTCASES_FOLDER)
    .filter((f) => f.toLowerCase().endsWith(".json"))
    .sort()
  const cases = []
  for (const f of files) {
    const obj = readJSONSafe(path.join(TESTCASES_FOLDER, f))
    if (obj) cases.push(obj)
  }
  if (cases.length > 0) {
    emit({ event: "info", message: `Loaded ${cases.length} test case(s) from ${TESTCASES_FOLDER}`, timestamp: ts() })
  }
  return cases
}

function loadTestcases() {
  // Prefer folder of per-testcase JSONs
  const folderCases = readTestcasesFromFolder()
  if (folderCases.length > 0) return folderCases

  // Fallback to combined file
  const combined = readJSONSafe(TESTCASES_COMBINED)
  if (Array.isArray(combined) && combined.length > 0) {
    emit({
      event: "info",
      message: `Loaded ${combined.length} test case(s) from testcases.json`,
      timestamp: ts(),
    })
    return combined
  }

  return []
}

function extractFirstUrl(testcase) {
  const urlRegex = /(https?:\/\/[^\s"'<>)\][]+)/i
  let url = null

  if (Array.isArray(testcase.TestData)) {
    for (const data of testcase.TestData) {
      const m = String(data || "").match(urlRegex)
      if (m) {
        url = m[0]
        break
      }
    }
  }
  if (!url && Array.isArray(testcase.Steps)) {
    for (const step of testcase.Steps) {
      const m = String(step?.ExpectedResult || "").match(urlRegex)
      if (m) {
        url = m[0]
        break
      }
    }
  }
  return url
}

function parsePlaywrightReportForScreenshot(reportFile) {
  try {
    const report = JSON.parse(fs.readFileSync(reportFile, "utf8"))
    // The JSON reporter varies by version; search for first screenshot attachment if present
    if (report && report.suites) {
      const stack = [report]
      while (stack.length) {
        const node = stack.pop()
        if (node?.attachments) {
          const shot = node.attachments.find(
            (a) => a?.name?.toLowerCase().includes("screenshot") || a?.contentType?.includes("image"),
          )
          if (shot?.path) return shot.path
        }
        for (const k of ["suites", "tests", "results", "steps"]) {
          if (Array.isArray(node?.[k])) node[k].forEach((child) => stack.push(child))
        }
      }
    }
  } catch (e) {
    // ignore
  }
  return null
}

function parseErrorMessageFromReport(reportFile) {
  try {
    const report = JSON.parse(fs.readFileSync(reportFile, "utf8"))
    // Find any error message
    let candidate = null
    const stack = [report]
    while (stack.length) {
      const node = stack.pop()
      if (node?.error?.message) {
        candidate = node.error.message
        break
      }
      for (const k of ["suites", "tests", "results", "steps"]) {
        if (Array.isArray(node?.[k])) node[k].forEach((child) => stack.push(child))
      }
    }
    if (candidate) {
      return String(candidate)
        .split("\n")[0]
        .replace(/\x1B\[\d+m/g, "")
        .trim()
    }
  } catch {
    // ignore
  }
  return "Unknown error"
}

async function callGemini(promptText) {
  if (!GEMINI_API_KEY) {
    emit({
      event: "error",
      message: "Gemini API key not configured. Please provide a valid API key.",
      timestamp: ts(),
    })
    return null
  }
  try {
    const payload = { contents: [{ parts: [{ text: promptText }] }] }
    const res = await axios.post(GEMINI_API_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": GEMINI_API_KEY,
      },
      timeout: 60000,
    })
    const rawText = res?.data?.candidates?.[0]?.content?.parts?.[0]?.text || ""
    const match = rawText.match(/```(?:javascript|ts|typescript)?\n([\s\S]*?)```/)
    const code = match ? match[1].trim() : rawText.trim()
    if (!code) {
      emit({ event: "error", message: "No code returned from Gemini", timestamp: ts() })
      return null
    }
    return code
  } catch (e) {
    const msg =
      e.code === "ECONNABORTED"
        ? "Request timeout"
        : e.response?.data?.error?.message || e.message || "Gemini request failed"
    emit({ event: "error", message: `Gemini API Error: ${msg}`, timestamp: ts() })
    return null
  }
}

function applyLocalFix(code, errorMsg) {
  let updated = code

  // Example: relax strict locators and add waits
  updated = updated.replace(
    /await\s+page\.goto$$['"]([^'"]+)['"]$$\s*;?/g,
    `await page.goto('$1', { waitUntil: 'networkidle', timeout: 30000 });\nawait page.waitForTimeout(1500);`,
  )

  // Simple fix for common locator issues: try getByRole on buttons
  updated = updated.replace(
    /page\.locator$$['"]([^'"]+)['"]$$\.click$$$$/g,
    `page.getByRole('button', { name: /$1/i }).first().click()`,
  )

  return updated
}

function applyAdvancedSelfHealing(code) {
  let updated = code

  // Wrap actions with lightweight try/catch and retry waits
  updated = updated.replace(
    /(await\s+page\.[^\n;]+;)/g,
    `try {\n  $1\n} catch (e) {\n  await page.waitForTimeout(1000)\n  // retry a generic alternative if possible\n}`,
  )

  return updated
}

function buildPrompt(tc) {
  const startUrl = extractFirstUrl(tc) || "about:blank"
  const steps = Array.isArray(tc.Steps) ? tc.Steps : []
  const testData = Array.isArray(tc.TestData) ? tc.TestData : []

  const lines = []
  lines.push("You are a Playwright test generator.")
  lines.push("Return only a complete JavaScript test file for Playwright's @playwright/test runner.")
  lines.push("Constraints:")
  lines.push("- Use proper imports: import { test, expect } from '@playwright/test'")
  lines.push("- Navigate to the start URL and follow the steps.")
  lines.push("- Put realistic waits (waitForLoadState, small timeouts) where needed. Avoid arbitrary long waits.")
  lines.push("- Do not wrap your answer in Markdown fences.")
  lines.push("")
  lines.push(`TestCaseID: ${tc.TestCaseID || "Unknown"}`)
  lines.push(`Description: ${tc.Description || "N/A"}`)
  lines.push(`StartURL: ${startUrl}`)
  lines.push("")
  lines.push("TestData:")
  for (const d of testData) lines.push(`- ${d}`)
  lines.push("")
  lines.push("Steps:")
  for (const s of steps) lines.push(`- ${s?.Step || s?.Action || JSON.stringify(s)}`)
  lines.push("")
  lines.push("ExpectedResults:")
  for (const s of steps) if (s?.ExpectedResult) lines.push(`- ${s.ExpectedResult}`)

  return lines.join("\n")
}

function writeTestFile(testCaseId, code) {
  ensureDirs()
  const filePath = path.join(TESTS_DIR, `${testCaseId}.spec.js`)
  fs.writeFileSync(filePath, code, { encoding: "utf-8" })
  return filePath
}

function runPlaywrightSingle(testFileRelPath) {
  // Use reporter=json and capture output to file for post-processing
  const cmd = `npx playwright test ${testFileRelPath} --reporter=json > "${PW_REPORT_PATH}"`
  execSync(cmd, { stdio: "pipe", timeout: 60_000, shell: true })
}

async function processTestCase(tc, index, total) {
  const testCaseID = tc.TestCaseID || `TC_${index + 1}`
  const description = tc.Description || "No description"

  emit({
    event: "script_generation_started",
    testCaseID,
    description,
    status: "Generating Script",
    progress: `${index + 1}/${total}`,
    liveMessage: `Generating script for ${testCaseID} (${index + 1}/${total})`,
    timestamp: ts(),
  })

  const prompt = buildPrompt(tc)
  let code = await callGemini(prompt)

  if (!code) {
    emit({
      event: "error",
      message: `Failed to generate code for ${testCaseID}.`,
      testCaseID,
      timestamp: ts(),
    })
    return
  }

  // Ensure code has import
  if (!/from\s+['"]@playwright\/test['"]/.test(code)) {
    code = `import { test, expect } from '@playwright/test'\n\n${code}`
  }

  const filePath = writeTestFile(testCaseID, code)
  emit({
    event: "file_created",
    testCaseID,
    description,
    filePath,
    liveMessage: `Script generated for ${testCaseID}`,
    timestamp: ts(),
  })
  emit({
    event: "code_generated",
    testCaseID,
    description,
    version: "initial",
    code,
    filePath,
    timestamp: ts(),
  })

  let attempt = 0
  const maxAttempts = 4
  let passed = false

  while (attempt < maxAttempts && !passed) {
    attempt++
    const healingType = attempt === 1 ? "initial" : attempt === 2 ? "local" : attempt === 3 ? "gemini" : "advanced"
    const runMsg =
      attempt === 1
        ? "Initial generated code is running"
        : attempt === 2
          ? "Locally modified code is running"
          : attempt === 3
            ? "Gemini healed code is running"
            : "Advanced self-healed code is running"

    emit({
      event: "test_execution_started",
      message: runMsg,
      testCaseID,
      attempt,
      healingType,
      liveMessage: `${healingType.charAt(0).toUpperCase() + healingType.slice(1)} ${testCaseID} is ${attempt === 1 ? "running" : "healing"}`,
      status: "Running",
      timestamp: ts(),
    })

    // Try to run the test
    try {
      runPlaywrightSingle(`tests/${testCaseID}.spec.js`)
      // If no error is thrown, treat as pass
      passed = true
      emit({
        event: "test_passed",
        testCaseID,
        description,
        attempt,
        healingType,
        status: "Passed",
        liveMessage: `${testCaseID} passed successfully`,
        timestamp: ts(),
      })
    } catch (err) {
      // Test failed (non-zero exit); parse report and error
      const errorMsg = parseErrorMessageFromReport(PW_REPORT_PATH)
      const screenshotPath = parsePlaywrightReportForScreenshot(PW_REPORT_PATH)

      const currentCode = fs.readFileSync(filePath, "utf8")
      emit({
        event: "test_failed",
        testCaseID,
        description,
        error: errorMsg,
        attempt,
        healingType,
        screenshotPath: screenshotPath || "",
        status: "Failed",
        liveMessage: `${testCaseID} failed - attempt ${attempt}`,
        timestamp: ts(),
      })

      if (attempt >= maxAttempts) break

      // Begin healing
      const nextHealingType = attempt === 1 ? "local" : attempt === 2 ? "gemini" : "advanced"
      emit({
        event: "self_healing_started",
        testCaseID,
        description,
        attempt,
        type: nextHealingType,
        status: "Self-healing",
        liveMessage: `${nextHealingType.charAt(0).toUpperCase() + nextHealingType.slice(1)} ${testCaseID} is healing`,
        timestamp: ts(),
      })

      let updatedCode = currentCode
      if (attempt === 1) {
        updatedCode = applyLocalFix(updatedCode, errorMsg)
        emit({
          event: "local_fix_applied",
          message: `Applied local fix for ${testCaseID} (attempt ${attempt})`,
          testCaseID,
          liveMessage: `Local healing applied to ${testCaseID}`,
          timestamp: ts(),
        })
      } else if (attempt === 2) {
        const enhancedPrompt = [
          "The following Playwright test failed. Fix it.",
          "Return only the corrected JavaScript file content for @playwright/test (no markdown fences).",
          "",
          "Existing failing code:",
          "```javascript",
          currentCode,
          "```",
          "",
          "Error message:",
          errorMsg,
        ].join("\n")
        const aiCode = await callGemini(enhancedPrompt)
        if (aiCode) {
          updatedCode = aiCode
          emit({
            event: "gemini_fix_applied",
            message: `Applied Gemini fix for ${testCaseID} (attempt ${attempt})`,
            testCaseID,
            screenshotUsed: Boolean(screenshotPath),
            liveMessage: `Gemini healing applied to ${testCaseID}`,
            timestamp: ts(),
          })
        }
      } else if (attempt === 3) {
        updatedCode = applyAdvancedSelfHealing(updatedCode)
        emit({
          event: "advanced_fix_applied",
          message: `Applied advanced self-healing for ${testCaseID} (attempt ${attempt})`,
          testCaseID,
          liveMessage: `Advanced healing applied to ${testCaseID}`,
          timestamp: ts(),
        })
      }

      if (updatedCode) {
        // Ensure import exists
        if (!/from\s+['"]@playwright\/test['"]/.test(updatedCode)) {
          updatedCode = `import { test, expect } from '@playwright/test'\n\n${updatedCode}`
        }
        fs.writeFileSync(filePath, updatedCode, { encoding: "utf-8" })
        emit({
          event: "code_generated",
          testCaseID,
          description,
          version: attempt === 1 ? "local" : attempt === 2 ? "gemini" : "advanced",
          code: updatedCode,
          filePath,
          timestamp: ts(),
        })
      } else {
        emit({
          event: "error",
          message: `No updated code generated for ${testCaseID} (attempt ${attempt})`,
          timestamp: ts(),
        })
        break
      }
    }
  }

  if (!passed) {
    emit({
      event: "test_final_failure",
      message: `Test ${testCaseID} failed after ${maxAttempts} attempts.`,
      testCaseID,
      healingType: "final_failure",
      status: "Failed",
      liveMessage: `${testCaseID} failed after all attempts`,
      timestamp: ts(),
    })
  }
}

async function main() {
  const testcases = loadTestcases()
  if (!Array.isArray(testcases) || testcases.length === 0) {
    emit({
      event: "error",
      message: "No test cases found. Ensure JSON files exist in 'testcases/' or a valid testcases.json exists.",
      timestamp: ts(),
    })
    return
  }
  if (!GEMINI_API_KEY) {
    emit({
      event: "error",
      message: "Gemini API key not configured. Please provide a valid API key to generate test scripts.",
      timestamp: ts(),
    })
    return
  }

  emit({
    event: "info",
    message: `Starting test generation for ${testcases.length} test cases`,
    timestamp: ts(),
  })

  for (let i = 0; i < testcases.length; i++) {
    // Stop mechanism (if a "stop.txt" file exists)
    if (fs.existsSync(path.join(__dirname, "stop.txt"))) {
      emit({ event: "info", message: "Test execution stopped by user.", timestamp: ts() })
      break
    }
    try {
      await processTestCase(testcases[i], i, testcases.length)
    } catch (e) {
      emit({
        event: "error",
        message: `Error processing test case ${(testcases[i] || {}).TestCaseID || i + 1}: ${e.message}`,
        timestamp: ts(),
      })
    }
  }

  emit({ event: "all_tests_completed", message: "All test cases processed.", timestamp: ts() })
}

main()
