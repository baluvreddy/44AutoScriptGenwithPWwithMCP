import subprocess
import json
from typing import Callable, Dict

async def run_tests(update_table: Callable, update_codes: Callable, update_prompts: Callable):
    global process
    try:
        process = subprocess.Popen(
            ["node", "generate_and_runall.js"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1
        )
        while True:
            output = process.stdout.readline()
            if output == '' and process.poll() is not None:
                break
            if output:
                output = output.strip()
                try:
                    data = json.loads(output)
                    live_message = data.get('liveMessage', '')
                    
                    if data.get("event") == "script_generation_started":
                        progress = data.get('progress', '')
                        status_msg = f"Generating Script ({progress})" if progress else "Generating Script"
                        update_table(data['testCaseID'], data.get('description', ''), status_msg, timestamp=data['timestamp'], live_message=live_message)
                    elif data.get("event") == "file_created":
                        update_table(data['testCaseID'], data.get('description', ''), "Script Generated", timestamp=data['timestamp'], live_message=live_message)
                    elif data.get("event") == "test_execution_started":
                        healing_type = data.get('healingType', 'initial')
                        attempt = data.get('attempt', 1)
                        status_msg = f"Running (Attempt {attempt})"
                        update_table(data['testCaseID'], data.get('description', ''), status_msg, f"Attempt {attempt}", attempts=attempt, healing_type=healing_type, timestamp=data['timestamp'], live_message=live_message)
                    elif data.get("event") == "test_passed":
                        healing_type = data.get('healingType', 'initial')
                        update_table(data['testCaseID'], data.get('description', ''), "Passed", attempts=data.get('attempt', 0), healing_type=healing_type, timestamp=data['timestamp'], live_message=live_message)
                    elif data.get("event") == "test_failed":
                        healing_type = data.get('healingType', 'initial')
                        screenshot_path = data.get('screenshotPath', '')
                        failure_reason = data['error']
                        update_table(data['testCaseID'], data.get('description', ''), "Failed", failure_reason, attempts=data.get('attempt', 0), healing_type=healing_type, timestamp=data['timestamp'], screenshot_path=screenshot_path, live_message=live_message)
                    elif data.get("event") == "self_healing_started":
                        healing_type = data.get('type', 'unknown')
                        update_table(data['testCaseID'], data.get('description', ''), "Self-healing", f"Applying {healing_type} fix", attempts=data['attempt'], healing_type=healing_type, timestamp=data['timestamp'], live_message=live_message)
                    elif data.get("event") == "local_fix_applied":
                        update_table(data['testCaseID'], data.get('description', ''), "Local Fix Applied", timestamp=data['timestamp'], live_message=live_message)
                    elif data.get("event") == "gemini_fix_applied":
                        screenshot_used = data.get('screenshotUsed', False)
                        status_msg = "AI Fix Applied (with screenshot)" if screenshot_used else "AI Fix Applied"
                        update_table(data['testCaseID'], data.get('description', ''), status_msg, timestamp=data['timestamp'], live_message=live_message)
                    elif data.get("event") == "advanced_fix_applied":
                        update_table(data['testCaseID'], data.get('description', ''), "Advanced Fix Applied", timestamp=data['timestamp'], live_message=live_message)
                    elif data.get("event") == "code_generated":
                        update_codes(data['testCaseID'], data['version'], data['code'])
                    elif data.get("event") == "full_healing_prompt":
                        update_prompts(data['testCaseID'], data['prompt'], data['timestamp'])
                    elif data.get("event") == "screenshot_captured":
                        print(f"Screenshot captured for {data['testCaseID']} attempt {data['attempt']}: {data['screenshotPath']}")
                    elif data.get("event") == "test_final_failure":
                        update_table(data['testCaseID'], data.get('description', ''), "Failed", "Failed after all attempts", attempts=4, healing_type="final_failure", timestamp=data['timestamp'], live_message=live_message)
                    elif data.get("event") == "all_tests_completed":
                        print("All test cases have been processed.")
                except json.JSONDecodeError:
                    continue
        return_code = process.poll()
        if return_code != 0:
            print(f"Test execution failed with return code: {return_code}")
    except Exception as e:
        print(f"Error executing Node.js script: {str(e)}")

def stop_tests(process: subprocess.Popen):
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
