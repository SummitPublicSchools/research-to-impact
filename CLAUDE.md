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
- **`content/`** — plain text extracted from every file a published resource links to
  (`<drive-id>.txt`, pages split by a form feed, plus `manifest.json`). Written by
  `tools/index-files.mjs`, never by hand; `build.js` cuts it into passages and writes
  `dist/search-docs.json`, which the page fetches when search opens. `fixtures/content/`
  is invented sample text for CI.
- **`docs/`** — `editor-guide.md`, `sheet-guardrails.md`, `file-hosting.md`, `dashboard.md`,
  `sheet-sync.md`, `sheet-bridge.md`, `analytics.md`, `sheet-diff.md`, `design-plan.md`, `build-day.md`,
  `search.md`,
  `getting-claude-set-up.md`, `colab-migration.md`, `aaae-public-goods-crosswalk.md`.
  **`docs/apps-script/`** holds the container-bound scripts: `PublishFiles.gs` (builds the
  Files manifest) and `Guardrails.gs` (dropdowns + conditional formatting), both surfaced
  via an **"R2I" menu** in the sheet whose top item, **Update everything**, runs both; plus
  `Bridge.gs`, the write bridge (below), which has no menu item. `Analytics.gs` belongs to a
  **different** spreadsheet (the analytics log), not the content sheet.
