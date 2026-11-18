#!/usr/bin/env node
'use strict';
/*
 * Research to Impact — client for the sheet bridge (docs/apps-script/Bridge.gs).
 *
 * Applies narrow, logged edits to the master Google Sheet, which an AI session
 * otherwise cannot write to at all. Every change is recorded on the sheet's
 * `BridgeLog` tab with before/after values.
 *
 *   node tools/sheet.js health
 *   node tools/sheet.js get  "Co-Planning" cp-5-how-to-measure
 *   node tools/sheet.js set  "Co-Planning" cp-1-infographic-and-impact-data published FALSE
 *   node tools/sheet.js unpublish "Co-Planning" cp-1-infographic-and-impact-data
 *   node tools/sheet.js batch ops.json [--apply]
 *
 * Batches are a DRY RUN unless you pass --apply, so you always see the diff first.
 *
 * Credentials come from .bridge-url and .bridge-token next to this repo (both
 * gitignored), or from R2I_BRIDGE_URL / R2I_BRIDGE_TOKEN in the environment.
 * Nothing here ever prints the token.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readSecret(file, envVar, label) {
  if (process.env[envVar]) return process.env[envVar].trim();
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) {
    console.error(`Missing ${label}.\n` +
      `  Expected ${p} (gitignored) or the ${envVar} environment variable.\n` +
      `  See docs/sheet-bridge.md for setup.`);
    process.exit(2);
  }
  const v = fs.readFileSync(p, 'utf8').trim();
  if (!v) { console.error(`${p} is empty.`); process.exit(2); }
  return v;
}

async function call(payload, { get = false } = {}) {
  const url = readSecret('.bridge-url', 'R2I_BRIDGE_URL', 'the bridge URL');
  const token = readSecret('.bridge-token', 'R2I_BRIDGE_TOKEN', 'the bridge token');

  let res;
  if (get) {
    const u = new URL(url);
    u.searchParams.set('token', token);
    res = await fetch(u, { redirect: 'follow' });
  } else {
    res = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, token }),
    });
  }

  const text = await res.text();
  let body;
  try { body = JSON.parse(text); }
  catch {
    console.error(`The bridge did not return JSON (HTTP ${res.status}).`);
    if (/accounts\.google\.com|Sign in/i.test(text)) {
      console.error('It looks like the deployment is not set to "Anyone" access —\n' +
                    'Google served a sign-in page. Re-deploy with: Who has access = Anyone.');
    } else {
      console.error(text.slice(0, 600));
    }
    process.exit(1);
  }
  return body;
}

function describe(r) {
  if (!r.ok) return `  ✗ [${r.index}] ${r.error}`;
  if (r.op === 'get') return `  · ${r.tab} / ${r.id}  row ${r.row}`;
  if (!r.changed) return `  = ${r.tab} / ${r.id}  ${r.column} already "${r.after}"`;
  if (r.op === 'append') return `  + ${r.tab}  new row appended`;
  return `  ✓ ${r.tab} / ${r.id}  ${r.column}: "${r.before}" → "${r.after}"`;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  if (!cmd || cmd === 'help' || cmd === '--help') {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].split('/*')[1].trim());
    return;
  }

  if (cmd === 'health') {
    const r = await call(null, { get: true });
    if (!r.ok) { console.error('✗ ' + r.error); process.exit(1); }
    console.log(`✓ bridge ${r.bridge} on "${r.spreadsheet}"`);
    console.log(`  tabs seen: ${r.tabs.length}`);
    const missing = r.allowedTabs.filter(t => !r.tabs.includes(t));
    if (missing.length) console.log(`  ! allowed but not present: ${missing.join(', ')}`);
    return;
  }

  let ops, dryRun = false;

  if (cmd === 'get') {
    const [tab, id] = rest;
    if (!tab || !id) { console.error('usage: get <tab> <id>'); process.exit(2); }
    ops = [{ op: 'get', tab, id }];
  } else if (cmd === 'set') {
    const [tab, id, column, ...valueParts] = rest;
    if (!tab || !id || !column || !valueParts.length) {
      console.error('usage: set <tab> <id> <column> <value>'); process.exit(2);
    }
    ops = [{ op: 'set', tab, id, column, value: valueParts.join(' ') }];
  } else if (cmd === 'unpublish') {
    const [tab, id] = rest;
    if (!tab || !id) { console.error('usage: unpublish <tab> <id>'); process.exit(2); }
    ops = [{ op: 'set', tab, id, column: 'published', value: 'FALSE' }];
  } else if (cmd === 'batch') {
    const file = rest.find(a => !a.startsWith('--'));
    if (!file) { console.error('usage: batch <ops.json> [--apply]'); process.exit(2); }
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    ops = Array.isArray(parsed) ? parsed : parsed.ops;
    if (!Array.isArray(ops)) { console.error(`${file} must be an array of ops, or {"ops":[...]}.`); process.exit(2); }
    dryRun = !rest.includes('--apply');
  } else {
    console.error(`Unknown command "${cmd}". Try: health, get, set, unpublish, batch`);
    process.exit(2);
  }

  const r = await call({ ops, dryRun });

  if (r.error) { console.error('✗ ' + r.error); process.exit(1); }

  if (dryRun) console.log('DRY RUN — nothing written. Re-run with --apply to commit.\n');
  (r.results || []).forEach(x => console.log(describe(x)));

  if (ops.length === 1 && ops[0].op === 'get' && r.results && r.results[0] && r.results[0].values) {
    console.log();
    Object.entries(r.results[0].values).forEach(([k, v]) => {
      if (String(v).trim() !== '') console.log(`  ${k}: ${String(v).slice(0, 300)}`);
    });
  }

  console.log(`\n${r.applied || 0} changed · ${r.unchanged || 0} already correct · ${r.failed || 0} failed`);
  if (r.failed) process.exit(1);
}

main().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
