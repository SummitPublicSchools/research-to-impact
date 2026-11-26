#!/usr/bin/env node
'use strict';
/*
 * Research to Impact — site build.
 * Pulls the master Google Sheet, assembles the page data, and writes dist/index.html
 * by injecting that data into template.html (replacing the __DATA__ placeholder).
 *
 * Run remotely (default; fetches the live sheet — requires the sheet shared as
 *   "anyone with the link: Viewer"):
 *     node build.js
 * Run against local CSV fixtures (no network):
 *     SHEET_SOURCE=local node build.js
 *
 * Override the sheet with: SHEET_ID=... node build.js
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------- config
const SHEET_ID   = process.env.SHEET_ID   || '1IHC6eaWAtYomqPR08mrl7147-Zo_bq3Dz1pR1orZNxs';
const SOURCE     = process.env.SHEET_SOURCE || 'remote';   // 'remote' | 'local'
const FIXTURE_DIR= process.env.FIXTURE_DIR || 'fixtures';
const TEMPLATE   = process.env.TEMPLATE   || 'template.html';
const OUT_DIR    = process.env.OUT_DIR    || 'dist';
const CACHE_BUST = Date.now();   // unique per build; defeats gviz CSV caching

const SITE_TAB = 'Site', SECTIONS_TAB = 'Sections', MODULES_TAB = 'Modules';
// Resource tabs. The section a row belongs to is the TAB it sits on (resource
// rows carry no `section` column), so we map tab name -> section here.
const RESOURCE_TABS = [
  'Co-Planning', 'Repeated Reading', 'Routine Data Cycles',
  'Leading Implementation', 'Stories & Spotlights', 'Evidence & Impact',
  'R2I Library', 'Site Assets',
];
// Tiers that render as browsable section + module pages (and appear in the nav).
// R2I is the Research-to-Impact Library: it renders as a browsable page (its
// modules are the cross-cutting "Collections") only once its section's
// nav_visible flips off 'hidden-until-live'; until then it shows as soon-chips.
const PAGE_TIERS = ['IGNITE', 'Own', 'Stories', 'Evidence', 'R2I'];
// Of those, the tiers that also get a card on the homepage. Practitioner-first:
// the practice toolkits and Leading Implementation are featured; Stories and
// Evidence are browsable + in nav, but deliberately NOT on the homepage.
const HOMEPAGE_TIERS = ['IGNITE', 'Own'];
// The sheet labels the library differently across tabs; normalize to the
// canonical section_name from the Sections tab.
const SECTION_ALIASES = { 'R2I Library': 'Research-to-Impact Library' };
const canon = s => SECTION_ALIASES[(s || '').trim()] || (s || '').trim();

const warn = [], info = [], tabReport = [], err = [];
// STRICT=1 makes the build fail (exit 1) when there are hard errors. CI runs
// strict so mistakes can't merge; the Netlify/nightly build stays lenient so a
// single bad row never takes the whole site offline.
const STRICT = String(process.env.STRICT || '').trim() === '1';

// ---------------------------------------------------------------- helpers
const TRUE = v => String(v == null ? '' : v).trim().toUpperCase() === 'TRUE';
const num  = v => { const n = parseInt(String(v == null ? '' : v).trim(), 10); return isNaN(n) ? 0 : n; };
function isRecent(dateStr, days = 30) {
  const s = String(dateStr || '').trim(); if (!s) return false;
  const d = new Date(s); if (isNaN(d)) return false;
  return (Date.now() - d.getTime()) / 86400000 <= days;
}
function group(arr, keyFn) {
  const out = {}; for (const x of arr) { const k = keyFn(x); (out[k] = out[k] || []).push(x); } return out;
}

// ---- link/asset normalization ----
// Editors paste a Google Drive "share" link (or any URL) into the sheet. Pull the
// file id out of the common Drive URL shapes so we can build a clean direct link.
function driveId(url) {
  const s = String(url || '');
  const m = s.match(/\/file\/d\/([-\w]{20,})/) || s.match(/[?&]id=([-\w]{20,})/);
  return m ? m[1] : null;
}
// A link to open/download a file. Drive -> the file's view page (lets the user
// preview or download); any other URL passes through; a bare filename is treated
// as a path in the repo's assets/ folder. Blank stays blank.
function fileUrl(url) {
  const s = String(url || '').trim(); if (!s) return '';
  const id = driveId(s); if (id) return `https://drive.google.com/file/d/${id}/view`;
  if (/^https?:\/\//i.test(s)) return s;
  return 'assets/' + s.replace(/^\/+/, '');
}
// An image src. Drive -> a sized thumbnail (renders inline); other URLs/paths as above.
function imageUrl(url) {
  const s = String(url || '').trim(); if (!s) return '';
  const id = driveId(s); if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w1200`;
  if (/^https?:\/\//i.test(s)) return s;
  return 'assets/' + s.replace(/^\/+/, '');
}
// A video link. Editors sometimes paste Vimeo's full "Embed" snippet (iframe +
// script tag) instead of the page link; pull the video id back out so the inline
// player still works. Vimeo "share" links (vimeo.com/share/<uuid>) carry no
// video id — resolveVimeoLinks() swaps them for the numeric URL after all tabs load.
// ----- HubSpot ids -----
const HS_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hsId = (v, re) => { const s = String(v || '').trim(); return re.test(s) ? s : ''; };
// ----- About page -----
// The Site tab carries more about_* prose than the page used to show. Five
// paragraphs — about_toolkits, about_origin, about_continue, about_team and
// about_community — were written and then never read by the build, while the
// page asked for an about_story key that has never existed on the tab and so
// rendered an empty "Our story" heading. These are the sections, in reading
// order; a blank or missing setting is simply skipped.
//
// about_story is kept as an override: if someone does create it, it wins over
// about_origin for the opening section.
const ABOUT_SECTIONS = [
  { keys: ['about_story', 'about_origin'], heading: 'Our story' },
  { keys: ['about_ignite'], heading: 'IGNITE' },
  { keys: ['about_practices'], heading: 'The practices' },
  { keys: ['about_toolkits'], heading: 'What’s on this site' },
  { keys: ['about_continue'], heading: 'The work continues' },
  { keys: ['about_team'], heading: 'Team' },
  { keys: ['about_network'], heading: 'Our network' },
  { keys: ['about_community'], heading: 'Partners and funders' },
];
function aboutBlocks(S) {
  const out = [];
  for (const sec of ABOUT_SECTIONS) {
    const key = sec.keys.find(k => String(S[k] || '').trim());
    if (!key) continue;
    const lines = String(S[key]).trim().split(/\n+/).map(l => l.trim()).filter(Boolean);
    let heading = sec.heading;
    // Several of these cells were written with their own title line on top
    // ("A Second Edition", "The Work Continues:", "Our Network:"), and the page
    // then printed its own <h2> above it — so the live About page read
    // "NETWORK & PARTNERS / Our Network: The IGNITE Network is...". Where a
    // first line looks like a title (short, no sentence-ending punctuation, and
    // something follows it) use it as the heading instead: it is the team's own
    // wording, and the duplication goes away. Otherwise keep the default.
    if (lines.length > 1 && lines[0].length <= 60 && !/[.!?]$/.test(lines[0])) {
      heading = lines.shift().replace(/[:：]\s*$/, '');
    }
    out.push({ key, heading, body: lines });
  }
  return out;
}
// ----- Privacy page -----
// One Site setting, `privacy`, holds the whole page: a line that looks like a
// title (short, no sentence-ending punctuation) starts a section, every other
// line is a paragraph. Lines before the first title are the opening. Blank
// means no page, and the footer then shows no Privacy link at all — a word
// that looks like a link and goes nowhere is worse than nothing.
function privacyBlocks(v) {
  const out = [];
  for (const line of String(v || '').split(/\n+/).map(l => l.trim()).filter(Boolean)) {
    if (line.length <= 60 && !/[.!?:]$/.test(line)) out.push({ heading: line, body: [] });
    else { if (!out.length) out.push({ heading: '', body: [] }); out[out.length - 1].body.push(line); }
  }
  return out.filter(s => s.body.length);
}
function videoUrl(url, where) {
  const s = String(url || '').trim(); if (!s) return '';
  if (s.includes('<')) {
    const m = s.match(/player\.vimeo\.com\/video\/(\d+)(?:[^"'\s]*[?&]h=([0-9a-zA-Z]+))?/);
    if (m) {
      const clean = `https://vimeo.com/${m[1]}${m[2] ? '/' + m[2] : ''}`;
      warn.push(`${where}: cell contains pasted Vimeo embed code, not a link. Rescued it as ${clean} — please put that link in the cell.`);
      return clean;
    }
    warn.push(`${where}: cell contains HTML (looks like pasted embed code) with no recognizable Vimeo link — ignored. Paste the video's page link instead.`);
    return '';
  }
  return fileUrl(s);
}
// Two kinds of Vimeo link carry no video id, so the inline player cannot embed
// them and the Watch button falls back to opening a new tab:
//
//   vimeo.com/share/<uuid>              the Share dialog's "Copy link"
//   vimeo.com/<user>/<slug>             a vanity link, e.g. /marshallstreet/co-planning
//
// The vanity form is what the sheet actually had: ten of the site's eleven
// published videos used it, and none of them played in the page.
//
// We resolve both through Vimeo's public oEmbed endpoint, which returns the
// numeric video_id. The previous approach — fetching the page and scraping its
// canonical link — now gets a 403 from Vimeo for both forms, which is why the
// one share link in the sheet had been warning unresolved for so long.
//
// Resolution happens once per unique link, and on any failure the original is
// left alone: the video still works, it just opens in a new tab. Each lookup is
// bounded by a timeout so a hanging request cannot stall a deploy.
const VIMEO_NEEDS_LOOKUP = [
  /^https:\/\/vimeo\.com\/share\//i,
  // A vanity link: two path segments where the first is not all digits. Excludes
  // vimeo.com/<id> (already numeric) and vimeo.com/<id>/<hash> (an unlisted link,
  // whose hash the player needs and which videoUrl() already understands).
  /^https:\/\/vimeo\.com\/(?!\d+(?:[/?#]|$))[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/i,
];
async function resolveVimeoLinks(holders) {
  const needs = v => VIMEO_NEEDS_LOOKUP.some(re => re.test(v || ''));
  const pending = holders.filter(h => needs(h.obj[h.key]));
  if (!pending.length) return;
  const resolved = {};
  for (const u of [...new Set(pending.map(h => h.obj[h.key].split('?')[0]))]) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch('https://vimeo.com/api/oembed.json?url=' + encodeURIComponent(u), { signal: ctrl.signal });
      clearTimeout(timer);
      const j = res.ok ? await res.json() : null;
      // An unlisted video's oEmbed carries the ?h= hash on the player URL; keep
      // it, because the embed is rejected without it.
      const hash = j && typeof j.html === 'string' ? (j.html.match(/[?&]h=([0-9a-zA-Z]+)/) || [])[1] : '';
      resolved[u] = j && j.video_id ? `https://vimeo.com/${j.video_id}${hash ? '/' + hash : ''}` : null;
    } catch { resolved[u] = null; }
  }
  for (const h of pending) {
    const clean = resolved[h.obj[h.key].split('?')[0]];
    if (clean) {
      info.push(`${h.where}: resolved Vimeo link -> ${clean} (put that in the cell and the build stops needing the lookup).`);
      h.obj[h.key] = clean;
    } else {
      warn.push(`${h.where}: could not resolve "${h.obj[h.key]}" to a Vimeo video id — the video will open in a new tab instead of playing inline. Put the numeric URL (e.g. https://vimeo.com/123456789) in the cell.`);
    }
  }
}

// ---------------------------------------------------------------- document index
// Search looks INSIDE the linked files, not just at the sheet's description of
// them. The text itself is extracted ahead of time by tools/index-files.mjs and
// committed under content/ (one <drive-id>.txt per file, pages separated by a
// form feed) — so this step is pure string work: no network, no PDF tooling, no
// dependencies. It cuts that text into passages and writes them to a separate
// file the page fetches only when someone opens search, so the page itself does
// not grow. See docs/search.md.
const CONTENT_DIR = process.env.CONTENT_DIR ||
  (SOURCE === 'local' ? path.join(FIXTURE_DIR, 'content') : 'content');
const PASSAGE_WORDS = 110;      // target passage length
const PASSAGE_MIN   = 15;       // shorter than this is a heading, not a passage
const PASSAGE_MAX   = 170;      // a paragraph longer than this is cut into windows
const DUP_SHINGLE   = 6;        // words per shingle when spotting repeated pages
const DUP_FRACTION  = 0.6;      // share of a page already seen elsewhere => repeat

function linkedFileId(url) {
  const m = String(url || '').match(/(?:docs\.google\.com\/(?:document|presentation)|drive\.google\.com\/file)\/d\/([\w-]+)/);
  return m ? m[1] : '';
}
const docToks = s => String(s).toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').split(/\s+/).filter(Boolean);

// Many of the PDFs set their headings with wide letter-spacing, and text
// extraction reads the gaps as word breaks: "PROGRESS MONITORING" comes out as
// "PR OGR E SS M O N ITOR IN G". Left alone, those fragments are indexed as
// words — typing "pr" matched exactly that and nothing else — and they are what
// a snippet then quotes. A run is recognised by being made of pieces rather
// than words (checked against the documents' own vocabulary), and repaired by
// closing the gaps and re-cutting the letters into words the documents
// themselves use elsewhere. A run that cannot be re-cut cleanly is dropped: a
// missing heading costs little, a wrong word in the index costs trust.
// (A heading can wrap, so a single line break counts as a gap; a blank line does not.)
const SPACED_GAP = /(?:[ \t]+|[ \t]*\n(?!\s*\n)[ \t]*)/;
const SPACED_RUN = new RegExp('(?<![A-Za-z])[A-Z&]{1,14}(?:' + SPACED_GAP.source + '[A-Z&]{1,14}){3,}(?![A-Za-z])', 'g');
function isLetterSpaced(run, vocab) {
  // Real capitals are made of words; a letter-spaced run is made of pieces.
  // Short pieces, specifically: a row of acronyms ("IEP ELL MTSS") is not words
  // either, and must be left alone.
  const t = run.split(/\s+/).filter(x => x && x !== '&');
  const pieces = t.filter(x => !vocab.has(x.toLowerCase())).length;
  return pieces >= 2 && pieces / t.length >= 0.3 && t.filter(x => x.length <= 2).length / t.length >= 0.3;
}
function segmentWords(letters, vocab) {
  // Fewest words wins; a tie goes to whichever cut came first.
  const n = letters.length, best = new Array(n + 1).fill(null);
  best[0] = [];
  for (let i = 0; i < n; i++) {
    if (!best[i]) continue;
    for (let j = i + 1; j <= Math.min(n, i + 24); j++) {
      const w = letters.slice(i, j);
      if (!vocab.has(w)) continue;
      if (!best[j] || best[i].length + 1 < best[j].length) best[j] = best[i].concat(w);
    }
  }
  return best[n];
}
function repairLetterSpacing(text, vocab, stats) {
  return text.replace(SPACED_RUN, run => {
    if (!isLetterSpaced(run, vocab)) return run;
    // "&" is a real word boundary; everything else is closed up and re-cut.
    const parts = run.split('&').map(part => {
      const letters = part.replace(/\s+/g, '').toLowerCase();
      return letters ? segmentWords(letters, vocab) : [];
    });
    if (parts.some(x => !x)) { stats.dropped++; if (process.env.DEBUG_SPACING) console.error('DROP ' + JSON.stringify(run)); return ' '; }
    stats.repaired++;
    return parts.map(x => x.join(' ').toUpperCase()).join(' & ');
  });
}

function buildDocIndex(resources) {
  const empty = { index: { v: 1, docs: [], passages: [] }, files: 0, words: 0, kept: 0, spacing: { repaired: 0, dropped: 0 } };
  if (!fs.existsSync(CONTENT_DIR)) return empty;

  // 1. One "doc" per distinct text, however many resources link to it. Two
  //    resources can share a Drive file, and two Drive files can be the same
  //    document uploaded twice (each Collection's "full collection" PDF is).
  const byText = new Map();
  let files = 0;
  const seenFile = new Map();
  for (const r of resources) {
    if (!r.published) continue;
    const fid = linkedFileId(r.link); if (!fid) continue;
    if (!seenFile.has(fid)) {
      const f = path.join(CONTENT_DIR, fid + '.txt');
      seenFile.set(fid, fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null);
      if (seenFile.get(fid) != null) files++;
    }
    const text = seenFile.get(fid); if (text == null) continue;
    const key = docToks(text).join(' ');
    if (!key) continue;
    if (!byText.has(key)) byText.set(key, { ids: [], text, n: key.split(' ').length });
    const d = byText.get(key); if (!d.ids.includes(r.id)) d.ids.push(r.id);
  }

  // 2. Smallest first, so that when a compilation repeats a stand-alone
  //    document, the stand-alone one keeps the passage. Otherwise a 179-page
  //    "full collection" would match every query its parts match and crowd the
  //    specific resource out of its own result.
  // The dictionary the repair cuts against: the words these documents actually
  // use. Counted from lower-case text only — the damage is confined to
  // capitalised headings, so a word seen in running prose is a real word, while
  // a fragment like "ARN" repeated in every page header is not.
  const wordCount = new Map();
  for (const d of byText.values()) {
    for (const w of d.text.match(/\b[A-Za-z][a-z]+\b/g) || []) {
      const k = w.toLowerCase(); wordCount.set(k, (wordCount.get(k) || 0) + 1);
    }
  }
  const vocab = new Set(['a', 'i']);
  // Short "words" need more evidence: a stray "gn" or "ls" in prose would
  // otherwise vouch for the very fragments this is trying to catch.
  for (const [w, c] of wordCount) if (c >= (w.length === 2 ? 25 : w.length === 3 ? 6 : 2)) vocab.add(w);
  const spacing = { repaired: 0, dropped: 0 };
  for (const d of byText.values()) d.text = repairLetterSpacing(d.text, vocab, spacing);

  const docs = [...byText.values()].sort((a, b) => a.n - b.n || a.ids[0].localeCompare(b.ids[0]));
  const seen = new Set();
  const out = { v: 1, docs: [], passages: [] };
  let words = 0, kept = 0;

  for (const d of docs) {
    words += d.n;
    let pages = d.text.split('\f').map(p => p.trim());
    const paged = pages.length > 1;

    // Running heads and footers repeat on every page; they would otherwise be
    // the most "frequent" text in the document and pad every snippet.
    if (pages.length >= 4) {
      const count = new Map();
      for (const p of pages) {
        for (const l of new Set(p.split('\n').map(x => x.replace(/\d+/g, '#').trim()).filter(x => x && x.length < 120))) {
          count.set(l, (count.get(l) || 0) + 1);
        }
      }
      const furniture = new Set([...count].filter(([, c]) => c >= pages.length * 0.5).map(([l]) => l));
      if (furniture.size) pages = pages.map(p => p.split('\n').filter(l => !furniture.has(l.replace(/\d+/g, '#').trim())).join('\n'));
    }

    const mine = [];
    const di = out.docs.length;
    pages.forEach((page, pi) => {
      const tk = docToks(page);
      if (tk.length < 8) return;
      const sh = [];
      for (let i = 0; i + DUP_SHINGLE <= tk.length; i++) sh.push(tk.slice(i, i + DUP_SHINGLE).join(' '));
      mine.push(...sh);
      if (sh.length && sh.filter(x => seen.has(x)).length / sh.length >= DUP_FRACTION) return;

      // Cut the page into passages on paragraph boundaries.
      const paras = page.split(/\n\s*\n/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
      const chunks = []; let cur = [], n = 0;
      const flush = () => { if (cur.length) { chunks.push(cur.join(' ')); cur = []; n = 0; } };
      for (const para of paras) {
        const w = para.split(' ');
        if (w.length > PASSAGE_MAX) {
          flush();
          for (let i = 0; i < w.length; i += PASSAGE_WORDS) chunks.push(w.slice(i, i + PASSAGE_WORDS).join(' '));
          continue;
        }
        if (n && n + w.length > PASSAGE_MAX) flush();
        cur.push(para); n += w.length;
        if (n >= PASSAGE_WORDS) flush();
      }
      flush();
      for (const c of chunks) {
        // A passage this short is a title page or a divider, not something to rank.
        if (c.split(' ').length < PASSAGE_MIN) continue;
        out.passages.push([di, paged ? pi + 1 : 0, c]); kept += c.split(' ').length;
      }
    });
    for (const x of mine) seen.add(x);
    // A doc whose every page was a repeat still gets its slot, so indexes stay aligned.
    out.docs.push(d.ids);
  }
  return { index: out, files, words, kept, spacing };
}

// Poster frames for the intro players. An embedded Vimeo iframe paints a black
// box with a spinner until the player has loaded, which on a toolkit page is
// the first thing under the intro. The page instead shows the video's own still
// with a play button and only loads the player on click, so it needs the still's
// URL — which the same public oEmbed endpoint returns, with the duration.
//
// Only the section and module intro videos get one (a resource's Watch button
// opens a modal and never shows a resting frame). Live builds only: a fixtures
// build stays network-free. On any failure the entry is simply left without a
// poster and the page falls back to a plain navy panel with the play button.
async function fetchVimeoPosters(holders) {
  if (SOURCE === 'local') return;
  const isVimeo = v => /^https:\/\/(?:player\.)?vimeo\.com\//i.test(v || '');
  const pending = holders.filter(h => isVimeo(h.obj[h.key]));
  const found = {};
  await Promise.all([...new Set(pending.map(h => h.obj[h.key]))].map(async u => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch('https://vimeo.com/api/oembed.json?width=1280&url=' + encodeURIComponent(u), { signal: ctrl.signal });
      clearTimeout(timer);
      const j = res.ok ? await res.json() : null;
      if (j && /^https:\/\/i\.vimeocdn\.com\//.test(j.thumbnail_url || '')) {
        found[u] = { poster: j.thumbnail_url, duration: Number(j.duration) || 0 };
      }
    } catch { /* no poster; the page has a fallback */ }
  }));
  let missed = 0;
  for (const h of pending) {
    const f = found[h.obj[h.key]];
    if (f) { h.obj[h.key + '_poster'] = f.poster; h.obj[h.key + '_duration'] = f.duration; }
    else missed++;
  }
  if (missed) info.push(`${missed} intro video(s) have no poster frame from Vimeo — they show a plain panel with a play button instead.`);
}

