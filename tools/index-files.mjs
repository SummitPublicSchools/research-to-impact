/**
 * Document text cache — what lets search look INSIDE the linked files.
 *
 *   node build.js && node tools/index-files.mjs          # refresh what changed
 *   node tools/index-files.mjs --force                   # re-extract everything
 *   node tools/index-files.mjs --check                   # report only, write nothing
 *
 * WHY THIS EXISTS. The site holds metadata, not documents: a title, a summary,
 * a who_for line. A question whose answer lives on page 12 of a PDF could only
 * ever be pointed at. This tool reads every file a *published* resource links
 * to — as an anonymous visitor, exactly as the public would — pulls out the
 * text, and commits it to `content/`. The build then cuts that text into
 * passages and ships them as `dist/search-docs.json` (see docs/search.md).
 *
 * WHY IT IS NOT PART OF THE BUILD. The linked files are ~200 MB of PDF, the
 * Netlify build image has no PDF tooling, and this repo has no dependencies.
 * Extraction therefore happens here — on a laptop or in the scheduled GitHub
 * workflow, both of which have `pdftotext` — and the build only ever reads
 * plain text that is already in the repo. A build makes no extra network calls
 * and cannot fail because Drive was slow.
 *
 * WHAT IT READS
 *   Drive files (PDF)   downloaded, then `pdftotext`; pages are kept, so a
 *                       search result can say which page it found.
 *   Google Docs/Slides  the public plain-text export. No page numbers.
 *   Google Sheets       skipped — a grid of cells is not prose worth ranking.
 *   anything else       skipped (Vimeo, external sites).
 *
 * CHANGE DETECTION. A Drive file is re-downloaded only when its Last-Modified
 * or size changes (one HEAD request each). Docs and Slides offer no such
 * signal, so their text is simply re-fetched — it is a few kilobytes.
 *
 * FAILURE POLICY. A network error keeps whatever is already cached: a flaky
 * run must never shrink the index. A file that answers with a sign-in wall is
 * removed from the cache and reported — if the public cannot open it, search
 * should not be quoting it. Entries no published resource links to any more
 * are pruned.
 *
 * `content/manifest.json` is deterministic (no timestamps), so a run that
 * finds nothing new produces no diff.
 *
 * Needs `pdftotext` (poppler): `brew install poppler` / `apt-get install poppler-utils`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const FORCE = process.argv.includes('--force');
const CHECK = process.argv.includes('--check');
const PAGE = process.env.PAGE || path.join('dist', 'index.html');
const DIR = process.env.CONTENT_DIR || 'content';
const MANIFEST = path.join(DIR, 'manifest.json');

/* A page that yields this few words on average is almost certainly a scan or
   a slide exported as an image: the file opens fine and search finds nothing
   in it. Worth saying out loud rather than discovering later. */
const THIN_WORDS_PER_PAGE = 40;

/** Which fetchable Google file, if any, a resource link points at. */
export function linkTarget(url) {
  const u = String(url || '');
  let m;
  if ((m = u.match(/docs\.google\.com\/document\/d\/([\w-]+)/))) {
    return { kind: 'gdoc', id: m[1], url: `https://docs.google.com/document/d/${m[1]}/export?format=txt` };
  }
  if ((m = u.match(/docs\.google\.com\/presentation\/d\/([\w-]+)/))) {
    return { kind: 'gslides', id: m[1], url: `https://docs.google.com/presentation/d/${m[1]}/export?format=txt` };
  }
  if ((m = u.match(/drive\.google\.com\/file\/d\/([\w-]+)/))) {
    return { kind: 'file', id: m[1], url: `https://drive.usercontent.google.com/download?id=${m[1]}&export=download&confirm=t` };
  }
  return null;
}

const words = s => String(s).split(/\s+/).filter(Boolean).length;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Tidy extracted text without disturbing the page breaks (\f) pdftotext emits:
   they are the only record of which page a passage came from. */
export function clean(text) {
  return String(text)
    // NFKC folds typographic ligatures back into letters. Without it a PDF set
    // with "ﬀ"/"ﬁ" yields "di\uFB00erentiation", which no query will ever match.
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000e-\u001f\u200b-\u200d\u2060\ufeff]/g, '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .split('\f').map(p => p.trim()).join('\n\f\n')
    .trim() + '\n';
}

async function withRetry(fn, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { last = e; await sleep(800 * (i + 1)); }
  }
  throw last;
}

/** Returns {text, sig, pages} | {blocked:true} | {unsupported:reason}. Throws on network error. */
async function extract(t, prev, tmp) {
  if (t.kind === 'file') {
    const head = await withRetry(() => fetch(t.url, { method: 'HEAD' }));
    const ct = head.headers.get('content-type') || '';
    if (!head.ok || /text\/html/.test(ct)) return { blocked: true };
    const sig = `${head.headers.get('last-modified') || ''}|${head.headers.get('content-length') || ''}`;
    if (!FORCE && prev && prev.sig === sig && sig !== '|') return { unchanged: true };
    const buf = await withRetry(async () => {
      const r = await fetch(t.url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return Buffer.from(await r.arrayBuffer());
    });
    if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') {
      // Drive answers a private file with an HTML page and a 200.
      if (/^\s*<(!doctype|html)/i.test(buf.subarray(0, 200).toString('latin1'))) return { blocked: true };
      return { unsupported: 'not a PDF' };
    }
    const f = path.join(tmp, t.id + '.pdf');
    fs.writeFileSync(f, buf);
    let text;
    try {
      text = execFileSync('pdftotext', ['-enc', 'UTF-8', f, '-'], { maxBuffer: 256 * 1024 * 1024 }).toString('utf8');
    } finally { fs.rmSync(f, { force: true }); }
    text = clean(text);
    return { text, sig, pages: text.split('\f').length };
  }
  const r = await withRetry(() => fetch(t.url));
  const ct = r.headers.get('content-type') || '';
  if (r.status === 401 || r.status === 403 || r.status === 404 || /text\/html/.test(ct)) return { blocked: true };
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return { text: clean(await r.text()), sig: '', pages: 0 };
}

