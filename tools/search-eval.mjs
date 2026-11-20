/**
 * Search quality gate.
 *
 * Lifts the search engine straight out of the built page and runs it against a
 * labelled set of real practitioner queries. No network, no key, no cost.
 *
 *   node tools/search-eval.mjs               # invariant only — safe on any build
 *   node tools/search-eval.mjs --score        # + ranking floors (needs a LIVE build)
 *   node tools/search-eval.mjs --score --verbose
 *
 * Every check runs twice when the build produced dist/search-docs.json: once on
 * the sheet-only index the page loads with, and once with the document text
 * loaded on top — the two states the page really runs in.
 *
 * WHY THIS EXISTS. The search this replaced looked fine and was badly broken in
 * a way no one would notice from the outside: it required every word of a query
 * to appear in one resource, so it answered keywords well and returned a blank
 * panel for 17 of 18 natural-language questions — behind a box labelled "Search
 * or ask a question". A ranking change can regress exactly that quietly, so the
 * measurement lives in CI rather than in someone's memory.
 *
 * The set is split. `tune` is what the ranking was developed against; `holdout`
 * was written first and never tuned on, and is the honest number.
 *
 * The labels describe the LIVE sheet, so the ranking floors only mean anything
 * against a live build and are opt-in behind --score. Without it this runs the
 * content-independent invariant alone, which is valid on any build and is the
 * one CI needs: it is precisely the failure this rewrite existed to fix.
 *
 *   node build.js && node tools/search-eval.mjs --score --verbose
 *
 * is the command to run after changing the ranking, the stopword list or the
 * synonym table.
 *
 * Labels are a judgement about where a practitioner should land, not ground
 * truth. Several accept more than one section because the corpus genuinely has
 * more than one defensible home for the question; where a label was widened,
 * `label_note` records the evidence for widening it.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const VERBOSE = process.argv.includes('--verbose');
const PAGE = process.env.PAGE || path.join('dist', 'index.html');

/* Thresholds are floors, not targets: they are set just under the measured
   result so an honest improvement never fails the build, while a real
   regression does. */
const FLOOR = {
  tune:    { zero: 0, section: 23, module: 24 },
  holdout: { zero: 0, section: 13, module: 14 },
};
/* `inside` is the third split: questions whose answer is in the TEXT of a linked
   file and nowhere in the sheet. Each names the resource that holds it, which
   must appear in the top INSIDE_TOP results once the document index is loaded.
   Like the other floors it is set just under the measured result. */
const INSIDE_TOP = 5;
const INSIDE_FLOOR = 13;

function loadEngine(html) {
  // The engine is ordinary top-level code in the page. Rather than keep a
  // second copy here (which would drift), slice it out and evaluate it with a
  // stub DATA — so this tests the code that actually ships.
  const start = html.indexOf('/* ---- search ---');
  const end = html.indexOf('function runSearch(');
  if (start < 0 || end < 0) throw new Error('could not find the search block in ' + PAGE);
  const m = html.match(/const DATA = (\{.*?\});\nlet state/s);
  if (!m) throw new Error('could not find DATA in ' + PAGE);
  const src = html.slice(start, end) + '\n;return {searchAll, buildSearchIndex, loadDocIndex, DATA};';
  return new Function('DATA', src)(JSON.parse(m[1]));
}

const html = readFileSync(PAGE, 'utf8');
const SET = JSON.parse(readFileSync(path.join('tools', 'search-queries.json'), 'utf8'));
const SCORING = process.argv.includes('--score');
const DOCS = path.join(path.dirname(PAGE), 'search-docs.json');
const EXPECT = process.argv.flatMap((a, i, all) => a === '--expect-inside' ? [all[i + 1]] : []).filter(Boolean);

let failed = false;

/* Everything is measured twice, because the page really does run in two
   states: the sheet-only index it loads with, and the same index once the
   document text has arrived. Adding 300,000 words of prose to a ranking is
   exactly the kind of change that can quietly bury the curated results, so the
   original floors have to hold in BOTH states — not just the old one. */