// ---------------------------------------------------------------- audience lens
// "I'm a …" in the search panel. Deliberately broad — four lenses, not job
// titles — and deliberately DERIVED from the who_for line each resource already
// carries, rather than a second column an editor has to keep in step with it.
// The price is that who_for must name a role in words these patterns know; the
// build warns about any published resource that lands in no lens, so a miss is
// loud rather than silent.
//
// Coaches and counselors read with School leaders (decided 20 Nov 2026: broad
// beats specific). A resource can sit in more than one lens.
const AUDIENCES = [
  { key: 'teachers', label: 'Teachers',
    test: /teacher|educator|co-teach|classroom|interventionist|paraeducator|instructional aide|teaching associate|tutor|\bpairs?\b/i },
  { key: 'school', label: 'School leaders',
    test: /school leader|principal|\bdean|administrator|counselor|coach|leadership team|\b(?:literacy|data) leads?\b|mtss|(?<!(?:network|district|system)\s)\bleaders?\b/i },
  { key: 'district', label: 'District & network leaders',
    test: /district|network|system leader|central office|superintendent/i },
  { key: 'funders', label: 'Funders & researchers',
    test: /funder|researcher|polic(?:y|ies)|philanthrop|evaluator/i },
];
function audienceOf(whoFor) {
  const w = String(whoFor || '');
  const hit = AUDIENCES.filter(a => a.test.test(w)).map(a => a.key);
  // "Teams who want to know what a data cycle is": a school team is teachers and
  // the people who lead them, so an otherwise unplaced "team" belongs to both.
  if (!hit.length && /\bteams?\b/i.test(w)) return ['teachers', 'school'];
  return hit;
}