async function main() {
  if (!fs.existsSync(PAGE)) throw new Error(`${PAGE} not found — run \`node build.js\` first (a LIVE build, not fixtures).`);
  try { execFileSync('pdftotext', ['-v'], { stdio: 'ignore' }); }
  catch (e) { throw new Error('pdftotext not found. Install poppler: `brew install poppler` or `apt-get install poppler-utils`.'); }

  const m = fs.readFileSync(PAGE, 'utf8').match(/const DATA = (\{.*?\});\nlet state/s);
  if (!m) throw new Error('could not find DATA in ' + PAGE);
  const resources = JSON.parse(m[1]).resources.filter(r => r.published && r.link);

  // One entry per distinct file, however many resources link to it.
  const targets = new Map();
  for (const r of resources) {
    const t = linkTarget(r.link);
    if (!t) continue;
    if (!targets.has(t.id)) targets.set(t.id, { ...t, usedBy: [] });
    targets.get(t.id).usedBy.push(r.id);
  }
  if (!targets.size) throw new Error('no published resource links to a Google file — refusing to empty the cache. Is this a fixtures build?');

  const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r2i-index-'));
  const out = {}, report = { fresh: [], same: 0, kept: [], blocked: [], unsupported: [], thin: [] };
  if (!CHECK) fs.mkdirSync(DIR, { recursive: true });

  const queue = [...targets.values()];
  const worker = async () => {
    for (let t; (t = queue.shift());) {
      const prev = manifest[t.id], who = t.usedBy.join(', ');
      const txt = path.join(DIR, t.id + '.txt');
      const havePrev = prev && fs.existsSync(txt);
      try {
        const x = await extract(t, havePrev ? prev : null, tmp);
        if (x.blocked) { report.blocked.push(who); continue; }
        if (x.unsupported) { report.unsupported.push(`${who} (${x.unsupported})`); continue; }
        if (x.unchanged) { out[t.id] = prev; report.same++; continue; }
        const entry = { kind: t.kind, sig: x.sig, pages: x.pages, words: words(x.text) };
        if (havePrev && fs.readFileSync(txt, 'utf8') === x.text) report.same++;
        else { report.fresh.push(who); if (!CHECK) fs.writeFileSync(txt, x.text); }
        out[t.id] = entry;
      } catch (e) {
        if (havePrev) { out[t.id] = prev; report.kept.push(`${who} (${e.cause?.code || e.message})`); }
        else report.kept.push(`${who} (${e.cause?.code || e.message}) — nothing cached yet`);
      }
    }
  };
  // Drive throttles hard above a few parallel downloads; three is the fastest that stays reliable.
  await Promise.all([worker(), worker(), worker()]);
  fs.rmSync(tmp, { recursive: true, force: true });

  for (const [id, e] of Object.entries(out)) {
    if (e.pages && e.words / e.pages < THIN_WORDS_PER_PAGE) report.thin.push(`${targets.get(id).usedBy.join(', ')} — ${e.pages} pages, ${e.words} words`);
  }

  if (!CHECK) {
    // Prune text nothing published links to any more (and anything now blocked).
    for (const f of fs.readdirSync(DIR)) {
      if (f.endsWith('.txt') && !out[f.slice(0, -4)]) fs.rmSync(path.join(DIR, f));
    }
    const sorted = Object.fromEntries(Object.keys(out).sort().map(k => [k, out[k]]));
    fs.writeFileSync(MANIFEST, JSON.stringify(sorted, null, 1) + '\n');
  }

  const total = Object.values(out).reduce((a, e) => a + e.words, 0);
  const list = (label, a) => { if (a.length) { console.log(`\n${label} (${a.length}):`); a.forEach(x => console.log('  - ' + x)); } };
  console.log(`\nDocument text cache — ${Object.keys(out).length} of ${targets.size} linked files readable, ${total.toLocaleString('en-US')} words`);
  console.log(`  ${report.fresh.length} new or changed, ${report.same} unchanged${CHECK ? '  (--check: nothing written)' : ''}`);
  list('New or changed', report.fresh);
  list('SIGN-IN REQUIRED — the public cannot open these, so they are not searchable', report.blocked);
  list('Not indexable', report.unsupported);
  list('Little text for their length — probably scans or image-only slides', report.thin);
  list('Fetch failed — kept the cached copy', report.kept);
  console.log('');
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('index-files.mjs')) {
  main().catch(e => { console.error('\nINDEX FAILED: ' + e.message); process.exit(1); });
}
