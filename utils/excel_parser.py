import pandas as pd
import json
import re
from collections import OrderedDict
from difflib import get_close_matches

COLUMN_MAP = {
    "TestCaseID": ["Test Case ID", "ID", "Case ID","Scenario ID", "TestCaseID", "TC ID", "Test ID", "TestCase", "TCID", "Test Case Number", "Test Number", "TestCase No", "TC Number", "Test Identifier", "Case Number"],
    "Title": ["Feature", "Module Name", "Title", "Module","Scenario Name", "Test Name", "Test Title", "Functionality", "Test Module", "Feature Name", "Test Case Name", "Module Title", "Test Function"],
    "Description": ["Test Case Description","Scenario Description", "Test Case", "Scenario", "Test Case Title", "Test Objective", "Purpose", "Test Scenario", "Test Goal", "Description", "Test Purpose", "Test Summary", "Objective", "Test Details"],
    "Prerequisite": ["Pre-requisites", "Precondition","Prerequisite ID", "Pre-conditions", "Requisite", "Pre-Rules", "Setup", "Requirements", "Pre-Req", "Conditions", "Pre-Requirement", "Test Setup", "Precondition(s)", "Setup Conditions", "Initial Conditions", "Test Prerequisites"],
    "TestData": ["Test Data","argument", "Data", "Input", "Inputs", "Test Input", "Data Set", "Input Data", "Test Dataset", "Test Parameters", "Data Inputs"],
    "StepNo": ["Step No.", "Step Num  ber", "No", "Step ID", "Sequence", "Step", "Sequence No", "Order", "Step Seq", "Test Step No", "Step Order"],
    "Action": ["Test Step", "Step", "Action", "Test Steps", "Test Action", "Procedure", "Test Procedure", "Step Description", "Action Step", "Test Activity", "Step Action", "Execution Step"],
    "ExpectedResult": ["Expected Result", "Result", "Expected", "Expected Outcome", "Outcome", "Verification", "Expected Behavior", "Test Result", "Expected Output", "Test Outcome", "Verification Result", "Expected Response"]
}

SIMILARITY_THRESHOLD = 0.8

def find_column(df, possible_names):
    for name in possible_names:
        if name in df.columns:
            return name
    lower_cols = {col.lower(): col for col in df.columns}
    for name in possible_names:
        if name.lower() in lower_cols:
            return lower_cols[name.lower()]
    all_possible = df.columns.tolist()
    for name in possible_names:
        matches = get_close_matches(name, all_possible, n=1, cutoff=SIMILARITY_THRESHOLD)
        if matches:
            return matches[0]
    return None

def clean_testdata(raw_testdata):
    cleaned = []
    seen = set()
    for item in raw_testdata:
        if item:
            if isinstance(item, str) and re.match(r'^https?://[^\s]+$', item):
                td = item.strip()
                if td and td not in seen:
                    seen.add(td)
                    cleaned.append(td)
                continue
            tokens = []
            for part in str(item).split('\n'):
                tokens.extend(part.split(','))
            temp_tokens = []
            for t in tokens:
                temp_tokens.extend(t.split(';'))
            tokens = temp_tokens
            for td in tokens:
                td = td.strip()
                if not td:
                    continue
                if ':' in td:
                    key, val = td.split(':', 1)
                    key = key.strip().lower()
                    val = val.strip()
                    if not val:
                        continue
                    td = f"{key}: {val}"
                if td not in seen:
                    seen.add(td)
                    cleaned.append(td)
    return cleaned

def parse_excel(file_path):
    df = pd.read_excel(file_path).fillna("")
    col_names = {key: find_column(df, names) for key, names in COLUMN_MAP.items()}
    for key in ["TestCaseID", "Title", "Description", "Prerequisite"]:
        col = col_names.get(key)
        if col:
            df[col] = df[col].replace("", None).ffill().fillna("")
    if col_names["TestCaseID"]:
        groups = df.groupby(df[col_names["TestCaseID"]], sort=False)
    else:
        groups = df.groupby([df[col_names["Title"]], df[col_names["Description"]]], sort=False)
    testcases = []
    auto_id_counter = 1
    for tc_id, group in groups:
        first_row = group.iloc[0]
        tc_id_val = tc_id if col_names["TestCaseID"] else f"TC{auto_id_counter:03}"
        if not str(tc_id_val).strip():
            continue
        auto_id_counter += 1 if not col_names["TestCaseID"] else 0
        raw_testdata = group[col_names["TestData"]].tolist() if col_names["TestData"] else []
        cleaned_testdata = clean_testdata(raw_testdata)
        steps = []
        step_seen = set()
        step_counter = 1
        used_testdata = set()
        for _, row in group.iterrows():
            action_cell = row[col_names["Action"]] if col_names["Action"] else ""
            expected = row[col_names["ExpectedResult"]] if col_names["ExpectedResult"] else ""
            if action_cell:
                split_actions = [a.strip() for a in re.split(r'(?:\b\d+[\.\)]\s*|\b[a-zA-Z][\.\)]\s*|[,\n;])', action_cell) if a.strip()]
                total_steps = len(split_actions)
                for i, action in enumerate(split_actions):
                    step_key = (step_counter, action)
                    if step_key not in step_seen:
                        matched_data = []
                        for td in cleaned_testdata:
                            key = td.split(":", 1)[0].strip().lower() if ':' in td else td.lower()
                            if key in action.lower():
                                matched_data.append(td)
                                used_testdata.add(td)
                        steps.append({
                            "StepNo": step_counter,
                            "Action": action,
                            "ExpectedResult": expected if i == total_steps - 1 else "",
                            "TestData": matched_data
                        })
                        step_seen.add(step_key)
                        step_counter += 1
        testcase_level_testdata = [td for td in cleaned_testdata if td not in used_testdata]
        testcase = OrderedDict({
            "TestCaseID": tc_id_val,
            "Title": first_row[col_names["Title"]] if col_names["Title"] else "",
            "Description": first_row[col_names["Description"]] if col_names["Description"] else "",
            "Prerequisite": first_row[col_names["Prerequisite"]] if col_names["Prerequisite"] else "",
            "Steps": steps,
            "Summary": f"This test case verifies: {str(first_row[col_names['Description']] if col_names['Description'] else '').strip().lower()}."
        })
        if testcase_level_testdata:
            testcase["TestData"] = testcase_level_testdata
        testcases.append(testcase)
    return testcases
