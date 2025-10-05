from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import os
import json
import subprocess
import asyncio
import pandas as pd
from datetime import datetime
from utils.excel_parser import parse_excel
from utils.test_runner import run_tests, stop_tests
from typing import Dict, List
import hashlib
import re

app = FastAPI(title="Excel to Playwright Test Automation", description="API for automating Playwright tests from Excel files")

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage (replace with database if needed)
test_statuses: List[Dict] = []
test_codes: Dict[str, Dict[str, str]] = {}
full_healing_prompts: Dict[str, Dict] = {}
error_logs: List[Dict] = []
process = None
stop_flag = False
current_status: Dict[str, str] = {}

def log_error_to_file(testcase_id: str, error_message: str, attempt: int, healing_type: str = "", code: str = "", screenshot_path: str = ""):
    error_entry = {
        "testcase_id": testcase_id,
        "error_message": error_message,
        "attempt": attempt,
        "healing_type": healing_type,
        "code": code,
        "screenshot_path": screenshot_path,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    
    error_logs.append(error_entry)
    
    # Write to JSON file
    try:
        with open("error_logs.json", "w", encoding="utf-8") as f:
            json.dump(error_logs, f, indent=4, ensure_ascii=False)
    except Exception as e:
        print(f"Error writing to error_logs.json: {str(e)}")

def update_table(testCaseID: str, description: str, status: str, failure_reason: str = "", attempts: int = 0, healing_type: str = "", running_code: str = "", timestamp: str = None, screenshot_path: str = "", live_message: str = ""):
    if timestamp is None:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    attempt_text = ""
    if attempts > 0:
        attempt_text = f" - Attempt {attempts}"
    
    if healing_type and healing_type != "initial":
        healing_text = f" ({healing_type})"
    else:
        healing_text = ""
    
    if live_message:
        current_status[testCaseID] = live_message
    else:
        current_status[testCaseID] = f"{status}{attempt_text}{healing_text}"
    
    # Log errors with screenshot information
    if status in ["Failed", "Error"] and failure_reason:
        log_error_to_file(testCaseID, failure_reason, attempts, healing_type, running_code, screenshot_path)
    
    for entry in test_statuses:
        if entry["Test Case ID"] == testCaseID:
            entry.update({
                "Status": status,
                "Failure Reason": failure_reason,
                "Attempts": attempts,
                "Healing Type": healing_type,
                "Running Code": running_code,
                "Timestamp": timestamp,
                "Screenshot Path": screenshot_path
            })
            return
    test_statuses.append({
        "Test Case ID": testCaseID,
        "Test Case Description": description,
        "Status": status,
        "Failure Reason": failure_reason,
        "Attempts": attempts,
        "Healing Type": healing_type,
        "Running Code": running_code,
        "Timestamp": timestamp,
        "Screenshot Path": screenshot_path
    })

def update_codes(testCaseID: str, version: str, code: str):
    if testCaseID not in test_codes:
        test_codes[testCaseID] = {}
    test_codes[testCaseID][version] = code

def update_prompts(testCaseID: str, prompt: str, timestamp: str = None):
    if timestamp is None:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    full_healing_prompts[testCaseID] = {
        "prompt": prompt,
        "timestamp": timestamp
    }

@app.get("/", response_class=HTMLResponse)
async def get_home():
    try:
        with open("static/index.html", "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="index.html not found")
    except UnicodeDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Error reading index.html: {str(e)}")

@app.post("/upload-excel/")
async def upload_excel(file: UploadFile = File(...)):
    if not file.filename.endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Only .xlsx files are supported")
    
    file_path = f"temp_{file.filename}"
    try:
        with open(file_path, "wb") as f:
            f.write(await file.read())
        
        testcases = parse_excel(file_path)
        if os.path.exists("testcases.json"):
            os.remove("testcases.json")
        with open("testcases.json", "w", encoding="utf-8") as f:
            json.dump(testcases, f, indent=4, ensure_ascii=False)
        
        folder = "testcases"
        try:
            # Ensure folder exists and is clean
            if os.path.exists(folder):
                # remove only .json files to avoid deleting other assets by mistake
                for name in os.listdir(folder):
                    if name.lower().endswith(".json"):
                        try:
                            os.remove(os.path.join(folder, name))
                        except Exception:
                            pass
            else:
                os.makedirs(folder, exist_ok=True)

            def _sanitize(name: str) -> str:
                # keep alnum, dash, underscore; replace others with underscore
                return re.sub(r"[^A-Za-z0-9_-]+", "_", name or "").strip("_") or "testcase"

            files_written = 0
            for idx, tc in enumerate(testcases):
                tcid = tc.get("TestCaseID") or tc.get("Test Case ID") or f"testcase_{idx+1}"
                filename = _sanitize(tcid) + ".json"
                out_path = os.path.join(folder, filename)
                with open(out_path, "w", encoding="utf-8") as out:
                    json.dump(tc, out, indent=4, ensure_ascii=False)
                files_written += 1
        except Exception as e:
            # If folder writing fails, still respond with combined JSON success
            print(f"Error writing per-testcase JSON files: {e}")

        return JSONResponse(content={
            "message": f"Parsed {len(testcases)} test case(s) and saved to testcases.json",
            "testcases": testcases,
            "per_file_export": {
                "folder": folder,
                "files_written": files_written if 'files_written' in locals() else 0
            }
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error parsing Excel: {str(e)}")
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)

@app.get("/download-json/")
async def download_json():
    if not os.path.exists("testcases.json"):
        raise HTTPException(status_code=404, detail="testcases.json not found")
    return FileResponse("testcases.json", filename="testcases.json", media_type="application/json")

@app.post("/run-tests/")
async def run_tests_endpoint(background_tasks: BackgroundTasks, api_key: str = ""):
    global process, stop_flag
    if not os.path.exists("testcases.json"):
        raise HTTPException(status_code=404, detail="testcases.json not found")
    
    test_statuses.clear()
    test_codes.clear()
    full_healing_prompts.clear()
    error_logs.clear()
    stop_flag = False
    process = None
    
    if os.path.exists("stop.txt"):
        os.remove("stop.txt")
    
    if api_key and api_key.strip():
        try:
            # Set environment variable for the Node.js process
            os.environ['GEMINI_API_KEY'] = api_key.strip()
            
            # Also update the JavaScript file as backup
            with open("generate_and_runall.js", "r", encoding="utf-8") as f:
                content = f.read()
            
            # Replace the API key line more reliably
            content = re.sub(
                r'const GEMINI_API_KEY = .*?;',
                f'const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "{api_key.strip()}";',
                content
            )
            
            with open("generate_and_runall.js", "w", encoding="utf-8") as f:
                f.write(content)
                
            print(f"API key configured successfully")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error updating API key: {str(e)}")
    else:
        # Check if API key is available in environment
        if not os.environ.get('GEMINI_API_KEY'):
            raise HTTPException(status_code=400, detail="Gemini API key is required. Please provide a valid API key.")
    
    background_tasks.add_task(run_tests, update_table, update_codes, update_prompts)
    
    return JSONResponse(content={"message": "Test execution started with configured API key"})

@app.post("/stop-tests/")
async def stop_tests_endpoint():
    global stop_flag, process
    stop_flag = True
    with open("stop.txt", "w") as f:
        f.write("stop")
    if process:
        stop_tests(process)
    return JSONResponse(content={"message": "Test execution stop requested"})

@app.get("/test-statuses/")
async def get_test_statuses():
    return JSONResponse(content=test_statuses)

@app.get("/test-codes/{test_case_id}")
async def get_test_codes(test_case_id: str):
    return JSONResponse(content=test_codes.get(test_case_id, {}))

@app.get("/healing-prompt/{test_case_id}")
async def get_healing_prompt(test_case_id: str):
    return JSONResponse(content=full_healing_prompts.get(test_case_id, {}))

@app.get("/error-logs/")
async def get_error_logs():
    return JSONResponse(content=error_logs)

@app.get("/download-error-logs/")
async def download_error_logs():
    if not os.path.exists("error_logs.json"):
        raise HTTPException(status_code=404, detail="error_logs.json not found")
    return FileResponse("error_logs.json", filename="error_logs.json", media_type="application/json")

@app.get("/current-status/")
async def get_current_status():
    return JSONResponse(content=current_status)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
