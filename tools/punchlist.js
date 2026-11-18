#!/usr/bin/env node
'use strict';
/*
 * Research to Impact — build-day punch list.
 *
 * READ-ONLY. Pulls the live Google Sheet and prints the work queue: what is
 * blocking each row from being live, grouped by section so a team can divide it
 * up. This does NOT build or deploy anything and never writes to the sheet.
 *
 *   node tools/punchlist.js                 # live sheet
 *   SHEET_SOURCE=local node tools/punchlist.js   # fixtures, no network
 *   node tools/punchlist.js --out punchlist.md   # also write a shareable file
 *
 * Deliberately standalone: it re-implements the sheet read rather than importing
 * build.js, so nothing here can affect the production build path.
 */

const fs = require('fs');
const path = require('path');

const SHEET_ID    = process.env.SHEET_ID || '1IHC6eaWAtYomqPR08mrl7147-Zo_bq3Dz1pR1orZNxs';
const SOURCE      = process.env.SHEET_SOURCE || 'remote';
const FIXTURE_DIR = process.env.FIXTURE_DIR || 'fixtures';
const CACHE_BUST  = Date.now();

const RESOURCE_TABS = [
  'Co-Planning', 'Repeated Reading', 'Routine Data Cycles',
  'Leading Implementation', 'Stories & Spotlights', 'Evidence & Impact',
  'R2I Library', 'Site Assets',
];
const SECTION_ALIASES = { 'R2I Library': 'Research-to-Impact Library' };
const canon = s => SECTION_ALIASES[(s || '').trim()] || (s || '').trim();

const TRUE = v => String(v == null ? '' : v).trim().toUpperCase() === 'TRUE';
const txt  = v => String(v == null ? '' : v).trim();

