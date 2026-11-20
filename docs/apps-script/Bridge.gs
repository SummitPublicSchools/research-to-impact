/**
 * R2I Sheet Bridge — a narrow, audited write endpoint for the master sheet.
 *
 * WHY THIS EXISTS
 *   An AI session can read this sheet (the build pulls it as CSV) but cannot write
 *   to it: there is no Sheets write capability available to it. This container-bound
 *   script exposes a deliberately small set of operations over HTTPS so routine,
 *   mechanical edits — flipping `published`, fixing a `summary`, adding a missing
 *   `Modules` row — can be applied without a person retyping them.
 *
 * WHAT IT DELIBERATELY WILL NOT DO
 *   - It will not touch the `Files` tab (PublishFiles.gs owns that).
 *   - It will not change any `id`. Ids are permanent: they bind a row to its Drive
 *     file and its public deep link. Renaming one breaks both.
 *   - It will not write arbitrary ranges, formulas, or columns. Only the columns in
 *     ALLOWED_COLUMNS, only on the tabs in ALLOWED_TABS.
 *   - It will not delete rows.
 *   - It will not run without a token that matches the one in Script Properties.
 *
 * EVERY CHANGE IS LOGGED to a `BridgeLog` tab with a timestamp, the operation, and
 * the before and after values, so the team can see exactly what changed and undo it.
 *
 * SETUP: see docs/sheet-bridge.md. Revoke at any time by deleting the deployment
 * (Deploy -> Manage deployments -> Archive) or clearing the token property.
 */

// ---------------------------------------------------------------- configuration

var TOKEN_PROPERTY = 'R2I_BRIDGE_TOKEN';
var LOG_TAB = 'BridgeLog';
var MAX_OPS = 60;            // refuse oversized batches
// Bump this whenever this file changes, and re-paste it into the Apps Script
// editor. `tools/sheet.js ping` reports the version the sheet is actually
// running, which is the only way to tell a stale copy from a current one.
// 1.1.0 — append may write a tab's own key column (so new Site settings can be
//         created), and refuses a row that has no key at all.
// 1.2.0 — module_image is writable. The column was added to the Modules tab on
//         19 Nov so module pages can carry a photo; without this the bridge
//         refuses it and the 34 rows have to be filled by hand.
var BRIDGE_VERSION = '1.2.0';

// Tabs the bridge may write to. `Files` is intentionally absent.
var ALLOWED_TABS = [
  'Site', 'Sections', 'Modules',
  'Co-Planning', 'Repeated Reading', 'Routine Data Cycles',
  'Leading Implementation', 'Stories & Spotlights', 'Evidence & Impact',
  'R2I Library', 'Site Assets'
];

// Columns the bridge may write. `id` is absent on purpose.
var ALLOWED_COLUMNS = [
  'published', 'status', 'focal', 'focal_order', 'gated',
  'title', 'summary', 'who_for', 'module', 'format', 'practice',
  'link_url', 'link_type', 'video_url', 'image', 'image_caption',
  'body', 'why_it_works', 'quote', 'overview', 'date_published', 'note',
  // Sections tab
  'section_name', 'header_label', 'tier', 'order', 'nav_visible',
  'landing_intro', 'landing_video', 'header_image',
  // Modules tab
  'section', 'module_order', 'module_name', 'module_video', 'module_image',
  // Site tab is key/value
  'value'
];

// Columns gviz can mis-type if they are not plain text. See the project guide:
// a stray non-TRUE/FALSE cell in a boolean-looking column makes gviz drop values
// on read, which once caused a phantom "Coming soon" bug.
var TEXT_FORCED_COLUMNS = ['published', 'focal', 'gated', 'overview'];

// ---------------------------------------------------------------- entry points

