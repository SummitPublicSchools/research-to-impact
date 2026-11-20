# Research to Impact — project guide for AI sessions

Sheet-driven static website publishing Marshall Street's **Research to Impact (R2I)**
practices as public goods, fulfilling a Bill & Melinda Gates Foundation **Ignite grant**
(Global Access / open access). Practitioner-first, but also hosts research/funder content
without cluttering the practitioner experience. Licensed **CC BY 4.0**.

## Architecture

Google Sheet → `build.js` (fetches each tab as CSV via the gviz endpoint) → injects data +
SEO into `template.html` → writes `dist/index.html` → **Netlify auto-deploys on push to
`main`** (plus a nightly rebuild). **Content is edited in the Sheet, never in HTML.**

- **`build.js`** — fetch tabs, assemble page data + nav, normalize Drive/Vimeo links, inject
  SEO/OG meta, write `dist/`. `STRICT=1` exits non-zero on errors (duplicate ids); used by CI.
- **`template.html`** — the single-page shell; a `DATA` JSON blob is injected at build time.
  Client-side renders home/section/module views, hash deep-links, search, the gated email
  modal, and inline video players.
- **`fixtures/`** — sample CSVs mirroring the sheet. `SHEET_SOURCE=local node build.js` builds
  from them with no network. CI builds strict from fixtures.
- **`docs/`** — `editor-guide.md`, `sheet-guardrails.md`, `file-hosting.md`, `dashboard.md`,
  `sheet-sync.md`, `sheet-bridge.md`, `sheet-diff.md`, `design-plan.md`, `build-day.md`,
  `search.md`,
  `getting-claude-set-up.md`, `colab-migration.md`, `aaae-public-goods-crosswalk.md`.
  **`docs/apps-script/`** holds the container-bound scripts: `PublishFiles.gs` (builds the
  Files manifest) and `Guardrails.gs` (dropdowns + conditional formatting), both surfaced
  via an **"R2I" menu** in the sheet whose top item, **Update everything**, runs both; plus
  `Bridge.gs`, the write bridge (below), which has no menu item.
- **`tools/`** — `sheet.js` (bridge client), `publish.sh` (triggers the rebuild workflow),
  `preview.js`, `punchlist.js`, `accesscheck.sh`, `search-eval.mjs` (+ `search-queries.json`,
  the labelled query set).

## Build / test locally

```
SHEET_SOURCE=local STRICT=1 node build.js   # build from fixtures, strict (what CI runs)
node tools/search-eval.mjs                  # search invariant (also CI; any build)
node build.js && node tools/search-eval.mjs --score --verbose   # ranking floors (LIVE build)
```

CI (`.github/workflows/ci.yml`) runs the first two and smoke-checks the rendered page on
every push/PR. The repo has **no dependencies** — build and tools are Node stdlib only.

## Deploys

**Netlify auto-publish is ON.** A merge to `main` is live in roughly 3 seconds — there is no
manual publish step and no approval gate. Netlify posts **nothing** to GitHub for a production
deploy (only Deploy Previews get a check-run), so an absent GitHub check does not mean an
absent deploy. Verify against the live page, not against GitHub.

**Skip markers are asymmetric**, which has bitten this repo:

| Pushed how | Netlify reads the marker from |
|---|---|
| commit pushed directly to a branch | the **commit message** |
| pull request | the **PR title** — a marked commit still gets a Deploy Preview |

