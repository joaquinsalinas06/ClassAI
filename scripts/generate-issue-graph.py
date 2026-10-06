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
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ClassAI — Ruta de entrega</title>
  <meta name="description" content="Narrativa visual de milestones, dependencias y sub-issues de ClassAI." />
  <style>
    :root {
      color-scheme: dark;
      --bg: #090d16;
      --surface: #0f1522;
      --surface-2: #151d2d;
      --surface-3: #1b2538;
      --text: #f3f6fb;
      --muted: #95a2b8;
      --faint: #657289;
      --border: #273247;
      --ready: #22c55e;
      --blocked: #ef4444;
      --closed: #64748b;
      --accent: #8b9cff;
      --shadow: 0 18px 48px rgba(0,0,0,.34);
    }

    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    body {
      display: grid;
      grid-template-rows: auto 1fr;
      overflow: hidden;
    }

    header {
      position: relative;
      z-index: 5;
      padding: 18px 20px 14px;
      border-bottom: 1px solid var(--border);
      background:
        linear-gradient(180deg, rgba(15,21,34,.98), rgba(9,13,22,.96));
      box-shadow: 0 10px 32px rgba(0,0,0,.18);
    }

    .headline {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 20px;
      flex-wrap: wrap;
    }

    .title-block h1 {
      margin: 0 0 5px;
      font-size: 21px;
      line-height: 1.2;
      letter-spacing: -.02em;
    }

    .title-block p {
      margin: 0;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
    }

    .summary {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .metric {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      min-height: 30px;
      padding: 6px 9px;
      border: 1px solid var(--border);
      border-radius: 9px;
      background: rgba(21,29,45,.72);
      color: var(--muted);
      font-size: 11px;
      white-space: nowrap;
    }

    .metric strong {
      color: var(--text);
      font-size: 12px;
      font-weight: 700;
    }

    .milestone-strip {
      display: grid;
      grid-template-columns: repeat(4, minmax(150px, 1fr));
      gap: 8px;
      margin-top: 14px;
    }

    .milestone-card {
      position: relative;
      overflow: hidden;
      min-width: 0;
      padding: 9px 11px 10px 13px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: rgba(21,29,45,.58);
      color: var(--text);
      cursor: pointer;
      text-align: left;
      transition: border-color .15s ease, transform .15s ease, background .15s ease;
    }

    .milestone-card::before {
      content: "";
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 3px;
      background: var(--week-color, var(--accent));
    }

    .milestone-card:hover,
    .milestone-card.active {
      border-color: var(--week-color, var(--accent));
      background: rgba(27,37,56,.9);
      transform: translateY(-1px);
    }

    .milestone-card .week {
      display: block;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .04em;
      text-transform: uppercase;
    }

    .milestone-card .goal {
      display: block;
      margin-top: 2px;
      color: var(--muted);
      font-size: 10px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .milestone-card .mini {
      display: block;
      margin-top: 5px;
      color: var(--faint);
      font-size: 9px;
    }

    .controls {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) repeat(3, minmax(145px, auto)) auto auto;
      gap: 8px;
      margin-top: 12px;
    }

    input, select, button {
      min-height: 34px;
      border: 1px solid var(--border);
      border-radius: 9px;
      background: var(--surface-2);
      color: var(--text);
      font: inherit;
      font-size: 12px;
      outline: none;
    }

    input, select { padding: 7px 10px; }
    button { padding: 7px 11px; cursor: pointer; font-weight: 650; }

    input:focus, select:focus, button:hover {
      border-color: #526486;
    }

    main {
      position: relative;
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 350px;
    }

    #graph-shell {
      position: relative;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      background:
        radial-gradient(circle at 1px 1px, rgba(112,130,164,.18) 1px, transparent 0) 0 0 / 26px 26px,
        linear-gradient(180deg, #0b101a, #090d16);
    }

    #cy {
      position: absolute;
      inset: 0;
      z-index: 2;
    }

    .axis-note {
      position: absolute;
      z-index: 4;
      left: 14px;
      top: 12px;
      max-width: 440px;
      padding: 7px 9px;
      border: 1px solid rgba(63,76,101,.7);
      border-radius: 8px;
      background: rgba(9,13,22,.82);
      color: var(--muted);
      font-size: 10px;
      line-height: 1.45;
      pointer-events: none;
      backdrop-filter: blur(8px);
    }

    aside {
      min-width: 0;
      overflow: auto;
      border-left: 1px solid var(--border);
      background: linear-gradient(180deg, var(--surface), #0c121e);
      padding: 17px;
    }

    aside h2 {
      margin: 0 0 6px;
      font-size: 16px;
      line-height: 1.3;
      letter-spacing: -.01em;
    }

    aside h3 {
      margin: 17px 0 6px;
      color: var(--muted);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: .11em;
    }

    .muted, .empty {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.55;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      margin: 2px 3px 2px 0;
      padding: 4px 7px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--surface-2);
      color: #cbd5e5;
      font-size: 10px;
      line-height: 1;
    }

    .pill.ready { border-color: rgba(34,197,94,.45); color: #86efac; }
    .pill.blocked { border-color: rgba(239,68,68,.45); color: #fca5a5; }
    .pill.closed { border-color: rgba(100,116,139,.45); color: #a8b1c1; }

    .github-link {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      margin-top: 8px;
      color: #aebcff;
      font-size: 11px;
      font-weight: 700;
      text-decoration: none;
    }

    .github-link:hover { text-decoration: underline; }

    .relation {
      display: block;
      margin: 2px 0;
      padding: 6px 7px;
      border: 1px solid transparent;
      border-radius: 7px;
      color: #d8deea;
      font-size: 11px;
      line-height: 1.35;
      text-decoration: none;
    }

    .relation:hover {
      border-color: var(--border);
      background: var(--surface-2);
    }

    .legend {
      margin-top: 18px;
      padding-top: 12px;
      border-top: 1px solid var(--border);
      color: var(--muted);
      font-size: 10px;
      line-height: 1.7;
    }

    .legend-row {
      display: flex;
      align-items: center;
      gap: 7px;
    }

    .line {
      width: 17px;
      height: 0;
      border-top: 2px solid #9ca8bc;
    }

    .line.dashed { border-top-style: dashed; border-color: #66738c; }
    .line.before { border-color: #60a5fa; }
    .line.after { border-color: #f59e0b; }

    .story-flow {
      display: grid;
      grid-template-columns: 1fr;
      gap: 7px;
      margin: 14px 0 4px;
    }

    .story-step {
      padding: 9px 10px;
      border: 1px solid var(--border);
      border-radius: 9px;
      background: var(--surface-2);
    }

    .story-step strong {
      display: block;
      margin-bottom: 3px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: .08em;
    }

    .story-step span {
      display: block;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.4;
    }

    .story-step.before { border-color: rgba(96,165,250,.42); }
    .story-step.before strong { color: #93c5fd; }
    .story-step.current { border-color: rgba(248,250,252,.52); background: #1b2538; }
    .story-step.current strong { color: #f8fafc; }
    .story-step.after { border-color: rgba(245,158,11,.42); }
    .story-step.after strong { color: #fbbf24; }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex: 0 0 auto;
    }

    .dot.ready { background: var(--ready); }
    .dot.blocked { background: var(--blocked); }

    @media (max-width: 1100px) {
      .milestone-strip { grid-template-columns: repeat(2, minmax(150px, 1fr)); }
      .controls { grid-template-columns: 1fr 1fr 1fr; }
      main { grid-template-columns: 1fr; }
      aside {
        position: absolute;
        z-index: 8;
        top: 10px;
        right: 10px;
        bottom: 10px;
        width: min(350px, calc(100vw - 20px));
        border: 1px solid var(--border);
        border-radius: 12px;
        box-shadow: var(--shadow);
      }
    }

    @media (max-width: 700px) {
      header { padding: 14px 12px 12px; }
      .summary { justify-content: flex-start; }
      .milestone-strip { grid-template-columns: 1fr 1fr; }
      .controls { grid-template-columns: 1fr 1fr; }
      .axis-note { display: none; }
    }
  </style>
</head>
<body>
<header>
  <div class="headline">
    <div class="title-block">
      <h1>ClassAI · Ruta de entrega</h1>
      <p>Izquierda → derecha = tiempo. Dentro de cada semana, los issues avanzan por nivel de dependencia y se agrupan por capa de trabajo.</p>
      <p>Generado desde relaciones nativas de GitHub · __GENERATED_AT__</p>
    </div>
    <div class="summary" id="summary"></div>
  </div>

  <div class="milestone-strip" id="milestone-strip"></div>

  <div class="controls">
    <input id="search" type="search" placeholder="Buscar #, título, persona o label…" />
    <select id="milestone"><option value="">Todas las semanas</option></select>
    <select id="state">
      <option value="open" selected>Issues abiertos</option>
      <option value="ready">Listos para empezar</option>
      <option value="blocked">Bloqueados</option>
      <option value="all">Abiertos + cerrados</option>
      <option value="closed">Solo cerrados</option>
    </select>
    <select id="relations">
      <option value="dependency" selected>Solo dependencias</option>
      <option value="both">Dependencias + sub-issues</option>
      <option value="subissue">Solo sub-issues</option>
    </select>
    <button id="fit">Ajustar vista</button>
    <button id="reset">Restablecer</button>
  </div>
</header>

<main>
  <section id="graph-shell">
    <div class="axis-note">
      Cada bloque vertical es un milestone. Las flechas sólidas muestran qué trabajo desbloquea a cuál; las líneas punteadas de jerarquía están ocultas por defecto para reducir ruido.
    </div>
    <div id="cy"></div>
  </section>

  <aside id="details">
    <h2>Selecciona un issue</h2>
    <p class="empty">Al hacer clic se resalta su cadena completa de dependencias: qué necesita antes y qué trabajo desbloquea después.</p>
    <div class="legend">
      <div class="legend-row"><span class="line before"></span> azul = lo que necesito antes</div>
      <div class="legend-row"><span class="line after"></span> ámbar = lo que desbloqueo después</div>
      <div class="legend-row"><span class="line dashed"></span> parent / sub-issue</div>
      <div class="legend-row"><span class="dot ready"></span> listo para empezar</div>
      <div class="legend-row"><span class="dot blocked"></span> todavía bloqueado</div>
    </div>
  </aside>
</main>

<script src="https://cdn.jsdelivr.net/npm/cytoscape@3.31.2/dist/cytoscape.min.js"></script>
<script>
const DATA = __GRAPH_DATA__;

const WEEK_ORDER = [
  "Semana 9 — Bring-up y bases",
  "Semana 10 — Subsistemas conectados",
  "Semana 11 — Integración End-to-End",
  "Semana 12 — Validación y Freeze v1.0"
];

const WEEK_META = {
  "Semana 9 — Bring-up y bases": {
    short: "Semana 9",
    goal: "Bring-up, PN532/HCE y bases",
    accent: "#8b5cf6",
    fill: "#171227"
  },
  "Semana 10 — Subsistemas conectados": {
    short: "Semana 10",
    goal: "Subsistemas conectados",
    accent: "#3b82f6",
    fill: "#0f192a"
  },
  "Semana 11 — Integración End-to-End": {
    short: "Semana 11",
    goal: "Integración end-to-end",
    accent: "#14b8a6",
    fill: "#0d1d20"
  },
  "Semana 12 — Validación y Freeze v1.0": {
    short: "Semana 12",
    goal: "Validación y freeze v1.0",
    accent: "#f59e0b",
    fill: "#211a0d"
  },
  "__project__": {
    short: "Proyecto",
    goal: "Roadmap y coordinación global",
    accent: "#64748b",
    fill: "#131923"
  }
};

const WORKSTREAMS = [
  { key: "objective", label: "Objetivos de semana" },
  { key: "nfc", label: "NFC y móvil" },
  { key: "edge", label: "Dispositivo y edge" },
  { key: "cloud", label: "Conectividad y backend" },
  { key: "product", label: "Producto y datos" },
  { key: "qa", label: "Validación" },
  { key: "coordination", label: "Coordinación" }
];

const PERSON_NAMES = {
  "joaquinsalinas06": "Salinas",
  "zutomayo10": "Isaac",
  "Auky216": "Auqui",
  "Landov311": "Lando"
};

const NODE_W = 222;
const NODE_H = 70;
const NODE_Y_GAP = 84;
const RANK_X = 246;
const BAND_PAD_X = 72;
const BAND_GAP = 86;
const LEFT_MARGIN = 230;
const HEADER_Y = 58;
const ROW_START_Y = 190;

function milestoneKey(node) {
  return node.milestone && WEEK_ORDER.indexOf(node.milestone.title) >= 0
    ? node.milestone.title
    : "__project__";
}

function workstreamFor(node) {
  if (node.is_parent) return "objective";
  const labels = new Set(node.labels || []);
  if (labels.has("Testing")) return "qa";
  if (labels.has("NFC") || labels.has("Mobile")) return "nfc";
  if (labels.has("Hardware") || labels.has("Firmware")) return "edge";
  if (labels.has("Connectivity") || labels.has("Backend")) return "cloud";
  if (labels.has("Platform") || labels.has("Data & AI")) return "product";
  return "coordination";
}

function dueText(node) {
  if (!node.milestone || !node.milestone.due_on) return "Sin fecha";
  return new Date(node.milestone.due_on).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short"
  });
}

function shortTitle(text, max) {
  return text.length <= max ? text : text.slice(0, max - 1) + "…";
}

function assigneeLine(node) {
  if (!node.assignees || !node.assignees.length) return "Sin responsable";
  return node.assignees.map(function(a) {
    return PERSON_NAMES[a.login] || a.login;
  }).join(" · ");
}

const nodeByNumber = new Map(DATA.nodes.map(function(node) {
  return [node.number, node];
}));

const dependencyEdges = DATA.edges.filter(function(edge) {
  return edge.type === "dependency";
});

const subissueEdges = DATA.edges.filter(function(edge) {
  return edge.type === "subissue";
});

const rankByNumber = new Map(DATA.nodes.map(function(node) {
  return [node.number, 0];
}));

for (let pass = 0; pass < DATA.nodes.length; pass += 1) {
  let changed = false;
  dependencyEdges.forEach(function(edge) {
    const source = nodeByNumber.get(edge.source);
    const target = nodeByNumber.get(edge.target);
    if (!source || !target) return;
    if (milestoneKey(source) !== milestoneKey(target)) return;
    const next = (rankByNumber.get(source.number) || 0) + 1;
    if (next > (rankByNumber.get(target.number) || 0)) {
      rankByNumber.set(target.number, next);
      changed = true;
    }
  });
  if (!changed) break;
}

const BAND_ORDER = ["__project__"].concat(WEEK_ORDER);
const nodesByBand = new Map(BAND_ORDER.map(function(key) { return [key, []]; }));
DATA.nodes.forEach(function(node) {
  const key = milestoneKey(node);
  if (!nodesByBand.has(key)) nodesByBand.set(key, []);
  nodesByBand.get(key).push(node);
});

const maxRankByBand = new Map();
BAND_ORDER.forEach(function(key) {
  const nodes = nodesByBand.get(key) || [];
  let maxRank = 0;
  nodes.forEach(function(node) {
    maxRank = Math.max(maxRank, rankByNumber.get(node.number) || 0);
  });
  maxRankByBand.set(key, maxRank);
});

const rowCountMax = new Map(WORKSTREAMS.map(function(row) { return [row.key, 1]; }));
BAND_ORDER.forEach(function(band) {
  WORKSTREAMS.forEach(function(row) {
    const count = (nodesByBand.get(band) || []).filter(function(node) {
      return workstreamFor(node) === row.key;
    }).length;
    rowCountMax.set(row.key, Math.max(rowCountMax.get(row.key) || 1, count));
  });
});

const rowTop = new Map();
const rowHeight = new Map();
let cursorY = ROW_START_Y;
WORKSTREAMS.forEach(function(row) {
  const maxCount = rowCountMax.get(row.key) || 1;
  const height = Math.max(row.key === "objective" ? 210 : 230, maxCount * NODE_Y_GAP + 70);
  rowTop.set(row.key, cursorY);
  rowHeight.set(row.key, height);
  cursorY += height;
});
const GRAPH_HEIGHT = cursorY + 80;

const bandLayout = new Map();
let cursorX = LEFT_MARGIN;
BAND_ORDER.forEach(function(key) {
  const maxRank = maxRankByBand.get(key) || 0;
  const minWidth = key === "__project__" ? 430 : 610;
  const width = Math.max(minWidth, BAND_PAD_X * 2 + NODE_W + maxRank * RANK_X);
  bandLayout.set(key, {
    start: cursorX,
    width: width,
    center: cursorX + width / 2
  });
  cursorX += width + BAND_GAP;
});
const GRAPH_WIDTH = cursorX + 80;

const positionByNumber = new Map();
BAND_ORDER.forEach(function(bandKey) {
  const band = bandLayout.get(bandKey);
  WORKSTREAMS.forEach(function(row) {
    const group = (nodesByBand.get(bandKey) || [])
      .filter(function(node) { return workstreamFor(node) === row.key; })
      .sort(function(a, b) {
        const rankDiff = (rankByNumber.get(a.number) || 0) - (rankByNumber.get(b.number) || 0);
        return rankDiff || a.number - b.number;
      });

    group.forEach(function(node, index) {
      const rank = rankByNumber.get(node.number) || 0;
      positionByNumber.set(node.number, {
        x: band.start + BAND_PAD_X + NODE_W / 2 + rank * RANK_X,
        y: rowTop.get(row.key) + 58 + index * NODE_Y_GAP
      });
    });
  });
});

function statusClass(node) {
  if (node.state === "closed") return "closed";
  return node.is_blocked ? "blocked" : "ready";
}

function weekColor(node) {
  return WEEK_META[milestoneKey(node)].accent;
}

function weekFill(node) {
  return WEEK_META[milestoneKey(node)].fill;
}

function bandStats(key) {
  const nodes = nodesByBand.get(key) || [];
  return {
    open: nodes.filter(function(n) { return n.state === "open"; }).length,
    ready: nodes.filter(function(n) { return n.state === "open" && !n.is_blocked; }).length,
    blocked: nodes.filter(function(n) { return n.state === "open" && n.is_blocked; }).length
  };
}

const elements = [];

BAND_ORDER.forEach(function(key) {
  const band = bandLayout.get(key);
  const meta = WEEK_META[key];
  const stats = bandStats(key);

  elements.push({
    group: "nodes",
    data: {
      id: "band-" + key,
      kind: "band",
      milestone: key,
      label: ""
    },
    position: { x: band.center, y: GRAPH_HEIGHT / 2 },
    classes: "decorative band"
  });

  elements.push({
    group: "nodes",
    data: {
      id: "header-" + key,
      kind: "header",
      milestone: key,
      accent: meta.accent,
      label: meta.short + "\n" + meta.goal + "\n" + stats.ready + " listos · " + stats.blocked + " bloqueados"
    },
    position: { x: band.center, y: HEADER_Y },
    classes: "decorative week-header"
  });
});

WORKSTREAMS.forEach(function(row) {
  elements.push({
    group: "nodes",
    data: {
      id: "row-" + row.key,
      kind: "row-label",
      label: row.label
    },
    position: {
      x: 108,
      y: rowTop.get(row.key) + 58
    },
    classes: "decorative row-label"
  });
});

DATA.nodes.forEach(function(node) {
  const position = positionByNumber.get(node.number) || { x: 0, y: 0 };
  const milestone = milestoneKey(node);
  const meta = WEEK_META[milestone];
  const label = "#" + node.number + " · " + shortTitle(node.title, 48) + "\n" + assigneeLine(node);

  elements.push({
    group: "nodes",
    data: {
      id: "i" + node.number,
      kind: "issue",
      number: node.number,
      label: label,
      title: node.title,
      state: node.state,
      milestone: milestone,
      workstream: workstreamFor(node),
      rank: rankByNumber.get(node.number) || 0,
      accent: meta.accent,
      fill: meta.fill,
      status: statusClass(node)
    },
    position: position,
    classes: "issue " + statusClass(node) + (node.is_parent ? " parent" : "")
  });
});

DATA.edges.forEach(function(edge, index) {
  const source = nodeByNumber.get(edge.source);
  const target = nodeByNumber.get(edge.target);
  const crossWeek = source && target && milestoneKey(source) !== milestoneKey(target);
  const accent = source ? WEEK_META[milestoneKey(source)].accent : "#7b879d";

  elements.push({
    group: "edges",
    data: {
      id: edge.type + "-" + edge.source + "-" + edge.target + "-" + index,
      source: "i" + edge.source,
      target: "i" + edge.target,
      relation: edge.type,
      crossWeek: crossWeek ? "yes" : "no",
      edgeColor: crossWeek ? accent : "#657289",
      edgeWidth: crossWeek ? 2.4 : 1.45
    },
    classes: edge.type + (crossWeek ? " cross-week" : "")
  });
});

const cy = cytoscape({
  container: document.getElementById("cy"),
  elements: elements,
  wheelSensitivity: 0.14,
  minZoom: 0.12,
  maxZoom: 2.2,
  boxSelectionEnabled: false,
  autoungrabify: true,
  style: [
    {
      selector: "node.issue",
      style: {
        "shape": "round-rectangle",
        "width": NODE_W,
        "height": NODE_H,
        "background-color": "data(fill)",
        "label": "data(label)",
        "color": "#eef3fb",
        "font-size": 10.2,
        "font-weight": 600,
        "text-wrap": "wrap",
        "text-max-width": 194,
        "text-valign": "center",
        "text-halign": "center",
        "line-height": 1.28,
        "border-width": 2,
        "border-color": "data(accent)",
        "overlay-opacity": 0,
        "shadow-blur": 13,
        "shadow-color": "#000000",
        "shadow-opacity": 0.18,
        "shadow-offset-y": 5
      }
    },
    {
      selector: "node.issue.parent",
      style: {
        "font-weight": 800,
        "height": 76,
        "border-width": 2.5
      }
    },
    {
      selector: "node.issue.blocked",
      style: {
        "border-color": "#ef4444",
        "border-width": 3.2
      }
    },
    {
      selector: "node.issue.ready",
      style: {
        "border-color": "#22c55e",
        "border-width": 2.8
      }
    },
    {
      selector: "node.issue.closed",
      style: {
        "opacity": 0.38,
        "border-color": "#64748b"
      }
    },
    {
      selector: "node.issue.prerequisite-path",
      style: {
        "opacity": 1,
        "border-color": "#60a5fa",
        "border-width": 3.5,
        "background-color": "#101b2f",
        "shadow-color": "#2563eb",
        "shadow-opacity": 0.28
      }
    },
    {
      selector: "node.issue.downstream-path",
      style: {
        "opacity": 1,
        "border-color": "#f59e0b",
        "border-width": 3.5,
        "background-color": "#241b0d",
        "shadow-color": "#d97706",
        "shadow-opacity": 0.28
      }
    },
    {
      selector: "node.issue.selected-issue",
      style: {
        "opacity": 1,
        "border-color": "#f8fafc",
        "border-width": 4.5,
        "background-color": "#202b42",
        "shadow-color": "#f8fafc",
        "shadow-opacity": 0.34,
        "shadow-blur": 22,
        "z-index": 1000
      }
    },
    {
      selector: "node.band",
      style: {
        "shape": "round-rectangle",
        "width": function(ele) {
          const band = bandLayout.get(ele.data("milestone"));
          return band ? band.width - 18 : 500;
        },
        "height": GRAPH_HEIGHT - 30,
        "background-color": function(ele) {
          return WEEK_META[ele.data("milestone")].fill;
        },
        "background-opacity": 0.42,
        "border-width": 1,
        "border-color": function(ele) {
          return WEEK_META[ele.data("milestone")].accent;
        },
        "border-opacity": 0.28,
        "events": "no",
        "z-index": 0
      }
    },
    {
      selector: "node.week-header",
      style: {
        "shape": "round-rectangle",
        "width": 310,
        "height": 76,
        "background-color": "#111827",
        "background-opacity": 0.98,
        "border-width": 2,
        "border-color": "data(accent)",
        "label": "data(label)",
        "color": "#f8fafc",
        "font-size": 10.5,
        "font-weight": 800,
        "text-wrap": "wrap",
        "text-max-width": 270,
        "text-valign": "center",
        "text-halign": "center",
        "line-height": 1.35,
        "events": "no",
        "z-index": 4
      }
    },
    {
      selector: "node.row-label",
      style: {
        "shape": "round-rectangle",
        "width": 168,
        "height": 34,
        "background-color": "#111827",
        "background-opacity": 0.92,
        "border-width": 1,
        "border-color": "#2d394f",
        "label": "data(label)",
        "color": "#9eabc2",
        "font-size": 10,
        "font-weight": 700,
        "text-valign": "center",
        "text-halign": "center",
        "events": "no",
        "z-index": 3
      }
    },
    {
      selector: "edge",
      style: {
        "curve-style": "taxi",
        "taxi-direction": "horizontal",
        "taxi-turn": 34,
        "taxi-turn-min-distance": 18,
        "width": "data(edgeWidth)",
        "line-color": "data(edgeColor)",
        "target-arrow-color": "data(edgeColor)",
        "target-arrow-shape": "triangle",
        "arrow-scale": 0.72,
        "opacity": 0.58,
        "z-index": 1
      }
    },
    {
      selector: "edge.cross-week",
      style: {
        "opacity": 0.82
      }
    },
    {
      selector: "edge.prerequisite-path",
      style: {
        "line-color": "#60a5fa",
        "target-arrow-color": "#60a5fa",
        "width": 3.2,
        "opacity": 1,
        "z-index": 900
      }
    },
    {
      selector: "edge.downstream-path",
      style: {
        "line-color": "#f59e0b",
        "target-arrow-color": "#f59e0b",
        "width": 3.2,
        "opacity": 1,
        "z-index": 900
      }
    },
    {
      selector: "edge.subissue",
      style: {
        "curve-style": "taxi",
        "taxi-direction": "vertical",
        "line-style": "dashed",
        "line-color": "#4f5d75",
        "target-arrow-color": "#4f5d75",
        "width": 1.15,
        "opacity": 0.34
      }
    },
    {
      selector: ".dimmed",
      style: {
        "opacity": 0.07,
        "text-opacity": 0.07
      }
    },
    {
      selector: ".focused",
      style: {
        "opacity": 1,
        "text-opacity": 1,
        "z-index": 999
      }
    }
  ],
  layout: {
    name: "preset",
    fit: false,
    animate: false
  }
});

function visibleIssueNodes() {
  return cy.nodes("node.issue").filter(function(node) {
    return node.style("display") !== "none";
  });
}

function fitVisible() {
  const visible = visibleIssueNodes();
  const decor = cy.nodes(".decorative").filter(function(node) {
    return node.style("display") !== "none";
  });
  const collection = visible.union(decor);
  if (collection.length) cy.fit(collection, 46);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function issueLink(number) {
  const node = nodeByNumber.get(number);
  if (!node) return "";
  return '<a class="relation" href="' + node.url + '" target="_blank" rel="noreferrer">#' +
    node.number + " · " + escapeHtml(node.title) + "</a>";
}

function directPrerequisites(number) {
  return dependencyEdges
    .filter(function(edge) { return edge.target === number; })
    .map(function(edge) { return edge.source; });
}

function directDependents(number) {
  return dependencyEdges
    .filter(function(edge) { return edge.source === number; })
    .map(function(edge) { return edge.target; });
}

function renderDetails(number, story) {
  const node = nodeByNumber.get(number);
  if (!node) return;

  const labels = (node.labels || []).length
    ? node.labels.map(function(label) {
        return '<span class="pill">' + escapeHtml(label) + "</span>";
      }).join("")
    : '<span class="empty">Sin labels.</span>';

  const directBefore = directPrerequisites(number);
  const directAfter = directDependents(number);

  const blockers = directBefore.length
    ? directBefore.map(issueLink).join("")
    : '<span class="empty">No depende directamente de otro issue.</span>';

  const blocking = directAfter.length
    ? directAfter.map(issueLink).join("")
    : '<span class="empty">No desbloquea otro issue directamente.</span>';

  const parents = node.parents.length
    ? node.parents.map(issueLink).join("")
    : '<span class="empty">Sin parent issue.</span>';

  const children = node.children.length
    ? node.children.map(issueLink).join("")
    : '<span class="empty">Sin sub-issues.</span>';

  const beforeCount = story ? story.beforeNodes.length : 0;
  const afterCount = story ? story.afterNodes.length : 0;
  const stateClass = node.state === "closed" ? "closed" : (node.is_blocked ? "blocked" : "ready");
  const stateLabel = node.state === "closed" ? "Cerrado" : (node.is_blocked ? "Bloqueado" : "Listo");

  document.getElementById("details").innerHTML =
    '<h2>#' + node.number + " · " + escapeHtml(node.title) + "</h2>" +
    '<div><span class="pill ' + stateClass + '">' + stateLabel + "</span>" +
    '<span class="pill">Nivel ' + (rankByNumber.get(node.number) || 0) + "</span></div>" +
    '<div class="story-flow">' +
      '<div class="story-step before"><strong>← Antes</strong><span>' +
        beforeCount + ' issue' + (beforeCount === 1 ? '' : 's') +
        ' forman la cadena que debe llegar hasta aquí.</span></div>' +
      '<div class="story-step current"><strong>Issue seleccionado</strong><span>#' +
        node.number + ' · ' + escapeHtml(node.title) + '</span></div>' +
      '<div class="story-step after"><strong>Después →</strong><span>Al completarlo, queda en la ruta hacia ' +
        afterCount + ' issue' + (afterCount === 1 ? '' : 's') + ' posteriores.</span></div>' +
    "</div>" +
    '<a class="github-link" href="' + node.url + '" target="_blank" rel="noreferrer">Abrir en GitHub ↗</a>' +
    "<h3>Necesita directamente</h3><div>" + blockers + "</div>" +
    "<h3>Desbloquea directamente</h3><div>" + blocking + "</div>" +
    "<h3>Milestone</h3><div class=\"muted\">" +
      escapeHtml(node.milestone ? node.milestone.title : "Proyecto / sin milestone") +
      "<br>Cierra: " + escapeHtml(dueText(node)) + "</div>" +
    "<h3>Responsables</h3><div class=\"muted\">" + escapeHtml(assigneeLine(node)) + "</div>" +
    "<h3>Capa</h3><div class=\"muted\">" +
      escapeHtml(WORKSTREAMS.find(function(row) { return row.key === workstreamFor(node); }).label) +
      "</div>" +
    "<h3>Parent</h3><div>" + parents + "</div>" +
    "<h3>Sub-issues</h3><div>" + children + "</div>" +
    "<h3>Labels</h3><div>" + labels + "</div>" +
    '<div class="legend">' +
      '<div class="legend-row"><span class="line before"></span> azul: prerequisites → issue seleccionado</div>' +
      '<div class="legend-row"><span class="line after"></span> ámbar: issue seleccionado → trabajo posterior</div>' +
      '<div class="legend-row"><span class="line dashed"></span> parent / sub-issue</div>' +
    "</div>";
}

function directionalDependencyStory(nodeEle) {
  let beforeNodes = cy.collection();
  let beforeEdges = cy.collection();
  let afterNodes = cy.collection();
  let afterEdges = cy.collection();

  const seenBefore = new Set([nodeEle.id()]);
  const beforeQueue = [nodeEle];
  while (beforeQueue.length) {
    const current = beforeQueue.shift();
    current.connectedEdges("edge.dependency").forEach(function(edge) {
      if (edge.target().id() !== current.id()) return;
      const prerequisite = edge.source();
      beforeEdges = beforeEdges.union(edge);
      beforeNodes = beforeNodes.union(prerequisite);
      if (!seenBefore.has(prerequisite.id())) {
        seenBefore.add(prerequisite.id());
        beforeQueue.push(prerequisite);
      }
    });
  }

  const seenAfter = new Set([nodeEle.id()]);
  const afterQueue = [nodeEle];
  while (afterQueue.length) {
    const current = afterQueue.shift();
    current.connectedEdges("edge.dependency").forEach(function(edge) {
      if (edge.source().id() !== current.id()) return;
      const dependent = edge.target();
      afterEdges = afterEdges.union(edge);
      afterNodes = afterNodes.union(dependent);
      if (!seenAfter.has(dependent.id())) {
        seenAfter.add(dependent.id());
        afterQueue.push(dependent);
      }
    });
  }

  return {
    beforeNodes: beforeNodes,
    beforeEdges: beforeEdges,
    afterNodes: afterNodes,
    afterEdges: afterEdges
  };
}

function clearFocus() {
  cy.elements().removeClass(
    "dimmed focused prerequisite-path downstream-path selected-issue"
  );
}

cy.on("tap", "node.issue", function(event) {
  const selected = event.target;
  const story = directionalDependencyStory(selected);

  clearFocus();

  cy.nodes("node.issue").addClass("dimmed");
  cy.edges().addClass("dimmed");
  cy.nodes(".decorative").removeClass("dimmed");

  story.beforeNodes
    .removeClass("dimmed")
    .addClass("focused prerequisite-path");
  story.beforeEdges
    .removeClass("dimmed")
    .addClass("focused prerequisite-path");

  story.afterNodes
    .removeClass("dimmed")
    .addClass("focused downstream-path");
  story.afterEdges
    .removeClass("dimmed")
    .addClass("focused downstream-path");

  selected
    .removeClass("dimmed prerequisite-path downstream-path")
    .addClass("focused selected-issue");

  renderDetails(selected.data("number"), story);
});

cy.on("tap", function(event) {
  if (event.target === cy) {
    clearFocus();
    document.getElementById("details").innerHTML =
      '<h2>Selecciona un issue</h2>' +
      '<p class="empty">Azul muestra todo lo que debe ocurrir antes. Ámbar muestra todo lo que este issue ayuda a desbloquear después.</p>' +
      '<div class="legend">' +
        '<div class="legend-row"><span class="line before"></span> prerequisites → seleccionado</div>' +
        '<div class="legend-row"><span class="line after"></span> seleccionado → downstream</div>' +
        '<div class="legend-row"><span class="line dashed"></span> parent / sub-issue</div>' +
      '</div>';
  }
});

const milestoneSelect = document.getElementById("milestone");
WEEK_ORDER.forEach(function(name) {
  const option = document.createElement("option");
  option.value = name;
  option.textContent = name;
  milestoneSelect.appendChild(option);
});

function renderMilestoneStrip() {
  const strip = document.getElementById("milestone-strip");
  strip.innerHTML = "";
  WEEK_ORDER.forEach(function(name) {
    const stats = bandStats(name);
    const meta = WEEK_META[name];
    const sample = (nodesByBand.get(name) || []).find(function(node) { return node.milestone; });
    const due = sample ? dueText(sample) : "—";

    const button = document.createElement("button");
    button.className = "milestone-card";
    button.style.setProperty("--week-color", meta.accent);
    button.dataset.milestone = name;
    button.innerHTML =
      '<span class="week">' + escapeHtml(meta.short) + "</span>" +
      '<span class="goal">' + escapeHtml(meta.goal) + "</span>" +
      '<span class="mini">Cierra ' + escapeHtml(due) + " · " +
        stats.ready + " listos · " + stats.blocked + " bloqueados</span>";

    button.addEventListener("click", function() {
      milestoneSelect.value = milestoneSelect.value === name ? "" : name;
      applyFilters();
    });
    strip.appendChild(button);
  });
}

function renderSummary(visibleCount) {
  const summary = document.getElementById("summary");
  summary.innerHTML =
    '<span class="metric"><strong>' + visibleCount + "</strong> visibles</span>" +
    '<span class="metric"><strong>' + DATA.summary.ready + "</strong> listos</span>" +
    '<span class="metric"><strong>' + DATA.summary.blocked + "</strong> bloqueados</span>" +
    '<span class="metric"><strong>' + DATA.summary.dependency_edges + "</strong> dependencias</span>";
}

function applyFilters() {
  const query = document.getElementById("search").value.trim().toLowerCase();
  const milestone = milestoneSelect.value;
  const state = document.getElementById("state").value;
  const relation = document.getElementById("relations").value;

  clearFocus();

  cy.batch(function() {
    cy.nodes("node.issue").forEach(function(ele) {
      const node = nodeByNumber.get(ele.data("number"));
      const haystack = [
        "#" + node.number,
        node.title,
        (node.labels || []).join(" "),
        (node.assignees || []).map(function(a) { return a.login; }).join(" "),
        node.milestone ? node.milestone.title : ""
      ].join(" ").toLowerCase();

      let visible = !query || haystack.indexOf(query) >= 0;
      if (milestone && milestoneKey(node) !== milestone) visible = false;
      if (state === "open" && node.state !== "open") visible = false;
      if (state === "closed" && node.state !== "closed") visible = false;
      if (state === "ready" && (node.state !== "open" || node.is_blocked)) visible = false;
      if (state === "blocked" && (node.state !== "open" || !node.is_blocked)) visible = false;

      ele.style("display", visible ? "element" : "none");
    });

    cy.edges().forEach(function(edge) {
      let visible = true;
      if (relation !== "both" && edge.data("relation") !== relation) visible = false;
      if (edge.source().style("display") === "none" || edge.target().style("display") === "none") {
        visible = false;
      }
      edge.style("display", visible ? "element" : "none");
    });

    cy.nodes(".band, .week-header").forEach(function(ele) {
      const key = ele.data("milestone");
      const visible = !milestone || key === milestone;
      ele.style("display", visible ? "element" : "none");
    });

    cy.nodes(".row-label").style("display", "element");
  });

  document.querySelectorAll(".milestone-card").forEach(function(card) {
    card.classList.toggle("active", !!milestone && card.dataset.milestone === milestone);
  });

  renderSummary(visibleIssueNodes().length);
  window.setTimeout(fitVisible, 20);
}

["search", "milestone", "state", "relations"].forEach(function(id) {
  document.getElementById(id).addEventListener(id === "search" ? "input" : "change", applyFilters);
});

document.getElementById("fit").addEventListener("click", fitVisible);
document.getElementById("reset").addEventListener("click", function() {
  document.getElementById("search").value = "";
  milestoneSelect.value = "";
  document.getElementById("state").value = "open";
  document.getElementById("relations").value = "dependency";
  applyFilters();
});

renderMilestoneStrip();
renderSummary(DATA.nodes.filter(function(node) { return node.state === "open"; }).length);
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
