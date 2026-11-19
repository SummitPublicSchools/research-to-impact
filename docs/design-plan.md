# Design plan — Research to Impact

Written 18 November 2026, against the live site at `researchtoimpact.marshall.org`
and the sheet data behind it (199 rows, 118 published).

Proposed design, rendered with the real content:
**https://claude.ai/artifact/VVAjiZqoF9JN4W6y27XAud**

> **Where this stands, as of 19 November 2026.** Sections 1–3 are the original
> diagnosis and are kept as written, as the record of what the site was. Most of
> it is now fixed and live: the phone has a menu, the brand is the current one,
> the hero photos load, toolkit pages show their resources, and both empty rooms
> are dealt with. The proof band (§3, item 2) is up, and the development banner
> (§1, "First impression") is down. **Section 4 is the live status** — read that
> for what is built and what is left. Everything described as a defect in
> section 1 has been fixed; what remains is content the team owns, plus the
> start-here row at step 10.

---

## The short version

The site does not feel basic because the styling is bad. It feels basic because
**the homepage shows four grey boxes and a toolkit page shows seven rows that say
"3 available"** — 118 published resources, and you can't see one of them without
two clicks. On top of that, three things are actually broken, and the whole site
is still wearing the old Marshall brand.

Almost all of this is `template.html`. **A redesign needs no sheet edits and no
bridge** — it is a code change that Netlify deploys on push.

*That held for the look, but not for the two empty rooms: fixing those meant
nine cells in the sheet, which did need the bridge. See step 7 in section 4.*

---

## 1. What's wrong

### Defects, not taste

**On a phone the site has no navigation at all.** One rule hides the menu and
puts nothing back:

```css
@media (max-width:760px){nav.main{display:none}}
```

Below 760px the only links on the page are the four toolkit cards and the
logo. Evidence & Stories, R2I Practices, About, and every dropdown are
unreachable. Confirmed by reading the accessibility tree at 375px: `link Home`,
`button Search`, `button Explore the toolkits`, four card links. That is the
whole site on a phone. Most teachers will open it on a phone.

**Every toolkit page opens on a grey box.** The hero photos are 310–560KB
JPEGs with no `width`/`height` and no `loading` attribute, so the browser
paints the CSS placeholder first. My first screenshot of `/#/Co-Planning`
caught the grey gradient with the title sitting on it; the photo arrived on a
later frame. Assets total 6.8MB.

**Two sections in the top nav are empty rooms.** Stories & Spotlights:
**0 published across 3 modules**. Evidence & Impact: 6 published but **0 in any
of its 4 declared modules**, so the page renders four empty headings. "Evidence"
is the likeliest click a funder makes.

There are only **five media queries in the entire 762-line template**. There is
no responsive design to speak of.

### Off-brand

The site is in the **old** Marshall brand. Against
`marshall-design-system/brand/tokens.json`:

| | Site now | Marshall brand |
|---|---|---|
| Display face | DM Serif Display | **Figtree Light 300** |
| Body face | Arimo | **Figtree Regular 400** |
| Orange | `#AB4D00` (burnt) + `#fc6e42` coral | **`#ed8f47`** |
| Navy | `#21344C` | `#21334c` |
| Blue / teal | absent | `#3d87f5` / `#5cc2a1` |
| Logo | retired **MARSHALL CoLab** wordmark | lever mark, `source/logos/web/` |
| Surfaces | gradients, drop shadows, rounded photos | **flat; hard-edged photos** |

The coral and burnt orange aren't tints of anything in the palette. The footer
wordmark is a different organisation's old identity.

### Hidden content

The sheet is far richer than the site admits:

| Field | Rows that have it | Where it shows |
|---|---|---|
| `summary` | 149 | module pages only |
| `image` | 30 | rarely |
| `quote` | **23** | nowhere prominent |
| `body` | 26 | module pages |
| `why` | 16 | module pages |

The 23 quotes are the find. They are field-verified outcomes with hard numbers:

- 79% → 97% course pass rate (Ednovate)
- 25% → 81% of students with disabilities earning an A or B in math (STEM Prep)
- 44% → 92% reaching mastery (Rosenwald Collegiate)
- 53% → 77% of graduates in a postsecondary pathway, 95% still engaged a year
  later (Simon Gratz)
- suspensions down 36 points, attendance up 26 points (Simon Gratz)

