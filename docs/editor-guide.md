# Editor's Guide — running the site from the Google Sheet

This site is built entirely from one Google Sheet. You edit the sheet; a build reads
it and republishes the site. **You never touch code or HTML to change content.**
This guide explains every tab and column, what's allowed, and how a row you type
becomes a live page.

> Who this is for: the team writing and curating content (resources, stories,
> reports). No technical background needed.

---

## How your edits reach the site

```
You edit the Sheet  →  the build reads it  →  the site republishes
```

- **Nightly:** the site rebuilds automatically every night, so edits go live the
  next morning.
- **Now:** to publish immediately, a teammate with repo access runs
  *Actions → Scheduled rebuild → Run workflow* (or hits the Netlify build hook).
  Rebuild takes about a minute.

Two things make a change appear:
1. The data is in the right tab with the required columns filled in.
2. The resource is **published** (see below). Unpublished rows still show as
   "coming soon" so you can stage work in the open.

---

## The tabs

| Tab | What it controls |
| --- | --- |
| **Site** | Global text: site name, hero, footer, About copy, partner credits, HubSpot IDs. |
| **Sections** | The big areas of the site and where they sit in the nav. |
| **Modules** | The groupings inside each section (the sub-pages). |
| **One tab per section** (`Co-Planning`, `Repeated Reading`, `Routine Data Cycles`, `Leading Implementation`, `Stories & Spotlights`, `Evidence & Impact`, `R2I Library`, `Site Assets`) | The actual resources — one row per resource. |
| `Instructions`, `Column Guide` | Reference only. The build ignores these tabs. |

**Key rule:** a resource's section is the **tab it lives on**. To put a resource in
Co-Planning, add its row to the `Co-Planning` tab. There is no "section" column on
resource rows.

---

## Resource columns (the per-section tabs)

These are the columns the site actually uses. Fill these in:

| Column | What it does | Allowed values / notes |
| --- | --- | --- |
| `id` | Unique handle for the row. | Any unique text, no spaces (e.g. `co-1-getting-started-guide`). **Must be unique across the whole site.** |
| `module` | Which sub-page it appears on. | Must **exactly match** a `module_name` for this section on the Modules tab. |
| `title` | The resource name shown on the card. | Plain text. |
| `format` | Sets the icon and the "type" chip. | `Document`, `Deck`, `Tool`, `Protocol`, `Template`, `Case Study`, `Infographic`, `Video`, `Other` |
| `focal` | Featured? Featured items show as big cards; others sit in the "more" list. | `TRUE` / `FALSE` |
| `focal_order` | Order among featured items (1 = first). | A number, or blank. |
| `published` | Live or not. `FALSE` shows a "coming soon" card. | `TRUE` / `FALSE` |
| `status` | Your internal progress note (not publicly shown). | `planned`, `in_progress`, `ready` |
| `summary` | One- or two-sentence description on the card. | Plain text. Required for published featured cards. |
| `who_for` | Short "who this is for" line, shown under the card **and searched**. Worth filling on every resource: it carries the words people use for themselves ("instructional coach", "paraeducator", "counselor") that appear nowhere else, so without it those searches find nothing. | Plain text under 120 characters, e.g. `Instructional coaches observing a co-planning meeting`. |
| `link_url` | The file or page the Download button opens. | A Google Drive share link (preferred) or any URL. See **Adding files** below. |
| `video_url` | The Vimeo video the Watch button plays (in-page). | A Vimeo link (preferred). A non-Vimeo link still works but opens in a new tab. |
| `link_type` | Set to `embed` to mark a resource as a video. | `embed` or blank. (A `video_url` also marks it as a video.) |
| `image` | Optional image on the card. | A Drive image link or URL. See **Adding images**. |
| `date_published` | Drives the "New" badge (auto for ~30 days). | A date, or blank. |
| `gated` | Ask for an email before download (optional, skippable). | `TRUE` / `FALSE` — see **The email ask**. |
| `practice` *(Stories tab only)* | Ties a story to a practice so it also appears on that toolkit's page. | Must match a toolkit `section_name`, e.g. `Co-Planning`. |

**Reference/planning columns the site does _not_ display** (use them for your own
tracking): `priority`, `audience`, `extra_files`, `license`, `r2i_attribution`,
`owner`, `source_file`, `tags`, `related`, `note`. Leave them or use them freely —
they won't show on the site.

### Rich practice cards (Collections)

