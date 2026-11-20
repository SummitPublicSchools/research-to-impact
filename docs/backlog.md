# Backlog

Open work, newest thinking at the top of each item. The design plan
(`design-plan.md`) is the record of what has been built; this is what is next.

Started 19 November 2026, from Greg's list and Stephanie Lassalle's review.

---

## 1. Design audit — "it still feels a little blocky"

**Status:** audit written, see [`design-audit.md`](design-audit.md). Nothing
implemented yet.

Headline: the styling is fine, there is no *system* under it — 6 corner radii,
12 gaps, 38 paddings and 18 type size/weight pairs on the homepage alone — and
every block on every page is a rounded rectangle floating in a 1040px column,
with nothing full-bleed. Six findings, ordered by what to do first.

**Do this before** the module-page work below, or that work gets redone.

## 2. Photos — place the ones we have

**Status:** the two missing landing-page heroes are done (19 November,
`15637e5` plus two Sections rows). Resource images and module images are still
open.

Available: **17 general classroom photos** and 17 headshots in
`marshall-design-system/source/photos/`, plus **55 images already in this repo**
(16 `assets/practices/`, 26 `assets/collections/`, partners, brand).

| Where | State |
|---|---|
| Section landing pages | **6 of 6** — Research-to-Impact Library and Evidence & Impact filled 19 Nov |
| Module pages | 0 of 34 — **there is no field**, see item 5 |
| Published resources | 28 of 119 have an `image` |

### How the two heroes were chosen, for the next time

The existing heroes set a house style: mid-shot, several people, real
environment, mid-action — **not portraits**. Both new photos were checked *as
rendered heroes*, under the real 58% navy overlay at hero crop, before being
committed. That step is the point: the title sits bottom-left, and a photo can
look good on its own while putting a face directly under the words. Both
alternates were rejected on exactly that.

Sequencing matters too. The assets shipped and deployed **first**, and only then
did `header_image` get set, so there was never a moment where a section pointed
at a file that was not there yet.

### Still open

**Resource images: 28 of 119.** The biggest remaining gap, and the one that
would most change how the module pages feel — a card with a photo reads
completely differently from a card without one. This is sheet work (`image` on
each resource row) and could be done through the bridge, but it needs someone to
decide which photo belongs to which resource; that is an editorial judgment, not
a mechanical one.

**Module images need a build change first** (item 5).

**Consent is settled.** Greg confirmed on 19 November that every photo Marshall
holds has consent cleared. The design system's "known gaps" note still says
otherwise — that line is stale, not a live risk. (Five 20MB+ originals were
never pulled into the design system, which is a separate and minor gap.)

## 3. Search audit, and "Ask the Resources"

**Status:** search audited and fixed 19 November (`0f1430c`). "Ask the
Resources" is untouched and still a placeholder.

### What the audit found

Search read `title`, `summary`, `section`, `module`, `format` and `who_for`. It
did **not** read `body`, `why` or `quote` — which is where the narrative, the
"why it works" bullets and the field outcomes live, and therefore where the
school names and the numbers are.

The sharpest version: the homepage proof band names four schools, eight
resources mention them, and **searching any of the four returned nothing.**

| Query | was | now |
|---|---|---|
| Ednovate | 0 | 1 |
| STEM Preparatory Schools | 0 | 1 |
| Rosenwald Collegiate Academy | 0 | 1 |
| Simon Gratz High School | 0 | 5 |
| IEP | 0 | 1 |
| mastery | 5 | 10 |
| graduation | 1 | 5 |

Separately **"coplanning" returned nothing at all**, on a site whose flagship
practice is hyphenated. Punctuation is now stripped from both sides.

And a ranking flaw: substring matching let "pass" match "Passages" in a title
and outrank the resource whose quote reads "the course pass rate increased from
79% to 97%". A whole-phrase hit now outscores loose single terms.

The list also capped at 40 while the count showed the true total, so a search
could say 51 and show 40 with nothing to explain the gap.

### "Ask the Resources"

**Status:** built 19 November. Needs `ANTHROPIC_API_KEY` set in Netlify before it
answers anything — until then the panel falls back to search, which is the
intended degradation. Setup steps, cost and tuning: `docs/ask-the-resources.md`.

The measurement that decided the design: the entire published library is **~21k
tokens**, small enough to ship in one prompt, so there is no retrieval layer,
no embeddings and no vector store. But **78% of resources carry under 300
characters** of text, and the site holds metadata rather than the documents
themselves — so this routes a question to the right resource and says why. It
does not teach the practice, and the prompt forbids it from pretending to.

