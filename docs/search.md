# Search

The panel behind the header's **Search or ask** control. It runs entirely in the
visitor's browser over data already in the page: **no server, no API, no cost,
no latency, and nothing that can be down.** It also cannot invent a resource,
because it can only ever return rows that exist.

---

## What was wrong

The box says "Search or ask a question". It could not answer questions.

The previous implementation required **every** word of a query to appear in one
resource (`terms.every(...)`). That works for `repeated reading`. For "How do I
start co-planning with a new co-teacher?" it demanded a resource containing
"how" and "do" and "i" — so the panel came back blank.

Measured against 32 realistic practitioner queries:

| | zero results |
|---|---|
| keyword queries (`fluency`, `MTSS`, `co-planning`) | **0 of 11** |
| natural-language questions | **17 of 18** |

The search was not weak. It was a keyword search behind a box that invited
questions, and the failure was invisible from the outside because the queries a
maintainer types are exactly the ones that worked.

---

## How it works now

Ranked retrieval — **BM25F** — with four pieces of domain knowledge layered on.

**1. BM25F with field weights.** `title` 6, `module` 4, `section` 4, `format` 2,
`summary` 2, `body`/`why`/`quote` 1. Rare words count for more than common ones
(IDF), and repetition saturates rather than accumulating.

**Length normalisation is load-bearing here.** The Research-to-Impact Library
rows are the ones carrying `body`, `why` and `quote` text imported from CoLab;
without normalisation they simply have more words and won every query, including
"repeated reading".

**2. Synonyms — the highest-leverage piece, and hand-built.** `SEARCH_SYN` maps
what a practitioner types to what this library calls it. The gap is almost never
spelling: it is that a teacher says *co-teacher* and the sheet says
*co-planning*, or says *below grade level* and the sheet says *fluency*.

Two rules matter:
- **Synonyms add, never replace.** An earlier version removed the matched phrase
  from the query, which demoted the visitor's own words to inferred weight —
  "students with disabilities" was deleting the literal "disabilities", the most
  distinctive word in the query (15 of 119 resources use it).
- **A literal match always outranks an inferred one** (weight 1 vs 0.55).

**3. The site's own taxonomy.** Someone typing a section or module name is not
guessing, so exact names boost hard (×2.6). Partial name overlap gets
proportional credit, which is how "is there proof this actually works" reaches
the section named *Evidence & Impact* without either word being typed.

**4. Tier.** The IGNITE practice toolkits are homepage tier and carry the top
nav; the Library is cross-cutting background. Search honours the same hierarchy
the nav already does (×1.45).

Plus: light stemming (`planning`→`plan`), a squashed form of every hyphenated
word so `coplanning` still finds `co-planning`, and a one-edit spelling rescue
that fires **only** for a word the library has never seen — so a real word is
never quietly swapped for a different real word.

Instead of strict AND, a result must match **at least half** the words the
visitor actually typed, and score within a fraction of the top hit. A question
can no longer return nothing; one incidental word can no longer drag in a third
of the library.

---

## What the panel shows

**Where to start** — the best-matching *module*, with its intro **straight from
the sheet**. Nothing is generated or paraphrased, so there is nothing to get
wrong, and the reader gets Marshall's own words.

This is the part worth understanding. Asking "how do I know if co-planning is
working" surfaces *Co-Planning · Coaching & Progress Monitoring*, whose intro
opens: "How do you know co-planning is working, and working well?" An answer
layer would have paraphrased that sentence. Surfacing it is free, instant, and
exact.

**Matching resources**, each with a one-line snippet of its own text with the
matched words marked — so a result explains itself instead of asking to be
taken on trust.

---

## Quality gate

```
node build.js && node tools/search-eval.mjs --score --verbose
```

`tools/search-queries.json` holds 40 labelled practitioner queries, split:

- **`tune` (25)** — what the ranking was developed against.
- **`holdout` (15)** — written first, never tuned on. This is the honest number.

Current, against the live sheet:

| | zero results | top-1 in right section | right module in top 3 | median results |
|---|---|---|---|---|
| tune | 0/25 | 24/25 | 25/25 | 15 |
| **holdout** | **0/15** | **14/15** | **15/15** | 10 |

The labels are a judgement about where a practitioner should land, not ground
truth. Several accept more than one section because the corpus genuinely has
more than one defensible home; where a label was widened during development,
`label_note` records the evidence — in every case the returned document itself.

**CI runs the invariant only** (`node tools/search-eval.mjs`, no `--score`): *no
natural-language question returns a blank panel.* That holds whatever is in the
sheet, because it is a property of the ranking rather than the content. The
ranking floors need a live build, so they are opt-in — run the scored command
above after touching the ranking, the stopword list or the synonym table.

---

## Tuning

Everything is at the top of the search block in `template.html`:

| | |
|---|---|
| `SEARCH_SYN` | The vocabulary table. **Start here** — most "it didn't find X" reports are a missing phrase, and adding one is a one-line change. |
| `SEARCH_STOP` | Function words. Note `getting` is stopped but `start`/`started` are not: "Getting Started" is a module on every practice. |
| `S_FIELDS` | Field weights. **A field missing from this list is not searched at all** — `who_for` sat unindexed because it was empty when the search was written, so filling it would have done nothing on its own. |
| `S_K1`, `S_B` | BM25 saturation and length normalisation. |

Re-run the scored eval after any change. If a floor fails, the floor is doing
its job — it is set just under the measured result so an honest improvement
passes and a regression does not.

---

## Known limits

- **Vocabulary not in the table and not in the sheet won't be found.** That is
  the real ceiling, and it is why `SEARCH_SYN` is the first place to look.
- **`who_for` is now filled on all 119 resources** and indexed at weight 3, above
  `summary`. It is short and curated, so every word in it is a role a visitor
  might use for themselves. Keeping it filled on new resources matters: it is
  what lets "I'm an instructional coach", "paraeducator" or "for deans" find
  anything at all.
- **A term the whole library is about cannot discriminate.** "Students with
  disabilities" is the premise of the entire site, so it is a weak signal
  within it.
- **It ranks; it does not answer.** For a question whose answer lives *inside* a
  PDF in Drive, search can only point at the PDF. Closing that gap means
  indexing the documents, which is a separate project — see
  `docs/backlog.md`.
