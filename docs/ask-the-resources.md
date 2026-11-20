# Ask the Resources

The answer panel behind the header's **Search or ask** control. A visitor types a
question, presses Enter, and gets two or three sentences plus a link to the one
resource the answer came from.

It is **a router, not an oracle** — and that distinction is the whole design.

---

## What it can and cannot do

The site holds resource *metadata*: a title, a section, a module, usually one
summary sentence, sometimes a body paragraph or a quote. It does not hold the
resources. The guides, decks and protocols are files in Drive, and nothing in
this codebase ever sees their text.

So it can answer:

> **How do I start co-planning with a new co-teacher?**
> Co-planning works when the conditions are in place first: protected planning
> time, roles each partner agrees to, and a routine you keep. The Enabling
> Conditions guide walks through each one.
> *Source: Co-Planning · Enabling Conditions →*

It cannot answer "walk me through a first co-planning meeting", because that
text is inside a document the site has never read. The system prompt in
`netlify/functions/ask.mjs` forbids it from trying, and the answer card carries a
standing line under every answer: *"This points you to the right resource — it
doesn't replace reading it."*

If you want substantive answers rather than good routing, the work is indexing
the Drive documents. That is a separate project, not a setting.

---

## How it is built

```
Google Sheet
   │
   ├─ build.js ──> dist/index.html        the page (as before)
   │
   └─ build.js ──> netlify/functions/corpus-data.mjs
                        │  generated, gitignored, ~21k tokens
                        ▼
                   netlify/functions/ask.mjs   ──>  Claude (claude-opus-5-5)
                        ▲                                   │
                        └──────── POST /api/ask ────────────┘
                                      ▲
                               template.html
```

**There is no retrieval layer, and that is deliberate.** The entire published
library is about **21,000 tokens** — 83,000 characters of ids, titles, section
and module labels, summaries, bodies, quotes and intros — which fits in a single
prompt with room to spare against a 1M context window. `build.js` prints the
exact figure on every build. Embeddings, chunking and a vector store would all be machinery for a
problem this corpus does not have — and every one of them would be a thing that
can fall out of sync with the sheet. The corpus is regenerated on every build
and bundled into the function, so it cannot drift from the page it shipped with.

**This is the first piece of the site with a server in it.** Everything else is
a flat file plus a nightly rebuild. An API key cannot live in the page, so it
lives in a Netlify environment variable and the function holds it. That is the
cost of the feature: one new thing that can be down.

### The citation guard

The model returns a resource id. `ask.mjs` checks that id against the real set
built from the corpus, and **drops the entire answer** if it does not match.

A fluent, confident answer citing a resource that does not exist is the one
failure that would actually cost Marshall credibility on a funder-facing site
publishing under CC BY. It is also cheap to make structurally impossible rather
than merely unlikely, so it is. `tools/ask-selftest.mjs` tests exactly this case.

### What it degrades to

Every failure path — no key, bad key, API down, rate limited, timed out,
truncated, invented citation — renders one line in the answer card and leaves the
live search results below it untouched. Search is the floor; the answer is a
layer on top. The panel never breaks.

---

## Setup (one-time, needs a human at a computer)

The code is deployed. The endpoint returns `503 not_configured` and the page
falls back to search until the key is set.

**1. Create an API key**

1. Go to <https://console.anthropic.com/settings/keys>.
2. **Create Key**. Name it `research-to-impact-netlify`.
3. Copy it. You will not be shown it again.

**2. Set a spend limit — do this before step 3**

1. In the same console, go to **Settings → Limits**.
2. Set a monthly spend limit you are comfortable with. **$50** is a sensible
   starting point for this site's traffic (see Cost below). You can lower it once
   you have a week of real numbers.

This is the real backstop against a stuck client or a script running up a bill.
The per-IP rate limit in the function is a speed bump, not a wall — it lives in
one function instance's memory and resets when that instance recycles.

**3. Add the key to Netlify**

1. Netlify → the `ignite-public-goods` site → **Site configuration** →
   **Environment variables**.