These are buried in the R2I Library. A funder meeting lives on this page and
right now the homepage doesn't carry one of them.

### First impression

The first line anyone reads is a banner saying the site is under development.
Honest, and the wrong thing to lead with. Fix the items above and take it down
rather than rewording it.

---

## 2. Direction

Not a new look — the **current Marshall brand**, applied properly. That is both
the right answer and the cheap one: `marshall-design-system/dist/marshall-tokens.css`
already exists and pulls Figtree from Google Fonts.

Three ideas carry it:

1. **Navy, white, and photography.** Navy dominates (brand proportion ~30%),
   bands of white and pale blue between, real classroom photos full-bleed and
   hard-edged. No gradients, no drop shadows, no rounded photo corners.
2. **The lever.** The brand's own concept — a blue diagonal stroke with an
   orange fulcrum, lifted from the mark — as the one recurring structural
   device, on eyebrows and section heads. It replaces generic rounded cards as
   the thing that makes the page recognisably Marshall.
3. **Weight, not family.** Figtree only, as the brand requires. Personality
   comes from the gap between Light 300 at 62px and SemiBold 600 at 16px, and
   from a strict scale. That contrast is what reads as modern.

Buttons change meaningfully: primary becomes **orange fill with navy text**
(5.25:1, brand-sanctioned) instead of today's dark burnt orange with white.
Lighter, warmer, and it passes contrast where the current one is merely dark.

Brand rules that constrain this, from the skill: only navy and black carry body
text; blue is for 24px-and-up only; orange, teal and light blue are fills, never
text — the one exception being orange eyebrow labels above a navy heading.

---

## 3. Page by page

### Homepage — from one screen to a real front door

1. **Hero** — full-bleed classroom photo over navy, Figtree Light headline,
   orange eyebrow with the lever, two buttons.
2. **Proof band** (new) — four of the outcome numbers above, in navy, directly
   under the hero. This is the single highest-value addition on the site.
3. **Toolkit cards** — with their photos, a line of what's inside, and real
   counts ("38 resources · 7 modules"), not "7 modules" alone.
4. **Start here** (new) — three real entry points for a visitor with ten
   minutes: the intro video, the executive summary, the agenda templates.
5. **One field story** — photo + quote + school, pulled from the 23.
6. **The Library** — 31 practices across five collections, with counts.
7. **Footer** — lever logo, CC BY 4.0, the Ignite grant line.

### Toolkit page — show the resources

Today: grey hero, paragraph, seven identical rows. Proposed: photo hero with
counts, then **each module opens with its own top resources already on the
page** — format chip, title, summary, action — and an "All 11 in this module"
link. The material becomes visible one click earlier.

### Module page

The strongest page already. It needs the brand, and relief from fourteen
identical orange Download pills stacked in a column: one primary action per
card, quieter secondary rows.

### Mobile

A real menu. Everything else stacks to one column at 400px.

---

## 4. Build order

| | Work | Where | Status |
|---|---|---|---|
| 1 | Mobile navigation | `template.html` | **done** — `f878825` |
| 2 | Brand tokens: Figtree, palette, flat surfaces, lever logo | `template.html` | **done** — `f878825` |
| 3 | Image weight and loading | `template.html`, `assets/` | **done** — `f878825` |
| 4 | Homepage: richer cards | `template.html` | **done** — `7e8721f` |
| 4b | Homepage: proof band | `template.html`, `build.js` | **done** — `03e94ac` + 16 Site rows |
| 5 | Toolkit page: surface module resources | `template.html` | **done** — `7e8721f` |
| 6 | Module page polish | `template.html` | **done** — `61b089f` |
| 7 | Fix the two empty rooms (sheet, not code) | master sheet | **done** — 19 Nov, via the bridge |
| 8 | Collapse the one-item secondary dropdown | `template.html` | **done** — `51b45e4` |
| 9 | Fit the phone header down to 320px | `template.html` | **done** — `6f9d732` |
| 10 | Homepage: start-here row | `template.html`, `build.js` | **done** — `c9abbf4` + 9 Site rows |
| 11 | Take down the development banner | `template.html` | **done** — `532ae80` |

None of this needed a `build.js` change in the end — the data was already in the
page; the template was just not using it.

