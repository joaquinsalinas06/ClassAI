#!/usr/bin/env python3
"""Generate an interactive HTML graph from native GitHub issue relationships.

Sources of truth:
- Native parent/sub-issue relationships.
- Native issue dependencies (blocked by).
- Native issue metadata (state, milestone, assignees, labels).

The script intentionally does not parse dependency text from issue bodies.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

API_VERSION = "2026-03-10"
API_ROOT = "https://api.github.com"


def api_get(path: str, token: str | None) -> Any:
    url = path if path.startswith("https://") else API_ROOT + path
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": API_VERSION,
        "User-Agent": "ClassAI-Issue-Graph",
    }
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"GitHub API {exc.code} for {url}: {body}") from exc


def paged(path: str, token: str | None) -> list[dict[str, Any]]:
    separator = "&" if "?" in path else "?"
    page = 1
    items: list[dict[str, Any]] = []
    while True:
        batch = api_get(f"{path}{separator}per_page=100&page={page}", token)
        if not isinstance(batch, list):
            raise RuntimeError(f"Expected list from {path}, got {type(batch).__name__}")
        items.extend(batch)
        if len(batch) < 100:
            return items
        page += 1


def clean_issue(raw: dict[str, Any]) -> dict[str, Any]:
    milestone = raw.get("milestone")
    labels = [
        label.get("name") if isinstance(label, dict) else str(label)
        for label in raw.get("labels", [])
    ]
    assignees = [
        {
            "login": user.get("login", ""),
            "avatar": user.get("avatar_url", ""),
        }
        for user in raw.get("assignees", [])
    ]
    return {
        "number": raw["number"],
        "id": raw["id"],
        "title": raw.get("title") or "",
        "state": raw.get("state", "open"),
        "state_reason": raw.get("state_reason"),
        "url": raw.get("html_url", ""),
        "labels": labels,
        "assignees": assignees,
        "milestone": {
            "title": milestone.get("title"),
            "due_on": milestone.get("due_on"),
        } if milestone else None,
        "created_at": raw.get("created_at"),
        "updated_at": raw.get("updated_at"),
        "sub_issues_summary": raw.get("sub_issues_summary") or {
            "total": 0,
            "completed": 0,
            "percent_completed": 0,
        },
        "issue_dependencies_summary": raw.get("issue_dependencies_summary") or {
            "blocked_by": 0,
            "total_blocked_by": 0,
            "blocking": 0,
            "total_blocking": 0,
        },
    }


def is_archived_planning_issue(issue: dict[str, Any]) -> bool:
    title = issue.get("title", "")
    return issue.get("state") == "closed" and title.startswith("Histórico — Semana ")


def collect_graph(repo: str, token: str | None) -> dict[str, Any]:
    raw_issues = paged(f"/repos/{repo}/issues?state=all", token)
    raw_issues = [item for item in raw_issues if "pull_request" not in item]
    raw_issues = [item for item in raw_issues if not is_archived_planning_issue(item)]

    nodes = {item["number"]: clean_issue(item) for item in raw_issues}
    edges: list[dict[str, Any]] = []
    edge_keys: set[tuple[str, int, int]] = set()

    for number, issue in sorted(nodes.items()):
        sub_summary = issue["sub_issues_summary"]
        if int(sub_summary.get("total", 0) or 0) > 0:
            sub_issues = paged(f"/repos/{repo}/issues/{number}/sub_issues", token)
            for child in sub_issues:
                child_number = child["number"]
                if child_number not in nodes:
                    nodes[child_number] = clean_issue(child)
                key = ("subissue", number, child_number)
                if key not in edge_keys:
                    edges.append({
                        "type": "subissue",
                        "source": number,
                        "target": child_number,
                    })
                    edge_keys.add(key)

        dep_summary = issue["issue_dependencies_summary"]
        if int(dep_summary.get("total_blocked_by", dep_summary.get("blocked_by", 0)) or 0) > 0:
            blockers = paged(
                f"/repos/{repo}/issues/{number}/dependencies/blocked_by",
                token,
            )
            for blocker in blockers:
                blocker_number = blocker["number"]
                if blocker_number not in nodes:
                    nodes[blocker_number] = clean_issue(blocker)
                # Direction is prerequisite -> dependent.
                key = ("dependency", blocker_number, number)
                if key not in edge_keys:
                    edges.append({
                        "type": "dependency",
                        "source": blocker_number,
                        "target": number,
                    })
                    edge_keys.add(key)

    dependency_edges = [e for e in edges if e["type"] == "dependency"]
    subissue_edges = [e for e in edges if e["type"] == "subissue"]

    open_blockers: dict[int, list[int]] = {n: [] for n in nodes}
    blocking: dict[int, list[int]] = {n: [] for n in nodes}
    children: dict[int, list[int]] = {n: [] for n in nodes}
    parents: dict[int, list[int]] = {n: [] for n in nodes}

    for edge in dependency_edges:
        src, dst = edge["source"], edge["target"]
        blocking.setdefault(src, []).append(dst)
        if nodes.get(src, {}).get("state") == "open":
            open_blockers.setdefault(dst, []).append(src)

    for edge in subissue_edges:
        src, dst = edge["source"], edge["target"]
        children.setdefault(src, []).append(dst)
        parents.setdefault(dst, []).append(src)

    for number, node in nodes.items():
        node["open_blockers"] = sorted(open_blockers.get(number, []))
        node["blocking"] = sorted(blocking.get(number, []))
        node["children"] = sorted(children.get(number, []))
        node["parents"] = sorted(parents.get(number, []))
        node["is_blocked"] = node["state"] == "open" and bool(node["open_blockers"])
        node["is_parent"] = bool(node["children"])

    milestone_names = sorted({
        node["milestone"]["title"]
        for node in nodes.values()
        if node.get("milestone")
    })

    open_nodes = [n for n in nodes.values() if n["state"] == "open"]
    closed_nodes = [n for n in nodes.values() if n["state"] == "closed"]
    blocked_nodes = [n for n in open_nodes if n["is_blocked"]]
    ready_nodes = [n for n in open_nodes if not n["is_blocked"]]

    return {
        "repository": repo,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "summary": {
            "issues": len(nodes),
            "open": len(open_nodes),
            "closed": len(closed_nodes),
            "blocked": len(blocked_nodes),
            "ready": len(ready_nodes),
            "dependency_edges": len(dependency_edges),
            "subissue_edges": len(subissue_edges),
        },
        "milestones": milestone_names,
        "nodes": [nodes[k] for k in sorted(nodes)],
        "edges": edges,
    }


HTML_TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ClassAI — Issue dependency graph</title>
  <meta name="description" content="Live dependency and sub-issue graph generated from native GitHub Issues relationships." />
  <style>
    :root {
      color-scheme: light dark;
      --bg: #0b1020;
      --panel: #121a2d;
      --panel2: #182238;
      --text: #e6edf7;
      --muted: #9eabc2;
      --border: #2d3a55;
      --accent: #7c8cff;
      --ready: #22c55e;
      --blocked: #ef4444;
      --closed: #64748b;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
    body { display: grid; grid-template-rows: auto 1fr; height: 100vh; overflow: hidden; }
    header { border-bottom: 1px solid var(--border); background: rgba(11,16,32,.96); padding: 14px 18px; display: grid; gap: 12px; z-index: 2; }
    .top { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    h1 { font-size: 18px; margin: 0; }
    .sub { color: var(--muted); font-size: 12px; }
    .stats { display: flex; gap: 8px; flex-wrap: wrap; }
    .stat { background: var(--panel2); border: 1px solid var(--border); border-radius: 9px; padding: 6px 9px; font-size: 12px; }
    .controls { display: grid; grid-template-columns: minmax(180px,1fr) repeat(3,minmax(120px,auto)) auto auto; gap: 8px; }
    input, select, button { border: 1px solid var(--border); background: var(--panel2); color: var(--text); border-radius: 8px; padding: 8px 10px; font: inherit; }
    button { cursor: pointer; }
    button:hover { border-color: var(--accent); }
    main { min-height: 0; display: grid; grid-template-columns: 1fr 330px; }
    #cy { min-width: 0; min-height: 0; background-image: radial-gradient(#22304c 1px, transparent 1px); background-size: 24px 24px; }
    aside { border-left: 1px solid var(--border); background: var(--panel); padding: 16px; overflow: auto; }
    aside h2 { font-size: 16px; margin: 0 0 8px; }
    aside h3 { font-size: 12px; text-transform: uppercase; color: var(--muted); letter-spacing: .08em; margin: 18px 0 6px; }
    .pill { display: inline-block; padding: 3px 7px; margin: 2px; background: var(--panel2); border: 1px solid var(--border); border-radius: 999px; font-size: 11px; }
    .issue-link { color: #9eb0ff; text-decoration: none; }
    .issue-link:hover { text-decoration: underline; }
    .relation { display: block; padding: 5px 0; color: var(--text); text-decoration: none; font-size: 12px; }
    .relation:hover { color: #a9b8ff; }
    .legend { font-size: 11px; color: var(--muted); line-height: 1.6; margin-top: 16px; }
    .swatch { display: inline-block; width: 13px; height: 3px; vertical-align: middle; margin-right: 5px; }
    .solid { background: #aab5ca; }
    .dashed { border-top: 2px dashed #6b7892; height: 0; }
    .empty { color: var(--muted); font-size: 13px; line-height: 1.5; }
    @media (max-width: 900px) {
      .controls { grid-template-columns: 1fr 1fr; }
      main { grid-template-columns: 1fr; }
      aside { position: absolute; right: 8px; bottom: 8px; top: 155px; width: min(330px, calc(100vw - 16px)); z-index: 3; border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 16px 40px rgba(0,0,0,.35); }
    }
  </style>
</head>
<body>
<header>
  <div class="top">
    <div>
      <h1>ClassAI — Issue dependency graph</h1>
      <div class="sub">Native GitHub sub-issues + blocked-by relationships · generated __GENERATED_AT__</div>
    </div>
    <div class="stats" id="stats"></div>
  </div>
  <div class="controls">
    <input id="search" type="search" placeholder="Search #, title, assignee, label…" />
    <select id="milestone"><option value="">All milestones</option></select>
    <select id="state">
      <option value="open" selected>Open issues</option>
      <option value="all">Open + closed</option>
      <option value="closed">Closed only</option>
      <option value="ready">Ready / unblocked</option>
      <option value="blocked">Blocked only</option>
    </select>
    <select id="relations">
      <option value="both">Dependencies + hierarchy</option>
      <option value="dependency">Dependencies only</option>
      <option value="subissue">Sub-issues only</option>
    </select>
    <button id="fit">Fit</button>
    <button id="reset">Reset</button>
  </div>
</header>
<main>
  <div id="cy"></div>
  <aside id="details">
    <h2>Select an issue</h2>
    <p class="empty">Click any node to inspect its milestone, assignees, blockers, downstream work and sub-issues.</p>
    <div class="legend">
      <div><span class="swatch solid"></span>dependency: prerequisite → blocked work</div>
      <div><span class="swatch dashed"></span>hierarchy: parent → sub-issue</div>
      <div>Red border = currently blocked by at least one open issue.</div>
      <div>Green border = open and ready.</div>
    </div>
  </aside>
</main>
<script src="https://cdn.jsdelivr.net/npm/cytoscape@3.31.2/dist/cytoscape.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/dagre@0.8.5/dist/dagre.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/cytoscape-dagre@2.5.0/cytoscape-dagre.js"></script>
<script>
const DATA = __GRAPH_DATA__;

const milestoneColors = {
  "Semana 9 — Bring-up y bases": "#7c3aed",
  "Semana 10 — Subsistemas conectados": "#2563eb",
  "Semana 11 — Integración End-to-End": "#0f766e",
  "Semana 12 — Validación y Freeze v1.0": "#d97706"
};

function colorFor(node) {
  if (node.state === "closed") return "#64748b";
  return milestoneColors[node.milestone && node.milestone.title] || "#475569";
}

function shortTitle(text, max) {
  return text.length <= max ? text : text.slice(0, max - 1) + "…";
}

const nodeByNumber = new Map(DATA.nodes.map(function(n) { return [n.number, n]; }));
const elements = [];

DATA.nodes.forEach(function(n) {
  elements.push({
    group: "nodes",
    data: {
      id: "i" + n.number,
      number: n.number,
      label: "#" + n.number + "  " + shortTitle(n.title, 64),
      title: n.title,
      state: n.state,
      blocked: n.is_blocked ? "yes" : "no",
      parentIssue: n.is_parent ? "yes" : "no",
      milestone: n.milestone ? n.milestone.title : "",
      bg: colorFor(n)
    },
    classes: [
      n.state === "closed" ? "closed" : "open",
      n.is_blocked ? "blocked" : "ready",
      n.is_parent ? "parent" : ""
    ].join(" ")
  });
});

DATA.edges.forEach(function(e, idx) {
  elements.push({
    group: "edges",
    data: {
      id: e.type + "-" + e.source + "-" + e.target + "-" + idx,
      source: "i" + e.source,
      target: "i" + e.target,
      relation: e.type
    },
    classes: e.type
  });
});

const cy = cytoscape({
  container: document.getElementById("cy"),
  elements: elements,
  wheelSensitivity: 0.18,
  style: [
    {
      selector: "node",
      style: {
        "shape": "round-rectangle",
        "background-color": "data(bg)",
        "label": "data(label)",
        "color": "#ffffff",
        "font-size": 10,
        "font-weight": 600,
        "text-wrap": "wrap",
        "text-max-width": 190,
        "text-valign": "center",
        "text-halign": "center",
        "width": 218,
        "height": 58,
        "padding": 5,
        "border-width": 2,
        "border-color": "#32415f",
        "overlay-opacity": 0
      }
    },
    {
      selector: "node.blocked",
      style: { "border-width": 4, "border-color": "#ef4444" }
    },
    {
      selector: "node.ready.open",
      style: { "border-width": 3, "border-color": "#22c55e" }
    },
    {
      selector: "node.closed",
      style: { "opacity": 0.45, "border-color": "#94a3b8" }
    },
    {
      selector: "node.parent",
      style: { "font-weight": 800, "height": 64 }
    },
    {
      selector: "edge",
      style: {
        "curve-style": "bezier",
        "width": 2,
        "target-arrow-shape": "triangle",
        "arrow-scale": 0.9,
        "opacity": 0.72
      }
    },
    {
      selector: "edge.dependency",
      style: {
        "line-color": "#aab5ca",
        "target-arrow-color": "#aab5ca"
      }
    },
    {
      selector: "edge.subissue",
      style: {
        "line-style": "dashed",
        "line-color": "#66738c",
        "target-arrow-color": "#66738c",
        "width": 1.5,
        "opacity": 0.52
      }
    },
    {
      selector: ".faded",
      style: { "opacity": 0.08, "text-opacity": 0.08 }
    },
    {
      selector: ".highlight",
      style: { "opacity": 1, "z-index": 9999 }
    }
  ],
  layout: {
    name: "dagre",
    rankDir: "LR",
    rankSep: 92,
    nodeSep: 30,
    edgeSep: 14,
    animate: false,
    fit: true,
    padding: 35
  }
});

function stats() {
  const s = DATA.summary;
  document.getElementById("stats").innerHTML =
    '<span class="stat">' + s.open + ' open</span>' +
    '<span class="stat">' + s.ready + ' ready</span>' +
    '<span class="stat">' + s.blocked + ' blocked</span>' +
    '<span class="stat">' + s.dependency_edges + ' dependencies</span>' +
    '<span class="stat">' + s.subissue_edges + ' sub-issue links</span>';
}
stats();

const milestoneSelect = document.getElementById("milestone");
DATA.milestones.forEach(function(name) {
  const option = document.createElement("option");
  option.value = name;
  option.textContent = name;
  milestoneSelect.appendChild(option);
});

function assigneeText(n) {
  return n.assignees.length ? n.assignees.map(function(a) { return "@" + a.login; }).join(", ") : "Unassigned";
}

function issueLink(number) {
  const n = nodeByNumber.get(number);
  if (!n) return "#" + number;
  return '<a class="relation" href="' + n.url + '" target="_blank" rel="noreferrer">#' + number + ' · ' + escapeHtml(n.title) + '</a>';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showDetails(number) {
  const n = nodeByNumber.get(number);
  if (!n) return;
  const due = n.milestone && n.milestone.due_on ? new Date(n.milestone.due_on).toLocaleDateString() : "—";
  const labels = n.labels.length ? n.labels.map(function(x) { return '<span class="pill">' + escapeHtml(x) + '</span>'; }).join("") : '<span class="empty">No labels</span>';
  const blockers = n.open_blockers.length ? n.open_blockers.map(issueLink).join("") : '<span class="empty">No open blockers — ready to start.</span>';
  const blocking = n.blocking.length ? n.blocking.map(issueLink).join("") : '<span class="empty">Nothing depends directly on this issue.</span>';
  const children = n.children.length ? n.children.map(issueLink).join("") : '<span class="empty">No sub-issues.</span>';
  const parents = n.parents.length ? n.parents.map(issueLink).join("") : '<span class="empty">No parent issue.</span>';

  document.getElementById("details").innerHTML =
    '<h2>#' + n.number + ' · ' + escapeHtml(n.title) + '</h2>' +
    '<div><span class="pill">' + escapeHtml(n.state) + '</span>' + (n.is_blocked ? '<span class="pill">blocked</span>' : '<span class="pill">ready</span>') + '</div>' +
    '<p><a class="issue-link" href="' + n.url + '" target="_blank" rel="noreferrer">Open in GitHub ↗</a></p>' +
    '<h3>Milestone</h3><div>' + escapeHtml(n.milestone ? n.milestone.title : "None") + '<br><span class="sub">Due ' + escapeHtml(due) + '</span></div>' +
    '<h3>Assignees</h3><div>' + escapeHtml(assigneeText(n)) + '</div>' +
    '<h3>Labels</h3><div>' + labels + '</div>' +
    '<h3>Blocked by (open)</h3><div>' + blockers + '</div>' +
    '<h3>Directly blocking</h3><div>' + blocking + '</div>' +
    '<h3>Parent</h3><div>' + parents + '</div>' +
    '<h3>Sub-issues</h3><div>' + children + '</div>' +
    '<div class="legend"><div><span class="swatch solid"></span>dependency</div><div><span class="swatch dashed"></span>parent/sub-issue</div></div>';
}

cy.on("tap", "node", function(evt) {
  const number = evt.target.data("number");
  showDetails(number);
  cy.elements().addClass("faded").removeClass("highlight");
  const neighborhood = evt.target.closedNeighborhood();
  neighborhood.removeClass("faded").addClass("highlight");
  evt.target.removeClass("faded").addClass("highlight");
});

cy.on("tap", function(evt) {
  if (evt.target === cy) {
    cy.elements().removeClass("faded highlight");
  }
});

function applyFilters() {
  const query = document.getElementById("search").value.trim().toLowerCase();
  const milestone = milestoneSelect.value;
  const state = document.getElementById("state").value;
  const relation = document.getElementById("relations").value;

  cy.batch(function() {
    cy.nodes().forEach(function(ele) {
      const n = nodeByNumber.get(ele.data("number"));
      const haystack = [
        "#" + n.number,
        n.title,
        n.labels.join(" "),
        n.assignees.map(function(a) { return a.login; }).join(" "),
        n.milestone ? n.milestone.title : ""
      ].join(" ").toLowerCase();

      let visible = !query || haystack.indexOf(query) !== -1;
      if (milestone && (!n.milestone || n.milestone.title !== milestone)) visible = false;
      if (state === "open" && n.state !== "open") visible = false;
      if (state === "closed" && n.state !== "closed") visible = false;
      if (state === "ready" && (n.state !== "open" || n.is_blocked)) visible = false;
      if (state === "blocked" && (n.state !== "open" || !n.is_blocked)) visible = false;

      ele.style("display", visible ? "element" : "none");
    });

    cy.edges().forEach(function(edge) {
      let visible = true;
      if (relation !== "both" && edge.data("relation") !== relation) visible = false;
      if (edge.source().style("display") === "none" || edge.target().style("display") === "none") visible = false;
      edge.style("display", visible ? "element" : "none");
    });
  });

  cy.layout({
    name: "dagre",
    rankDir: "LR",
    rankSep: 92,
    nodeSep: 30,
    edgeSep: 14,
    animate: false,
    fit: true,
    padding: 35
  }).run();
}

["search", "milestone", "state", "relations"].forEach(function(id) {
  document.getElementById(id).addEventListener(id === "search" ? "input" : "change", applyFilters);
});

document.getElementById("fit").addEventListener("click", function() { cy.fit(undefined, 35); });
document.getElementById("reset").addEventListener("click", function() {
  document.getElementById("search").value = "";
  milestoneSelect.value = "";
  document.getElementById("state").value = "open";
  document.getElementById("relations").value = "both";
  cy.elements().removeClass("faded highlight");
  applyFilters();
});

applyFilters();
</script>
</body>
</html>
"""


def render_html(graph: dict[str, Any]) -> str:
    data = json.dumps(graph, ensure_ascii=False, separators=(",", ":"))
    # Prevent an issue title from terminating the script element.
    data = data.replace("<", "\u003c")
    generated = dt.datetime.fromisoformat(graph["generated_at"]).strftime("%Y-%m-%d %H:%M UTC")
    return (
        HTML_TEMPLATE
        .replace("__GRAPH_DATA__", data)
        .replace("__GENERATED_AT__", generated)
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default=os.getenv("GITHUB_REPOSITORY", "joaquinsalinas06/ClassAI"))
    parser.add_argument("--output", default="_site")
    args = parser.parse_args()

    token = os.getenv("GITHUB_TOKEN") or os.getenv("GH_TOKEN")
    output = pathlib.Path(args.output)
    output.mkdir(parents=True, exist_ok=True)

    graph = collect_graph(args.repo, token)
    (output / "graph.json").write_text(
        json.dumps(graph, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (output / "index.html").write_text(render_html(graph), encoding="utf-8")

    summary = graph["summary"]
    print(
        "Generated graph:",
        f"{summary['issues']} issues,",
        f"{summary['dependency_edges']} dependencies,",
        f"{summary['subissue_edges']} sub-issue links.",
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
