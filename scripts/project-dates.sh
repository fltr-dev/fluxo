#!/usr/bin/env bash
# Preenche no Fluxo's Project:
#   Start date ← dia em que o Status virou "In progress"
#   End date   ← dia em que o Status virou "Done"
# Usa a hora da última mudança de Status, não a hora em que o script roda.
# Só preenche datas vazias; data editada à mão nunca é sobrescrita.
# DRY_RUN=1 só lista o que faria.
#
# Em issues, Start/End date são Issue fields da organização (gravados na issue);
# em PRs e rascunhos, são campos do próprio Project.
set -euo pipefail

PROJECT=PVT_kwDOCjWFJ84BqKDP
PROJECT_START=PVTF_lADOCjWFJ84BqKDPzhoiY04
PROJECT_END=PVTF_lADOCjWFJ84BqKDPzhoiY0c
ISSUE_START=IFD_kgDOAbxAdw
ISSUE_END=IFD_kgDOAbxAeA

# Data vazia = fieldValueByName null. Em issues o valor vem como
# ProjectV2ItemIssueFieldValue (sem .date), então qualquer não-null conta como preenchido.
# ponytail: fuso fixo UTC-3 (Brasil sem horário de verão desde 2019); trocar por TZ se voltar.
pending=$(gh api graphql --paginate -f query='
query($endCursor: String) {
  organization(login: "fltr-dev") { projectV2(number: 6) {
    items(first: 100, after: $endCursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        status: fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name updatedAt } }
        start: fieldValueByName(name: "Start date") { __typename }
        end: fieldValueByName(name: "End date") { __typename }
        content { __typename ... on Issue { id number } ... on PullRequest { number } ... on DraftIssue { title } }
      }
    }
  } }
}' --jq '
.data.organization.projectV2.items.nodes[]
| select(.status.updatedAt != null)
| (.status.updatedAt | fromdate - 10800 | strftime("%Y-%m-%d")) as $d
| (if .content.number then "#\(.content.number)" else .content.title end) as $label
| (.content.__typename == "Issue") as $issue
| (if $issue then "issue \(.content.id)" else "item \(.id)" end) as $target
| if .status.name == "In progress" and .start == null then
    "\($target) \(if $issue then "'"$ISSUE_START"'" else "'"$PROJECT_START"'" end) \($d) Start date \($label)"
  elif .status.name == "Done" and .end == null then
    "\($target) \(if $issue then "'"$ISSUE_END"'" else "'"$PROJECT_END"'" end) \($d) End date \($label)"
  else empty end')

[ -z "$pending" ] && { echo "Nada a preencher."; exit 0; }

while read -r kind id field date label; do
  echo "$date → $label"
  [ -n "${DRY_RUN:-}" ] && continue
  if [ "$kind" = issue ]; then
    gh api graphql -f query='
      mutation($i: ID!, $f: ID!, $d: String!) {
        updateIssueFieldValue(input: { issueId: $i, issueField: { fieldId: $f, dateValue: $d } }) { clientMutationId }
      }' -f i="$id" -f f="$field" -f d="$date" > /dev/null
  else
    gh api graphql -f query='
      mutation($p: ID!, $i: ID!, $f: ID!, $d: Date!) {
        updateProjectV2ItemFieldValue(input: { projectId: $p, itemId: $i, fieldId: $f, value: { date: $d } }) { clientMutationId }
      }' -f p="$PROJECT" -f i="$id" -f f="$field" -f d="$date" > /dev/null
  fi
done <<< "$pending"
