#!/usr/bin/env bash
set -u
R=~/Dev/express/research/raw
cd "$R"
F='number,title,body,author,createdAt,updatedAt,labels,comments,reactionGroups,state,url'
gh issue list -R expressjs/express --state open --limit 500 --json "$F" > issues-open.json
gh pr list -R expressjs/express --state open --limit 500 --json "$F,baseRefName,headRefName,isDraft,reviewDecision,additions,deletions,files" > prs-open.json
gh issue list -R expressjs/discussions --state open --limit 500 --json "$F" > tc-discussions-open.json
gh issue list -R expressjs/perf-wg --state all --limit 500 --json "$F" > perf-wg-all.json
gh issue list -R expressjs/security-wg --state all --limit 500 --json "$F" > security-wg-all.json 2>/dev/null || echo '[]' > security-wg-all.json
gh api repos/expressjs/express/security-advisories --paginate > advisories.json 2>/dev/null || echo '[]' > advisories.json
# GitHub Discussions on express (paginated GraphQL)
cursor=null; i=0; : > discussions.jsonl
while :; do
  if [ "$cursor" = null ]; then after=""; else after=", after:\"$cursor\""; fi
  out=$(gh api graphql -f query="{repository(owner:\"expressjs\",name:\"express\"){discussions(first:50$after){pageInfo{hasNextPage endCursor} nodes{number title url createdAt category{name} upvoteCount answer{body} author{login} body comments(first:30){totalCount nodes{author{login} body replies(first:10){nodes{author{login} body}}}}}}}}")
  echo "$out" | jq -c '.data.repository.discussions.nodes[]' >> discussions.jsonl
  more=$(echo "$out" | jq -r '.data.repository.discussions.pageInfo.hasNextPage'); cursor=$(echo "$out" | jq -r '.data.repository.discussions.pageInfo.endCursor')
  i=$((i+1)); [ "$more" = true ] && [ $i -lt 20 ] || break
done
# Closed issues/PRs: titles for skimming + targeted searches
gh issue list -R expressjs/express --state closed --limit 6000 --json number,title,labels,closedAt,stateReason,reactionGroups > issues-closed-titles.json
gh pr list -R expressjs/express --state merged --limit 3000 --json number,title,mergedAt,baseRefName > prs-merged-titles.json
for q in perf performance security vulnerability "6.x" v6 router async "req.query" redirect header http2 typescript; do
  gh api -X GET search/issues -f q="repo:expressjs/express is:closed $q" -f per_page=50 --jq '.items[]|{number,title,state,html_url,comments,reactions:.reactions.total_count}' >> closed-targeted.jsonl
done
# Full comment threads for open issues and PRs
mkdir -p threads
for n in $(jq -r '.[].number' issues-open.json prs-open.json); do
  gh api "repos/expressjs/express/issues/$n/comments" --paginate --jq '[.[]|{user:.user.login,created_at,body}]' > "threads/$n.json" 2>/dev/null
done
for n in $(jq -r '.[].number' prs-open.json); do
  gh api "repos/expressjs/express/pulls/$n/comments" --paginate --jq '[.[]|{user:.user.login,path,body}]' > "threads/$n.review.json" 2>/dev/null
done
gh api repos/expressjs/perf-wg/issues/15/comments --paginate --jq '[.[]|{user:.user.login,created_at,body}]' > threads/perf-wg-15.json
gh api repos/expressjs/discussions/issues/267/comments --paginate --jq '[.[]|{user:.user.login,created_at,body}]' > threads/tc-267.json
echo DONE