Use `[skip netlify]`, never the generic `[skip ci]`, which would also skip this repo's GitHub
Actions CI. The keepalive commit in `.github/workflows/rebuild.yml` carries the marker because
without it each scheduled rebuild fired *two* production deploys (the build hook's, plus the
keepalive push's) at roughly double the credits. Don't remove it without redoing that maths —
the header comment in that workflow has the evidence.

A squash merge concatenates commit messages into the body, so a literal marker anywhere in the
branch's history can leak into the merge commit. Prefer a merge commit when any commit message
contains one.

## Key concepts & gotchas

- **Tiers** (`tier` on the Sections tab) drive prominence: `IGNITE` (practice toolkits) +
  `Own` (Leading Implementation) = homepage cards + top nav; `Stories` + `Evidence` =
  secondary, shown in the **"Evidence & Stories"** dropdown; `R2I` = the **"Collections"**
  dropdown (cross-cutting topics, shown as "soon" chips until that section is live);
  `Site` = the About page. The two dropdown labels are constants in `build.js`
  (`SECONDARY_NAV_LABEL`, `COLLECTIONS_NAV_LABEL`); their **contents stay sheet-driven**.
  **A dropdown with one section left renders as a plain link to that section**, under its
  own name rather than the group label — a label promising a menu of one reads badly. That
  is decided in `template.html` (`navHtml`/`navDrawerHtml`) from the data, so the dropdown
  returns by itself when the sheet makes a second section live. The live sheet currently has
  one secondary section; the fixtures still have two, so CI covers both paths.
- **`nav_visible` is a sentinel, not a boolean**: `build.js` tests it against the literal
  string `'hidden-until-live'`. Any other value (including blank) means visible. Setting it
  to `no` or `FALSE` will **not** hide a section.
- **Nav grouping**: top-nav items group by `header_label` — sections sharing a label cluster
  with no divider between them.
- **gviz type coercion (IMPORTANT)**: if a column looks boolean to gviz, a stray text cell can
  be dropped/nulled on read. Booleans (`focal`/`published`/`gated`) must be **plain-text**
  `TRUE`/`FALSE`. `Guardrails.gs` enforces this; getting it wrong once caused a "Coming soon" bug.
- **Files manifest**: editors name a file starting with the resource `id` and drop it in the
  Drive "01 - Published" folder; `PublishFiles.gs` writes a `Files` tab mapping id→URL; the
  build wires the Download button. No URL pasting.
- **Videos play inline (Vimeo)**: `video_url` (resource Watch button → modal player),
  `landing_video` (Sections) and `module_video` (Modules) → embedded intro players. The parser
  handles numeric / unlisted (`vimeo.com/ID/HASH`, keeps the privacy hash) / player links and
  rescues a pasted embed snippet; non-Vimeo links fall back to opening in a new tab.
  **A video resource can keep its URL in `link_url` instead of `video_url`** — that is what
  `link_type = embed` means, and `resAction()` falls back to it. Both are resolved.
- **Vimeo links with no id are resolved at build time** (`resolveVimeoLinks` in `build.js`).
  Share links (`vimeo.com/share/<uuid>`) and **vanity links**
  (`vimeo.com/<user>/<slug>`) carry no video id, so the player cannot embed them. The build
  asks Vimeo's public **oEmbed** endpoint for the numeric `video_id` and swaps it in, keeping
  the `?h=` hash when oEmbed returns one. Don't go back to scraping the Vimeo page — Vimeo
  answers that with 403, which silently broke this for a long time: ten of eleven videos were
  opening in a new tab and only one link ever warned. On failure the original value is left
  alone and the build warns, naming the URL. The lookup only fires for links that need it, so
  a fixtures build makes no network calls; a live build costs a few seconds.
- **Intro videos show a still, not a live player** (`fetchVimeoPosters` in `build.js`,
  `videoBlock` in `template.html`). A live build asks the same oEmbed endpoint for each
  section/module intro video's `thumbnail_url` and duration; the page shows that still with a
  play button and only loads the Vimeo iframe on click. Fixtures builds skip the lookup, and a
  video with no still falls back to a navy panel with the same button — never a black box.
- **Search is ranked retrieval (BM25F) in the browser** — no server, no API, no cost,
  nothing that can be down, and it cannot invent a resource. It replaced a strict-AND
  keyword filter that returned **nothing for 17 of 18 natural-language questions** while
  answering every keyword query perfectly — invisible from the outside, because the
  queries a maintainer types are the ones that worked. Four things carry it: BM25F with
  field weights (**length normalisation is load-bearing** — the Library rows carry
  `body`/`why`/`quote` and otherwise win everything on word count), a hand-built
  `SEARCH_SYN` vocabulary table (**start here** for any "it didn't find X"), the site's
  own section/module names, and homepage tier. **Synonyms add, never replace** — removing
  the matched phrase demoted the visitor's own words. The panel's "Where to start" card
  shows the best-matching module's intro **straight from the sheet**, not a paraphrase.
  `tools/search-eval.mjs` holds 40 labelled queries with a never-tuned-on holdout split;
  CI runs the content-independent invariant, ranking floors need a live build and
  `--score`. See `docs/search.md`.
- **Gated email ask**: `gated=TRUE` shows a skippable HubSpot email prompt (a harmless
  placeholder until `hubspot_portal_id` / `hubspot_form_id` are set on the Site tab).
- **Lists tab + guardrails**: the `Lists` tab centralizes every dropdown's values; `Guardrails.gs`
  applies all dropdowns + conditional formatting **by header name** (so column-order quirks like
  the `gated`/`note` swap on a couple of tabs don't matter).

## Conventions & constraints

- `dist/` is generated — never edit by hand. Never hardcode content in `template.html`; it
  comes from the sheet.
- Deploys to Netlify (project `ignite-public-goods`); the site is **live at
  `researchtoimpact.marshall.org`** — note `marshall.org`, not `marshallstreet.org`, which
  has never resolved. The Site tab's `domain` feeds `__SEO_URL__` and now carries the live
  host, so `og:url` is correct — verify against the live page before assuming otherwise.
- **An AI session can write to the sheet's content tabs** through the bridge: a
  token-authenticated Apps Script web app (`docs/apps-script/Bridge.gs`) with `tools/sheet.js`
  as its client. See `docs/sheet-bridge.md`. Narrow by design — an allow-list of tabs and
  columns, no `id` changes, no deletes, no `Files`/`Lists` tab — and **every write is appended
  to a `BridgeLog` tab**, which is the audit trail and the undo list. The token lives in
  `.bridge-token` (gitignored, mode 600); never print it.
  What still needs a human at a computer: **editing the Apps Script itself** (including
  re-pasting `Bridge.gs` after a change here) and anything off the allow-list. For those,
  give exact click-by-click steps rather than attempting them.
- **Modules vs. `module` drift**: a resource's `module` is a dropdown fed by the Lists tab,
  but the Modules tab is hand-typed with no guard. When they drift, `modulesOf()` in
  `template.html` rescues the orphans by treating any module a published resource names as
  real — so the page self-heals, but the stale Modules row still renders beside it as an
  empty duplicate. Fix the sheet; don't rely on the rescue. Watch for this when verifying a
  rename: the rescue means the *new* name appears in the old build too, so poll for the
  **old** name disappearing, not the new one arriving.
