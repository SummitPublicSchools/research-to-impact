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
import { readFileSync } from 'node:fs';
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

function loadEngine(html) {
  // The engine is ordinary top-level code in the page. Rather than keep a
  // second copy here (which would drift), slice it out and evaluate it with a
  // stub DATA — so this tests the code that actually ships.
  const start = html.indexOf('/* ---- search ---');
  const end = html.indexOf('function runSearch(');
  if (start < 0 || end < 0) throw new Error('could not find the search block in ' + PAGE);
  const m = html.match(/const DATA = (\{.*?\});\nlet state/s);
  if (!m) throw new Error('could not find DATA in ' + PAGE);
  const src = html.slice(start, end) + '\n;return {searchAll, buildSearchIndex, DATA};';
  return new Function('DATA', src)(JSON.parse(m[1]));
}

const html = readFileSync(PAGE, 'utf8');
const { searchAll, buildSearchIndex, DATA } = loadEngine(html);
buildSearchIndex();
const SET = JSON.parse(readFileSync(path.join('tools', 'search-queries.json'), 'utf8'));

const published = DATA.resources.filter(r => r.published);
const SCORING = process.argv.includes('--score');

console.log(`\nSearch quality — ${published.length} published resources\n`);
if (!SCORING) {
  console.log('  Ranking floors not checked (pass --score against a live build).');
  console.log('  Running the content-independent invariant only.\n');
}

let failed = false;
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

/* A question must never return a blank panel. This holds whatever is in the
   sheet — it is a property of the ranking, not of the content — so it is the
   check CI can always run, and it is the specific failure this whole rewrite
   existed to fix. Asserted separately, and loudly. */
const questions = [...SET.tune, ...SET.holdout].filter(c => /^(how|what|where|when|why|who|is|are|do|does|can|should|I |anything|supporting|students)/i.test(c.q));
const blank = questions.filter(c => !searchAll(c.q).resources.length);
console.log(`\n  ${blank.length ? 'FAIL' : 'ok  '}  natural-language questions returning nothing: ${blank.length}/${questions.length}`);
if (blank.length) { failed = true; blank.forEach(c => console.log('        ' + c.q)); }

console.log(failed ? '\nSearch quality FAILED\n' : '\nSearch quality OK\n');
process.exit(failed ? 1 : 0);
