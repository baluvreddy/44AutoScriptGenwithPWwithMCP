let testCount = 0
let currentTest = 0

function navigatePage() {
  const page = document.getElementById("pageSelect").value
  document.getElementById("homePage").style.display = page === "home" ? "block" : "none"
  document.getElementById("codeComparisonPage").style.display = page === "codeComparison" ? "block" : "none"
  document.getElementById("errorLogsPage").style.display = page === "errorLogs" ? "block" : "none"

  if (page === "codeComparison") {
    loadTestCases()
  } else if (page === "errorLogs") {
    loadErrorLogs()
  }
}

async function uploadExcel() {
  const fileInput = document.getElementById("excelFile")
  const apiKey = document.getElementById("apiKey").value
  if (!fileInput.files.length) {
    document.getElementById("excelStatus").innerHTML =
      '<span style="color: #ff4d4d;">Please select an Excel file.</span>'
    return
  }
  const formData = new FormData()
  formData.append("file", fileInput.files[0])
  document.getElementById("excelStatus").innerHTML = '<span class="circle-loading rotating">⟳</span> Parsing Excel...'
  try {
    const response = await fetch("/upload-excel/", {
      method: "POST",
      body: formData,
    })
    const result = await response.json()
    console.log("Upload response:", result) // Debug log
    if (response.ok) {
      document.getElementById("excelStatus").innerHTML = `<span style="color: #00ff7f;">${result.message}</span>`
      const jsonContainer = document.getElementById("jsonContainer")
      const jsonContent = document.getElementById("jsonContent")
      const fullJson = JSON.stringify(result.testcases, null, 2)

      jsonContent.textContent = fullJson
      jsonContainer.style.display = "block"

      document.getElementById("downloadJsonBtn").disabled = false
      document.getElementById("runTestsBtn").disabled = false

      testCount = result.testcases.length
      currentTest = 0
    } else {
      document.getElementById("excelStatus").innerHTML = `<span style="color: #ff4d4d;">${result.detail}</span>`
    }
  } catch (error) {
    document.getElementById("excelStatus").innerHTML = `<span style="color: #ff4d4d;">Error: ${error.message}</span>`
    console.error("Upload error:", error) // Debug log
  }
}

async function downloadJson() {
  window.location.href = "/download-json/"
}

async function runTests() {
  const apiKey = document.getElementById("apiKey").value
  document.getElementById("testStatus").innerHTML =
    '<span class="circle-loading rotating">⟳</span> Starting test execution...'
  document.getElementById("runTestsBtn").disabled = true
  document.getElementById("stopTestsBtn").disabled = false
  document.getElementById("progress").style.width = "0%"
  try {
    const response = await fetch("/run-tests/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey }),
    })
    const result = await response.json()
    document.getElementById("testStatus").innerHTML =
      `<span class="circle-loading rotating">⟳</span> <span style="color: #00ff7f;">${result.message}</span>`
    pollTestStatuses()
  } catch (error) {
    document.getElementById("testStatus").innerHTML = `<span style="color: #ff4d4d;">Error: ${error.message}</span>`
    document.getElementById("runTestsBtn").disabled = false
    document.getElementById("stopTestsBtn").disabled = true
  }
}

async function stopTests() {
  document.getElementById("testStatus").innerHTML =
    '<span class="circle-loading rotating">⟳</span> Stopping test execution...'
  document.getElementById("stopTestsBtn").disabled = true
  try {
    const response = await fetch("/stop-tests/", { method: "POST" })
    const result = await response.json()
    document.getElementById("testStatus").innerHTML = `<span style="color: #ff4d4d;">${result.message}</span>`
    document.getElementById("runTestsBtn").disabled = false
  } catch (error) {
    document.getElementById("testStatus").innerHTML = `<span style="color: #ff4d4d;">Error: ${error.message}</span>`
    document.getElementById("runTestsBtn").disabled = false
  }
}

