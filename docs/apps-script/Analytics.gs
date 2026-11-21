/**
 * R2I Analytics — an anonymous event receiver for the public site.
 *
 * WHY THIS EXISTS
 *   The site is static files: there is no server to count a visit. This script,
 *   bound to its OWN spreadsheet (never the content sheet), is published as a web
 *   app. The page posts one small JSON note per event and this appends one row
 *   to the `Events` tab. A `Summary` tab totals the rows with ordinary formulas.
 *   Free, no vendor, and the numbers live in a sheet the team owns.
 *
 * WHAT IS RECORDED
 *   Page views, resource opens (by resource id), searches (the words typed and
 *   how many results came back), which search result was picked, intro video
 *   plays, and "an email was given" (never the address — that goes to
 *   HubSpot and nowhere else).
 *
 * WHAT IS NOT
 *   No cookies, no IP address, no user agent, no name, no email. `session` is a
 *   random id the page makes up in memory for one page load; it is not stored
 *   on the visitor's device and cannot link two visits.
 *
 * THE ENDPOINT IS PUBLIC — anyone can post to it. So it is strict about what
 *   it accepts: a fixed list of event names, every field shape-checked and
 *   length-capped, a leading = + - @ stripped (so a cell can never become a
 *   formula), a per-minute ceiling, a per-session ceiling and a row ceiling.
 *   It always answers "ok" and never says why something was dropped.
 *
 * SETUP: see docs/analytics.md. Turn it off at any time by archiving the
 *   deployment (Deploy -> Manage deployments -> Archive) or by blanking
 *   `analytics_url` on the content sheet's Site tab.
 */

// ---------------------------------------------------------------- configuration

// Bump when this file changes, and re-paste it into the Apps Script editor.
// Opening the web app URL in a browser reports the version actually running.
var ANALYTICS_VERSION = '1.0.0';

var EVENTS_TAB = 'Events';
var SUMMARY_TAB = 'Summary';
var HEADERS = ['time', 'month', 'event', 'session', 'page', 'section', 'module',
               'resource', 'query', 'results', 'detail', 'referrer', 'source', 'device'];

var EVENTS = ['view', 'open', 'search', 'pick', 'intro', 'email'];
var PAGES = ['home', 'about', 'privacy', 'saved', 'r2ihome', 'section', 'module'];
var DEVICES = ['phone', 'tablet', 'desktop'];

var MAX_BODY = 1500;          // characters of JSON accepted per event
var MAX_PER_MINUTE = 300;     // across all visitors; a flood is dropped, not stored
var MAX_PER_SESSION = 400;    // one page load cannot write more rows than this
var MAX_ROWS = 400000;        // 14 columns x 400k rows stays inside Sheets' cell limit

// ---------------------------------------------------------------- web app

function doGet() {
  return ContentService.createTextOutput('R2I analytics receiver ' + ANALYTICS_VERSION);
}

function doPost(e) {
  try { record_(e); } catch (err) { /* never surface a reason to the caller */ }
  return ContentService.createTextOutput('ok');
}

function record_(e) {
  var raw = e && e.postData && e.postData.contents;
  if (!raw || raw.length > MAX_BODY) return;
  var b = JSON.parse(raw);
  if (!b || typeof b !== 'object') return;

  var ev = String(b.e || '');
  if (EVENTS.indexOf(ev) < 0) return;
  var sid = String(b.sid || '');
  if (!/^[a-z0-9]{8,16}$/.test(sid)) return;

  var cache = CacheService.getScriptCache();
  var now = new Date();
  if (bump_(cache, 'm' + Math.floor(now.getTime() / 60000), 120) > MAX_PER_MINUTE) return;
  if (bump_(cache, 's' + sid, 21600) > MAX_PER_SESSION) return;

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EVENTS_TAB);
  if (!sheet || sheet.getLastRow() >= MAX_ROWS) return;

  var page = String(b.page || '');
  var rid = String(b.rid || '');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(rid)) rid = '';
  // These events are about one resource; without a well-formed id they say nothing.
  if (!rid && ['open', 'pick', 'email'].indexOf(ev) >= 0) return;
  var ref = String(b.ref || '').toLowerCase();
  var dev = String(b.dev || '');
  var n = Number(b.n);
  var tz = Session.getScriptTimeZone();

  sheet.appendRow([
    Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm:ss'),
    Utilities.formatDate(now, tz, 'yyyy-MM'),
    ev,
    sid,
    PAGES.indexOf(page) >= 0 ? page : '',
    text_(b.sec, 80),
    text_(b.mod, 80),
    rid,
    text_(b.q, 80).toLowerCase(),
    (ev === 'search' && isFinite(n) && n >= 0 && n < 100000) ? Math.floor(n) : '',
    text_(b.d, 40),
    /^[a-z0-9.-]{1,80}$/.test(ref) ? ref : '',
    text_(b.src, 40),
    DEVICES.indexOf(dev) >= 0 ? dev : ''
  ]);
}

