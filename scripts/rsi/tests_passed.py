"""Runs the repo's node:test files (test/*.test.mjs) and prints tests_passed=<n>. Standard library only."""
import glob
import re
import subprocess

files = sorted(glob.glob("test/*.test.mjs"))
passed = 0
if files:
    run = subprocess.run(["node", "--test", "--test-reporter=tap", *files], capture_output=True, text=True, encoding="utf-8", errors="replace")
    match = re.search(r"^# pass (\d+)", run.stdout, re.M)
    if match:
        passed = int(match.group(1))
print(f"tests_passed={passed}")