function doGet(e) {
  try {
    requireToken_(e && e.parameter ? e.parameter.token : '');
    return json_({
      ok: true,
      bridge: BRIDGE_VERSION,
      spreadsheet: SpreadsheetApp.getActiveSpreadsheet().getName(),
      tabs: SpreadsheetApp.getActiveSpreadsheet().getSheets().map(function (s) { return s.getName(); }),
      allowedTabs: ALLOWED_TABS,
      allowedColumns: ALLOWED_COLUMNS
    });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  var lock = LockService.getDocumentLock();
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    requireToken_(body.token);

    var ops = body.ops;
    if (!Array.isArray(ops)) throw new Error('Body must contain an "ops" array.');
    if (!ops.length) throw new Error('No operations supplied.');
    if (ops.length > MAX_OPS) throw new Error('Too many operations (' + ops.length + '); max is ' + MAX_OPS + '.');

    var dryRun = body.dryRun === true;

    // Serialise writers so two sessions cannot interleave edits.
    if (!lock.tryLock(20000)) throw new Error('The sheet is busy (another write is in progress). Try again.');

    var results = ops.map(function (op, i) {
      try {
        return applyOp_(op, dryRun, i);
      } catch (err) {
        return { index: i, ok: false, error: String(err.message || err), op: op };
      }
    });

    var applied = results.filter(function (r) { return r.ok && r.changed; }).length;
    var failed = results.filter(function (r) { return !r.ok; }).length;

    if (!dryRun && applied) SpreadsheetApp.flush();

    return json_({
      ok: failed === 0,
      dryRun: dryRun,
      applied: applied,
      unchanged: results.filter(function (r) { return r.ok && !r.changed; }).length,
      failed: failed,
      results: results
    });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

// ---------------------------------------------------------------- operations

function applyOp_(op, dryRun, index) {
  var kind = String(op.op || '').toLowerCase();
  if (kind === 'get') return opGet_(op, index);
  if (kind === 'set') return opSet_(op, dryRun, index);
  if (kind === 'append') return opAppend_(op, dryRun, index);
  throw new Error('Unknown op "' + op.op + '". Use get, set or append.');
}

function opGet_(op, index) {
  var ctx = locate_(op);
  var out = {};
  ctx.headers.forEach(function (h, i) { if (h) out[h] = ctx.values[i]; });
  return { index: index, ok: true, changed: false, op: 'get', tab: ctx.tabName, id: op.id, row: ctx.rowNumber, values: out };
}

function opSet_(op, dryRun, index) {
  var column = String(op.column || '').trim();
  assertAllowedColumn_(column);
  var ctx = locate_(op);

  var col = ctx.headers.indexOf(column);
  if (col < 0) throw new Error('Tab "' + ctx.tabName + '" has no column "' + column + '".');

  var before = ctx.values[col];
  var value = normaliseValue_(column, op.value);

  if (String(before) === String(value)) {
    return { index: index, ok: true, changed: false, op: 'set', tab: ctx.tabName, id: op.id,
             column: column, before: before, after: value, note: 'already set' };
  }

  if (!dryRun) {
    var cell = ctx.sheet.getRange(ctx.rowNumber, col + 1);
    // Force plain text on the columns gviz can mis-type, so TRUE/FALSE stay strings.
    if (TEXT_FORCED_COLUMNS.indexOf(column) >= 0) cell.setNumberFormat('@');
    cell.setValue(value);

    // Read the cell back before claiming success. A column carrying a
    // "reject input" dropdown (Guardrails.gs applies these from the Lists tab)
    // silently discards a value that is not in its list — setValue does not
    // throw — so without this check the bridge reports writes that never
    // happened. Observed on the `module` column.
    SpreadsheetApp.flush();
    var readBack = cell.getValue();
    if (String(readBack).trim() !== String(value).trim()) {
      var rule = cell.getDataValidation();
      var allowed = '';
      if (rule) {
        try {
          var vals = rule.getCriteriaValues();
          if (vals && vals.length && vals[0] && vals[0].getValues) {
            allowed = ' Allowed here: ' + vals[0].getValues()
              .map(function (r) { return String(r[0]).trim(); })
              .filter(Boolean).join(' | ') + '.';
          }
        } catch (ignored) {}
      }
      throw new Error('Wrote "' + value + '" to ' + column + ' but the cell still reads "' +
        readBack + '".' + (rule ? ' That column has a dropdown that rejects values outside its list.' + allowed
                                : ' The cell may be protected or driven by a formula.'));
    }

    logChange_(ctx.tabName, op.id, column, before, value);
  }

  return { index: index, ok: true, changed: true, op: 'set', tab: ctx.tabName, id: op.id,
           column: column, before: before, after: value, row: ctx.rowNumber };
}

function opAppend_(op, dryRun, index) {
  var tabName = assertAllowedTab_(op.tab);
  var sheet = sheetByName_(tabName);
  var row = op.row || {};
  var keys = Object.keys(row);
  if (!keys.length) throw new Error('append needs a "row" object.');
  // A new row may carry this tab's own key column — see assertAllowedColumn_.
  // Without it an appended Site row has a blank `setting` and the build cannot
  // see it at all.
  var keyColumn = keyColumnFor_(tabName);
  keys.forEach(function (k) { assertAllowedColumn_(k, keyColumn); });
  if (keys.indexOf(keyColumn) < 0) {
    throw new Error('append to "' + tabName + '" needs a "' + keyColumn + '" — a row without one is invisible to the build.');
  }

  var headers = headerRow_(sheet);
  keys.forEach(function (k) {
    if (headers.indexOf(k) < 0) throw new Error('Tab "' + tabName + '" has no column "' + k + '".');
  });

  var line = headers.map(function (h) {
    return h && Object.prototype.hasOwnProperty.call(row, h) ? normaliseValue_(h, row[h]) : '';
  });

  if (!dryRun) {
    sheet.appendRow(line);
    var written = sheet.getLastRow();
    headers.forEach(function (h, i) {
      if (h && TEXT_FORCED_COLUMNS.indexOf(h) >= 0) sheet.getRange(written, i + 1).setNumberFormat('@');
    });
    logChange_(tabName, '(new row ' + written + ')', keys.join(','), '', JSON.stringify(row));
  }

  return { index: index, ok: true, changed: true, op: 'append', tab: tabName, row: line, appended: !dryRun };
}

// ---------------------------------------------------------------- helpers

function requireToken_(supplied) {
  var expected = PropertiesService.getScriptProperties().getProperty(TOKEN_PROPERTY);
  if (!expected) throw new Error('Bridge is not configured: set the ' + TOKEN_PROPERTY + ' script property.');
  var a = String(supplied || ''), b = String(expected);
  if (a.length !== b.length) throw new Error('Unauthorised.');
  var diff = 0;
  for (var i = 0; i < b.length; i++) diff |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  if (diff !== 0) throw new Error('Unauthorised.');
}

function assertAllowedTab_(tab) {
  var name = String(tab || '').trim();
  if (!name) throw new Error('No tab given.');
  if (ALLOWED_TABS.indexOf(name) < 0) {
    throw new Error('Tab "' + name + '" is not writable through the bridge.');
  }
  return name;
}

/**
 * The column that identifies a row on each tab. Resource tabs key on `id`.
 */
function keyColumnFor_(tabName) {
  return (tabName === 'Site') ? 'setting'
       : (tabName === 'Sections') ? 'section_id'
       : (tabName === 'Modules') ? 'module_name'
       : 'id';
}

/**
 * `allowKeyColumn` is passed ONLY by append, and only for the tab's own key
 * column. A new row is useless without its key — a Site row with a blank
 * `setting` is invisible to the build — but the same permission on `set` would
 * let the bridge RENAME an existing key, and renaming e.g. `hero_headline`
 * would silently empty a part of the page. So appending a key is allowed and
 * changing one is not. `id` stays refused either way: resource ids bind a row
 * to its Drive file and its public deep link, so they are never written here.
 */
function assertAllowedColumn_(column, allowKeyColumn) {
  var c = String(column || '').trim();
  if (!c) throw new Error('No column given.');
  if (c.toLowerCase() === 'id') {
    throw new Error(allowKeyColumn === 'id'
      ? 'Refusing to write an id. A resource row has to be created in the sheet by a person, ' +
        'because its id also names its file in the Drive "01 - Published" folder.'
      : 'Refusing to change an id. Ids are permanent — they bind a row to its file and its public link.');
  }
  if (allowKeyColumn && c === allowKeyColumn) return c;
  if (ALLOWED_COLUMNS.indexOf(c) < 0) {
    throw new Error('Column "' + c + '" is not writable through the bridge.' +
      (allowKeyColumn ? '' : ' (A tab\'s key column can be written by append, but never changed by set.)'));
  }
  return c;
}

function sheetByName_(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('No tab named "' + name + '" in this spreadsheet.');
  return sheet;
}

function headerRow_(sheet) {
  var last = sheet.getLastColumn();
  if (!last) return [];
  return sheet.getRange(1, 1, 1, last).getValues()[0].map(function (h) { return String(h).trim(); });
}

/**
 * Find a row by its `id` (or by `setting` on the key/value Site tab).
 *
 * The Modules tab needs two keys, not one: module names repeat across sections
 * ("Overview", "Enabling Conditions" and five others each appear in all three
 * toolkits), so `module_name` alone is ambiguous for most module rows. For that
 * tab the caller must also pass `section`.
 */
function locate_(op) {
  var tabName = assertAllowedTab_(op.tab);
  var sheet = sheetByName_(tabName);
  var headers = headerRow_(sheet);
  var keyColumn = keyColumnFor_(tabName);
  var keyIndex = headers.indexOf(keyColumn);
  if (keyIndex < 0) throw new Error('Tab "' + tabName + '" has no "' + keyColumn + '" column.');

  var wanted = String(op.id || '').trim();
  if (!wanted) throw new Error('No id given.');

  // Second key for Modules.
  var secIndex = -1, wantedSection = '';
  if (tabName === 'Modules') {
    wantedSection = String(op.section || '').trim();
    if (!wantedSection) {
      throw new Error('Modules rows need a "section" as well as a "module_name" — ' +
        'module names repeat across sections, so the name alone is ambiguous.');
    }
    secIndex = headers.indexOf('section');
    if (secIndex < 0) throw new Error('Modules tab has no "section" column.');
  }

  var rows = sheet.getLastRow();
  if (rows < 2) throw new Error('Tab "' + tabName + '" has no data rows.');
  var width = Math.max(headers.length, 1);
  var grid = sheet.getRange(2, 1, rows - 1, width).getValues();

  var matches = [];
  for (var i = 0; i < grid.length; i++) {
    if (String(grid[i][keyIndex]).trim() !== wanted) continue;
    if (secIndex >= 0 && String(grid[i][secIndex]).trim() !== wantedSection) continue;
    matches.push(i + 2);
  }
  var label = wanted + (wantedSection ? '" in section "' + wantedSection : '');
  if (!matches.length) throw new Error('No row on "' + tabName + '" with ' + keyColumn + ' "' + label + '".');
  if (matches.length > 1) throw new Error('Ambiguous: ' + matches.length + ' rows on "' + tabName + '" have ' + keyColumn + ' "' + label + '" (rows ' + matches.join(', ') + '). Fix the duplicate first.');

  var rowNumber = matches[0];
  return {
    tabName: tabName, sheet: sheet, headers: headers, rowNumber: rowNumber,
    values: sheet.getRange(rowNumber, 1, 1, Math.max(headers.length, 1)).getValues()[0]
  };
}

/** Keep booleans as the plain-text TRUE/FALSE the build expects; never write a formula. */
function normaliseValue_(column, value) {
  if (value === null || value === undefined) return '';
  var s = String(value);
  if (TEXT_FORCED_COLUMNS.indexOf(column) >= 0) {
    var up = s.trim().toUpperCase();
    if (up === 'TRUE' || up === 'FALSE') return up;
    if (up === '') return '';
    throw new Error('Column "' + column + '" must be TRUE or FALSE (got "' + s + '").');
  }
  // A leading = / + / - / @ would be read as a formula. Keep it as literal text.
  if (/^[=+\-@]/.test(s)) return "'" + s;
  return s;
}

function logChange_(tab, id, column, before, after) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var log = ss.getSheetByName(LOG_TAB);
    if (!log) {
      log = ss.insertSheet(LOG_TAB);
      log.appendRow(['when (UTC)', 'tab', 'id', 'column', 'before', 'after', 'by']);
      log.setFrozenRows(1);
      // A freshly inserted sheet is not immediately ready: appending a data row
      // right after creating it dropped the before/after values of the very
      // first logged change. Flush so the new sheet exists before we write to it.
      SpreadsheetApp.flush();
    }
    // Write the row explicitly rather than with appendRow, and force text format,
    // so values like "TRUE" or a leading "=" are recorded verbatim.
    var row = log.getLastRow() + 1;
    log.getRange(row, 1, 1, 7).setNumberFormat('@').setValues([[
      new Date().toISOString(), tab, id, column,
      truncate_(before), truncate_(after), 'bridge ' + BRIDGE_VERSION
    ]]);
  } catch (ignored) {
    // Logging must never block a change.
  }
}

function truncate_(v) {
  var s = (v === null || v === undefined) ? '' : String(v);
  return s.length > 500 ? s.slice(0, 500) + '…' : s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Run this once from the Apps Script editor to create a token.
 * It writes the token into Script Properties and shows it once so you can copy it.
 */
function setUpBridgeToken() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  var token = '';
  for (var i = 0; i < 48; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));
  PropertiesService.getScriptProperties().setProperty(TOKEN_PROPERTY, token);
  Logger.log('R2I bridge token (copy this once, then clear the log):\n\n' + token + '\n');
  return token;
}
