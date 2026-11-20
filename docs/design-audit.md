# Design audit — November 2026

> **Status:** findings 1, 2, 3, 5 and 6 were implemented on 19 November
> (`template.html`). Only finding 4 (accent colour) is still open; the bands
> from finding 3 are what create the places blue belongs.

Written against the live site, measured rather than eyeballed. The brief was
"it still feels a little blocky… is there a way for this to feel more modern".

The short answer: **the problem is not the styling, it is that there is no
system underneath it.** Six corner radii, twelve gap values, thirty-eight
padding values and eighteen type size/weight combinations are in use on the
homepage alone. Nothing is wrong individually; together they read as
approximate, and "approximate" is what reads as dated.

A second, separate answer: **every block on every page is a rounded rectangle
floating in a 1040px column.** Nothing touches the edge of the page. That is
the "blocky" feeling precisely — it is a column of boxes, not a composition.

Findings are marked **canon** where the brand guidelines say so, **additive**
where the design system derived it, and **craft** where it is a general
typographic or interface judgment and the call is ours.

---

## 1. There is no type scale — *craft, and one canon violation*

Eighteen distinct size/weight pairs on the homepage:

```
44/300  34/300  20/400  18/700  17/400  16/400  16/600  15/600  15/400
14/400  14/700  13/400  13/600  13/700  12/400  12/600  12/700  10/400
```

Three things are wrong with that list.

- **Four weights are in use: 300, 400, 600 and 700.** The brand spec says *"At
  most three weights on a page"* (§3, derived from the guidelines' own
  typesetting). 700 is the one to drop — it is not in the brand's role table at
  all, which runs Light 300 / Regular 400 / SemiBold 600.
- **Six sizes live within 5px of each other** (12, 13, 14, 15, 16, 17). Those
  are not steps, they are drift. A reader cannot perceive a 1px difference as
  hierarchy, so the hierarchy is carried entirely by weight and colour.
- **13px appears at three weights** (400, 600, 700), which is the clearest sign
  that sizes were chosen per component rather than from a scale.

The display end is good: 44 and 34 at weight 300 is exactly the brand's Light
display treatment, and the hero reads well because of it.

**Proposal.** A six-step scale, and nothing off it:

| Step | Size | Weight | Use |
|---|---|---|---|
| display | 44 / clamp | 300 | Page titles |
| title | 28 | 300 | Section heads |
| heading | 18 | 600 | Card titles |
| body | 16 | 400 | Running text |
| meta | 14 | 400 | Secondary text |
| label | 12 | 600 | Eyebrows, chips, uppercase |

That is three weights, six sizes, each a perceptible step from the next.

## 2. There is no spacing or radius scale — *craft*

- **12 distinct flex/grid gaps**: 7, 8, 9, 12, 13, 16, 18px and others.
- **38 distinct padding values.**
- **6 distinct corner radii**: 7, 8, 9, 14, 16px and 50%, plus one
  `0px 0px 8px`.

Gaps of 7, 8 and 9px are not three decisions; they are the same decision made
three times. The cost is that nothing lines up across components, which the eye
reads as sloppiness even when it cannot name it.

**Proposal.** A 4px spacing scale (4, 8, 12, 16, 24, 32, 48, 64) and two radii
— one for cards, one for pills — with 50% kept for the genuinely circular
number badges.

## 3. Nothing is full-bleed — *this is the "blocky" one*

Measured on the homepage: **no top-level block reaches the viewport edge.**
Every one is inset in the 1040px column:

| Block | Background | Radius | Full-bleed |
|---|---|---|---|
| hero | white | 16px | no |
| proof | navy | 16px | no |
| cards | — | — | no |
| start-here | — | — | no |
| band | light blue | 14px | no |

Five stacked rounded rectangles, same column, same gap. The navy proof band is
the strongest thing on the page and it floats as a rounded box rather than
anchoring the page as a band.

The brand's own layout language goes the other way: §5 describes **full-bleed
divider pages** and photography that is *"full-bleed or gridded"*. Letting the
navy band and the hero photo run to the edges would be more on-brand than what
is there now, not less — and it is the single change most likely to answer
"make it feel modern".

**Done, 19 November.** `main` no longer carries the max-width; it is full width
and its children are centred individually, so a block can opt out with `.bleed`
and span the viewport, with `.bleed-in` putting its content back on the column.
The homepage proof band and the section hero now run edge to edge.

Deliberately not the usual `width:100vw; margin-left:calc(50% - 50vw)` trick:
`100vw` includes the scrollbar, so that version overflows by about 15px on any
page tall enough to scroll — which is all of them.

