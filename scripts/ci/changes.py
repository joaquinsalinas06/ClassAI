"""Select product jobs from git paths; shared contracts deliberately test every consumer."""

import os
from pathlib import PurePosixPath
import subprocess

JOBS = ("backend", "mqtt", "web", "firmware", "android")


def select(paths):
    selected = set()
    for path in paths:
        if path in {"docs/contracts.md", ".github/workflows/product-ci.yml"} or path.startswith("scripts/ci/"):
            return set(JOBS)
        if PurePosixPath(path).suffix == ".md":
            continue
        if path.startswith(("backend/", "tools/voice_agent/", "deploy/")):
            selected.update(("backend", "mqtt"))
        if path.startswith(("web/", "design/")):
            selected.add("web")
        if path.startswith(("mobile/android/", "design/")):
            selected.add("android")
        if path.startswith("firmware/"):
            selected.update(("firmware", "backend", "web"))  # shared comfort cases/algorithm
    return selected


if __name__ == "__main__":
    base = os.environ["CI_BASE_SHA"]
    if not base.strip("0"):
        selected = set(JOBS)
    else:
        # For PRs use the merge base; pushes compare before..HEAD.
        if os.environ["CI_EVENT"] == "pull_request":
            base = subprocess.check_output(["git", "merge-base", base, "HEAD"], text=True).strip()
        paths = subprocess.check_output(["git", "diff", "--name-only", base, "HEAD"], text=True).splitlines()
        selected = select(paths)
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        for job in JOBS:
            output.write(f"{job}={str(job in selected).lower()}\n")
