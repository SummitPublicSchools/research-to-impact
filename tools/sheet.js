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

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Apps Script endpoints close the socket on a good fraction of requests —
 * measured at roughly 4 failures in 6 against this deployment. The failure is a
 * transport error (UND_ERR_SOCKET), not a response, so a retry is the fix.
 *
 * Retrying is only safe when the operations are idempotent. `get` and `set` are:
 * setting a cell to the same value twice is the same cell. `append` is not — a
 * retry could add a second copy of a row. Since the socket can close *after*
 * doPost already ran, we cannot tell whether a lost request took effect, so
 * batches containing an append are never retried automatically.
 */
function isTransient(err) {
  const codes = ['UND_ERR_SOCKET', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT'];
  for (let c = err; c; c = c.cause) if (c.code && codes.includes(c.code)) return true;
  return false;
}

async function call(payload, opts = {}) {
  const { retries = 0 } = opts;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await callOnce(payload, opts);
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !isTransient(err)) break;
      const wait = 700 * (attempt + 1);
      console.error(`  (connection dropped — retrying in ${wait}ms, attempt ${attempt + 2} of ${retries + 1})`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

async function callOnce(payload, { get = false } = {}) {
  const url = readSecret('.bridge-url', 'R2I_BRIDGE_URL', 'the bridge URL');
  const token = readSecret('.bridge-token', 'R2I_BRIDGE_TOKEN', 'the bridge token');

  let res;
  if (get) {
    const u = new URL(url);
    u.searchParams.set('token', token);
    res = await fetch(u, { redirect: 'follow' });
  } else {
    // Apps Script runs doPost and then 302s to script.googleusercontent.com to
    // serve the output. That redirect must be followed as a GET: letting fetch
    // follow it automatically re-sends the POST and the echo host answers 405.
    res = await fetch(url, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, token }),
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) {
        console.error(`The bridge redirected (HTTP ${res.status}) without a Location header.`);
        process.exit(1);
      }
      res = await fetch(location, { redirect: 'follow' });
    }
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
    const r = await call(null, { get: true, retries: 4 });
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

  const hasAppend = ops.some(o => String(o.op || '').toLowerCase() === 'append');
  if (hasAppend) {
    console.error('Note: this batch contains an append, which cannot be safely retried.\n' +
                  '      If the connection drops, check the sheet before re-running.\n');
  }

  // Each op re-reads its whole tab server-side, so a long batch overruns the
  // response window and Google drops the connection — measured: 20 ops failed
  // 5/5 while single ops succeeded 3/3. Send in small chunks instead.
  const CHUNK = Number(process.env.BRIDGE_CHUNK) || 6;
  const chunks = [];
  for (let i = 0; i < ops.length; i += CHUNK) chunks.push(ops.slice(i, i + CHUNK));

  const r = { ok: true, dryRun, applied: 0, unchanged: 0, failed: 0, results: [] };
  for (let c = 0; c < chunks.length; c++) {
    if (chunks.length > 1) console.error(`  [chunk ${c + 1}/${chunks.length}]`);
    let part;
    try {
      part = await call({ ops: chunks[c], dryRun }, { retries: hasAppend ? 0 : 4 });
    } catch (err) {
      console.error(`\n✗ Chunk ${c + 1} of ${chunks.length} failed: ${err.message}`);
      if (!dryRun) {
        console.error(`  ${r.applied} change(s) from earlier chunks ARE already written.`);
        console.error('  Re-running is safe for set/get ops — they are idempotent.');
      }
      throw err;
    }
    if (part.error) { console.error('✗ ' + part.error); process.exit(1); }
    r.ok = r.ok && part.ok;
    r.applied += part.applied || 0;
    r.unchanged += part.unchanged || 0;
    r.failed += part.failed || 0;
    (part.results || []).forEach(x => r.results.push(x));
  }

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

main().catch(e => {
  console.error('FAILED: ' + e.message);
  // Network errors from fetch say only "fetch failed"; the cause names the real
  // problem (DNS, TLS, connection reset), so always surface it.
  let cause = e.cause, depth = 0;
  while (cause && depth++ < 4) {
    console.error('  cause: ' + [cause.code, cause.message].filter(Boolean).join(' '));
    cause = cause.cause;
  }
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
});
