/**
 * R2I Analytics — an anonymous event receiver for the public site.
 *
 * WHY THIS EXISTS
 *   The site is static files: there is no server to count a visit. This script,
 *   bound to its OWN spreadsheet (never the content sheet), is published as a web
 *   app. The page posts one small JSON note per event and this appends one row
 *   to the `Events` tab. A `Dashboard` tab totals the rows with ordinary formulas.
 *   Free, no vendor, and the numbers live in a sheet the team owns.
 *
 * WHAT IS RECORDED
 *   Page views, resource opens (by resource id and title), searches (the words typed and
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
// 1.1.0 — a Dashboard tab for people who were not here when this was built, a
//         Full lists tab behind it, resource titles alongside ids, and `time`
//         stored as a real date so "last 30 days" can be counted.
// 1.1.1 — visits were counted with COUNTUNIQUE(FILTER(...)), which counts the
//         "no rows" error as one value, so every empty month showed 1 visit.
//         COUNTUNIQUEIFS has no such trap. Page names read as words.
var ANALYTICS_VERSION = '1.1.1';

var EVENTS_TAB = 'Events';
var DASH_TAB = 'Dashboard';
var LISTS_TAB = 'Full lists';
var OLD_SUMMARY_TAB = 'Summary';   // 1.0.0's tab, replaced by the two above
var HEADERS = ['time', 'month', 'event', 'session', 'page', 'section', 'module',
               'resource', 'query', 'results', 'detail', 'referrer', 'source', 'device',
               'title'];

var EVENTS = ['view', 'open', 'search', 'pick', 'intro', 'email'];
var PAGES = ['home', 'about', 'privacy', 'saved', 'r2ihome', 'section', 'module'];
var DEVICES = ['phone', 'tablet', 'desktop'];

var MAX_BODY = 1500;          // characters of JSON accepted per event
var MAX_PER_MINUTE = 300;     // across all visitors; a flood is dropped, not stored
var MAX_PER_SESSION = 400;    // one page load cannot write more rows than this
var MAX_ROWS = 400000;        // 15 columns x 400k rows stays inside Sheets' cell limit

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

  // `time` and `month` are the same real date, shown two ways by the column
  // formats. A date typed as text ("2026-11") is silently turned into a date by
  // Sheets anyway, so it is written as one on purpose.
  sheet.appendRow([
    now,
    now,
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
    DEVICES.indexOf(dev) >= 0 ? dev : '',
    text_(b.t, 80)
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

var NAVY = '#21334c', ORANGE = '#ed8f47', PALE = '#f3f5f8', LINE = '#d3d6db', GREY = '#5f6770';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('R2I Analytics')
    .addItem('Set up (or repair) the tabs', 'setup')
    .addToUi();
}

/**
 * Builds the Events tab (if missing), then rebuilds Dashboard and Full lists
 * from scratch. Safe to run again: it never deletes an event row.
 */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  setupEvents_(ss);
  [DASH_TAB, LISTS_TAB, OLD_SUMMARY_TAB].forEach(function (n) {
    var old = ss.getSheetByName(n);
    if (old) ss.deleteSheet(old);
  });
  // The blank tab every new spreadsheet starts with — removed only if untouched.
  var blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && blank.getCharts().length === 0) ss.deleteSheet(blank);
  buildDashboard_(ss.insertSheet(DASH_TAB, 0));
  buildLists_(ss.insertSheet(LISTS_TAB, 1));
  ss.setActiveSheet(ss.getSheetByName(DASH_TAB));
  ss.toast('Dashboard, Full lists and Events are ready.', 'R2I Analytics');
}

