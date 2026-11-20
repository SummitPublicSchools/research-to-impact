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

## Searching inside the documents

Everything above ranks the sheet's *description* of a resource — about 8,500
words. The files those rows link to hold about 450,000. A question whose answer
is on page 12 of a PDF could only ever be pointed at. Now the text of every
linked PDF, Google Doc and deck is searchable too, and a result found that way
says so: **"Inside the document, p. 12 …"** with the matching sentence.

```
linked files ──tools/index-files.mjs──▶ content/<drive-id>.txt   (committed)
content/ ──build.js──▶ dist/search-docs.json   (passages; fetched when search opens)
```

**1. Extraction is not part of the build.** The files are ~200 MB of PDF, the
Netlify image has no PDF tooling, and this repo has no dependencies. So
`tools/index-files.mjs` does it — on a laptop, or weekly in
`.github/workflows/rebuild.yml` — reading each file *as an anonymous visitor*
and committing plain text to `content/`. It re-downloads only files whose
`Last-Modified` or size changed. The build then does string work only: no extra
network calls, and it cannot fail because Drive was slow.

**2. The page does not carry the text.** The build cuts it into ~110-word
passages and writes `dist/search-docs.json` (≈1.9 MB, ≈580 KB compressed),
fetched the first time someone opens search. Until it arrives — and if it never
does — search behaves exactly as it did before.

**3. Repeats are removed, smallest document first.** Each Collection's "full
collection" PDF contains its stand-alone documents, and several files are
uploaded twice under different ids. A page already seen in a smaller document
is dropped from the larger one, so the 179-page compilation does not match
everything its parts match and crowd the specific resource out. Running heads
and footers are stripped the same way. (450,000 words in, 275,000 kept.)

**4. The sheet decides first; the documents refine.** *Which* resources come
back is settled from the sheet alone, exactly as before. Document text then
does two narrower things: it lifts a returned resource whose file also contains
the words, and it adds a resource the sheet missed — but only on stronger
evidence (`S_DOCNEED`: 60% of the visitor's words together in one passage, where
the sheet needs half; `S_DOCFLOOR`: a passage scoring within 70% of the best
one). A resource is credited with its single best passage, never the sum, and
that counts for `S_DOCW` = 0.35 of a sheet match.

That ordering is the lesson of this build. The first version let passage
matches vote on the coverage rule, and "anything for a principal rolling this
out" lost its (correct) sheet results to any passage containing "roll out".
Prose matches loose questions far too easily to be given that vote.

**To refresh by hand** (needs `pdftotext`: `brew install poppler`):

```
node build.js && node tools/index-files.mjs     # then commit content/
```

**Things that will catch you out**

- A new or replaced file is not searchable inside until the tool has run
  (weekly, or by hand). Its sheet row is searchable immediately, as always.
- `fixtures/content/` holds invented sample text so CI exercises the whole path.
  The live text is in `content/`. Neither is hand-edited.
- Ligatures matter: a PDF set with "ﬀ" extracts as one glyph and no query
  matches "di·erentiation". The tool folds them (NFKC). If a word that is
  plainly in a document cannot be found, look at the extracted text first.
- Gated resources are indexed like any other, so a snippet of their text shows
  before the (skippable) email ask.

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

**`inside` (15)** is a third split: questions whose answer is in the text of a
file and not in the sheet ("should we pause repeated reading during state
testing"), each naming the resource that holds it. They were written *from* the
passages, so they prove retrieval works rather than measure it blind.

| | sheet only | with documents |
|---|---|---|
| tune — top-1 section | 24/25 | 24/25 |
| holdout — top-1 section | 14/15 | 14/15 |
| inside — right document in top 5 | 8/15 | **14/15** |

Every check runs twice — on the sheet-only index the page loads with, and again
with the document text loaded — because those are the two states the page
really runs in, and the original floors must hold in both.

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
| `S_DOCW`, `S_DOCNEED`, `S_DOCFLOOR` | How much a passage inside a document counts, and the bar for adding a resource the sheet did not return. |

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
- **It ranks; it does not answer.** It can now find the passage inside a
  document and quote it with its page number, but it still does not compose an
  answer — on purpose (see "What the panel shows").
- **Six published files are sign-in only**, so their text cannot be read and
  they are searchable by their sheet row alone. `tools/index-files.mjs` names
  them on every run; they are the same six `tools/accesscheck.sh` reports.
- **A scanned or image-only PDF yields no text.** The index tool flags any file
  with very little text for its page count.
