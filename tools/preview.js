#!/usr/bin/env node
'use strict';
/*
 * Research to Impact — local preview with a rebuild key.
 *
 * Builds the real site from the live Google Sheet and serves it at
 * http://localhost:8080. Press "r" then Enter to re-pull the sheet and rebuild,
 * so you can see sheet edits in seconds — for free, with no Netlify deploy.
 *
 *   node tools/preview.js            # live sheet (what the site will look like)
 *   node tools/preview.js --local    # fixtures only, no network
 *   PORT=3000 node tools/preview.js
 *
 * Nothing here deploys. To publish, see docs/build-day.md.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');

const ROOT  = path.resolve(__dirname, '..');
const DIST  = path.join(ROOT, 'dist');
const PORT  = parseInt(process.env.PORT, 10) || 8080;
const LOCAL = process.argv.includes('--local');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8',
};

let building = false;

function build() {
  if (building) { console.log('  (a build is already running)'); return Promise.resolve(false); }
  building = true;
  const started = Date.now();
  const env = { ...process.env };
  if (LOCAL) env.SHEET_SOURCE = 'local'; else delete env.SHEET_SOURCE;
  console.log(`\n⏳ Building from ${LOCAL ? 'fixtures' : 'the live sheet'}…`);
  return new Promise(resolve => {
    const p = spawn(process.execPath, ['build.js'], { cwd: ROOT, env });
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { out += d; });
    p.on('close', code => {
      building = false;
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      // Echo the parts of the build report that matter while working.
      const keep = out.split('\n').filter(l =>
        /^\s*(resources:|nav sections:|secondary:|collections:)/.test(l) ||
        /^\s*[!X]\s/.test(l) ||
        /^(WARNINGS|ERRORS|No warnings|BUILD FAILED)/.test(l));
      console.log(keep.join('\n'));
      if (code === 0) console.log(`\n✅ Rebuilt in ${secs}s — refresh http://localhost:${PORT}`);
      else console.log(`\n❌ Build failed (exit ${code}) — the last good page is still being served.`);
      resolve(code === 0);
    });
  });
}

function serve() {
  http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.join(DIST, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(DIST)) { res.writeHead(403).end('Forbidden'); return; }
    fs.readFile(file, (err, buf) => {
      if (err) {
        // Single-page app: unknown paths fall back to index.html.
        fs.readFile(path.join(DIST, 'index.html'), (e2, idx) => {
          if (e2) { res.writeHead(404, { 'content-type': 'text/plain' }).end('Not built yet — press r then Enter.'); return; }
          res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' }).end(idx);
        });
        return;
      }
      res.writeHead(200, {
        'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
      }).end(buf);
    });
  }).listen(PORT, () => {
    console.log(`\n🌐 Serving dist/ at http://localhost:${PORT}`);
    console.log('   r + Enter = re-pull the sheet and rebuild');
    console.log('   q + Enter = quit\n');
  });
}

async function main() {
  await build();
  serve();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '' });
  rl.on('line', async line => {
    const cmd = line.trim().toLowerCase();
    if (cmd === 'r' || cmd === '') await build();
    else if (cmd === 'q' || cmd === 'quit' || cmd === 'exit') { console.log('bye'); process.exit(0); }
    else console.log('  r = rebuild, q = quit');
  });
}

main();
