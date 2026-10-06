# ClassAI issue dependency graph

> **Important:** this Markdown file is documentation, **not the graph itself**.
>
> Right now the graph is generated successfully by GitHub Actions as an artifact. The permanent Pages URL will return 404 until GitHub Pages is enabled once in repository settings.

## Where to see the graph right now

1. Open the workflow: https://github.com/joaquinsalinas06/ClassAI/actions/workflows/issue-dependency-graph.yml
2. Open the latest successful run.
3. At the bottom, under **Artifacts**, download **`classai-issue-dependency-graph`**.
4. Unzip it and open **`index.html`** in a browser.

The latest tested run generated the HTML successfully.

## Enable the permanent live URL

Go to:

**Repository Settings → Pages → Build and deployment → Source → GitHub Actions**

After that, run **Issue dependency graph** once manually (or wait for the next automatic run).

Then the graph will be published at:

https://joaquinsalinas06.github.io/ClassAI/

GitHub Pages requires this repository-level setting to be enabled before a custom Actions workflow can deploy the site.

---

ClassAI keeps its planning structure in native GitHub metadata:

- Milestones define the delivery week.
- Parent/sub-issues define hierarchy.
- `Blocked by` / `Blocking` define the execution path.
- Assignees define responsibility.
- Labels describe domain or execution context.

The visualization is **generated from GitHub itself**. Do not edit a graph by hand.

## Files

- `scripts/generate-issue-graph.py`: reads GitHub Issues through the REST API and generates a standalone interactive HTML page plus `graph.json`.
- `.github/workflows/issue-dependency-graph.yml`: rebuilds the graph automatically.

## What the graph shows

Two independent relationship types are rendered:

1. **Dependency** — solid arrow from the prerequisite to the work it unlocks.
2. **Sub-issue** — dashed arrow from a parent issue to its child.

An open issue has a red border when at least one native `blocked by` issue is still open. An open issue with no open blocker has a green border.

The page can be filtered by milestone, issue state, relation type, assignee, label, issue number, or title.

## Automatic refresh

The Action rebuilds on:

- issue creation, edit, close/reopen, assignment, labels, or milestone changes;
- pull-request activity;
- changes to the generator/workflow;
- manual `workflow_dispatch`;
- an hourly reconciliation.

GitHub exposes sub-issue and dependency changes as webhook events, but they are not currently first-class GitHub Actions workflow triggers. The hourly reconciliation is intentional: it guarantees that a relationship-only edit is eventually reflected without requiring a custom GitHub App.

New issues require no graph configuration. Once they exist in GitHub, the next build discovers them automatically.

## Local/manual generation

With a GitHub token that can read issues:

```bash
GITHUB_TOKEN=... python scripts/generate-issue-graph.py --repo joaquinsalinas06/ClassAI --output _site
```

Open `_site/index.html` in a browser.
