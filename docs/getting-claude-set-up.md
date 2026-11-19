# Getting set up — what to hand over, in order

Ordered by payoff. Steps 1 and 2 cover almost everything; the rest are smaller.

Each step says what it unlocks and what it costs you.

---

## 1. Install the sheet bridge — 10 minutes, unlocks the most

**What it unlocks:** editing rows. The 13 downloads that are broken only because
`published` is `TRUE` on something unfinished. The 5 missing `Modules` rows that
leave 24 resources on no page. Typos in `link_url`, `video_url`, `summary`, `title`.
Everything that is "one cell is wrong".

**Steps:** follow [`docs/sheet-bridge.md`](sheet-bridge.md) — six clicks in the
browser. In short: Extensions → Apps Script, paste in `Bridge.gs`, put the token
from `.bridge-token` into Script Properties, Deploy as a Web app ("Execute as: Me",
"Who has access: Anyone"), then paste the URL it gives you into the chat.

**What it costs you:** a script that runs with your permissions on the listed tabs
and columns, with every change logged to a `BridgeLog` tab. Revoke by archiving the
deployment.

---

## 2. Say yes to a nightly check — 1 minute, needs nothing from you

**What it unlocks:** the thing a spreadsheet cannot do for your team. Each night:
re-run the punch list and the public-access check, and report what changed — a new
resource published with a domain-locked file, a module row that went missing, a row
marked `ready` that nobody flipped live.

Content is moving faster than anyone is checking it. Between yesterday morning and
tonight the "on no page" count went 21 → 24: your team fixed the Enabling Conditions
gaps, and a Leading Implementation restructure created eleven new orphans. Nobody did
anything wrong; there is just no checker.

**Steps:** tell me the cadence (nightly is the obvious default) and I set it up.

---

## 3. Three things to check in Netlify yourself — 5 minutes

I would rather you look than hand me a token. A Netlify personal access token is
**account-wide** — it would let me deploy to or delete any site on your account,
which includes other Summit sites. The questions are small enough that reading them
off the screen is safer and faster.

Open the `ignite-public-goods` project, then:

1. **Site configuration → Build & deploy → Continuous deployment.** Is it connected
   to the GitHub repo, and is auto-publishing on? A push to `main` did not deploy
   when I tested it, which contradicts the README.
2. **Billing / usage.** How many build credits has this month used? `rebuild.yml`
   assumes ~15 per deploy against 300/month, and at least one deploy happened today
   that I cannot account for.
3. ~~Domain management.~~ **Resolved** — the site is live at
   `researchtoimpact.marshall.org`. Nothing to check here.

Tell me what you see and I will tell you what it means.

---

## 4. The custom domain — done, but one cell is wrong

The site is **live at https://researchtoimpact.marshall.org**. No CNAME request needed.

What is still wrong: the Site tab's `domain` says `researchtoimpact.marshallstreet.org`,
a hostname that has never resolved. That value feeds `__SEO_URL__`, so every `og:url`
and share card on the live site points at a dead host. One cell, and the bridge fixes
it the moment it is connected.

---

## 5. Six PDF exports — partly mine now

Six published resources point at live Google Docs and Slides. Publishing those as-is
would expose documents that keep changing, with comments and revision history.

I **can** now create files in Drive — tested and confirmed on the shared drive. What
I have not yet proven is exporting an existing Google Doc to PDF, because that means
pulling the file's bytes through this session, which is slow and clumsy for anything
large. Say the word and I will try it on the smallest one; if it works, the same
pipeline also does the bigger migration in step 7.

Otherwise: open each, **File → Download → PDF**, drop the PDF in Drive, and tell me —
I will wire the row.

---

## 6. Pushing code — just say "push"

`Bash(git push:*)` is already allowed in `.claude/settings.local.json`. The denials
you saw came from the auto-mode classifier judging intent per call, not from a
missing permission — which is why "Merge and publish" worked instantly.

So there is nothing to configure. When I say commits are ready, "push" is enough. I
would leave it that way: pushes touch a public repository, and a one-word checkpoint
is cheap. If you ever want it fully hands-off, the lever is the session's permission
mode, not a settings file — ask and I will explain the trade-off rather than change
it myself.

---

## 7. The decisions that stay yours

No permission helps with these, and they are what actually gate a launch.

- **A real release gate.** `status = ready` is not one: a row marked `ready` points at
  a file called `[Working Draft] IGNITE Training Deck #1`. The cleanest rule is *only
  files living in Drive "01 - Published" may be linked from the sheet* — then the
  access check enforces it automatically, and the structural cause of the 42 broken
  downloads goes away. This is the highest-value change on this page.
- **Licence sign-off.** The site publishes under CC BY 4.0, which lets anyone adapt
  your material commercially. One resource is co-branded `[Marshall & Layered
  Education]`; that partner should agree before launch.
- **Named people and schools.** A principal's name is in a filename the public sees
  on download. Case studies name schools. Fine if consented — worth confirming before
  a funder reads it.
- **Launch items:** drop the "under development" banner, decide whether Stories &
  Spotlights should be in the nav while nothing in it is published, fill `about_story`,
  and have someone open the 10 Vimeo links signed out (Cloudflare blocks every
  automated client, mine included, so no script can check those).

---

## What I will do without being asked, once step 1 is done

- Fix anything that is one wrong cell, and log it
- Keep the access check at zero blocked downloads
- Flag rows where the description does not match the actual document
- Report what changed each night, including what I chose not to touch

What I will keep asking about: anything that publishes something new to the world.