// ---- CSV (same parser as build.js, so we read the sheet identically) --------
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
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function toObjects(text, expectedKey) {
  const rows = parseCSV(text).filter(r => r.some(c => String(c).trim() !== ''));
  if (!rows.length) return [];
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
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}` +
      `/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(name)}&_cb=${CACHE_BUST}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not fetch tab "${name}" (HTTP ${res.status}).`);
    text = await res.text();
  }
  return toObjects(text, expectedKey);
}

// ---- main ------------------------------------------------------------------
async function main() {
  const outArgIdx = process.argv.indexOf('--out');
  const outFile = outArgIdx > -1 ? process.argv[outArgIdx + 1] : null;

  const site = {};
  (await loadTab('Site', 'setting')).forEach(r => { if (txt(r.setting)) site[txt(r.setting)] = r.value; });

  const sections = (await loadTab('Sections', 'section_name')).map(s => ({
    name: txt(s.section_name), tier: txt(s.tier), order: parseInt(s.order, 10) || 0,
    nav_visible: txt(s.nav_visible), landing_intro: txt(s.landing_intro),
  }));
  const secByName = {}; sections.forEach(s => { secByName[s.name] = s; });

  const modules = (await loadTab('Modules', 'module_name')).map(m => ({
    section: canon(m.section), name: txt(m.module_name),
  }));
  const modsBySection = {};
  modules.forEach(m => { (modsBySection[m.section] = modsBySection[m.section] || new Set()).add(m.name); });

  const filesMap = {};
  try {
    (await loadTab('Files', 'id')).forEach(r => { if (txt(r.id)) filesMap[txt(r.id)] = txt(r.url); });
  } catch (e) { /* optional */ }

  const rows = [];
  for (const tab of RESOURCE_TABS) {
    let raw;
    try { raw = await loadTab(tab, 'id'); } catch (e) { console.error('  ! ' + e.message); continue; }
    for (const r of raw) {
      if (!txt(r.id)) continue;
      const id = txt(r.id);
      const linkType = txt(r.link_type);
      const hasFile = !!txt(r.link_url) || (linkType === 'download' && !!filesMap[id]);
      rows.push({
        id, section: canon(tab), module: txt(r.module), title: txt(r.title),
        format: txt(r.format), status: txt(r.status),
        published: TRUE(r.published), focal: TRUE(r.focal), gated: TRUE(r.gated),
        summary: txt(r.summary), linkType, hasFile,
        isVideo: linkType === 'embed' || !!txt(r.video_url),
        videoUrl: txt(r.video_url),
      });
    }
  }

  // ---- analysis ----
  const L = [];           // report lines (markdown)
  const p = s => L.push(s);
  const readyUnpub   = rows.filter(r => r.status === 'ready' && !r.published);
  const orphans      = rows.filter(r => !modsBySection[r.section] || !modsBySection[r.section].has(r.module));
  const noSummary    = rows.filter(r => r.published && r.focal && !r.summary);
  const noFile       = rows.filter(r => r.published && !r.isVideo && !r.hasFile);
  const shareVideos  = rows.filter(r => /vimeo\.com\/share\//i.test(r.videoUrl));
  const pubNotReady  = rows.filter(r => r.published && r.status && r.status !== 'ready');
  const dupes        = Object.entries(rows.reduce((a, r) => { a[r.id] = (a[r.id] || 0) + 1; return a; }, {}))
                        .filter(([, n]) => n > 1);

  const missingModules = {};
  orphans.forEach(r => {
    const k = r.section + ' :: ' + (r.module || '(blank)');
    (missingModules[k] = missingModules[k] || []).push(r.id);
  });

  p('# Build-day punch list');
  p('');
  p(`Generated ${new Date().toISOString()} from ${SOURCE === 'local' ? `local fixtures in ${FIXTURE_DIR}/ (NOT the live sheet)` : 'the live sheet'}. Read-only snapshot.`);
  p('');

  // Section scoreboard
  p('## Where each section stands');
  p('');
  p('| Section | Rows | Published | Ready, not live | Planned | In progress | Nav |');
  p('|---|---:|---:|---:|---:|---:|---|');
  const order = [...new Set(rows.map(r => r.section))];
  let tot = { n: 0, pub: 0, ru: 0, pl: 0, ip: 0 };
  order.forEach(sec => {
    const sr = rows.filter(r => r.section === sec);
    const c = {
      n: sr.length,
      pub: sr.filter(r => r.published).length,
      ru: sr.filter(r => r.status === 'ready' && !r.published).length,
      pl: sr.filter(r => r.status === 'planned').length,
      ip: sr.filter(r => r.status === 'in_progress').length,
    };
    tot.n += c.n; tot.pub += c.pub; tot.ru += c.ru; tot.pl += c.pl; tot.ip += c.ip;
    const nav = secByName[sec] ? (secByName[sec].nav_visible || '(blank)') : 'NO SECTIONS ROW';
    p(`| ${sec} | ${c.n} | ${c.pub} | **${c.ru}** | ${c.pl} | ${c.ip} | ${nav} |`);
  });
  p(`| **Total** | **${tot.n}** | **${tot.pub}** | **${tot.ru}** | **${tot.pl}** | **${tot.ip}** | |`);
  p('');

  // The big queue
  p('## 1. Ready but not published — flip `published` to TRUE');
  p('');
  if (!readyUnpub.length) p('_None. Every ready row is live._');
  else {
    p(`${readyUnpub.length} rows are marked \`status = ready\` but \`published = FALSE\`, so they are finished work that nobody can see.`);
    p('');
    order.forEach(sec => {
      const sr = readyUnpub.filter(r => r.section === sec);
      if (!sr.length) return;
      p(`**${sec}** (${sr.length})`);
      p('');
      sr.forEach(r => {
        const flags = [];
        if (!r.isVideo && !r.hasFile) flags.push('⚠ no file yet');
        if (r.focal && !r.summary) flags.push('⚠ no summary');
        p(`- \`${r.id}\` — ${r.title || '(no title)'}${flags.length ? '  → ' + flags.join(', ') : ''}`);
      });
      p('');
    });
  }

  // Missing modules
  p('## 2. Missing module rows — add to the `Modules` tab');
  p('');
  if (!Object.keys(missingModules).length) p('_None. Every resource points at a module that exists._');
  else {
    p('Each of these resources names a module that has no row on the `Modules` tab, so the rows exist but appear on no page. Adding one module row rescues the whole group.');
    p('');
    p('| Add to Modules tab: `section` | `module_name` | Rescues |');
    p('|---|---|---:|');
    Object.entries(missingModules).forEach(([k, ids]) => {
      const [sec, mod] = k.split(' :: ');
      p(`| ${sec} | ${mod} | ${ids.length} rows |`);
    });
    p('');
    Object.entries(missingModules).forEach(([k, ids]) => {
      p(`<details><summary>${k} — ${ids.length} rows</summary>`);
      p('');
      ids.forEach(i => p(`- \`${i}\``));
      p('');
      p('</details>');
      p('');
    });
  }

  // Other blockers
  p('## 3. Other things to fix');
  p('');
  const block = (title, list, fmt) => {
    p(`**${title}** — ${list.length}`);
    p('');
    if (!list.length) p('_Clear._');
    else list.forEach(x => p('- ' + fmt(x)));
    p('');
  };
  block('Published cards with no summary', noSummary, r => `\`${r.id}\` (${r.section}) — card renders with no description`);
  block('Published rows that resolve to no file', noFile, r => `\`${r.id}\` (${r.section}) — download button leads nowhere; name a file after the id in Drive "01 - Published", or set \`link_url\``);
  block('Vimeo share links that will not play inline', shareVideos, r => `\`${r.id}\` — \`${r.videoUrl}\` → replace with the numeric URL (https://vimeo.com/123456789)`);
  block('Published but status is not "ready"', pubNotReady, r => `\`${r.id}\` — live with status \`${r.status}\``);
  block('Duplicate ids (these FAIL a strict build)', dupes, ([id, n]) => `\`${id}\` appears ${n} times`);

  const SITE_KEYS = ['tagline', 'hero_headline', 'hero_subhead', 'about_story', 'about_network', 'license_line'];
  const blankSite = SITE_KEYS.filter(k => !txt(site[k]));
  block('Blank Site settings', blankSite, k => `\`${k}\` — that page area renders empty`);

  const out = L.join('\n');
  console.log(out);
  if (outFile) {
    fs.writeFileSync(outFile, out + '\n');
    console.error(`\n[written to ${outFile}]`);
  }

  // Console-only headline so it is readable at a glance in a terminal
  console.error('');
  console.error('─'.repeat(64));
  console.error(`  ${tot.n} rows · ${tot.pub} live · ${tot.ru} ready and waiting · ${orphans.length} on no page`);
  console.error('─'.repeat(64));
}

main().catch(e => { console.error('PUNCH LIST FAILED: ' + e.message); process.exit(1); });