The mock that occupied most of the panel is gone; a real answer takes its place
and the search results sit directly below it, rendering instantly while the
answer loads.

**Still open, and worth doing before this is shown to funders:** read two or
three dozen real answers with Stephanie. Nothing automated can judge answer
quality — the self-test covers the citation guard and the failure paths, not
whether the sentences are good.

---

## From Stephanie's review, 19 November

## 4. A button to continue to the next module

**Status:** done 19 November (`e67e02f`).

Each module page now ends with the step either side of it. Ordering comes from
`modulesOf()`, the same list the section page renders from, so the pager can
never disagree with the module list a visitor just came from — including the
modules it rescues when a published resource names one the Modules tab does not.

Two decisions, recorded because they are the kind that get re-litigated:

- **The sequence stops at the section boundary** rather than rolling into the
  next toolkit. These are the steps within one practice; running Co-Planning's
  last module into Repeated Reading's first would imply an order across
  practices that does not exist.
- **The last module offers the way back up** — "End of <section> / All
  modules" — rather than a dead end or a greyed-out control.

Verified across all 34 modules in all six sections: every Previous and Next
points at the right neighbour, all 6 first modules have no Previous, all 6 last
modules carry a correct end link, 0 problems. Clicking Next three times from
Co-Planning / Overview walks the real sequence.

## 5. Photos on module pages

**Status:** built 19 November (`1b07fa1`). The 34 rows are not filled yet.

This was the answer to Stephanie's "Where did I miss adding photos to the module
or landing pages? I'm clearly missing something that I can do!" — she had not
missed anything, there was no field. Greg added `module_image` to the Modules
tab, and the build now reads and renders it.

A module shows **one** piece of media above its resources. If both
`module_image` and `module_video` are set the video wins; they share a slot and
stacking two large blocks pushes the resources off the screen. Photos render
hard-edged at 560px, 16:9, cropped to fill.

**8 of 34 are filled** (19 November, bridge 1.2.0 deployed). Deliberately not
all 34, for two reasons worth keeping:

- **The three toolkits share module names.** Co-Planning, Repeated Reading and
  Routine Data Cycles each have Overview, Enabling Conditions, Getting Started,
  Detailed Practice in Action, Coaching & Progress Monitoring, Common Pitfalls &
  Barriers, Learning More. Any mapping by module name repeats one photo across
  three pages, which reads as a bug.
- **There are not 34 suitable photos.** Seventeen in the design system, two now
  used as section heroes, leaves fifteen for twenty-nine non-Library modules.

What was filled, and why each earns its place:

| Module | Image |
|---|---|
| Co-Planning / Overview | two educators leaning in over one table |
| Repeated Reading / Overview | an adult working one to one with a student |
| Routine Data Cycles / Overview | an adult and two students reading a laptop |
| Library / Collaboration, Data for MTSS, Emotional Support, Postsecondary, Secondary Literacy | the collection illustrations already in the repo, 1:1 and already 1120x630 |

The working modules are left clean on purpose. Someone hunting an agenda
template does not need 315px of photography above the list, and a repeated
stock image would cheapen it.

**If more are wanted**, the constraint is photos, not plumbing: the field and
the bridge both work now.

## 6. "Download" on links that are not downloads

**Status:** done 19 November (`8d301c2`).

It was most of the site, not a few items: of 119 published resources, **70 are
`link_type: external_link`** — Google Docs, templates and pages that open in a
new tab and download nothing — and every one said "Download".

The sheet already drew the distinction; `link_type` simply never reached the
page. It is now carried into the resource record, and `resAction()` picks from
it: `external_link` gets **Open** and an external-link glyph, `download` keeps
**Download**, `embed` keeps **Watch**. The "not set yet" toast matches the kind
too, since an `external_link` wants a `link_url` and a `download` wants the file
in the Drive folder.

Verified by walking every module and comparing each rendered button against its
row: 119 checked, 0 mismatches.

## 7. Videos embedded — done

Fixed 19 November (`a758c72`). All 11 published videos now play in the page;
before that only one did. Worth telling her, since she had it down as a someday
item.

---

## Done today, for context

Redesign pass, mobile nav, Evidence & Impact content fixes, the secondary-nav
collapse, module-page polish, the phone header down to 320px, the homepage proof
band, the start-here row, the development banner removed, the About page reading
the sheet, the Vimeo resolver, and the colour logo. See `design-plan.md`.