2. **Add a variable** → **Add a single variable**.
3. Key: `ANTHROPIC_API_KEY`. Value: the key from step 1.
4. Scopes: leave as all. Deploy contexts: **All**.
5. **Create variable**.

**4. Redeploy**

Environment variables are read at function runtime, but a deploy is the cleanest
way to be sure. Push anything, or Netlify → **Deploys** → **Trigger deploy** →
**Deploy site**.

**5. Check it**

Open the site, click **Search or ask**, type a question, press Enter. If it still
says "Answers are switched off right now", the key is not reaching the function.

---

## Cost

Per question, on `claude-opus-5-5`:

| | Input | Output | Roughly |
|---|---|---|---|
| First question in an hour (cache **write**) | ~21k tokens at the cache-write rate | ~250 tokens | **10–17¢** |
| Every question within the hour after it (cache **read**) | ~21k tokens at $0.20/M | ~250 tokens | **~1¢** |

That spread is the whole economics of this feature: a cold question costs more
than ten warm ones. The corpus is byte-identical on every request and cached with
a **1-hour TTL** rather than the 5-minute default, because this site's traffic is
bursty — at the default, most questions would arrive after the entry had expired
and pay the cold price every time.

At a plausible 50 questions a day clustered into working hours (say eight cold
windows), that lands around **$40–50 a month**. Treat that as an order of
magnitude, not a forecast — the cold/warm mix depends entirely on how traffic
actually clusters, and it is the one number here I cannot measure in advance.
Read the real figure off the first week: the function returns token counts in its
JSON response (`usage.cache_read` should be ~21,000 on a warm question and 0 on a
cold one), and the console shows the bill.

**If `usage.cache_read` is always 0, caching has silently broken.** The usual
cause is a change that makes the corpus bytes differ between builds. `build.js`
sorts the resources and fixes the key order for exactly this reason, and
`tools/ask-selftest.mjs` asserts the prompt's shape.

---

## Tuning

Everything worth changing is at the top of `netlify/functions/ask.mjs`:

| | |
|---|---|
| `MODEL` | `claude-opus-5-5`. A cheaper model is a quality trade you should measure, not assume. |
| `effort: 'low'` | Thinking depth. `low` is right for picking one row out of a list and is what keeps the call inside a Netlify function's execution window. |
| `MAX_Q` | 300 characters. |
| `MAX_PER_WINDOW` | 8 questions per IP per minute. |
| `INSTRUCTIONS` | The system prompt — the answer's voice, length and honesty rules all live here. |

The corpus itself is the other lever. Dropping the `body` field in `build.js`
would cut the prompt substantially, but body text is where the substance is —
that is a quality trade, worth making against real usage numbers rather than in
advance.

To **switch the feature off** without a deploy, delete `ANTHROPIC_API_KEY` in
Netlify. The panel reverts to search with one explanatory line. To switch it off
permanently, set `AI_ANSWERS=false` in `template.html`, which restores the
original "coming soon" placeholder.

---

## Testing

```
npm run build:local && npm run test:ask
```

`tools/ask-selftest.mjs` stubs `globalThis.fetch` and drives the real handler, so
it costs nothing and needs no key. It covers request validation, the prompt's
shape (including the cache breakpoint), structured-output parsing, the citation
guard, every upstream failure mode and the rate limit. CI runs it on every push.

It does **not** test answer quality — nothing automated can. Before this goes in
front of funders, sit with Stephanie and read two or three dozen real answers to
real questions.

---

## Known limits

- **Latency.** Two to five seconds, against a search box that is instant. The
  search results render immediately while the answer loads, which is what makes
  the wait tolerable.
- **The rate limit is per function instance.** See step 2 of Setup.
- **`who_for` is empty on all 119 resources.** It is the single field that would
  most improve routing — it is what lets "I'm an instructional coach" find the
  right thing — and filling it is editorial work in the sheet, not code.
- **78% of resources have under 300 characters of text.** The answers are only
  ever as specific as the sheet is.