function run(label, withDocs) {
  const { searchAll, buildSearchIndex, loadDocIndex, DATA } = loadEngine(html);
  buildSearchIndex();
  let passages = 0;
  if (withDocs) {
    const j = JSON.parse(readFileSync(DOCS, 'utf8'));
    if (!loadDocIndex(j)) throw new Error('the page rejected ' + DOCS);
    passages = j.passages.length;
  }
  const published = DATA.resources.filter(r => r.published);
  console.log(`\n${label} — ${published.length} published resources${withDocs ? `, ${passages} document passages` : ''}\n`);

  for (const split of SCORING ? ['tune', 'holdout'] : []) {
    let zero = 0, sec = 0, mod = 0;
    const counts = [];
    for (const c of SET[split]) {
      const { resources, modules } = searchAll(c.q);
      if (!resources.length) {
        zero++;
        if (VERBOSE) console.log(`  ZERO  ${c.q}`);
        continue;
      }
      counts.push(resources.length);
      const want = c.sections || (c.section ? [c.section] : null);
      const okSec = !want || want.includes(resources[0].section);
      const okMod = !c.module
        || resources.slice(0, 3).some(r => r.module === c.module)
        || modules.slice(0, 2).some(m => m.module === c.module);
      if (okSec) sec++;
      if (okMod) mod++;
      if (VERBOSE && !(okSec && okMod)) {
        console.log(`  MISS  ${c.q.slice(0, 44).padEnd(46)}want ${((want || ['*']).join('/') + ' / ' + (c.module || '*')).slice(0, 36).padEnd(38)}got ${resources[0].section} / ${resources[0].module}`);
      }
    }
    counts.sort((a, b) => a - b);
    const n = SET[split].length, f = FLOOR[split];
    const bad = zero > f.zero || sec < f.section || mod < f.module;
    if (bad) failed = true;
    console.log(`  ${split.padEnd(8)} ${bad ? 'FAIL' : 'ok  '}  ` +
      `zero ${zero}/${n} (max ${f.zero})   ` +
      `top-1 section ${sec}/${n} (min ${f.section})   ` +
      `module in top-3 ${mod}/${n} (min ${f.module})   ` +
      `median results ${counts[Math.floor(counts.length / 2)] || 0}`);
  }

  if (SCORING && SET.inside) {
    let got = 0;
    for (const c of SET.inside) {
      const { resources, inside } = searchAll(c.q);
      const rank = resources.findIndex(r => c.ids.includes(r.id));
      const ok = rank >= 0 && rank < INSIDE_TOP;
      if (ok) got++;
      if (VERBOSE && (withDocs ? !ok : false)) {
        console.log(`  MISS  ${c.q.slice(0, 52).padEnd(54)}want ${c.ids[0].slice(0, 34).padEnd(36)}${rank < 0 ? 'not returned' : 'rank ' + (rank + 1)}  (top: ${resources[0] ? resources[0].id : '—'})`);
      }
      if (VERBOSE && withDocs && ok && !(inside && c.ids.some(id => inside.has(id)))) {
        console.log(`  note  ${c.q.slice(0, 52).padEnd(54)}found, but explained from the sheet rather than the document`);
      }
    }
    const n = SET.inside.length;
    // Without the documents these are, by construction, mostly unanswerable:
    // the number is printed as the baseline, and only gated when docs are loaded.
    const bad = withDocs && got < INSIDE_FLOOR;
    if (bad) failed = true;
    console.log(`  inside   ${withDocs ? (bad ? 'FAIL' : 'ok  ') : '    '}  ` +
      `right document in top ${INSIDE_TOP}: ${got}/${n}${withDocs ? ` (min ${INSIDE_FLOOR})` : '  (baseline — not gated)'}`);
  }

  /* --expect-inside "query::resource-id" — an end-to-end assertion on a build
     whose document text is known (CI's fixtures): the query must return that
     resource AND explain the hit with a passage from inside its file. */
  if (withDocs) {
    for (const e of EXPECT) {
      const [q, id] = e.split('::');
      const { resources, inside } = searchAll(q);
      const ok = resources.some(r => r.id === id) && inside.has(id);
      if (!ok) failed = true;
      console.log(`  ${ok ? 'ok  ' : 'FAIL'}  inside the document: "${q}" -> ${id}${ok ? (inside.get(id).page ? ' (p. ' + inside.get(id).page + ')' : '') : ''}`);
    }
  }

  /* A question must never return a blank panel. This holds whatever is in the
     sheet — it is a property of the ranking, not of the content — so it is the
     check CI can always run, and it is the specific failure this whole rewrite
     existed to fix. Asserted separately, and loudly. */
  const questions = [...SET.tune, ...SET.holdout].filter(c => /^(how|what|where|when|why|who|is|are|do|does|can|should|I |anything|supporting|students)/i.test(c.q));
  const blank = questions.filter(c => !searchAll(c.q).resources.length);
  console.log(`\n  ${blank.length ? 'FAIL' : 'ok  '}  natural-language questions returning nothing: ${blank.length}/${questions.length}`);
  if (blank.length) { failed = true; blank.forEach(c => console.log('        ' + c.q)); }
}

if (!SCORING) {
  console.log('\n  Ranking floors not checked (pass --score against a live build).');
  console.log('  Running the content-independent invariant only.');
}
run('Search quality, sheet only', false);
const haveDocs = existsSync(DOCS) && JSON.parse(readFileSync(DOCS, 'utf8')).passages.length > 0;
if (haveDocs) run('Search quality, with the documents loaded', true);
else console.log(`\n  (no document passages in ${DOCS} — second pass skipped)`);
if (EXPECT.length && !haveDocs) { failed = true; console.log('  FAIL  --expect-inside given, but the build produced no document passages'); }

console.log(failed ? '\nSearch quality FAILED\n' : '\nSearch quality OK\n');
process.exit(failed ? 1 : 0);
