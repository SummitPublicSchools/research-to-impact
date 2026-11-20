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

**Caveat to settle before anything external:** the design system records that
photo consent status is unverified, and five 20MB+ originals were never pulled.

## 3. Search audit, and "Ask the Resources"

**Status:** not started.

Two different things behind one button:

- **Search is real and live** (`searchResources` in `template.html`). Worth an
  audit: does it reach titles, summaries, `who_for`, `body`, module and section
  names? Does it rank sensibly? Does it find a resource by the practice it
  belongs to?
- **"Ask the Resources" is a placeholder.** It carries an "Experimental ·
  coming soon" badge, the send button is deliberately disabled, and the panel
  says an answer "is on the way". There is no answer quality to evaluate yet —
  building it is a separate project, and it needs a decision about what
  generates the answer.

---

## From Stephanie's review, 19 November

## 4. A button to continue to the next module

**Status:** not started. Her words: "this feels essential, though not urgent.
The functionality to move through the modules is important since we designed
them intentionally as a sequence."

Buildable as described: the Modules tab already carries `module_order`, so the
sequence exists in the data. Needs a previous/next control at the foot of a
module page, and a decision about what happens at the end of a section — stop,
or roll into the next section.

## 5. Photos on module pages — the field does not exist

**Status:** not started. This answers her "Where did I miss adding photos to the
module or landing pages? I'm clearly missing something that I can do!"

She did not miss anything. `build.js` reads only `section`, `module_order`,
`module_name`, `module_intro` and `module_video` from the Modules tab. **There
is no module image column at all**, which is why it is 0 of 34. Adding one is a
build change plus a new column, not a sheet edit.

Landing pages are the part she *can* do: `header_image` on the Sections tab, and
two are empty (item 2).

## 6. "Download" on links that are not downloads

**Status:** not started. Her example: the Co-Planning overview's executive
summary and template agendas.

Real bug, small fix. The sheet already distinguishes them — `link_type` is
`external_link` or `download` — but **`link_type` is never passed through to the
page**, so `resAction()` has nothing to switch on and labels everything
"Download". Needs one field carried into the resource record, then a label:
"Open" or "Open resource" for an external link, "Download" for a file.

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
