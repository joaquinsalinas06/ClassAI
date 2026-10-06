#!/usr/bin/env bash
set -euo pipefail

OWNER="joaquinsalinas06"
REPO="ClassAI"
REPO_FULL="$OWNER/$REPO"
PROJECT_TITLE="ClassAI Delivery"

command -v gh >/dev/null 2>&1 || {
  echo "ERROR: GitHub CLI (gh) no está instalado."
  exit 1
}

echo "==> Verificando acceso a GitHub Projects..."
if ! gh project list --owner "$OWNER" --limit 1 >/dev/null 2>&1; then
  echo "Falta el scope 'project' en GitHub CLI."
  echo "Ejecuta: gh auth refresh -s project"
  exit 1
fi

PROJECT_NUMBER="$(gh project list --owner "$OWNER" --limit 100 --format json --jq '.projects[] | select(.title == "ClassAI Delivery") | .number' | head -n1)"

if [ -z "$PROJECT_NUMBER" ]; then
  echo "==> Creando Project: $PROJECT_TITLE"
  PROJECT_NUMBER="$(gh project create --owner "$OWNER" --title "$PROJECT_TITLE" --format json --jq '.number')"
else
  echo "==> Reutilizando Project existente #$PROJECT_NUMBER"
fi

gh project edit "$PROJECT_NUMBER"   --owner "$OWNER"   --description "Plan de entrega de ClassAI. Milestones nativos = semanas; Priority y Target date = campos del Project; labels = áreas/modos."   --visibility PUBLIC >/dev/null

gh project link "$PROJECT_NUMBER" --owner "$OWNER" --repo "$REPO" >/dev/null 2>&1 || true

field_exists() {
  local field_name="$1"
  gh project field-list "$PROJECT_NUMBER" --owner "$OWNER" --format json     --jq ".fields[] | select(.name == \"$field_name\") | .name"     | grep -qx "$field_name"
}

if ! field_exists "Priority"; then
  echo "==> Creando campo Priority"
  gh project field-create "$PROJECT_NUMBER"     --owner "$OWNER"     --name "Priority"     --data-type SINGLE_SELECT     --single-select-options "P0 — Critical,P1 — Important,P2 — Nice to have" >/dev/null
fi

if ! field_exists "Target date"; then
  echo "==> Creando campo Target date"
  gh project field-create "$PROJECT_NUMBER"     --owner "$OWNER"     --name "Target date"     --data-type DATE >/dev/null
fi

target_date_for_issue() {
  case "$1" in
    1|2|3|4|5|72) echo "2026-10-06" ;;
    6|7|8|9|10) echo "2026-10-07" ;;
    11|12|13|14|15|16|70|71) echo "2026-10-11" ;;
    17|18|19|20|21) echo "2026-10-13" ;;
    22|23|24|25|26) echo "2026-10-14" ;;
    27|28|29|30|31|32|73|74) echo "2026-10-18" ;;
    33|34|35|36|37) echo "2026-10-20" ;;
    38|39|40|41|42|75|76) echo "2026-10-21" ;;
    43|44|45|46|47|48) echo "2026-10-25" ;;
    60|61|62|63|64) echo "2026-10-27" ;;
    49|50|51|52|53|54) echo "2026-10-28" ;;
    55|56|57|58|59|69) echo "2026-11-01" ;;
    *) echo "" ;;
  esac
}

priority_from_labels() {
  local labels="$1"
  if [[ ",$labels," == *",priority:P0,"* ]]; then
    echo "P0 — Critical"
  elif [[ ",$labels," == *",priority:P1,"* ]]; then
    echo "P1 — Important"
  elif [[ ",$labels," == *",priority:P2,"* ]]; then
    echo "P2 — Nice to have"
  else
    echo ""
  fi
}

echo "==> Añadiendo issues abiertos y migrando metadata..."
while IFS=$'\t' read -r number url labels; do
  [ -z "$number" ] && continue

  gh project item-add "$PROJECT_NUMBER" --owner "$OWNER" --url "$url" >/dev/null 2>&1 || true

  priority="$(priority_from_labels "$labels")"
  if [ -n "$priority" ]; then
    gh project item-edit "$PROJECT_NUMBER"       --owner "$OWNER"       --url "$url"       --field "Priority"       --value "$priority" >/dev/null
  fi

  target_date="$(target_date_for_issue "$number")"
  if [ -n "$target_date" ]; then
    gh project item-edit "$PROJECT_NUMBER"       --owner "$OWNER"       --url "$url"       --field "Target date"       --date "$target_date" >/dev/null
  fi

  if [[ ",$labels," == *",priority:P0,"* ]]; then
    gh issue edit "$number" -R "$REPO_FULL" --remove-label "priority:P0" >/dev/null
  fi
  if [[ ",$labels," == *",priority:P1,"* ]]; then
    gh issue edit "$number" -R "$REPO_FULL" --remove-label "priority:P1" >/dev/null
  fi
  if [[ ",$labels," == *",priority:P2,"* ]]; then
    gh issue edit "$number" -R "$REPO_FULL" --remove-label "priority:P2" >/dev/null
  fi

done < <(
  gh issue list -R "$REPO_FULL" --state open --limit 200     --json number,url,labels     --jq '.[] | [.number, .url, ([.labels[].name] | join(","))] | @tsv'
)

PROJECT_URL="$(gh project view "$PROJECT_NUMBER" --owner "$OWNER" --format json --jq '.url')"

echo
echo "Migración terminada."
echo "Project: $PROJECT_URL"
echo
echo "Metadata final:"
echo "  - Milestone nativo: Semana 9 / 10 / 11 / 12"
echo "  - Priority (Project): P0 / P1 / P2"
echo "  - Target date (Project): deadline por clase/cierre semanal"
echo "  - Status (Project): flujo de trabajo"
echo "  - Labels: áreas, modos y clasificación útil"
echo "  - Sub-issues/dependencies: relaciones nativas de GitHub"
echo
echo "Los labels priority:* se retiraron después de migrar su valor."
echo "Abriendo el Project..."
gh project view "$PROJECT_NUMBER" --owner "$OWNER" --web