// Count a key in the script cache and return the new count. Two posts landing
// in the same instant can both read the old value; the ceilings are there to
// stop a flood, not to be exact.
function bump_(cache, key, ttl) {
  var n = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(n), ttl);
  return n;
}

// Free text from a stranger: one line, capped, and never a formula.
function text_(v, max) {
  return String(v == null ? '' : v)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[=+\-@\s]+/, '')
    .slice(0, max)
    .trim();
}

// ---------------------------------------------------------------- sheet setup

function onOpen() {
  SpreadsheetApp.getUi().createMenu('R2I Analytics')
    .addItem('Set up (or repair) the tabs', 'setup')
    .addToUi();
}

/**
 * Creates the Events and Summary tabs. Safe to run again: it never deletes an
 * event row, and it rewrites Summary from scratch.
 */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var ev = ss.getSheetByName(EVENTS_TAB) || ss.insertSheet(EVENTS_TAB);
  ev.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  ev.setFrozenRows(1);
  // Plain text everywhere except `results`. A search for "504" must stay the
  // text "504": a column that mixes numbers and text loses the minority type
  // when QUERY reads it — the same trap as gviz on the content sheet.
  ev.getRange(1, 1, ev.getMaxRows(), HEADERS.length).setNumberFormat('@');
  ev.getRange(2, 10, ev.getMaxRows() - 1, 1).setNumberFormat('0');

  var old = ss.getSheetByName(SUMMARY_TAB);
  if (old) ss.deleteSheet(old);
  var su = ss.insertSheet(SUMMARY_TAB, 0);
  var E = "'" + EVENTS_TAB + "'!A:N";
  var put = function (cell, title, formula) {
    var r = su.getRange(cell);
    r.setValue(title).setFontWeight('bold');
    r.offset(1, 0).setFormula(formula);
  };

  su.getRange('A1').setValue('R2I site analytics').setFontWeight('bold').setFontSize(14);
  su.getRange('A2').setValue('Anonymous counts from researchtoimpact.marshall.org. A "visit" is one page load. Raw rows are on the Events tab.');

  put('A4', 'By month',
    '=IFERROR(QUERY(' + E + ',"select B, count(A) where C=\'view\' group by B order by B desc label B \'month\', count(A) \'page views\'",1),"No data yet")');
  put('D4', 'Visits by month',
    '=IFERROR(QUERY(UNIQUE({\'' + EVENTS_TAB + '\'!B2:B,\'' + EVENTS_TAB + '\'!D2:D}),"select Col1, count(Col2) where Col1 is not null group by Col1 order by Col1 desc label Col1 \'month\', count(Col2) \'visits\'",0),"No data yet")');
  put('G4', 'Page views by toolkit and module',
    '=IFERROR(QUERY(' + E + ',"select F, G, count(A) where C=\'view\' and F is not null group by F, G order by count(A) desc label F \'toolkit\', G \'module\', count(A) \'views\'",1),"No data yet")');
  put('K4', 'Resource opens',
    '=IFERROR(QUERY(' + E + ',"select H, count(A) where C=\'open\' and H is not null group by H order by count(A) desc label H \'resource id\', count(A) \'opens\'",1),"No data yet")');
  put('N4', 'Top searches',
    '=IFERROR(QUERY(' + E + ',"select I, count(A) where C=\'search\' and I is not null group by I order by count(A) desc limit 200 label I \'search\', count(A) \'times\'",1),"No data yet")');
  put('Q4', 'Searches that found nothing',
    '=IFERROR(QUERY(' + E + ',"select I, count(A) where C=\'search\' and J=0 and I is not null group by I order by count(A) desc limit 200 label I \'search\', count(A) \'times\'",1),"No data yet")');
  put('T4', 'Where visitors came from',
    '=IFERROR(QUERY(' + E + ',"select L, count(A) where L is not null group by L order by count(A) desc label L \'site\', count(A) \'visits\'",1),"No data yet")');
  put('W4', 'Everything else',
    '=IFERROR(QUERY(' + E + ',"select C, count(A) where C is not null group by C order by count(A) desc label C \'event\', count(A) \'count\'",1),"No data yet")');

  su.setFrozenRows(4);
  SpreadsheetApp.getActive().toast('Events and Summary tabs are ready.', 'R2I Analytics');
}
