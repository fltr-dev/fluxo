#!/usr/bin/env bash
# Preenche no Fluxo's Project:
#   Start date ← dia em que o Status virou "In progress"
#   End date   ← dia em que o Status virou "Done"
# Usa a hora da última mudança de Status, não a hora em que o script roda.
# Só preenche datas vazias; data editada à mão nunca é sobrescrita.
# DRY_RUN=1 só lista o que faria.
set -euo pipefail

PROJECT=PVT_kwDOCjWFJ84BqKDP
START=PVTF_lADOCjWFJ84BqKDPzhoiY04
END=PVTF_lADOCjWFJ84BqKDPzhoiY0c

# ponytail: fuso fixo UTC-3 (Brasil sem horário de verão desde 2019); trocar por TZ se voltar.
pending=$(gh api graphql --paginate -f query='
query($endCursor: String) {
  organization(login: "fltr-dev") { projectV2(number: 6) {
    items(first: 100, after: $endCursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        status: fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name updatedAt } }
        start: fieldValueByName(name: "Start date") { ... on ProjectV2ItemFieldDateValue { date } }
        end: fieldValueByName(name: "End date") { ... on ProjectV2ItemFieldDateValue { date } }
        content { ... on Issue { number } ... on PullRequest { number } ... on DraftIssue { title } }
      }
    }
  } }
}' --jq '
.data.organization.projectV2.items.nodes[]
| select(.status.updatedAt != null)
| (.status.updatedAt | fromdate - 10800 | strftime("%Y-%m-%d")) as $d
| (if .content.number then "#\(.content.number)" else .content.title end) as $label
| if .status.name == "In progress" and .start.date == null then "\(.id) '"$START"' \($d) Start date \($label)"
  elif .status.name == "Done" and .end.date == null then "\(.id) '"$END"' \($d) End date \($label)"
  else empty end')

[ -z "$pending" ] && { echo "Nada a preencher."; exit 0; }

while read -r item field date label; do
  echo "$date → $label"
  [ -n "${DRY_RUN:-}" ] && continue
  gh api graphql -f query='
    mutation($p: ID!, $i: ID!, $f: ID!, $d: Date!) {
      updateProjectV2ItemFieldValue(input: { projectId: $p, itemId: $i, fieldId: $f, value: { date: $d } }) { clientMutationId }
    }' -f p="$PROJECT" -f i="$item" -f f="$field" -f d="$date" > /dev/null
done <<< "$pending"