async function pollTestStatuses() {
  const tableContainer = document.getElementById("statusTableContainer")
  const updateTable = async () => {
    try {
      const response = await fetch("/test-statuses/")
      const statuses = await response.json()

      const currentStatusResponse = await fetch("/current-status/")
      const currentStatus = await currentStatusResponse.json()

      updateStatistics(statuses)
      updateLiveStatus(currentStatus)

      let tableHtml = `
                <table>
                    <tr>
                        <th>Test Case ID</th>
                        <th>Test Case Description</th>
                        <th>Status</th>
                        <th>Attempt</th>
                        <th>Healing Type</th>
                        <th>Failure Reason</th>
                        <th>Timestamp</th>
                        <th>Actions</th>
                    </tr>
            `
      statuses.forEach((row) => {
        let statusText = row.Status
        const statusClass = row.Status.toLowerCase().replace(/[^a-z]/g, "-")

        if (
          row.Status === "Running" ||
          row.Status === "Self-healing" ||
          row.Status === "Generating Script" ||
          row.Status === "Script Generated" ||
          row.Status === "Local Fix Applied" ||
          row.Status === "AI Fix Applied"
        ) {
          let loadingIcon = '<span class="circle-loading rotating">⟳</span>'
          if (row.Status === "Generating Script") loadingIcon = '<span class="circle-loading fast rotating">⚙</span>'

          statusText = `${loadingIcon} ${row.Status}`

          if (row.Attempts > 0) {
            statusText += ` - Attempt ${row.Attempts}`
          }
          if (row["Healing Type"] && row["Healing Type"] !== "initial") {
            statusText += ` (${row["Healing Type"]})`
          }
        }

        let failureReason = row["Failure Reason"] || "-"
        if (row["Screenshot Path"]) {
          failureReason += ` <a href="${row["Screenshot Path"]}" target="_blank" class="screenshot-link">📸 View Screenshot</a>`
        }

        tableHtml += `
                    <tr>
                        <td>${row["Test Case ID"]}</td>
                        <td>${row["Test Case Description"]}</td>
                        <td><span class="status-${statusClass}">${statusText}</span></td>
                        <td>${row.Attempts || 0}</td>
                        <td><span class="healing-type-${(row["Healing Type"] || "initial").replace(/[^a-z]/g, "-")}">${row["Healing Type"] || "Initial"}</span></td>
                        <td>${failureReason}</td>
                        <td>${row.Timestamp}</td>
                        <td>
                            <button onclick="viewTestCode('${row["Test Case ID"]}')" class="action-btn">📝 View Code</button>
                        </td>
                    </tr>
                `
      })
      tableHtml += "</table>"
      tableContainer.innerHTML = tableHtml

      const completedCount = statuses.filter((s) => ["Passed", "Failed"].includes(s.Status)).length
      const inProgressCount = statuses.filter((s) =>
        [
          "Running",
          "Generating Script",
          "Script Generated",
          "Local Fix Applied",
          "AI Fix Applied",
          "Self-healing",
        ].includes(s.Status),
      ).length

      if (statuses.length > testCount) {
        testCount = statuses.length
      }

      document.getElementById("progress").style.width = `${(completedCount / testCount) * 100}%`

      if (
        inProgressCount > 0 ||
        statuses.some((s) =>
          [
            "Running",
            "Generating Script",
            "Script Generated",
            "Local Fix Applied",
            "AI Fix Applied",
            "Self-healing",
          ].includes(s.Status),
        )
      ) {
        setTimeout(updateTable, 50) // Faster polling for more responsive updates
      } else {
        document.getElementById("runTestsBtn").disabled = false
        document.getElementById("stopTestsBtn").disabled = true
        document.getElementById("testStatus").innerHTML = '<span style="color: #00ff7f;">All tests processed.</span>'
      }
    } catch (error) {
      document.getElementById("testStatus").innerHTML =
        `<span style="color: #ff4d4d;">Error polling statuses: ${error.message}</span>`
      document.getElementById("runTestsBtn").disabled = false
      document.getElementById("stopTestsBtn").disabled = true
    }
  }
  await updateTable()
}

