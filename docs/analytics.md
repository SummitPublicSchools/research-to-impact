# Analytics — anonymous usage counts

The site counts how it is used without cookies, accounts, or a paid service. The page
posts one small note per event to a Google Sheet the team owns; a `Summary` tab totals
them. It is **off until `analytics_url` is set on the Site tab**.

## What is counted

| Event | When | What is stored |
|---|---|---|
| `view` | a page is shown (home, a toolkit, a module, About, Privacy, Saved) | toolkit and module names. A visit that arrives on a shared resource link adds that resource's id |
| `open` | Download, Open or Watch is pressed | the resource id, and `download` / `link` / `video`. Gated resources add `(gave email)` or `(skipped email)` |
| `search` | the visitor stops typing for 1.5 seconds | the words (up to 80 characters), how many results, the audience lens |
| `pick` | a search result is clicked | the resource id and the search that led to it |
| `intro` | a toolkit or module intro video is played | toolkit and module names |
| `email` | an email is sent to HubSpot from a gated resource | the resource id — **never the address** |

Every row also carries the time, a device size (`phone`, `tablet`, `desktop`) and a
`session` id. The first row of a visit adds the referring site's name (`google.com`, not
the full address) and a `utm_source` if the link had one.

## What is not

- **No cookies and nothing stored on the visitor's device.** The `session` id is a random
  value held in memory for one page load. It counts "one visit" and is gone on reload, so
  two visits by the same person cannot be linked. This is why the site needs no consent
  banner.
- No IP address, no browser fingerprint, no name, no email.
- Nothing is sent from Deploy Previews or local builds (the page checks it is on the live
  `domain`), from browsers that send Do Not Track or Global Privacy Control, or from
  automated browsers.
- Search words are stored as typed. Someone could type a name into the search box; the
  80-character cap is the only limit. Treat the Events tab as internal.

A "download" is a click on the button. The files live on Drive and the videos on Vimeo,
so the site cannot see whether a download finished or how much of a video was watched
(Vimeo's own stats have that).

## One-time setup (about ten minutes)

1. Create a **new, separate** Google Sheet named `R2I Analytics`. Do not use the content
   sheet: the receiving address is public, and it should have no way to reach content.
2. In it, **Extensions → Apps Script**. Delete the sample code, paste all of
   [`docs/apps-script/Analytics.gs`](apps-script/Analytics.gs), and press **Save**.
3. In the function dropdown choose **`setup`** and press **Run**. Approve the permission
   prompt (it asks to edit this one spreadsheet). The sheet now has `Summary` and `Events`
   tabs.
4. **Deploy → New deployment**. Click the gear → **Web app**. Set **Execute as: Me** and
   **Who has access: Anyone**. Press **Deploy** and copy the **Web app URL** (it ends in
   `/exec`).
5. Open that URL in a browser. It should say `R2I analytics receiver 1.0.0`.
6. On the content sheet's **Site** tab add a row: setting `analytics_url`, value the URL
   from step 4. (An AI session can add this row through the bridge.)
7. Rebuild the site (`tools/publish.sh`, or wait for the nightly build). Visit the live
   site, click around, and watch rows arrive on the `Events` tab.

If your Google Workspace does not offer "Anyone" in step 4, an administrator has
restricted web apps to the organisation, and the receiver cannot be public from that
account. Deploy it from an account that allows it.

**Reword the Privacy page first.** The `privacy` setting on the Site tab is the text of
the Privacy page, and it says the site has no analytics. Change that sentence before
setting `analytics_url`; the build warns while the two disagree. Saved and Done are not
counted, so the page's promise that they never leave the browser stays true.

## Reading the numbers

`Summary` has page views and visits by month, views by toolkit and module, opens by
resource, top searches, **searches that found nothing** (the list to read first — each is
a visitor the site failed; see `SEARCH_SYN` in `docs/search.md`), and referring sites.
The `Events` tab is the raw log: filter, pivot or chart it like any sheet. Run
**R2I Analytics → Set up (or repair) the tabs** to rebuild `Summary`; it never deletes
an event.

## Abuse limits

The address is public, so the script only accepts a fixed list of event names,
shape-checks and length-caps every field, strips a leading `= + - @` so a cell can never
become a formula, and drops anything past 300 events a minute, 400 per session, or
400,000 rows. It checks that a resource id *looks* like an id, not that it exists; an id
that matches no resource on the site is junk. It always answers `ok`.

## Changing or turning it off

- **Off:** blank `analytics_url` and rebuild, or archive the deployment
  (**Deploy → Manage deployments → Archive**).
- **After editing `Analytics.gs`:** bump `ANALYTICS_VERSION`, re-paste, then
  **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**. That
  keeps the same URL. A *new deployment* makes a new URL and the Site tab must follow.

## Emails (HubSpot)

Gated resources show the site's own one-field form. On submit the page posts the address
straight to HubSpot's form-submission endpoint, with the resource's title as the page
name, so the contact record shows what they came for. HubSpot's embed script and tracking
code are deliberately **not** loaded: the tracking code sets cookies and the embed script
carries the code to. The form is live once
`hubspot_portal_id` and `hubspot_form_id` are on the Site tab; the HubSpot form needs
only an **Email** field. Turn reCAPTCHA off for that form: a post from the site's own
form cannot complete one. This path has been tested against a stand-in, not yet against
a real HubSpot form — submit a test address the first time the ids are set.