function setupEvents_(ss) {
  var ev = ss.getSheetByName(EVENTS_TAB) || ss.insertSheet(EVENTS_TAB);
  var rows = ev.getMaxRows();
  ev.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  ev.setFrozenRows(1);
  if (rows > 1) {
    ev.getRange(2, 1, rows - 1, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
    ev.getRange(2, 2, rows - 1, 1).setNumberFormat('mmm yyyy');
    ev.getRange(2, 3, rows - 1, HEADERS.length - 2).setNumberFormat('@');
    ev.getRange(2, 10, rows - 1, 1).setNumberFormat('0');
  }
  // A row written by 1.0.0 may hold its time as text. Text sorts above every
  // date, so it would be counted in every month: turn any such cell into a date.
  var last = ev.getLastRow();
  if (last > 1) {
    var rng = ev.getRange(2, 1, last - 1, 2), vals = rng.getValues(), changed = false;
    vals.forEach(function (r) {
      for (var c = 0; c < 2; c++) {
        if (typeof r[c] === 'string' && r[c]) {
          var d = new Date(r[c].replace(' ', 'T'));
          if (!isNaN(d.getTime())) { r[c] = d; changed = true; }
        }
      }
    });
    if (changed) rng.setValues(vals);
  }
}

// --- formula pieces. Every list reads Events through TO_TEXT so a search for
// "504" and a search for "iep" are the same type; a column that mixes numbers
// and text loses the minority when QUERY reads it.
var EV = "'" + EVENTS_TAB + "'!";
function col_(c) { return EV + '$' + c + '$2:$' + c; }
// The page a view was of, as a reader would name it.
var PAGE_NAME = 'IF(' + col_('E') + '="r2ihome","R2I Practices",IF(' + col_('E') + '="home","Home page",PROPER(TO_TEXT(' + col_('E') + '))))';
var PAGE_LABEL = 'IF(' + col_('F') + '="",' + PAGE_NAME + ',IF(' + col_('G') + '="",TO_TEXT(' + col_('F') + '),' + col_('F') + '&" — "&' + col_('G') + '))';
// A resource by its title where the page sent one, else by its id.
var RES_LABEL = 'IF(' + col_('O') + '="",TO_TEXT(' + col_('H') + '),TO_TEXT(' + col_('O') + '))';

// A two-column "name, count" list: `label` is grouped by `key` and counted
// where `where` holds. Col1 = key, Col2 = label, Col3 = event, Col4 = results.
function listFormula_(key, label, where, limit) {
  // Col3 and Col4 are forced to one type each (text, number) so the query is
  // valid even before the first search or the first event exists. IFNA, not
  // IFERROR: an empty list shows nothing, but a broken formula stays visible.
  return '=IFNA(ARRAYFORMULA(QUERY({TO_TEXT(' + key + '),' + label + ',TO_TEXT(' + col_('C') + '),IF(' + col_('J') + '="",-1,' + col_('J') + ')},' +
    '"select max(Col2), count(Col3) where ' + where + " and Col1 is not null and Col1 != '' " +
    'group by Col1 order by count(Col3) desc' + (limit ? ' limit ' + limit : '') +
    " label max(Col2) '', count(Col3) ''\",0)),\"\")";
}
var LISTS = [
  { title: 'Most-viewed pages', unit: 'views', note: 'Which toolkit and module pages people look at.',
    key: PAGE_LABEL, label: PAGE_LABEL, where: "Col3 = 'view'" },
  { title: 'Most-opened resources', unit: 'opens', note: 'Download, Open or Watch was pressed.',
    key: col_('H'), label: RES_LABEL, where: "Col3 = 'open'" },
  { title: 'What people search for', unit: 'times', note: 'The words typed into Search.',
    key: col_('I'), label: 'TO_TEXT(' + col_('I') + ')', where: "Col3 = 'search'" },
  { title: 'Searches that found nothing', unit: 'times', note: 'People looked for this and the site had no answer. Worth reading first.',
    key: col_('I'), label: 'TO_TEXT(' + col_('I') + ')', where: "Col3 = 'search' and Col4 = 0" },
  { title: 'Where visitors come from', unit: 'visits', note: 'The site that linked here. Blank means typed, bookmarked or emailed.',
    key: col_('L'), label: 'TO_TEXT(' + col_('L') + ')', where: "Col3 != ''" }
];

function heading_(sh, row, col, width, text) {
  sh.getRange(row, col, 1, width).setBackground(NAVY).setFontColor('#ffffff').setFontWeight('bold');
  sh.getRange(row, col).setValue(text);
}
function note_(sh, row, col, width, text) {
  sh.getRange(row, col, 1, width).merge().setValue(text).setFontColor(GREY).setFontSize(9).setWrap(true).setVerticalAlignment('top');
}
function listBlock_(sh, row, col, L, limit) {
  heading_(sh, row, col, 2, L.title);
  sh.getRange(row, col + 1).setValue(L.unit).setHorizontalAlignment('right');
  note_(sh, row + 1, col, 2, L.note);
  sh.getRange(row + 2, col).setFormula(listFormula_(L.key, L.label, L.where, limit));
  if (limit) sh.getRange(row + 2, col, limit, 2).setBorder(null, null, true, null, null, true, LINE, SpreadsheetApp.BorderStyle.SOLID);
}

function buildDashboard_(sh) {
  sh.setHiddenGridlines(true);
  [300, 110, 110, 30, 260, 110, 150].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.getRange('A:G').setFontFamily('Arial').setFontSize(10).setVerticalAlignment('middle');

  sh.getRange('A1:G1').merge().setValue('Research to Impact — who is using the site')
    .setFontSize(18).setFontWeight('bold').setFontColor(NAVY);
  sh.getRange('A2:G2').merge()
    .setValue('Anonymous counts from researchtoimpact.marshall.org. Updates by itself as people visit. No names, emails or cookies are involved.')
    .setFontColor(GREY).setWrap(true);
  sh.setRowHeight(1, 40); sh.setRowHeight(2, 34);

  // ---- key numbers
  heading_(sh, 4, 1, 3, 'Key numbers');
  sh.getRange('B4').setValue('All time').setHorizontalAlignment('right');
  sh.getRange('C4').setValue('Last 30 days').setHorizontalAlignment('right');
  var T = col_('A'), E = col_('C'), since = '">="&(TODAY()-30)';
  var count = function (ev, extra) { return '=COUNTIFS(' + E + ',"' + ev + '"' + (extra || '') + ')'; };
  var recent = function (ev, extra) { return '=COUNTIFS(' + E + ',"' + ev + '",' + T + ',' + since + (extra || '') + ')'; };
  var zero = ',' + col_('J') + ',0';
  var keys = [
    ['Visits', '=COUNTUNIQUE(' + col_('D') + ')', '=COUNTUNIQUEIFS(' + col_('D') + ',' + T + ',' + since + ')'],
    ['Pages viewed', count('view'), recent('view')],
    ['Resources opened', count('open'), recent('open')],
    ['Searches', count('search'), recent('search')],
    ['Searches that found nothing', count('search', zero), recent('search', zero)],
    ['Emails given', count('email'), recent('email')]
  ];
  keys.forEach(function (k, i) {
    var r = 5 + i;
    sh.getRange(r, 1).setValue(k[0]);
    sh.getRange(r, 2).setFormula(k[1]);
    sh.getRange(r, 3).setFormula(k[2]);
    sh.setRowHeight(r, 30);
  });
  sh.getRange(5, 1, keys.length, 1).setFontSize(11);
  sh.getRange(5, 2, keys.length, 2).setFontSize(14).setFontWeight('bold').setFontColor(NAVY).setNumberFormat('#,##0').setHorizontalAlignment('right');
  sh.getRange(5, 1, keys.length, 3).setBorder(null, null, true, null, null, true, LINE, SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(5, 1, 1, 3).setBackground(PALE);

  // ---- what the words mean
  heading_(sh, 12, 1, 3, 'What the words mean');
  var words = [
    'Visit — one person opening the site once. Coming back later counts as a new visit, because nobody is tracked between visits.',
    'Pages viewed — every toolkit, module or other page shown during those visits.',
    'Resources opened — someone pressed Download, Open or Watch. It shows interest; it cannot show whether they read it.',
    'Emails given — someone chose to leave an email to get a resource. The address itself is in HubSpot, not here.'
  ];
  words.forEach(function (w, i) { note_(sh, 13 + i, 1, 3, w); sh.setRowHeight(13 + i, 32); });

  // ---- month by month (the last 12 calendar months, oldest first)
  heading_(sh, 4, 5, 3, 'Month by month');
  sh.getRange('E5:G5').setValues([['Month', 'Visits', 'Resources opened']]).setFontWeight('bold').setFontColor(GREY);
  sh.getRange('F5:G5').setHorizontalAlignment('right');
  for (var k = 11; k >= 0; k--) {
    var r = 6 + (11 - k);
    var from = '(EOMONTH(TODAY(),' + (-k - 1) + ')+1)', to = '(EOMONTH(TODAY(),' + (-k) + ')+1)';
    sh.getRange(r, 5).setFormula('=TEXT(' + from + ',"mmm yyyy")');
    sh.getRange(r, 6).setFormula('=COUNTUNIQUEIFS(' + col_('D') + ',' + T + ',">="&' + from + ',' + T + ',"<"&' + to + ')');
    sh.getRange(r, 7).setFormula('=COUNTIFS(' + E + ',"open",' + T + ',">="&' + from + ',' + T + ',"<"&' + to + ')');
  }
  sh.getRange('F6:G17').setNumberFormat('#,##0').setHorizontalAlignment('right');
  sh.getRange('E6:G17').setBorder(null, null, true, null, null, true, LINE, SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange('E17:G17').setFontWeight('bold');   // the current month

  // ---- chart
  var chart = sh.newChart().setChartType(Charts.ChartType.COLUMN)
    .addRange(sh.getRange('E5:G17')).setNumHeaders(1)
    .setPosition(19, 1, 0, 0)
    .setOption('title', 'Visits and resources opened, by month')
    .setOption('width', 1070).setOption('height', 330)
    .setOption('colors', [NAVY, ORANGE])
    .setOption('legend', { position: 'top' })
    .setOption('vAxis', { minValue: 0, format: '#,##0' })
    .build();
  sh.insertChart(chart);

  // ---- top-ten lists, two across. Each block is 13 rows: heading, note, ten rows, gap.
  var top = 37;
  LISTS.forEach(function (L, i) {
    listBlock_(sh, top + Math.floor(i / 2) * 13, i % 2 ? 5 : 1, L, 10);
  });

  // ---- devices, in the free slot beside the last list
  var dr = top + 2 * 13;
  heading_(sh, dr, 5, 2, 'Phone, tablet or computer');
  sh.getRange(dr, 6).setValue('visits').setHorizontalAlignment('right');
  note_(sh, dr + 1, 5, 2, 'What people were using, judged by screen width.');
  [['Computer', 'desktop'], ['Tablet', 'tablet'], ['Phone', 'phone']].forEach(function (d, i) {
    sh.getRange(dr + 2 + i, 5).setValue(d[0]);
    sh.getRange(dr + 2 + i, 6).setFormula('=COUNTUNIQUEIFS(' + col_('D') + ',' + col_('N') + ',"' + d[1] + '")');
  });
  sh.getRange(dr + 2, 5, 3, 2).setBorder(null, null, true, null, null, true, LINE, SpreadsheetApp.BorderStyle.SOLID);

  sh.getRange(top, 2, 40, 2).setHorizontalAlignment('right');
  sh.getRange(top, 6, 40, 2).setHorizontalAlignment('right');
  note_(sh, dr + 13, 1, 7, 'Each list shows the top ten. The "' + LISTS_TAB + '" tab has every row, and "' + EVENTS_TAB + '" is the raw log. To rebuild this page: R2I Analytics menu → Set up (or repair) the tabs.');
  sh.setFrozenRows(2);
}

// The same five lists with no top-ten limit, side by side.
function buildLists_(sh) {
  sh.getRange('A1').setValue('Full lists').setFontSize(14).setFontWeight('bold').setFontColor(NAVY);
  sh.getRange('A2').setValue('Every row behind the Dashboard\'s top-ten lists, most first.').setFontColor(GREY);
  LISTS.forEach(function (L, i) {
    var c = 1 + i * 3;
    sh.setColumnWidth(c, 320); sh.setColumnWidth(c + 1, 80); sh.setColumnWidth(c + 2, 30);
    listBlock_(sh, 4, c, L, 0);
    sh.getRange(4, c + 1, sh.getMaxRows() - 3, 1).setHorizontalAlignment('right');
  });
  sh.setRowHeight(5, 44);
  sh.setFrozenRows(5);
}