function updateLiveStatus(currentStatus) {
  const statusElement = document.getElementById("testStatus")
  const statusMessages = []

  for (const [testCaseId, status] of Object.entries(currentStatus)) {
    if (status.includes("Running") || status.includes("Generating") || status.includes("Self-healing")) {
      let message = ""
      const loadingIcon = '<span class="circle-loading rotating">⟳</span>' // More visible rotating symbol

      if (
        status.includes("initial") ||
        (!status.includes("local") && !status.includes("gemini") && !status.includes("advanced"))
      ) {
        message = `${loadingIcon} ${testCaseId} is running on attempt 1`
      } else if (status.includes("local")) {
        message = `${loadingIcon} ${testCaseId} is healing (Local) on attempt 2`
      } else if (status.includes("gemini")) {
        message = `${loadingIcon} ${testCaseId} is healing (Gemini AI) on attempt 3`
      } else if (status.includes("advanced")) {
        message = `${loadingIcon} ${testCaseId} is healing (Advanced) on attempt 4`
      } else if (status.includes("Generating")) {
        message = `<span class="circle-loading fast rotating">⚙</span> Generating script for ${testCaseId}`
      } else {
        message = `${loadingIcon} ${testCaseId} is ${status.toLowerCase()}`
      }
      statusMessages.push(message)
    }
  }

  if (statusMessages.length > 0) {
    statusElement.innerHTML = `<span style="color: #00ff7f;" class="live-status">${statusMessages.join(" | ")}</span>`
  } else if (Object.keys(currentStatus).length > 0) {
    statusElement.innerHTML = '<span style="color: #00ff7f;">All tests processed.</span>'
  }
}

function updateStatistics(statuses) {
  const totalTests = statuses.length
  const passedTests = statuses.filter((s) => s.Status === "Passed").length
  const failedTests = statuses.filter((s) => s.Status === "Failed").length
  const inProgressTests = statuses.filter((s) =>
    ["Running", "Generating Script", "Script Generated", "Local Fix Applied", "AI Fix Applied"].includes(s.Status),
  ).length
  const healingTests = statuses.filter((s) => s.Status === "Self-healing").length

  document.getElementById("totalTests").textContent = totalTests
  document.getElementById("passedTests").textContent = passedTests
  document.getElementById("failedTests").textContent = failedTests
  document.getElementById("inProgressTests").textContent = inProgressTests
  document.getElementById("healingTests").textContent = healingTests
}

async function viewTestCode(testCaseId) {
  document.getElementById("pageSelect").value = "codeComparison"
  navigatePage()

  setTimeout(async () => {
    await loadTestCases()
    document.getElementById("testCaseSelect").value = testCaseId
    await loadCodeComparison()
  }, 100)
}

async function loadTestCases() {
  const select = document.getElementById("testCaseSelect")
  try {
    const response = await fetch("/test-statuses/")
    const statuses = await response.json()
    select.innerHTML =
      '<option value="">Select Test Case</option>' +
      statuses.map((s) => `<option value="${s["Test Case ID"]}">${s["Test Case ID"]}</option>`).join("")
  } catch (error) {
    document.getElementById("codeComparison").innerHTML =
      `<span style="color: #ff4d4d;">Error loading test cases: ${error.message}</span>`
  }
}

