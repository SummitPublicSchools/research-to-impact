# Build day — run of show

For a working session where the team pushes the sheet hard and wants the site in
good shape by end of day. Everything here is either read-only or local, except the
one publish step, which is called out.

---

## 0. Read this first: the site is behind the sheet

The **Scheduled rebuild** workflow last fired **2026-09-28**. It still reports
`active`, the `NETLIFY_BUILD_HOOK` secret is still present, and every past run
succeeded — but no weekly run has happened since, so the live site has not picked up
seven weeks of sheet edits.

| | Live site | Live sheet |
|---|---:|---:|
| Resources | 180 | ~200 |
| Published | 44 | ~131 |

**The team's work is already done and already in the sheet — it is just not
deployed.** One publish (step 4) closes most of that gap before anyone edits a cell.

Cause of the stall is unconfirmed. The manual path works, so the practical fix for
tomorrow is to publish on demand and not rely on the cron. Worth a proper look
afterwards.

---

## 1. Morning setup (2 minutes)

```bash
cd ~/Coding\ Projects/summit-marshall/research-to-impact
```

```bash
node tools/punchlist.js --out punchlist.md
```

That prints the work queue — see step 3. Then, in a second terminal tab:

```bash
node tools/preview.js
```

This builds the real site from the live sheet and serves it at
**http://localhost:8080**. Leave it running all day.

---

## 2. The loop (this is the whole day)

1. Someone edits the **sheet**.
2. In the preview tab, press **`r`** then Enter.
3. Refresh **http://localhost:8080**.

A rebuild takes about **5 seconds** and pulls the sheet fresh every time (the build
adds a cache-buster, so there is no stale-CSV lag). Build warnings print on every
rebuild, so mistakes surface immediately instead of after a deploy.

**This loop is free.** Do all the iterating here.

---

## 3. What to work on, in order of payoff

Run `node tools/punchlist.js` any time for the current numbers. As of the evening
before:

### a. Add 4 rows to the `Modules` tab — rescues 21 resources

21 finished resources name a module that has no row on the `Modules` tab, so they
appear on **no page at all**. Four rows fix all of them:

| `section` | `module_order` | `module_name` |
|---|---|---|
| Repeated Reading | *(next in that section)* | Enabling Conditions |
| Routine Data Cycles | *(next in that section)* | Enabling Conditions |
| Evidence & Impact | *(next in that section)* | IGNITE Publications |
| Evidence & Impact | *(next in that section)* | The Original NIC Publications |

This is the highest-value edit on the list: four cells, 21 resources.

### b. Flip the ready-but-unpublished rows — 14 resources

Rows marked `status = ready` with `published = FALSE`. Mostly **Leading
Implementation** (7) — the Partner Handbook, Coaching Playbook, and the agenda set.

⚠ Most of these are flagged **no file yet** in the punch list. Flipping `published`
without a file gives a download button that leads nowhere. Either drop the file into
the Drive **"01 - Published"** folder named after the row's `id` and run
**R2I → Update everything** in the sheet, or set `link_url`.

### c. Decide on 15 rows that are live with a non-ready status

15 published rows still say `planned` or `in_progress`. Either the status is stale or
they went live early. Worth a quick pass so the Dashboard numbers mean something.

### d. Small fixes

- `about_story` on the **Site** tab is blank — the About page has an empty area.
- `cp-2-leader-videos-tbd` is a published card with no summary.
- `rr-3-legacy-spotlight` and the **Enabling Conditions** `module_video` use
  `vimeo.com/share/...` links that will not play inline. Replace with the numeric
  form (`https://vimeo.com/123456789`).

### e. Still empty

**Stories & Spotlights** has 6 rows, all `planned`, none published. It is in the nav
and will render as an empty section. Either populate it or set its `nav_visible` to
`hidden-until-live` for the day.

---

## 4. Publishing (the one step that costs something)

```bash
./tools/publish.sh
```

Triggers the rebuild workflow, waits for it, and tells you when Netlify is deploying.
About a minute end to end.

**Budget it.** `rebuild.yml` documents each production deploy as ~15 Netlify credits
against a 300-credit/month Free plan — roughly **20 deploys a month**. A day of
publishing after every edit would spend the month. Pushing code to `main` also
triggers a deploy, so that counts too.

A sane rhythm for tomorrow: **publish once first thing** (to clear the seven-week
backlog), **once or twice midday**, and **once at the end**. Iterate locally in
between.

---

## 5. Guardrails worth remembering

- **Content lives in the sheet.** Never edit `template.html` or `dist/` to change
  content.
- **`TRUE`/`FALSE` must be plain text**, not checkboxes. If a boolean column looks
  boolean to gviz, a stray text cell gets dropped on read — this caused a "Coming
  soon" bug once. **R2I → Update everything** enforces it.
- **ids are permanent.** They are the link between a row, its file in Drive, and its
  deep link. Renaming an id breaks the download and any shared URL. Moving a row
  between tabs is fine — keep the id.
- **Duplicate ids fail a strict build** and break rendering. The punch list checks
  for them; CI will reject them.
- Before pushing any code change: `SHEET_SOURCE=local STRICT=1 node build.js` — that
  is exactly what CI runs.

---

## 6. What an AI session cannot do here

Sheet cells and the container-bound Apps Script are **not** editable from a Claude
session — Drive access is effectively read-only for this project. Anything sheet-side
comes back as exact steps for a human to apply. Reading the sheet, building,
reporting, previewing, and publishing all work fine.