One regression caught on the way: with the gutter as `padding` on each child,
blocks that paint their own background (the hero, the closing band) had the
gutter *inside* the card, so their visible edge sat 22px wider than the toolkit
cards below. Sizing the box with `width:calc(100% - 44px)` instead puts every
visible edge back on one line — measured at 135px across all five homepage
blocks at 1280.

## 4. The accent colours are almost unused — *canon, with a caveat*

Measured as a share of coloured area on the homepage:

| Colour | On the page | Brand target (p.13) |
|---|---|---|
| navy | **28.8%** | ~30% |
| orange | **0.6%** | ~25% |
| blue `#3d87f5` | **0%** | ~25% |
| light blue | 3.2% | ~15% |
| teal | **0%** | ~5% |
| white / slate | 67% | — |

Navy is spot on. Everything else is far below, and **blue and teal do not
appear on the page at all.**

**The caveat matters.** Those proportions come from a guidelines deck, and 25%
orange on a reading-heavy website would be loud and would fight the brand's own
rule that orange never carries text. I am not proposing we hit 25%. I am saying
that 0.6% orange and 0% blue is the other extreme, and it is why the palette
reads as navy-and-white rather than as Marshall's. Blue at display size is
explicitly sanctioned (24pt+), which the page has places for.

## 5. The practice photos are rounded and framed — *canon violation*

Brand §5: photography is *"hard-edged rectangles, full-bleed or gridded. No
rounded corners, frames, duotones or filters."*

The hero photo and the section heroes are correct — hard-edged, radius 0. But
the rich practice cards wrap each photo in a pale blue padded box with an 11px
radius, inside a 13px-radius card. That is a rounded corner and a frame, on the
richest content the site has.

**Proposal.** Hard edges, no tint box. The photo sits flush in the card.

## 6. The measure is too long — *craft*

Running text in a rich practice card is **14px across 98 characters**. The
comfortable range is 45–75; 65 is the usual target. Long measure plus small
type is exactly what makes a page feel like a wall.

The About page and section intros are better (16px / 82ch) but still long.

**Proposal.** Body to 16px and a `max-width` around 68ch on running text. This
costs nothing and is probably the single biggest readability win on the site.

---

## Implemented on 19 November

Measured across all six page types after the change:

| | before | after |
|---|---|---|
| font sizes | 30 declared | **8 rendered** (44/34/28/22/18/16/14/12) |
| font weights | 5 (300,400,500,600,700) | **3** (300/400/600) |
| corner radii | 15 | **3 tokens** + `50%` for circular badges |
| gap values | 18 | **5 tokens** (1px micro-stacks left alone) |
| running text | 14px / 86-97 chars | **16px / 69-72 chars** |
| practice photos | 11px radius in a tinted, bordered box | **hard-edged, no frame** |

A base `h1..h6{font-weight:var(--w-semi)}` rule was needed: the toolkit card
`h3`s were rendering at 700 purely from the browser default, which is how a
fourth weight survived the first pass.

One trap worth recording: `--measure` was first set to `68ch` and measured out
at **86 real characters**. `1ch` is the width of "0", which in Figtree at 16px
is 10.25px against an average character nearer 8. It is now `54ch`, set from
counting characters per rendered line rather than from the unit.

## What I would do, in order

1. **Type scale** (§1) — biggest perceptual change, lowest risk, touches only
   CSS values.
2. **Measure and body size** (§6) — small change, large readability gain.
3. **Full-bleed bands** (§3) — the structural answer to "blocky"; a real layout
   change, worth doing deliberately.
4. **Spacing and radius scales** (§2) — tidies everything, invisible on its own.
5. **Photo treatment** (§5) — small, and it is a canon violation.
6. **Accent colour** (§4) — needs a judgment call about how far to go; best done
   after 1–3, since the bands in §3 create the places where blue belongs.

Steps 1, 2, 4 and 5 are close to mechanical and could go in one pass. Step 3 is
the one worth looking at together before it ships.

## What I checked and found healthy

- Photos in the hero and section heroes: hard-edged, radius 0, brand-correct.
- Display type: Light 300 at 44 and 34px, exactly the brand's treatment.
- Navy at 28.8% of coloured area, against a ~30% target.
- Line height 1.5–1.62 on running text, against a 1.4 brand floor — generous,
  which is right for screen.
- No horizontal overflow at any width from 320px up.
- Contrast: every colour pair measured this month passes AA, most well clear.
