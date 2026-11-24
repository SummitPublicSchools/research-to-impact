#!/usr/bin/env bash
# Research to Impact — public access check for every published download.
#
# Asks the question that matters before showing the site to the field or a funder:
# can someone who is NOT signed in to a Summit account actually open each file?
#
#   ./tools/accesscheck.sh                 # check the live site
#   ./tools/accesscheck.sh --out report.md # also write a shareable report
#
# Method (validated against Drive's own permission records on 2026-11-18):
#   For drive.google.com / docs.google.com links, an anonymous request returns
#     HTTP 200 -> the file is shared "anyone with the link"  (works in public)
#     HTTP 401 -> the file is restricted, usually domain-only (FAILS in public)
#   Confirmed both ways: rr-1-executive-summary (200 / anyoneWithLink) and
#   rdc-1-executive-summary + cp-1-infographic-and-impact-data
#   (401 / visibility UNLISTED_TO_DOMAIN, no anyoneWithLink entry).
#
#   Google throttles a burst of anonymous requests: an unpaced run once reported
#   77 of 108 files as "no response" when all but five were public. So each link
#   is retried (up to 4 times, backing off) on no response or HTTP 429, with a
#   short pause between links. A full run takes about three minutes. Anything
#   still unanswered is counted as UNKNOWN, never as public or as broken.
#
#   Vimeo is NOT checked: it returns 403 to any scripted client regardless of
#   whether the video is public, so a script cannot tell. Check videos in a browser.
#
# Read-only. Changes nothing, publishes nothing.
set -uo pipefail
cd "$(dirname "$0")/.."

SITE="${SITE_URL:-https://researchtoimpact.marshall.org}"
OUT=""
[ "${1:-}" = "--out" ] && OUT="${2:-access-report.md}"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "→ Fetching $SITE"
curl -sS --max-time 30 -o "$tmp/live.html" "$SITE" || { echo "Could not fetch the site." >&2; exit 1; }

node -e '
const fs=require("fs");
const h=fs.readFileSync(process.argv[1],"utf8");
const m=h.match(/const DATA\s*=\s*(\{[\s\S]*?\});\s*\n/);
if(!m){ console.error("Could not find the DATA blob in the page."); process.exit(1); }
const D=JSON.parse(m[1]);
const rows=[];
D.resources.filter(r=>r.published).forEach(r=>{
  if(r.link)      rows.push([r.id,r.section,r.module||"",r.title||"","file",r.link].join("\t"));
  if(r.video_url) rows.push([r.id,r.section,r.module||"",r.title||"","video",r.video_url].join("\t"));
});
fs.writeFileSync(process.argv[2], rows.join("\n"));
' "$tmp/live.html" "$tmp/urls.tsv" || exit 1

total=$(wc -l < "$tmp/urls.tsv" | tr -d ' ')
echo "→ Checking $total published links anonymously"

: > "$tmp/res.tsv"
while IFS=$'\t' read -r id section module title kind url; do
  [ -z "${url:-}" ] && continue
  case "$url" in
    *vimeo.com*) printf 'SKIPPED-VIMEO\t-\t%s\t%s\t%s\t%s\n' "$id" "$section" "$title" "$url" >> "$tmp/res.tsv"; continue ;;
  esac
  code="000"
  for try in 1 2 3 4; do
    code=$(curl -sS -L --max-time 25 --max-redirs 8 -o /dev/null -w '%{http_code}' "$url" 2>/dev/null) || code="000"
    [ "$code" != "000" ] && [ "$code" != "429" ] && break
    [ "$try" -lt 4 ] && sleep $((try * 5))
  done
  sleep 0.6
  case "$code" in
    200) v="PUBLIC" ;;
    401) v="SIGN-IN REQUIRED" ;;
    404|410) v="NOT FOUND" ;;
    000|429) v="UNKNOWN" ;;
    *)   v="UNEXPECTED-$code" ;;
  esac
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$v" "$code" "$id" "$section" "$title" "$url" >> "$tmp/res.tsv"
  printf '  %-18s %s\n' "$v" "$id"
done < "$tmp/urls.tsv"

bad=$(awk -F'\t' '$1=="SIGN-IN REQUIRED"||$1=="NOT FOUND"||$1 ~ /^UNEXPECTED/' "$tmp/res.tsv" | wc -l | tr -d ' ')
ok=$(awk -F'\t' '$1=="PUBLIC"' "$tmp/res.tsv" | wc -l | tr -d ' ')
vim=$(awk -F'\t' '$1=="SKIPPED-VIMEO"' "$tmp/res.tsv" | wc -l | tr -d ' ')
unk=$(awk -F'\t' '$1=="UNKNOWN"' "$tmp/res.tsv" | wc -l | tr -d ' ')

echo
echo "────────────────────────────────────────────────────────────"
printf '  %s public · %s BROKEN for the public · %s videos (check in a browser)\n' "$ok" "$bad" "$vim"
echo "────────────────────────────────────────────────────────────"
if [ "$unk" -gt 0 ]; then
  echo "  $unk could NOT be checked (no answer after 4 tries). Run again before"
  echo "  trusting this result:"
  awk -F'\t' '$1=="UNKNOWN" {print "    " $3}' "$tmp/res.tsv"
fi

if [ -n "$OUT" ]; then
  {
    echo "# Public access report"
    echo
    echo "Generated $(date -u '+%Y-%m-%dT%H:%M:%SZ') against $SITE, as an anonymous visitor."
    echo
    echo "| | Count |"
    echo "|---|---:|"
    echo "| Open to the public | $ok |"
    echo "| **Blocked for the public** | **$bad** |"
    echo "| Vimeo (needs a browser check) | $vim |"
    [ "$unk" -gt 0 ] && echo "| Could not be checked (run again) | $unk |"
    echo
    if [ "$bad" -gt 0 ]; then
      echo "## Blocked for the public"
      echo
      echo "Each of these is a live Download button that fails for anyone outside Summit."
      echo "Two possible fixes per row: share the file \`anyone with the link\`, **or** set"
      echo "\`published = FALSE\` on that row if the resource is not meant to be out yet."
      echo
      echo "| Section | id | Title | Status |"
      echo "|---|---|---|---|"
      awk -F'\t' '$1=="SIGN-IN REQUIRED"||$1=="NOT FOUND"||$1 ~ /^UNEXPECTED/ {printf "| %s | `%s` | %s | %s |\n",$4,$3,$5,$1}' "$tmp/res.tsv" | sort
      echo
    fi
    echo "## Videos not checked"
    echo
    echo "Vimeo returns 403 to scripted clients whether or not a video is public, so these"
    echo "must be opened in a browser while signed out:"
    echo
    awk -F'\t' '$1=="SKIPPED-VIMEO" {printf "- `%s` — %s\n",$3,$6}' "$tmp/res.tsv" | sort
  } > "$OUT"
  echo "[report written to $OUT]"
fi
