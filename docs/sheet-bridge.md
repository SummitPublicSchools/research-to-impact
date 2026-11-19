# Sheet bridge — setup (all clicks, no terminal)

This gives an AI session the ability to apply **narrow, logged** edits to the master
sheet: flipping `published`, fixing a `summary`, adding a missing `Modules` row. It
exists because an AI session can read the sheet but has no way to write to it.

Setup is six steps in the browser. You will need the token file from step 3.

---

## What it can and cannot do

**Can**, on the content tabs only: set `published`, `status`, `focal`, `gated`,
`title`, `summary`, `who_for`, `module`, `link_url`, `video_url`, the Sections and
Modules columns, and Site `value`. It can append a row (for missing modules).

**Cannot**, by design and enforced in the code:

- touch the **`Files`** tab — `PublishFiles.gs` owns that
- change any **`id`** — ids bind a row to its Drive file and its public deep link
- delete rows
- write a formula, or any column not on the allow-list
- run at all without the token

Booleans are written as plain-text `TRUE`/`FALSE` with the cell forced to text
format, which is what the build needs — the gviz mis-typing that once caused a
phantom "Coming soon" cannot happen through the bridge.

**Every change is logged.** The bridge creates a `BridgeLog` tab and appends the
timestamp, tab, id, column, and the before and after values. That is your audit
trail and your undo list.

---

## Setup

### 1. Open the script editor
In the sheet: **Extensions → Apps Script**. The project already holds
`PublishFiles.gs` and `Guardrails.gs`.

### 2. Add the bridge
Click the **+** next to "Files" → **Script** → name it `Bridge`. Delete the stub
`function myFunction() {}`, then paste the whole contents of
[`docs/apps-script/Bridge.gs`](apps-script/Bridge.gs). Press **Ctrl/Cmd + S**.

### 3. Set the token
In the Apps Script editor, left sidebar: **Project Settings** (the gear) → scroll to
**Script Properties** → **Add script property**.

- Property: `R2I_BRIDGE_TOKEN`
- Value: the 48-character string in the file **`.bridge-token`** at the root of this
  repo. It is gitignored, so it never leaves your machine. Open it, copy the line,
  paste it here.

Click **Save script properties**.

> Prefer to generate your own instead? In the editor, choose the function
> `setUpBridgeToken` and press **Run**, then read the value from **Execution log**
> and put that same value into `.bridge-token`.

### 4. Deploy it
**Deploy → New deployment** → gear icon → **Web app**. Then:

- Description: `R2I bridge`
- **Execute as: Me**
- **Who has access: Anyone**

Click **Deploy**, and authorise when Google asks.

> "Anyone" is required for a token-authenticated endpoint — Google will otherwise
> serve a sign-in page to any caller. The URL is useless without the token, but
> treat the URL as semi-sensitive anyway: do not paste it into public places.

### 5. Hand over the URL
Copy the **Web app URL** it shows (it ends in `/exec`) and paste it into the chat.
It goes into `.bridge-url`, which is also gitignored. The URL alone grants nothing;
the token is the gate, and that never needs to appear in chat.

### 6. Confirm
```bash
node tools/sheet.js health
```

You should see the bridge version and your spreadsheet's name.

---

## Using it

```bash
node tools/sheet.js get "Co-Planning" cp-5-how-to-measure
```

```bash
node tools/sheet.js unpublish "Co-Planning" cp-1-infographic-and-impact-data
```

Batches are a **dry run** unless you add `--apply`, so the diff is always visible
first:

```bash
node tools/sheet.js batch ops.json
```

---

## Revoking it

Any one of these stops it immediately:

- **Deploy → Manage deployments → Archive** the deployment
- delete the `R2I_BRIDGE_TOKEN` script property
- delete `Bridge.gs`

Rotating the token: run `setUpBridgeToken`, then update `.bridge-token` to match.

## Honest note on trust

The script runs **as you**, so within the tabs and columns listed above it acts with
your permissions. The restrictions are enforced in code you can read in one sitting —
about 330 lines, no dependencies, no network calls of its own. The `BridgeLog` tab
means nothing it does is invisible. If you would rather it could not write a given
column, remove that column from `ALLOWED_COLUMNS` and save; the change takes effect
on the next request.

---

## Note on Modules rows

Module names repeat across sections — `Overview`, `Enabling Conditions`,
`Getting Started` and four others each appear in all three toolkits. So editing an
existing module row needs **both** keys:

```bash
node tools/sheet.js batch ops.json      # where a Modules op carries "section"
```

```json
{ "op": "set", "tab": "Modules", "section": "Repeated Reading",
  "id": "Enabling Conditions", "column": "module_video", "value": "https://vimeo.com/123456789" }
```

Without `section` the bridge refuses the edit rather than guessing, because the name
alone matches three rows. Appending a new module row is unaffected.