**Found while building step 5, and worth recording:** eight *published*
resources were rendering on no page at all, including every Evidence & Impact
publication. A resource's `module` is a dropdown fed by the Lists tab, so
editors can only pick a valid value; the Modules tab is hand-typed and has no
guard. When the two drift, resources pointing at the newer name belong to a
module the page does not know about, and it dropped them silently.
`modulesOf()` now treats any module a published resource names as real, so the
page is self-healing. **That is a safety net, not the fix.** The three stale
Modules rows were corrected on 19 November, so nothing is relying on the rescue
today — but the drift can recur, because the Modules tab still has no guard.

### What step 7 actually was

Nine cells, written through the bridge and logged to `BridgeLog`:

- **Three module renames**, retiring the stale duplicates: `The IGNITE Network` →
  `The IGNITE Model` (Leading Implementation); `IGNITE White Papers & Publications`
  → `IGNITE Publications` and `The Original Networked Improvement Community` →
  `The Original NIC Publications` (both Evidence & Impact).
- **Four drafts re-pointed** (`ss-spotlight-1/2`, `ss-case-study-1/2`) to
  `IGNITE Stories & Spotlights`, so they have a home when they are published.
- **One `nav_visible`** → `hidden-until-live` on `stories-spotlights`, taking the
  empty section out of the nav until it has content.

Evidence & Impact now renders four modules — IGNITE Publications (1 resource),
External Evaluation (coming soon), Data Reports & Dashboards (coming soon), The
Original NIC Publications (5). There are **no orphaned module values left anywhere
in the sheet**. Taking Stories & Spotlights out left "Evidence & Stories" as a
dropdown of one, which is what step 8 fixed.

### Step 6, and what it turned up

Featured cards now pair two to a row where they are the short plain kind (rich
photo/narrative cards keep the full width), their action rows line up, the
compact rows below get a ghost button instead of a filled one, and the
"Available" chip — which every published card carried, so it distinguished
nothing — is gone. The worst module page went from 1772px to 1500px tall.

Verifying that turned up **two pre-existing horizontal-scroll bugs**, both the
same CSS trap: a grid track whose floor cannot shrink. `.mcards` used a bare
`1fr`, whose automatic floor is the item's min-content — the toolkit page
scrolled sideways by 37px on a 390px phone. `.tqgrid` used a bare `330px`
minmax floor; the practices page scrolled at 320px. Both fixed in the same
change.

### The phone header (`6f9d732`)

The one thing left after that was the *header*, which needed 397px of bar —
logo 146 + search 61 + Menu 84, plus a 22px gutter each side and two 18px
gaps — so on a 360px phone every page scrolled sideways by 16px. Three things
give way, in order of least cost:

1. **Dead space, below 1200px.** The top nav is hidden there, which makes the
   logo's 26px right margin (its only job is holding the logo off the nav) pure
   waste; the header's 22px gutter had also stopped matching `main`'s 16px.
   Reclaiming both buys 38px and aligns the logo with the content below it.
   That alone fixes 360px.
2. **The logo steps down below 480px**, 30px tall to 26px. At 146px wide it was
   taking 40% of a 360px bar, and without this the bar has only 7px of slack
   there once the Helvetica Neue fallback's wider metrics are allowed for.
3. **The word "Menu" goes below 355px**, leaving the hamburger, which fits a
   320px screen with 33px spare. The button keeps `aria-label="Menu"`, so its
   accessible name is unchanged, and the drawer is untouched.

Verified 320–1440px across all six page types, each width measured twice (once
with Figtree, once forced onto the fallback). Desktop is untouched: at 1201px
the 22px gutter, the 26px logo margin and the full nav all come back.

**The site now has no horizontal scroll at any width from 320px up.**

### The proof band (step 4b)

Built, and dormant until the sheet carries the numbers. It reads four indexed
Site settings per stat (`proof1_stat`, `proof1_label`, `proof1_source`,
`proof1_source_id`), exactly the way the R2I quotes and partner logos already
work, so nothing is hardcoded in the template. With no `proof*` keys defined it
renders nothing at all and the homepage is byte-for-byte what it was — which is
the state the live site is in right now.