async function loadCodeComparison() {
  const testCaseId = document.getElementById("testCaseSelect").value
  const comparisonDiv = document.getElementById("codeComparison")
  if (!testCaseId) {
    comparisonDiv.innerHTML = '<span style="color: #ff4d4d;">Please select a test case.</span>'
    return
  }
  try {
    const [codesRes, promptRes, statusRes] = await Promise.all([
      fetch(`/test-codes/${testCaseId}`),
      fetch(`/healing-prompt/${testCaseId}`),
      fetch(`/test-statuses/`),
    ])
    const codes = await codesRes.json()
    const prompt = await promptRes.json()
    const statuses = await statusRes.json()

    const testStatus = statuses.find((s) => s["Test Case ID"] === testCaseId)
    const successfulHealingType = testStatus?.["Healing Type"] || "initial"
    const testPassed = testStatus?.Status === "Passed"

    comparisonDiv.innerHTML = `<h3>Test Case ID: ${testCaseId}</h3>`

    if (testPassed) {
      comparisonDiv.innerHTML += `<div class="test-result-success">✅ Test PASSED on ${successfulHealingType === "initial" ? "initial attempt" : successfulHealingType + " healing attempt"}</div>`
    } else if (testStatus?.Status === "Failed") {
      comparisonDiv.innerHTML += `<div class="test-result-failed">❌ Test FAILED after all attempts</div>`
    }

    if (prompt.prompt) {
      comparisonDiv.innerHTML += `
                <h4>Full Healing Prompt</h4>
                <p>Generated at: ${prompt.timestamp}</p>
                <pre>${prompt.prompt}</pre>
            `
    }
    ;["initial", "local", "gemini", "advanced"].forEach((version) => {
      const versionName =
        version === "advanced" ? "Advanced Self-Healing" : version.charAt(0).toUpperCase() + version.slice(1)

      let versionHeader = `<h4>${versionName} Version`

      if (
        testPassed &&
        ((version === "initial" && successfulHealingType === "initial") || version === successfulHealingType)
      ) {
        versionHeader += ` <span class="success-indicator">✅ PASSED</span>`
      }
      versionHeader += `</h4>`

      const codeContent = codes[version] || `No ${versionName.toLowerCase()} version generated.`

      const isSuccessfulVersion =
        testPassed &&
        ((version === "initial" && successfulHealingType === "initial") || version === successfulHealingType)
      const codeClass = isSuccessfulVersion ? "code-successful" : "code-default"

      comparisonDiv.innerHTML += `
                ${versionHeader}
                <pre class="${codeClass}">${codeContent}</pre>
            `
    })
  } catch (error) {
    comparisonDiv.innerHTML = `<span style="color: #ff4d4d;">Error loading code comparison: ${error.message}</span>`
  }
}

async function loadErrorLogs() {
  const container = document.getElementById("errorLogsContainer")
  try {
    const response = await fetch("/error-logs/")
    const errorLogs = await response.json()

    if (errorLogs.length === 0) {
      container.innerHTML = '<p style="color: #00ff7f;">No errors logged yet.</p>'
      return
    }

    let tableHtml = `
            <table>
                <tr>
                    <th>Test Case ID</th>
                    <th>Error Message</th>
                    <th>Attempt</th>
                    <th>Healing Type</th>
                    <th>Screenshot</th>
                    <th>Timestamp</th>
                </tr>
        `

    errorLogs.forEach((log) => {
      const screenshotLink = log.screenshot_path
        ? `<a href="${log.screenshot_path}" target="_blank" class="screenshot-link">📸 View</a>`
        : "-"

      tableHtml += `
                <tr>
                    <td>${log.testcase_id}</td>
                    <td class="error-message">${log.error_message}</td>
                    <td>${log.attempt}</td>
                    <td><span class="healing-type-${log.healing_type.replace(/[^a-z]/g, "-")}">${log.healing_type || "Initial"}</span></td>
                    <td>${screenshotLink}</td>
                    <td>${log.timestamp}</td>
                </tr>
            `
    })

    tableHtml += "</table>"
    container.innerHTML = tableHtml
  } catch (error) {
    container.innerHTML = `<span style="color: #ff4d4d;">Error loading error logs: ${error.message}</span>`
  }
}

async function downloadErrorLogs() {
  try {
    window.location.href = "/download-error-logs/"
  } catch (error) {
    console.error("Error downloading error logs:", error)
  }
}

async function loadInitialStatistics() {
  try {
    const response = await fetch("/test-statuses/")
    const statuses = await response.json()
    updateStatistics(statuses)

    if (statuses.length > 0) {
      testCount = statuses.length
    }
  } catch (error) {
    console.error("Error loading initial statistics:", error)
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadInitialStatistics()
})