// Minimal RFC-4180-ish CSV parser: handles quoted fields, embedded commas,
// newlines, and "" escapes. Returns an array of row-arrays.
function parseCSV(text) {
  const rows = []; let row = [], field = '', i = 0, inQ = false;
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  // flush last field/row (unless trailing newline already pushed an empty row)
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function toObjects(text, expectedKey) {
  const rows = parseCSV(text).filter(r => r.some(c => String(c).trim() !== ''));
  if (!rows.length) return [];
  // Find the header row: the first row that actually contains expectedKey as a cell.
  // This makes us robust to gviz mis-detecting the header (the bug that silently
  // dropped Co-Planning / Repeated Reading / Routine Data Cycles).
  let headerIdx = 0;
  if (expectedKey) {
    const want = expectedKey.trim().toLowerCase();
    const found = rows.findIndex(r => r.some(c => String(c).trim().toLowerCase() === want));
    if (found >= 0) headerIdx = found;
  }
  const headers = rows[headerIdx].map(h => h.trim());
  return rows.slice(headerIdx + 1).map(r => {
    const o = {}; headers.forEach((h, idx) => { o[h] = r[idx] != null ? r[idx] : ''; }); return o;
  });
}

async function loadTab(name, expectedKey) {
  let text;
  if (SOURCE === 'local') {
    const f = path.join(FIXTURE_DIR, name + '.csv');
    if (!fs.existsSync(f)) throw new Error(`Local fixture missing: ${f}`);
    text = fs.readFileSync(f, 'utf8');
  } else {
    // headers=1 pins the first row as the (single) header row instead of letting
    // gviz auto-detect, which it got wrong on the larger tabs.
    // _cb is a unique-per-build cache-buster: gviz/Google CDN otherwise serves a
    // stale CSV snapshot for several minutes, so a "publish now" rebuild can read
    // old data. A unique query param forces a fresh export every build.
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}` +
      `/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(name)}&_cb=${CACHE_BUST}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Could not fetch tab "${name}" (HTTP ${res.status}). ` +
        `Check the tab name is exact and the sheet is shared "anyone with the link: Viewer".`);
    }
    text = await res.text();
  }
  const objs = toObjects(text, expectedKey);
  // Loud, specific diagnostics so an empty/misread tab can never hide again.
  tabReport.push(`${name}: ${objs.length} rows`);
  if (expectedKey && objs.length && !(expectedKey in objs[0])) {
    warn.push(`Tab "${name}": header row has no "${expectedKey}" column (got: ${Object.keys(objs[0]).slice(0, 6).join(', ')}...). Rows will be dropped.`);
  }
  return objs;
}

// ---------------------------------------------------------------- build
async function main() {
  // ----- Site (key/value) -----
  const siteRows = await loadTab(SITE_TAB, 'setting');
  const S = {}; siteRows.forEach(r => { if ((r.setting || '').trim()) S[r.setting.trim()] = r.value; });
  const site = {
    name: (S.site_name || 'Research to Impact').split('|')[0].trim(),
    // The site's name as the homepage prints it above the headline. Shorter
    // than site_name, which feeds page titles and is free to be descriptive
    // ("... Practice Toolkit"); a short_name setting on the Site tab overrides it.
    short_name: String(S.short_name || 'Research to Impact').trim(),
    tagline: S.tagline, hero_headline: S.hero_headline, hero_subhead: S.hero_subhead,
    cta: S.hero_cta_label, footer: S.footer_attribution, license: S.license_line,
    about: aboutBlocks(S),
    privacy: privacyBlocks(S.privacy),
    // The photo across the top of About. Defaults to a committed photo of two
    // educators planning, which no other page uses; an about_hero_image setting
    // on the Site tab (a bare filename under assets/, or a Drive link) replaces
    // it, and the value "none" removes the hero and brings the plain heading back.
    aboutHero: (v => /^none$/i.test(v) ? '' : imageUrl(v || 'practices/hero-home.jpg'))(String(S.about_hero_image || '').trim()),
    // The closing panel on About that points at Marshall Street itself, and the
    // target of the footer logo. All three come from the Site tab; with no
    // marshall_url the panel does not render and the footer logo is not a link.
    // Only an https URL is accepted, so a typo cannot become a script link.
    marshall: (u => /^https:\/\/[^\s"'<>]+$/.test(u) ? {
      url: u,
      text: String(S.about_marshall || '').trim(),
      cta: String(S.about_marshall_cta || '').trim() || 'Visit Marshall Street',
    } : null)(String(S.marshall_url || '').trim()),
    // Optional HubSpot capture (soft email ask on gated resources). Blank = a
    // placeholder shows instead of a live form, so nothing breaks before setup.
    // Only a real id is passed on: a portal id is digits, a form id is a GUID.
    // The live sheet once held the literal text "(leave blank)" in both cells,
    // which is truthy, so the page loaded HubSpot's script with nonsense ids.
    hubspot_portal: hsId(S.hubspot_portal_id, /^\d{4,12}$/),
    hubspot_form: hsId(S.hubspot_form_id, HS_GUID),
    // The footer's "Get updates" box posts to its own form, so a newsletter
    // sign-up is never confused with an email given to download one file.
    // Blank = the box is not shown at all.
    hubspot_updates_form: hsId(S.hubspot_updates_form_id, HS_GUID),
    hubspot_region: hsId(S.hubspot_region, /^[a-z]{2}\d$/) || 'na1',
    // Anonymous usage counts (docs/analytics.md). `analytics_url` is the web app
    // address of docs/apps-script/Analytics.gs. Blank = the page sends nothing.
    // `host` is the live domain: the page stays silent anywhere else, so
    // previews and local builds never write a row.
    analytics: (u => {
      if (!u) return null;
      if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u)) {
        warn.push('Site setting "analytics_url" is not an Apps Script web app address (https://script.google.com/macros/s/…/exec). Analytics is off.');
        return null;
      }
      const host = String(S.domain || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (!host) { warn.push('Site setting "analytics_url" is set but "domain" is blank, so the page cannot tell it is the live site. Analytics is off.'); return null; }
      // The Privacy page is sheet text; it must not go on promising the opposite.
      if (/\bno analytics\b/i.test(String(S.privacy || ''))) warn.push('Analytics is on, but the "privacy" setting still says "no analytics". Reword the Privacy page.');
      return { url: u, host };
    })(String(S.analytics_url || '').trim()),
  };
  ['tagline','hero_headline','hero_subhead','cta','footer','license']
    .forEach(k => { if (!String(site[k] || '').trim()) warn.push(`Site setting blank: "${k}" (page area may render empty).`); });
  // A typed-but-wrong id would otherwise fail silently. Parenthesised notes
  // such as "(leave blank)" are how the sheet marks an unset cell, so they pass.
  for (const [k, ok] of [['hubspot_portal_id', site.hubspot_portal], ['hubspot_form_id', site.hubspot_form], ['hubspot_updates_form_id', site.hubspot_updates_form]]) {
    const raw = String(S[k] || '').trim();
    if (raw && !ok && !/^\(.*\)$/.test(raw)) warn.push(`Site setting ${k} is not a valid HubSpot id ("${raw}"), so it is ignored.`);
  }
  if (!site.about.length) warn.push('About page has no content: every about_* setting on the Site tab is blank.');

  // ----- Modules (joined to sections) -----
  const modRows = (await loadTab(MODULES_TAB, 'module_name')).map(m => ({
    section: canon(m.section), order: num(m.module_order),
    name: (m.module_name || '').trim(), intro: m.module_intro || '',
    // module_image was added to the Modules tab on 19 Nov. Until then a module
    // page could not carry a photo at all, which is what Stephanie was looking
    // for when she asked where she had missed adding them — she had not; there
    // was no field. Resolved through imageUrl() like every other image, so a
    // Drive link or a bare assets/ path both work.
    image: imageUrl((m.module_image || '').trim()),
    video: videoUrl(m.module_video, `Modules tab, module "${(m.module_name || '').trim()}" module_video`),
  })).filter(m => m.name);
  const modulesBySection = group(modRows, m => m.section);

  // ----- Sections -----
  const secRows = await loadTab(SECTIONS_TAB, 'section_name');
  const allSections = secRows.map(r => {
    const name = (r.section_name || '').trim();
    return {
      name, section_id: (r.section_id || '').trim(),
      header_label: (r.header_label || '').trim(), tier: (r.tier || '').trim(),
      order: num(r.order), nav_visible: (r.nav_visible || '').trim(),
      intro: r.landing_intro || '', header_image: imageUrl(r.header_image),
      landing_video: videoUrl(r.landing_video, `Sections tab, "${name}" landing_video`),
      modules: (modulesBySection[name] || []).slice().sort((a, b) => a.order - b.order),
    };
  }).filter(s => s.name);

  // Sections that render as homepage cards + browsable pages:
  // the practice toolkits (tier IGNITE) and Leading Implementation (tier Own),
  // unless explicitly held out of nav.
  const pageSections = allSections
    .filter(s => PAGE_TIERS.includes(s.tier) && s.nav_visible !== 'hidden-until-live')
    .sort((a, b) => a.order - b.order);
  const pageNames = new Set(pageSections.map(s => s.name));

  // ----- Files manifest (optional): id -> published file URL -----
  // Maintained by the Apps Script that indexes the Drive published-files folder,
  // so editors attach a file just by naming it after the id — no URL pasting.
  // See docs/file-hosting.md. The tab is optional; without it, downloads simply
  // don't resolve (and a warning is emitted per published item).
  const filesMap = {};
  try {
    const fileRows = await loadTab('Files', 'id');
    fileRows.forEach(r => {
      const id = (r.id || '').trim();
      if (id) filesMap[id] = { url: fileUrl(r.url), mime: (r.mime || '').trim() };
    });
  } catch (e) { /* Files tab is optional */ }
  // Resolve a resource's link: an explicit link_url wins (external_link); otherwise
  // a 'download' resolves to its file in the manifest by id.
  const linkFor = r => {
    const explicit = fileUrl(r.link_url);
    if (explicit) return explicit;
    const id = (r.id || '').trim();
    if (String(r.link_type || '').trim() === 'download' && filesMap[id]) return filesMap[id].url;
    return '';
  };

  // ----- Resources (section injected from the tab) -----
  const resources = []; let dropped = 0;
  for (const tab of RESOURCE_TABS) {
    let rows;
    try { rows = await loadTab(tab, 'id'); }
    catch (e) { warn.push(e.message); continue; }
    if (!rows.length) warn.push(`Resource tab "${tab}" returned 0 rows — check the tab exists and its header row has an "id" column.`);
    const sectionName = canon(tab);
    for (const r of rows) {
      if (!(r.id || '').trim()) continue;
      const video_url = videoUrl(r.video_url, `${tab} row "${r.id.trim()}" video_url`);
      const rec = {
        id: r.id.trim(), section: sectionName, module: (r.module || '').trim(),
        title: (r.title || '').trim(), format: (r.format || 'Other').trim(),
        focal: TRUE(r.focal), focal_order: num(r.focal_order) || '',
        published: TRUE(r.published), status: (r.status || '').trim(),
        gated: TRUE(r.gated),
        practice: (r.practice || '').trim(),
        summary: r.summary || '', who_for: r.who_for || '',
        audience: audienceOf(r.who_for),
        isnew: isRecent(r.date_published),
        video: String(r.link_type || '').trim() === 'embed' || !!video_url,
        // Carried through so the page can label the button honestly. An
        // external_link opens a Google Doc or Drive preview in a new tab — it
        // does not download anything, and 70 of the 119 published resources are
        // this kind, so "Download" was wrong on most of the site.
        link_type: String(r.link_type || '').trim(),
        link: linkFor(r),
        video_url,
        image: imageUrl(r.image),
        // Rich practice content carried over from the CoLab pages (Collections).
        // Optional everywhere else; blank = unchanged card.
        image_caption: (r.image_caption || '').trim(),
        body: r.body || '',
        why: String(r.why_it_works || '').split('||').map(s => s.trim()).filter(Boolean),
        quote: (r.quote || '').trim(),
        overview: TRUE(r.overview),
      };
      if (!pageNames.has(rec.section)) { dropped++; continue; }
      resources.push(rec);
    }
  }
  if (dropped) info.push(`${dropped} resources skipped — their section is not a live nav section yet (e.g. Site Assets, or the Research-to-Impact Library while it is still hidden-until-live). They return automatically when that section's nav_visible = yes.`);

  // ----- data-quality checks (warn, don't fail) -----
  const modIndex = {}; pageSections.forEach(s => { modIndex[s.name] = new Set(s.modules.map(m => m.name)); });
  resources.forEach(r => {
    if (!modIndex[r.section] || !modIndex[r.section].has(r.module))
      warn.push(`Resource "${r.id}" -> module "${r.module}" not found in section "${r.section}" (won't appear on any module page).`);
  });
  resources.filter(r => r.published && r.focal && !String(r.summary).trim())
    .forEach(r => warn.push(`Published focal resource "${r.id}" has no summary (card shows no description).`));

  // Hard errors (fail the build under STRICT): duplicate ids break rendering.
  const seenId = new Set();
  resources.forEach(r => {
    if (seenId.has(r.id)) err.push(`Duplicate resource id "${r.id}" — ids must be unique across the whole site.`);
    else seenId.add(r.id);
  });

  // Soft warnings: invalid enumerations degrade gracefully but signal a typo.
  const FORMATS = new Set(['Document', 'Deck', 'Tool', 'Protocol', 'Template', 'Case Study', 'Infographic', 'Video', 'Other']);
  resources.forEach(r => {
    if (r.format && !FORMATS.has(r.format))
      warn.push(`Resource "${r.id}" has unknown format "${r.format}" (uses a generic icon). Allowed: ${[...FORMATS].join(', ')}.`);
  });
  const TIERS = new Set(['IGNITE', 'Own', 'Stories', 'Evidence', 'R2I', 'Site']);
  allSections.forEach(s => {
    if (s.tier && !TIERS.has(s.tier))
      warn.push(`Section "${s.name}" has unknown tier "${s.tier}" (won't surface anywhere). Allowed: ${[...TIERS].join(', ')}.`);
  });
  resources.filter(r => r.published && r.gated && !r.link)
    .forEach(r => warn.push(`Gated resource "${r.id}" resolves to no file (the email ask leads nowhere).`));
  // Once a Files manifest exists, flag any published item that resolves to nothing.
  if (Object.keys(filesMap).length) {
    resources.filter(r => r.published && !r.video && !r.link)
      .forEach(r => warn.push(`Published resource "${r.id}" resolves to no file — name a file after this id in the published folder, or set a link_url.`));
  }

  // ----- nav metadata (data-driven grouping + dividers) -----
  // Top-level nav stays practitioner-first: only the toolkits (IGNITE) and Leading
  // Implementation (Own). Stories & Spotlights and Evidence & Impact live in an
  // "Evidence & Stories" dropdown; the cross-cutting R2I collections get their own.
  const TOP_NAV_TIERS = ['IGNITE', 'Own'];
  const SECONDARY_NAV_LABEL = 'Evidence & Stories';
  const COLLECTIONS_NAV_LABEL = 'R2I Practices';
  // The toolkits used to be four links across the bar. Grouped under one menu
  // they leave room for the site's name beside the logo and let the header sit
  // on the same column as the page. Like the two labels above, this is
  // presentation only: which sections appear in the menu stays sheet-driven.
  const TOOLKITS_NAV_LABEL = 'Toolkits';
  const groups = [];
  pageSections.filter(s => TOP_NAV_TIERS.includes(s.tier)).forEach(s => {
    const g = groups.find(x => x.label === s.header_label);
    if (g) g.sections.push(s.name); else groups.push({ label: s.header_label, sections: [s.name] });
  });
  const libSec = allSections.find(s => s.tier === 'R2I');
  const aboutSec = allSections.find(s => s.tier === 'Site');
  // The Stories section is woven into the toolkit pages: a story tagged with a
  // `practice` surfaces on that practice's page. We pass its name so the template
  // can find those resources without hardcoding the section title.
  const storiesSec = allSections.find(s => s.tier === 'Stories');
  // Two secondary nav dropdowns, kept out of the practitioner-first front row:
  //   • Evidence & Stories — the proof + the people (Stories & Evidence, live now)
  //   • R2I Collections — cross-cutting topics (the R2I Library section's modules);
  //     they show as "soon" chips until that section's nav_visible flips to yes.
  // These labels are presentation only; the contents stay sheet-driven.
  const secondarySections = pageSections
    .filter(s => ['Stories', 'Evidence'].includes(s.tier))
    .sort((a, b) => a.order - b.order)
    .map(s => ({ name: s.name }));
  const collectionItems = libSec
    ? (modulesBySection[canon(libSec.name)] || []).slice().sort((a, b) => a.order - b.order).map(m => m.name)
    : [];
  const nav = {
    groups,
    toolkitsLabel: TOOLKITS_NAV_LABEL,
    secondary: secondarySections.length
      ? { name: SECONDARY_NAV_LABEL, sections: secondarySections }
      : null,
    collections: (libSec && collectionItems.length)
      ? { name: COLLECTIONS_NAV_LABEL, section: libSec.name, items: collectionItems, visible: libSec.nav_visible !== 'hidden-until-live' }
      : null,
    about: aboutSec ? { name: aboutSec.name } : { name: 'About' },
  };

  // ----- R2I Practices landing page (the Collections "home", recreated from the
  // old CoLab landing). Prose lives on the Site tab (editable); the five practice
  // cards come from the R2I Library modules; testimonials + journey are read from
  // indexed Site keys (r2i_quote1.., r2i_journey1..). -----
  const seq = (base, suffixes) => {
    const out = [];
    for (let n = 1; n <= 12; n++) {
      const o = {}; let any = false;
      for (const s of suffixes) { const v = (S[base + n + s.key] || '').trim(); o[s.as] = v; if (v) any = true; }
      if (!any) break; out.push(o);
    }
    return out;
  };
  // Each collection's character illustration (committed under assets/practices/),
  // mapped by module name. Update here if a collection is renamed.
  const P_IMG = {
    'Collaboration': 'collaboration', 'Secondary Literacy': 'literacy', 'Data for MTSS': 'mtss',
    'Postsecondary': 'postsecondary', 'Emotional Support': 'emotional',
  };
  const r2iPractices = libSec
    ? (modulesBySection[canon(libSec.name)] || []).slice().sort((a, b) => a.order - b.order)
        .map(m => ({ name: m.name, intro: m.intro, image: P_IMG[m.name] ? imageUrl('practices/' + P_IMG[m.name] + '.png') : '' }))
    : [];
  const quotes = seq('r2i_quote', [{ key: '', as: 'quote' }, { key: '_by', as: 'by' }, { key: '_role', as: 'role' }, { key: '_img', as: 'img' }])
    .map(q => ({ ...q, img: q.img ? imageUrl(q.img) : '' }));
  const partners = seq('r2i_partner', [{ key: '_img', as: 'img' }, { key: '_name', as: 'name' }])
    .map(p => ({ ...p, img: p.img ? imageUrl(p.img) : '' }));
  const r2iHome = (libSec && nav.collections && nav.collections.visible) ? {
    heading: (S.r2i_heading || 'Research to Impact Practices').trim(),
    headline: (S.r2i_headline || '').trim(),
    intro: (S.r2i_intro || '').trim(),
    intro2: (S.r2i_intro2 || '').trim(),
    heroImage: imageUrl((S.r2i_hero_image || '').trim()),
    section: libSec.name,
    practices: r2iPractices,
    quotes,
    journey: seq('r2i_journey', [{ key: '_label', as: 'label' }, { key: '_text', as: 'text' }]),
    map: (S.r2i_map_image || '').trim()
      ? { image: imageUrl(S.r2i_map_image), heading: (S.r2i_map_heading || '').trim(), text: (S.r2i_map_text || '').trim() }
      : null,
    partners: partners.length ? { heading: (S.r2i_partners_heading || 'Our Partners').trim(), logos: partners } : null,
  } : null;

  // ----- resolve share and vanity Vimeo links to numeric URLs (before shaping copies the values) -----
  await resolveVimeoLinks([
    ...resources.map(r => ({ obj: r, key: 'video_url', where: `${r.section} row "${r.id}" video_url` })),
    // A video resource can carry its URL in link_url instead of video_url — that
    // is what link_type "embed" means, and resAction() falls back to it the same
    // way. Two videos were still opening in a new tab after the video_url ones
    // were fixed, for exactly this reason. Only video rows are included, so an
    // ordinary resource's download link is never touched (the pattern only
    // matches vimeo.com anyway, but there is no reason to offer it the chance).
    ...resources.filter(r => r.video).map(r => ({ obj: r, key: 'link', where: `${r.section} row "${r.id}" link_url` })),
    ...allSections.map(s => ({ obj: s, key: 'landing_video', where: `Sections tab, "${s.name}" landing_video` })),
    ...modRows.map(m => ({ obj: m, key: 'video', where: `Modules tab, module "${m.name}" module_video` })),
  ]);

  // ----- poster frames for the intro players (after the links are numeric) -----
  await fetchVimeoPosters([
    ...allSections.map(s => ({ obj: s, key: 'landing_video' })),
    ...modRows.map(m => ({ obj: m, key: 'video' })),
  ]);

  // ----- shape exactly what the page render expects -----
  const sections = pageSections.map(s => ({
    name: s.name, intro: s.intro, header_image: s.header_image,
    homepage: HOMEPAGE_TIERS.includes(s.tier), video: s.landing_video,
    poster: s.landing_video_poster || '', duration: s.landing_video_duration || 0,
    modules: s.modules.map(m => ({ name: m.name, order: m.order, intro: m.intro, image: m.image, video: m.video,
      poster: m.video_poster || '', duration: m.video_duration || 0 })),
  }));
  // ----- Homepage proof band -----
  // Four field outcomes under the hero. Read from indexed Site keys, the same
  // way the R2I quotes and partners are (proof1_stat, proof1_label, ...), so
  // the numbers stay editable in the sheet and nothing is hardcoded here.
  //
  // They are NOT parsed out of the resource quotes. The numbers live inside
  // prose in several different shapes ("from 79% to 97%", "92% ... up from
  // 44%"), and the label and the school would have to be extracted from the
  // same sentence. A regex over editor-written prose is the wrong thing to
  // hang the most prominent claim on the site from.
  //
  // `source_id` is optional and points at the resource the number comes from,
  // so a reader can click through to the evidence. An id that no published
  // resource matches is dropped rather than rendered as a dead link.
  const proof = seq('proof', [
    { key: '_stat', as: 'stat' },         // "79% → 97%"
    { key: '_label', as: 'label' },       // "course pass rate"
    { key: '_source', as: 'source' },     // "Ednovate"
    { key: '_source_id', as: 'sourceId' },// resource id to deep-link to
  ]).filter(p => p.stat && p.label);
  proof.forEach(p => {
    if (!p.sourceId) return;
    const r = resources.find(x => x.id === p.sourceId && x.published);
    if (r) { p.to = { section: r.section, module: r.module }; }
    else { warn.push(`Proof band: source_id "${p.sourceId}" matches no published resource — the stat shows without a link.`); }
    delete p.sourceId;
  });
  if (proof.length && proof.length < 2) {
    warn.push(`Proof band: only ${proof.length} stat defined; it needs at least 2 to render as a band.`);
  }

  // ----- Homepage "start here" row -----
  // Three real things a visitor with ten minutes can do, chosen by an editor
  // rather than computed: start1_id names a resource, start1_label and
  // start1_note override its title and summary for the homepage. The action
  // (Watch / Download) is NOT resolved here — the template looks the resource up
  // by id and reuses resAction(), so the button can never drift from the one on
  // the resource's own card, and a resource that becomes gated stays gated here.
  //
  // A label is worth setting: three toolkits each have a resource titled
  // "Executive Summary", so the bare title is ambiguous on the homepage.
  const startHere = seq('start', [
    { key: '_id', as: 'id' },
    { key: '_label', as: 'label' },
    { key: '_note', as: 'note' },
  ]).filter(s => s.id).filter(s => {
    const r = resources.find(x => x.id === s.id && x.published);
    if (!r) warn.push(`Start-here: id "${s.id}" matches no published resource — that item is dropped.`);
    return !!r;
  });

  // ----- document index (text inside the linked files) -----
  const docIdx = buildDocIndex(resources);
  const docJson = JSON.stringify(docIdx.index);
  // The hash in the URL lets the file be cached hard and still change the moment
  // its contents do. `null` tells the page there is nothing to fetch.
  const searchDocs = docIdx.index.passages.length
    ? { url: 'search-docs.json?v=' + require('crypto').createHash('sha1').update(docJson).digest('hex').slice(0, 10),
        passages: docIdx.index.passages.length }
    : null;
  if (searchDocs) {
    info.push(`Document index: ${docIdx.files} files, ${docIdx.words.toLocaleString('en-US')} words read; ` +
      `${docIdx.kept.toLocaleString('en-US')} kept after removing repeats, in ${searchDocs.passages} passages ` +
      `(${Math.round(Buffer.byteLength(docJson) / 1024)} KB before compression).`);
    if (docIdx.spacing.repaired || docIdx.spacing.dropped) {
      info.push(`Document index: ${docIdx.spacing.repaired} letter-spaced heading(s) repaired, ${docIdx.spacing.dropped} dropped as unreadable.`);
    }
    // Belt and braces: if broken headings ever get through, say so in the build.
    const broken = docIdx.index.passages.filter(p => /(?:\b[A-Za-z]\b[ ]){4,}/.test(p[2])).length;
    if (broken) warn.push(`Document index: ${broken} passage(s) still contain letter-spaced fragments (e.g. "P R O G R E S S") — search will match and quote them as nonsense. See repairLetterSpacing in build.js.`);
  } else {
    info.push(`Document index: empty (no extracted text in ${CONTENT_DIR}/ — run tools/index-files.mjs).`);
  }
  {
    // A published resource whose file has no cached text is searchable by its
    // sheet row only. Say so once, as a count — the index tool names them.
    const missing = resources.filter(r => r.published && linkedFileId(r.link) &&
      !fs.existsSync(path.join(CONTENT_DIR, linkedFileId(r.link) + '.txt')));
    // (Not on a fixtures build: the fixtures carry sample text for a few files only.)
    if (searchDocs && missing.length && SOURCE !== 'local') {
      info.push(`Document index: ${missing.length} published resource(s) link to a file with no extracted text ` +
        `(${missing.slice(0, 6).map(r => r.id).join(', ')}${missing.length > 6 ? ', …' : ''}). ` +
        `Run tools/index-files.mjs; a sign-in-only file can never be indexed.`);
    }
  }

  // ----- audience lens -----
  const audiences = AUDIENCES.map(a => ({ key: a.key, label: a.label,
    count: resources.filter(r => r.published && r.audience.includes(a.key)).length }));
  {
    // A blank who_for is a different gap (and the fixtures are mostly blank); this
    // is about a line that IS written but names no role the lenses recognise.
    const unplaced = resources.filter(r => r.published && String(r.who_for).trim() && !r.audience.length);
    if (unplaced.length) {
      warn.push(`${unplaced.length} published resource(s) fit no audience lens, so "I'm a…" in search will never favour them: ` +
        `${unplaced.slice(0, 8).map(r => r.id).join(', ')}${unplaced.length > 8 ? ', …' : ''}. ` +
        `Name a role in who_for (teacher, school leader, coach, district or network leader, funder, researcher).`);
    }
  }

  const DATA = { site, sections, nav, resources, r2iHome, proof, startHere, storiesSection: storiesSec ? storiesSec.name : null, searchDocs, audiences };

  // ----- SEO / social metadata (build-time so crawlers and link unfurlers,
  // which don't run our JS, see real title/description/image) -----
  const escHtml = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const domain = (S.domain || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const baseUrl = domain ? `https://${domain}` : '';
  const heroImg = (S.hero_image || '').trim();
  let seoImage = '';
  if (/^https?:\/\//i.test(heroImg)) seoImage = heroImg;
  else if (driveId(heroImg)) seoImage = imageUrl(heroImg);
  else if (baseUrl) {
    // A file under assets/. Link previews (Slack, LinkedIn, iMessage) fetch this
    // address and show nothing when it is missing, and nothing on the page uses
    // hero_image, so a wrong name is invisible from the site itself: for weeks the
    // sheet named a file that was never committed and every shared link unfurled
    // without a picture. So check the file, and fall back to the homepage photo.
    const SEO_FALLBACK = 'practices/hero-home-students.jpg';
    const assetDir = process.env.ASSET_DIR || 'assets';
    let rel = heroImg.replace(/^\/+/, '');
    if (rel && !fs.existsSync(path.join(assetDir, rel))) {
      warn.push(`Site tab hero_image "${heroImg}" is not a file under ${assetDir}/, so link previews would have no picture. Using ${SEO_FALLBACK} instead. Fix the cell, or blank it to use that photo.`);
      rel = '';
    }
    if (!rel && fs.existsSync(path.join(assetDir, SEO_FALLBACK))) rel = SEO_FALLBACK;
    if (rel) seoImage = `${baseUrl}/assets/${rel}`;
  }
  const seo = {
    '__SEO_TITLE__': escHtml((S.site_name || site.name || 'Research to Impact').trim()),
    '__SEO_DESC__': escHtml((site.tagline || site.hero_subhead || '').trim()),
    '__SEO_URL__': escHtml(baseUrl),
    // One address for search engines: the same page is also reachable on the
    // netlify.app name, and without this the two compete.
    '__SEO_CANONICAL__': baseUrl ? `<link rel="canonical" href="${escHtml(baseUrl)}/"/>\n` : '',
    '__SEO_IMAGE__': escHtml(seoImage),
    // The lever icon (guidelines p.7), served from assets/ as the tab icon. The icon
    // is a graphic accent and never stands in for the logo — a favicon is the one
    // slot that takes a mark rather than a wordmark.
    // Browsers that take a vector tab icon use the SVG (sharp at any size, and it
    // turns white on a dark tab); the PNG is the fallback for the rest.
    '__FAVICON_SVG__': 'assets/brand/favicon.svg',
    '__FAVICON__': 'assets/brand/favicon.png',
  };

  // ----- inject + write -----
  if (!fs.existsSync(TEMPLATE)) throw new Error(`Template not found: ${TEMPLATE}`);
  const tpl = fs.readFileSync(TEMPLATE, 'utf8');
  if (!tpl.includes('__DATA__')) throw new Error('template.html is missing the __DATA__ placeholder.');
  // The data lands inside an inline <script>: escape "<" so no sheet content
  // (e.g. a pasted "</script>" in an embed snippet) can terminate the script
  // block early, and use a function replacement so "$"-sequences in content
  // aren't treated as replace() substitution patterns.
  let html = tpl.replace('__DATA__', () => JSON.stringify(DATA).replace(/</g, '\\u003c'));
  for (const [k, v] of Object.entries(seo)) html = html.split(k).join(v);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html);
  fs.writeFileSync(path.join(OUT_DIR, 'search-docs.json'), docJson);

  // The not-found page. Netlify serves dist/404.html for any address that is not
  // a file; without it a mistyped link lands on Netlify's own page with no way back.
  if (fs.existsSync('404.html')) fs.copyFileSync('404.html', path.join(OUT_DIR, '404.html'));
  // robots.txt and a sitemap. The site is one page (everything else is a #/ route,
  // which crawlers do not follow), so the sitemap has one entry.
  if (baseUrl) {
    fs.writeFileSync(path.join(OUT_DIR, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml\n`);
    fs.writeFileSync(path.join(OUT_DIR, 'sitemap.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${escHtml(baseUrl)}/</loc></url>\n</urlset>\n`);
  }

  // Copy committed static assets (images, etc.) into the publish dir, so links
  // like assets/foo.jpg resolve. Netlify publishes dist/, so assets must land
  // there too. Editors who use Google Drive links don't need this at all.
  const ASSET_DIR = process.env.ASSET_DIR || 'assets';
  if (fs.existsSync(ASSET_DIR)) {
    fs.cpSync(ASSET_DIR, path.join(OUT_DIR, 'assets'), { recursive: true });
    info.push(`Copied ${ASSET_DIR}/ into ${path.join(OUT_DIR, 'assets')}.`);
  }

  // ----- report -----
  const live = resources.filter(r => r.published).length;
  console.log(`\nBuilt ${path.join(OUT_DIR, 'index.html')}  (source: ${SOURCE})`);
  console.log(`  nav sections: ${sections.map(s => s.name).join(', ')}`);
  console.log(`  resources:    ${resources.length} (${live} published)`);
  console.log(`  secondary:    ${nav.secondary ? nav.secondary.name + ' (' + nav.secondary.sections.map(s => s.name).join(', ') + ')' : 'none'}`);
  console.log(`  collections:  ${nav.collections ? nav.collections.name + (nav.collections.visible ? ' [visible]' : ' [' + nav.collections.items.length + ' soon]') : 'none'}`);
  console.log(`\nTabs read:`); tabReport.forEach(m => console.log('  - ' + m));
  if (info.length) { console.log(`\nINFO:`); info.forEach(m => console.log('  - ' + m)); }
  if (warn.length) { console.log(`\nWARNINGS (${warn.length}):`); warn.forEach(m => console.log('  ! ' + m)); }
  else console.log('\nNo warnings.');
  if (err.length) { console.log(`\nERRORS (${err.length}):`); err.forEach(m => console.log('  X ' + m)); }

  if (STRICT && err.length) {
    console.error(`\nSTRICT mode: ${err.length} error(s) — failing build.`);
    process.exit(1);
  }
}

main().catch(e => { console.error('\nBUILD FAILED: ' + e.message); process.exit(1); });