The numbers are deliberately **not** parsed out of the resource quotes. They sit
inside prose in several different shapes ("from 79% to 97%", "92% … up from
44%"), and the label and the school would have to come out of the same sentence.
A regex over editor-written prose is the wrong thing to hang the most prominent
claim on the site from.

`proof1_source_id` is a resource id; the build resolves it to that resource's
module page so each stat links to its evidence, and drops the link (with a
warning) if the id matches no *published* resource. The band never renders a
dead link.

**It is live.** Switching it on took 16 Site rows, which the bridge could not
create at first: it can set the `value` of a setting that exists, but `setting`
was not a writable column, so it could not create a new one. `Bridge.gs` 1.1.0
fixed that — an append may write a tab's own key column, while a `set` still may
not, since renaming `hero_headline` would silently empty part of the page. After
that one paste the 16 rows went in through the bridge, all logged to `BridgeLog`
with the bridge version that wrote them.

The four stats, their labels, sources and source ids are in
`fixtures/Site.csv`, so CI builds and renders the band on every push and the
exact values are version-controlled.

The **development banner is down** (`532ae80`). It was hedging against the
defects listed in section 1 — no phone navigation, grey hero boxes, two empty
sections in the nav — and those are fixed, so the plan's own instruction applied:
take it down rather than reword it. It was hardcoded in the template, not
sheet-driven, so putting a notice back is a code change; a notice the team can
raise and lower itself belongs on the Site tab as an editable setting.

### Start here (step 10)

Three things a visitor with ten minutes can do, under the toolkit cards: watch
the introduction, read the executive summary, take the agenda templates. Sheet
driven like the proof band — `start1_id` names a resource, `start1_label` and
`start1_note` reword it for the homepage. The label matters: three toolkits each
have a resource titled "Executive Summary".

The action is not resolved in `build.js`. The template looks the resource up by
id and calls the same `resAction()` the resource's own card uses, so the button
cannot drift from it and gating is honoured in one place.

The closing band lost its opening line as a result. It used to read "New here?
Start with the Overview in any toolkit"; the row above now says that with real
links, so the band keeps only the live resource count.

### Found while building it: the videos do not play inline

**Ten of the eleven published videos open in a new tab instead of playing in the
page**, including "An Introduction to Co-Planning", which is now the first thing
the homepage asks a visitor to do.

They are all vanity URLs — `vimeo.com/marshallstreet/co-planning?share=copy` and
the like. The player embed needs a numeric id, and the parser cannot get one from
a vanity slug, so every one of them falls back to opening a new tab. Only
`rr-3-legacy-spotlight`, which carries a numeric `vimeo.com/1210896557` URL,
plays inline.

This is **not** caused by the start-here row: the same resource behaves
identically on its own card in Co-Planning / Overview. It has been true of the
whole site, and it was invisible because the build only warns about a module's
`module_video`, never about a resource's `video_url` — so ten broken videos
warned about nothing.

`build.js` already has the machinery to fix it. `resolveShareLinks()` fetches a
Vimeo page at build time and pulls the numeric id out of
`player.vimeo.com/video/(\d+)` or the canonical link, then rewrites the value.
It is only gated to `vimeo.com/share/...`; widening it to vanity URLs would fix
all ten at once, with no sheet edits. Care needed to keep `vimeo.com/<id>/<hash>`
unlisted links out of the new pattern.

**Still the team's, not mine:** write Stories & Spotlights and flip it back into
the nav; decide whether the development banner comes down; fill `about_story` on
the Site tab (blank, and the build warns about it); and replace the `Enabling
Conditions` `module_video` — it is a `vimeo.com/share/...` link the parser can't
resolve, so that one video opens in a new tab instead of playing inline.

---

## 5. What I need from you

Steps 1–3, 5, 7 and 8 are built and live. Two decisions are still outstanding,
and both are yours rather than mine:

- **Does the proof band go up before launch?** (§3, item 2 — the single
  highest-value addition on the homepage.) It puts named schools and their
  numbers on the front page. The quotes are already published on the live site,
  so this is a prominence decision rather than a disclosure one — but it is the
  kind of thing partner schools notice. Nothing is built for it yet, by design.
- **Does the development banner come down?** It is still the first line anyone
  reads. The defects it was hedging against are fixed.

Answered, and recorded here so it isn't reopened: **the brand is the direction.**
The build follows the v1.0 guidelines (logo, colour and type). The layout, type
scale, chart, table and photo rules in `marshall-design-system` are marked
*additive* — derived from the guidelines' own typesetting and contrast maths
rather than canon — so flag them as such before anything goes to an external
audience.
