# Backlog

Open work, newest thinking at the top of each item. The design plan
(`design-plan.md`) is the record of what has been built; this is what is next.

Started 19 November 2026, from Greg's list and Stephanie Lassalle's review.

---

## 1. Design audit — "it still feels a little blocky"

**Status:** not started. The biggest item, and the one most likely to change the
others.

The site is on-brand and the defects are gone, but the layout is a stack of
white rounded rectangles on a pale ground, and that is what reads as blocky. An
audit should look at least at:

- the card-on-card nesting (hero card, then toolkit cards, then start-here
  cards, then the band — four rounded containers in a column)
- vertical rhythm and section separation: right now almost everything is
  separated by the same gap and the same border radius
- whether the page needs full-bleed bands (navy, pale blue, photo) to break the
  column up, which the brand's own proportions would support
- type scale: the brand's own contrast is Light 300 at display size against
  SemiBold at body size, and the site uses a fairly narrow range of that
- photography: 34 photos in the design system and 55 in the repo, barely used
  outside heroes

**Do this before** the module-page work below, or that work gets redone.

## 2. Photos — place the ones we have

**Status:** not started; inventory known.

Available: **17 general classroom photos** and 17 headshots in
`marshall-design-system/source/photos/`, plus **55 images already in this repo**
(16 `assets/practices/`, 26 `assets/collections/`, partners, brand).

Known gaps, from a build against the live sheet:

| Where | State |
|---|---|
| Section landing pages | 4 of 6 have a `header_image` — **Research-to-Impact Library** and **Evidence & Impact** do not |
| Module pages | 0 of 34 — see item 5, there is no field |
| Published resources | 28 of 119 have an `image` |

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
