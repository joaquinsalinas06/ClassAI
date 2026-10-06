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

gh project edit "$PROJECT_NUMBER"   --owner "$OWNER"   --description "Plan de entrega de ClassAI. Milestone = semana; Priority, Target date y Status viven en el Project; labels = dominio/contexto."   --visibility PUBLIC >/dev/null

gh project link "$PROJECT_NUMBER" --owner "$OWNER" --repo "$REPO" >/dev/null 2>&1 || true

field_exists() {
  local field_name="$1"
  gh project field-list "$PROJECT_NUMBER" --owner "$OWNER" --format json     --jq ".fields[] | select(.name == \"$field_name\") | .name"     | grep -qx "$field_name"
}

if ! field_exists "Priority"; then
  gh project field-create "$PROJECT_NUMBER"     --owner "$OWNER"     --name "Priority"     --data-type SINGLE_SELECT     --single-select-options "P0 — Critical,P1 — Important,P2 — Nice to have" >/dev/null
fi

if ! field_exists "Target date"; then
  gh project field-create "$PROJECT_NUMBER"     --owner "$OWNER"     --name "Target date"     --data-type DATE >/dev/null
fi

priority_for_issue() {
  case "$1" in
    3|5|7|10|15|16|20|32|41|46|47|48|52|53|55|56|57|76) echo "P1 — Important" ;;
    59) echo "P2 — Nice to have" ;;
    1|2|4|6|8|9|11|12|13|14|17|18|19|21|22|23|24|25|26|27|28|29|30|31|33|34|35|36|37|38|39|40|42|43|44|45|49|50|51|54|58|60|61|62|63|64|69|70|71|72|73|74|75) echo "P0 — Critical" ;;
    *) echo "" ;;
  esac
}

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

echo "==> Añadiendo issues abiertos al Project..."
while IFS=$'\t' read -r number url; do
  [ -z "$number" ] && continue

  gh project item-add "$PROJECT_NUMBER" --owner "$OWNER" --url "$url" >/dev/null 2>&1 || true

  priority="$(priority_for_issue "$number")"
  if [ -n "$priority" ]; then
    gh project item-edit "$PROJECT_NUMBER"       --owner "$OWNER"       --url "$url"       --field "Priority"       --value "$priority" >/dev/null
  fi

  target_date="$(target_date_for_issue "$number")"
  if [ -n "$target_date" ]; then
    gh project item-edit "$PROJECT_NUMBER"       --owner "$OWNER"       --url "$url"       --field "Target date"       --date "$target_date" >/dev/null
  fi
done < <(
  gh issue list -R "$REPO_FULL" --state open --limit 200     --json number,url     --jq '.[] | [.number, .url] | @tsv'
)

PROJECT_URL="$(gh project view "$PROJECT_NUMBER" --owner "$OWNER" --format json --jq '.url')"

echo
echo "Migración terminada."
echo "Project: $PROJECT_URL"
echo
echo "Estructura final:"
echo "  - Milestone: semana y fecha de cierre"
echo "  - Priority: campo estructurado del Project"
echo "  - Target date: fecha concreta por issue"
echo "  - Status: campo nativo del Project"
echo "  - Assignee: nativo del issue"
echo "  - Parent/Sub-issues: nativo"
echo "  - Blocked by/Blocking: nativo"
echo "  - Labels: dominio y contexto de ejecución"
echo
gh project view "$PROJECT_NUMBER" --owner "$OWNER" --web