The Research-to-Impact Library tab uses five extra columns to reproduce the fuller
practice pages migrated from the old CoLab site (a photo, a narrative, a "Why it
Works" list, and an impact quote). They're optional — blank means a normal card —
but on a collection practice they render the full layout:

| Column | What it does | Allowed values / notes |
| --- | --- | --- |
| `image_caption` | Caption shown under the photo. | Plain text, e.g. `Ednovate, Los Angeles, CA`. |
| `body` | The full narrative. **Replaces `summary`** on the card when present. | Plain text. Separate paragraphs with a blank line. |
| `why_it_works` | The "Why it Works" bullet list. | Bullets separated by ` \|\| ` (space-pipe-pipe-space), e.g. `First point \|\| Second point`. |
| `quote` | The pull-quote (serif, accented). | Plain text, no quote marks needed. |
| `overview` | Marks the row as the **whole-collection** download → renders the orange "Full collection" CTA card at the top. | `TRUE` / `FALSE` (plain text — Guardrails enforces this). |

The practice **photos** for the migrated collections live in the repo at
`assets/collections/` and are referenced by the `image` column as a bare path
(e.g. `collections/collab-01.png`) — no Drive link needed.

### How a resource row becomes a live card
1. It's on a section tab → that's its section.
2. Its `module` matches a Modules row → it lands on that sub-page.
3. `published = TRUE` → it shows as "Available" (otherwise "coming soon").
4. `focal = TRUE` → it's a big featured card; otherwise it's in the "more" list.
5. `link_url` set → the Download button opens it.

---

## Adding files (Download button)

Two ways — see [`file-hosting.md`](file-hosting.md) for the full picture:

1. **Name-by-id (recommended).** Set `link_type = download`, leave `link_url` blank,
   and drop the file into the published-files Drive folder **named starting with the
   resource id**. An Apps Script keeps a `Files` tab up to date, and the build wires
   the Download button automatically. No URL pasting.
2. **Paste a link.** Set `link_type = external_link` and put a Google Doc / dashboard
   / Drive share link in `link_url`. The build cleans Drive links up automatically.
   This overrides option 1 for that one resource.

Either way, make sure the file/folder is shared **Anyone with the link → Viewer** or
people hit a "request access" wall (the Apps Script sets this for you).

## Adding images (card image)

Same idea: a Drive image link or any image URL in the `image` column. Drive links
are turned into an inline thumbnail automatically. Leave blank for no image.

## Adding video (plays in-page)

Videos live on **Vimeo** and play right on the page — no jumping off-site.

- **A video resource** (its own card with a Watch button): set `format = Video`,
  `link_type = embed`, and paste the Vimeo link into `video_url`. Watch opens an
  in-page player.
- **A section intro video**: put a Vimeo link in `landing_video` on the **Sections**
  tab — it plays at the top of that toolkit/practice page.
- **A module intro video**: put a Vimeo link in `module_video` on the **Modules**
  tab — it plays at the top of that module's page.

**Vimeo tips:** keep the Research to Impact videos in their own Vimeo folder, each
named starting with the resource id (same rule as files). Set each to **Hide from
Vimeo (unlisted)** so it stays off your public Vimeo profile but still plays on the
site — the privacy link (`vimeo.com/ID/HASH`) keeps working, hash and all. Any
non-Vimeo link (e.g. YouTube) still works but opens in a new tab instead of inline.

---

## The email ask (gated resources)

Set `gated = TRUE` to show a **soft, skippable** "add your email to download"
prompt before the file opens. Use it for the research/funder-facing items (white
papers, evaluation, reports) — **not** the practitioner toolkits, which should stay
friction-free. "No thanks, just download" always works, so it never blocks anyone.

Emails flow to HubSpot once the `hubspot_portal_id` and `hubspot_form_id` are set on
the **Site** tab. Until then a harmless placeholder shows and downloads still work.

---

## Module photos and intro videos

A module row can carry **one** piece of media above its resources:

| Column | Holds |
|---|---|
| `module_image` | a photo — a Drive link, or a path like `practices/hero-coplanning.jpg` |
| `module_video` | a Vimeo link |

**If both are filled the video wins** and the photo is not shown. They sit in
the same place at the same size, and stacking two large media blocks pushes the
resources off the screen. Fill one.

Photos render hard-edged at 560px wide, 16:9, cropped to fill — so a landscape
photo with its subject near the middle works best. Portraits get cropped badly.

---

## Sections tab

| Column | What it does | Allowed values |
| --- | --- | --- |
| `section_id` | Internal handle. | unique text, no spaces |
| `section_name` | The section's display name (and the matching resource tab name). | text |
| `header_label` | Groups items in the nav (sections sharing a label cluster together). | text |
| `tier` | **Controls how the section surfaces** (see below). | `IGNITE`, `Own`, `Stories`, `Evidence`, `R2I`, `Site` |
| `order` | Left-to-right / top-to-bottom order. | a number |
| `nav_visible` | `hidden-until-live` keeps a section out of the public nav until you're ready. | `yes` / `hidden-until-live` |
| `landing_intro` | The intro paragraph on the section page. | text |
| `landing_video` | Optional Vimeo video that plays at the top of the section page. | A Vimeo link, or blank. |
| `header_image` | Optional banner image at the top of the section page. | A Drive image link, a URL, or a bare filename in `assets/`. Leave blank for none. |

**What each `tier` does:**
- `IGNITE` — a practice toolkit. Homepage card **and** browsable pages, with intro video.
- `Own` — Leading Implementation. Same prominence as a toolkit.
- `Stories` — Stories & Spotlights. Browsable + in the nav, but **not** on the homepage.
- `Evidence` — Evidence & Impact. Same as Stories: secondary, demoted from the homepage.
- `R2I` — the Research-to-Impact Library (shows as the nav dropdown).
- `Site` — the About page.

To launch a section that's currently hidden, change its `nav_visible` to `yes`. No
code change needed.

## Modules tab

| Column | What it does |
| --- | --- |
| `section` | Which section this module belongs to (matches a `section_name`). |
| `module_order` | Order of modules within the section. |
| `module_name` | The module's name — **resource rows reference this exactly.** |
| `module_intro` | Optional intro on the module page. |
| `module_video` | Optional Vimeo video that plays at the top of the module page. |

## Site tab

Key/value settings: `site_name`, `tagline`, `hero_headline`, `hero_subhead`,
`hero_cta_label`, `footer_attribution`, `license_line`, the `about_*` paragraphs,
`about_hero_image` (the photo across the top of About: a file name under `assets/` or a
Drive link; leave it out for the default photo, or write `none` for no photo),
`about_network` (partner + funder credits), and the HubSpot keys
(`hubspot_portal_id`, `hubspot_form_id`, `hubspot_region`). Leave a setting blank
and the build will warn that its page area may render empty.

### The homepage proof band

The navy band of outcome numbers under the hero is built from numbered Site
settings, four keys per stat:

| Setting | Holds | Example |
|---|---|---|
| `proofN_stat` | the number, written exactly as it should read | `79% → 97%` |
| `proofN_label` | what the number measures, a few words | `course pass rate` |
| `proofN_source` | the school or network it comes from | `Ednovate` |
| `proofN_source_id` | *optional* — the `id` of the resource it comes from | `collab-student-work-analysis` |

Number them from 1 upwards with no gaps; the build stops at the first missing
`proofN_stat`. **The band needs at least two stats to appear at all** — a single
number reads as an orphan — and with none defined the homepage renders exactly
as it did before, so it is safe to leave empty while you gather them.

`proofN_source_id` turns the stat into a link to the module page holding that
resource, so a reader can go straight to the evidence. If the id does not match
a *published* resource the build warns and the stat still renders, just without
the link — it never produces a dead link.

Keep `stat` short: it is set at display size and four of them share one row on a
desktop screen. Write the arrow as a real `→` if you want one; the build prints
the value exactly as typed.

---

## Recommended Google Sheets data-validation (dropdowns)

Set these up once via **Data → Data validation** so editors can't enter an invalid
value. This prevents almost every build warning at the source.

| Tab | Column | Dropdown values |
| --- | --- | --- |
| every resource tab | `format` | Document, Deck, Tool, Protocol, Template, Case Study, Infographic, Video, Other |
| every resource tab | `focal`, `published`, `gated` | TRUE, FALSE |
| every resource tab | `status` | planned, in_progress, ready |
| Stories & Spotlights | `practice` | Co-Planning, Repeated Reading, Routine Data Cycles *(blank = general)* |
| Sections | `tier` | IGNITE, Own, Stories, Evidence, R2I, Site |
| Sections | `nav_visible` | yes, hidden-until-live |

Also worth adding: **conditional formatting** to flag a blank `summary` when
`published = TRUE`, and a sheet rule that `id` values are unique.

---

## Common build warnings and how to fix them

| Warning | Cause | Fix |
| --- | --- | --- |
| *"Resource X → module Y not found"* | `module` doesn't match a Modules row for that section. | Make the `module` value match exactly (watch spelling/casing). |
| *"Published focal resource has no summary"* | A featured, live card with an empty `summary`. | Add a one-line `summary`. |
| *"Site setting blank"* | A Site key is empty. | Fill it in on the Site tab. |
| *"returned 0 rows"* | Tab missing, renamed, or the header row lacks an `id` column. | Check the tab name and that row 1 has the column headers. |
| *"header row has no `id` column … Rows will be dropped"* | The first header cell (usually **A1**) is blank or got replaced with a space, so the build can't find the `id` column and **drops every row on that tab** — the whole toolkit publishes empty, silently. (Guardrails also shows that tab as `·` instead of `✓`.) | Put the literal text **`id`** back in cell A1 of that tab, then re-run **R2I → Update everything**. |

When in doubt, ask a teammate to run the build and read the warnings — every problem
is reported by name, nothing fails silently.

## Save, Done and Share (what visitors can do on their own)

Every published resource has three small icons beside Open or Watch. They are grey
until used; the star fills and the tick turns green:

- **Save** (the star) keeps it in the visitor's personal **Saved** list (top right;
  inside the menu on a phone).
- **Done** is a checkbox they tick once they have read or used it. The Saved page works
  as a to-do list, and each module page shows how many they have finished.
- **Share** gives a link to that one resource. It opens the resource on this site, on its
  module page, so a colleague sees it in context. On a phone it uses the phone's own share
  sheet; on a computer it offers **Copy link** and **Email it**, which opens the visitor's
  own mail program with a short message ready. The Saved page can share the whole list the
  same way.

There is no login. Saved and Done are stored in the visitor's own browser and never leave
it, so nobody at Marshall can see them, and they do not follow the visitor to another
device. Sharing sends nothing from the site either.

For editors there is one thing to know: all of this remembers a resource by its `id`.
Changing an `id` in the sheet silently drops that resource from everyone's saved list and
breaks any link to it that has already been shared.
