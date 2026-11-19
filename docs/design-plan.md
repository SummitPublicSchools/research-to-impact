# Design plan — Research to Impact

Written 18 November 2026, against the live site at `researchtoimpact.marshall.org`
and the sheet data behind it (199 rows, 118 published).

Proposed design, rendered with the real content:
**https://claude.ai/artifact/VVAjiZqoF9JN4W6y27XAud**

---

## The short version

The site does not feel basic because the styling is bad. It feels basic because
**the homepage shows four grey boxes and a toolkit page shows seven rows that say
"3 available"** — 118 published resources, and you can't see one of them without
two clicks. On top of that, three things are actually broken, and the whole site
is still wearing the old Marshall brand.

Almost all of this is `template.html`. **A redesign needs no sheet edits and no
bridge** — it is a code change that Netlify deploys on push.

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

| | Work | Where | Effort |
|---|---|---|---|
| 1 | Mobile navigation | `template.html` | half a day |
| 2 | Brand tokens: Figtree, palette, flat surfaces, lever logo | `template.html` | 1 day |
| 3 | Image sizing + `loading`/`decoding` + resized assets | `build.js`, `dist/assets/` | half a day |
| 4 | Homepage: proof band, richer cards, start-here | `template.html`, `build.js` | 1–2 days |
| 5 | Toolkit page: surface module resources | `template.html` | 1 day |
| 6 | Module page polish | `template.html` | half a day |

1–3 are strictly fixes and could go first on their own.

Steps 4 and 5 need two small `build.js` changes: pass `quote` through for the
proof band, and pass each module's top resources into the section view. Both are
additive — no sheet columns change.

**Content work, which is yours and the team's, not mine:** fill Stories &
Spotlights or take it out of the nav; get something into Evidence & Impact's
four modules; decide whether the development banner comes down.

---

## 5. What I need from you

Nothing, to start. Steps 1–3 are template and asset changes I can make and push
on your word — they don't touch the sheet and don't need the bridge.

Two decisions when you have a minute:

- **Is the brand the direction?** The mockup assumes yes. If Marshall Street has
  a web style guide beyond the v1.0 deck (which covers logo, colour and type
  only — layout and component rules in the design system are marked *additive*,
  derived rather than canon), point me at it before I build.
- **Does the proof band go up before launch?** It puts named schools and their
  numbers on the homepage. The quotes are already published on the live site, so
  this is a prominence decision rather than a disclosure one — but it is the
  kind of thing partner schools notice.
