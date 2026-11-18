#!/usr/bin/env bash
# Research to Impact — publish the current Google Sheet to the live site.
#
# Triggers the "Scheduled rebuild" workflow, which POSTs the Netlify build hook.
# Netlify then re-pulls the sheet and deploys. Takes about a minute.
#
#   ./tools/publish.sh          # trigger, then watch until it finishes
#   ./tools/publish.sh --quiet  # trigger and return immediately
#
# NOTE: each run is a Netlify PRODUCTION DEPLOY. The repo's rebuild.yml documents
# these as ~15 credits each against a 300-credit/month Free plan (~20 deploys a
# month). Preview locally with tools/preview.js — that is free — and publish in
# batches, not after every sheet edit.
set -euo pipefail

cd "$(dirname "$0")/.."

REPO="SummitPublicSchools/research-to-impact"
WORKFLOW="rebuild.yml"

# Guard: make sure we are pointed at the Summit repo, not another world's.
actual="$(git remote get-url origin 2>/dev/null || echo '')"
case "$actual" in
  *SummitPublicSchools/research-to-impact*) ;;
  *) echo "✋ origin is '$actual', not SummitPublicSchools/research-to-impact. Refusing to publish." >&2
     exit 1 ;;
esac

echo "→ Triggering a sheet rebuild on $REPO (production deploy)…"
gh workflow run "$WORKFLOW" --repo "$REPO"

if [ "${1:-}" = "--quiet" ]; then
  echo "✓ Triggered. Watch it at: https://github.com/$REPO/actions"
  exit 0
fi

echo "→ Waiting for the run to appear…"
for _ in $(seq 1 20); do
  id="$(gh run list --repo "$REPO" --workflow "$WORKFLOW" --limit 1 --json databaseId,status \
        --jq '.[0] | select(.status != "completed") | .databaseId' 2>/dev/null || true)"
  [ -n "${id:-}" ] && break
  sleep 2
done

if [ -z "${id:-}" ]; then
  echo "⚠ Could not find the new run. Check https://github.com/$REPO/actions"
  exit 0
fi

gh run watch "$id" --repo "$REPO" --exit-status || {
  echo "❌ The rebuild workflow failed. Open the run above; most likely the"
  echo "   NETLIFY_BUILD_HOOK secret needs re-adding."
  exit 1
}

echo
echo "✅ Build hook fired. Netlify is deploying now (~1 min)."
echo "   Live:   https://ignite-public-goods.netlify.app"
echo "   Deploys: https://app.netlify.com  (project: ignite-public-goods)"