- **`tools/`** — `sheet.js` (bridge client), `publish.sh` (triggers the rebuild workflow),
  `preview.js`, `punchlist.js`, `accesscheck.sh`, `index-files.mjs` (document text for
  search; needs `pdftotext`), `search-eval.mjs` (+ `search-queries.json`,
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
  `Own` (Leading Implementation) = homepage cards + the **"Toolkits"** menu in the top nav; `Stories` + `Evidence` =
  secondary, shown in the **"Evidence & Stories"** dropdown; `R2I` = the **"Collections"**
  dropdown (cross-cutting topics, shown as "soon" chips until that section is live);
  `Site` = the About page. The two dropdown labels are constants in `build.js`
  (`SECONDARY_NAV_LABEL`, `COLLECTIONS_NAV_LABEL`, plus `TOOLKITS_NAV_LABEL` for the
  toolkits menu); their **contents stay sheet-driven**.
  **A dropdown with one section left renders as a plain link to that section**, under its
  own name rather than the group label — a label promising a menu of one reads badly. That
  is decided in `template.html` (`navHtml`/`navDrawerHtml`) from the data, so the dropdown
  returns by itself when the sheet makes a second section live. The live sheet currently has
  one secondary section; the fixtures still have two, so CI covers both paths.
- **The header fits because the toolkits are one menu.** Logo, four nav items and Search
  need about 710px and sit on the page's 996px column; the Menu button takes over at 820px.
  Putting the toolkits back as separate links breaks that fit — re-measure before doing it.
  The site's name is not in the header (it read as clutter there): it is the eyebrow above
  the homepage headline (`short_name` on the Site tab, default "Research to Impact").
- **"Start here" is automatic** (`startPicks` in `template.html`). A toolkit page shows the
  first three featured resources of its Overview module, topped up from the modules after
  it; the homepage shows each toolkit's introduction. The Site tab's `start1_id`.. picks
  override the automatic ones only for the toolkit they all sit in.
- **About's Marshall Street panel and the footer logo link** come from three Site settings:
  `marshall_url` (https only), `about_marshall`, `about_marshall_cta`. No URL, no panel.
  **About's photo band** is `about_hero_image`: unset means the committed default
  (`practices/hero-home.jpg`), `none` removes it.
- **The Privacy page (`#/privacy`) is one Site setting, `privacy`** (`privacyBlocks` in
  `build.js`). A short line with no closing punctuation starts a section; every other line
  is a paragraph; an email address becomes a mail link. Blank means no page **and no footer
  link**. It says what the site collects — update it when that changes (analytics, a new
  embed, a new form).
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
  `--score`. **A field absent from `S_FIELDS` is not searched at all** — `who_for` sat
  unindexed for exactly this reason, so filling the column would have done nothing until
  it was added. Keep `who_for` filled on new resources: it carries the role words
  ("instructional coach", "paraeducator", "counselor") that appear nowhere else in the
  sheet. See `docs/search.md`.
- **Search also reads inside the linked files.** Extraction is deliberately *not* in the
  build: `tools/index-files.mjs` (weekly in `rebuild.yml`, or by hand) commits text to
  `content/`, and the build only does string work. **The sheet decides which resources
  come back; document passages only re-rank them or add a miss on stronger evidence** —
  letting passages vote on coverage buried correct results. A new file is searchable
  inside only after the tool has run. Sign-in-only files can never be indexed.
- **Audience lens ("I'm a…" in search)**: four broad lenses — Teachers, School leaders
  (includes coaches and counselors), District & network leaders, Funders & researchers —
  **derived at build time from `who_for`** by `audienceOf()` in `build.js`; there is no
  audience column. The build warns when a written `who_for` names no recognised role. The
  lens reorders results and never hides any. The choice lives in `localStorage` only.
- **Save, Done and Share**: a visitor can star a resource (Saved, in the header; in the
  menu on a phone), tick it **Done** with a checkbox, and **Share** it. **No account and no
  server**: Saved and Done are resource ids in `localStorage` (`r2i.saved`, `r2i.done`).
  Done is the visitor's own tick — pressing Open only highlights the checkbox; an earlier
  automatic "Opened" mark was dropped because opening is not reading. Share gives a link to
  one resource, `#/r/<id>`, which opens its module page with that card ringed (not the
  Drive file); phones use the system share sheet, computers get Copy link and a `mailto:`.
  `#/saved/id,id,…` shares a whole list. On a card the three are **quiet icons, not buttons**
  (`quick`): no border or label, grey until used, and each icon is also the record (the
  star fills, the tick turns green). Three labelled buttons read as clutter, and a "…"
  menu hid the state and had to repeat it on the card — both were tried. The Saved page
  keeps its checkbox on the row. All of it is safe only because ids never change —
  another reason not to rename one. Marks update in place (`refreshMarks`); a full
  `render()` scrolls to the top.
- **Gated email ask**: `gated=TRUE` shows a skippable HubSpot email prompt (a harmless
  placeholder until `hubspot_portal_id` / `hubspot_form_id` are set on the Site tab).
- **Footer "Get updates"**: hidden until `hubspot_portal_id` and `hubspot_updates_form_id`
  are set, then posts the email to HubSpot's public form endpoint (no HubSpot script). Its
  own form id keeps newsletter sign-ups apart from download emails. `build.js` passes on
  only well-formed ids (`hsId`) — the sheet's literal "(leave blank)" was once truthy.
- **Analytics is a Google Sheet, not a service** (`docs/analytics.md`). With
  `analytics_url` on the Site tab, `track()` in `template.html` posts anonymous events
  (views, opens by id, searches) to `docs/apps-script/Analytics.gs`, a web app bound
  to its **own** spreadsheet. **No cookies, nothing stored on the device** — the session id
  lives in a variable for one page load — which is what keeps the site free of a consent
  banner; don't move it into `localStorage` or add a tracking script without rethinking
  that. It is silent off the live `domain`, so previews and local builds never write rows.
  Saved and Done are deliberately **not** counted: the Privacy page says they never leave
  the browser. The build warns if analytics is on while the `privacy` text still says
  "no analytics".
- **Gated emails post straight to HubSpot's submissions endpoint** from the site's own
  form. HubSpot's embed script is not loaded on purpose (it carries cookie code).
- **Lists tab + guardrails**: the `Lists` tab centralizes every dropdown's values; `Guardrails.gs`
  applies all dropdowns + conditional formatting **by header name** (so column-order quirks like
  the `gated`/`note` swap on a couple of tabs don't matter).

## Conventions & constraints

- `dist/` is generated — never edit by hand. Never hardcode content in `template.html`; it
  comes from the sheet.
- **The link-preview image is the Site tab's `hero_image`, and nothing on the page uses
  it**, so a wrong value is invisible from the site: the sheet once named a file that was
  never committed and every shared link unfurled with no picture. `build.js` now checks the
  file exists under `assets/`, warns, and falls back to the homepage photo. The build also
  writes `robots.txt`, a one-entry `sitemap.xml` (every other view is a `#/` route) and a
  canonical tag, and copies the repo-root `404.html` into `dist/`.
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
