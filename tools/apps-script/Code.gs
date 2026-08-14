/**
 * Jadauco — publish the catalogue from inside the spreadsheet.
 *
 * T-27/T-28. Bound to the catalogue sheet. Gives the client a Jadauco menu with a
 * "Publish to website" item, so the whole workflow — photos into Drive, a row in the sheet,
 * publish — happens in Google, and they never open GitHub.
 *
 * One file, deliberately. It was briefly two, and the second one not being pasted is exactly
 * how you get "Script function not found: checkCatalogue" — a setup step that can be forgotten
 * is a setup step that will be.
 *
 * Setup: Extensions → Apps Script, paste this in, then run `setUp` once from the editor and
 * approve the permissions it asks for. See doc/sheet/SHEET-SETUP.md.
 */

var REPO = 'jadauco-jewels/jadauco'; // owner/repo
var EVENT_TYPE = 'sync-catalogue'; // must match repository_dispatch types in the workflow
var DEBOUNCE_MINUTES = 10;

var PROP_TOKEN = 'GITHUB_TOKEN';
var PROP_DIRTY = 'PENDING_CHANGES';
var PROP_LAST = 'LAST_PUBLISHED_AT';

/** Adds the menu. Runs automatically whenever the spreadsheet is opened. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Jadauco')
    .addItem('Check the catalogue', 'checkCatalogue')
    .addItem('Clear the check marks', 'clearCatalogueMarks')
    .addSeparator()
    .addItem('Publish to website', 'publishNow')
    .addSeparator()
    .addItem('Turn on automatic publishing', 'enableAutoPublish')
    .addItem('Turn off automatic publishing', 'disableAutoPublish')
    .addItem('Set the GitHub token…', 'promptForToken')
    .addToUi();
}

/** The button. Asks GitHub to run the sync, and says plainly whether the ask landed. */
function publishNow() {
  var ui = SpreadsheetApp.getUi();
  var token = PropertiesService.getScriptProperties().getProperty(PROP_TOKEN);

  if (!token) {
    ui.alert(
      'Not set up yet',
      'The GitHub token is missing. Choose Jadauco → Set the GitHub token… and paste the ' +
        'token Vikash gave you.',
      ui.ButtonSet.OK
    );
    return;
  }

  var response = dispatch(token, 'button');

  if (response.getResponseCode() === 204) {
    PropertiesService.getScriptProperties().deleteProperty(PROP_DIRTY);
    PropertiesService.getScriptProperties().setProperty(PROP_LAST, new Date().toISOString());
    SpreadsheetApp.getActiveSpreadsheet().toast(
      'Publishing started. Your changes will be on the website in about four minutes. ' +
        'If anything is wrong you will get an email.',
      'Sent to the website',
      12
    );
    return;
  }

  // 401/404 are the same thing from the client's point of view — the token is not working —
  // so the message says what to do rather than what the status code was.
  var message =
    response.getResponseCode() === 401 || response.getResponseCode() === 404
      ? 'GitHub would not accept the token. It may have expired. Ask Vikash for a new one, ' +
        'then choose Jadauco → Set the GitHub token…'
      : 'GitHub answered ' + response.getResponseCode() + '. Try again in a minute; if it ' +
        'keeps happening, send Vikash this message:\n\n' + response.getContentText().slice(0, 400);

  ui.alert('Could not start publishing', message, ui.ButtonSet.OK);
}

/** POST repository_dispatch. Returns the raw response so callers can decide what to say. */
function dispatch(token, source) {
  return UrlFetchApp.fetch('https://api.github.com/repos/' + REPO + '/dispatches', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    payload: JSON.stringify({
      event_type: EVENT_TYPE,
      client_payload: { source: source, at: new Date().toISOString() },
    }),
    muteHttpExceptions: true,
  });
}

/**
 * T-28 — every edit only raises a flag. Publishing itself is left to the timer below.
 *
 * This is the whole point of the debounce: a festival price revision across forty rows (S-2)
 * fires this forty times and must still produce exactly one build.
 */
function onEditHandler() {
  PropertiesService.getScriptProperties().setProperty(PROP_DIRTY, 'yes');
}

/** Runs on a timer. Publishes once if anything changed since the last run, then clears. */
function publishIfPending() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(PROP_DIRTY) !== 'yes') return;

  var token = props.getProperty(PROP_TOKEN);
  if (!token) return;

  var response = dispatch(token, 'auto');
  if (response.getResponseCode() === 204) {
    props.deleteProperty(PROP_DIRTY);
    props.setProperty(PROP_LAST, new Date().toISOString());
  }
  // A failure deliberately leaves the flag set, so the next tick tries again. The daily cron
  // in the workflow is the backstop if the token itself is dead.
}

function enableAutoPublish() {
  disableAutoPublish();

  // An installable onEdit trigger, not the simple onEdit(e) function: only installable
  // triggers may call UrlFetchApp or read Script Properties.
  var sheet = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.newTrigger('onEditHandler').forSpreadsheet(sheet).onEdit().create();
  ScriptApp.newTrigger('publishIfPending').timeBased().everyMinutes(DEBOUNCE_MINUTES).create();

  SpreadsheetApp.getUi().alert(
    'Automatic publishing is on',
    'Changes you make will go to the website by themselves, within about ' +
      DEBOUNCE_MINUTES +
      ' minutes. You can still use Publish to website when you want it sooner.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function disableAutoPublish() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var name = triggers[i].getHandlerFunction();
    if (name === 'onEditHandler' || name === 'publishIfPending') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

/**
 * Store the token. Script Properties are readable only by editors of this script — someone
 * holding the sheet's view-only link cannot see them.
 */
function promptForToken() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.prompt(
    'GitHub token',
    'Paste the token Vikash gave you. It is stored in this spreadsheet only.',
    ui.ButtonSet.OK_CANCEL
  );
  if (answer.getSelectedButton() !== ui.Button.OK) return;

  var token = answer.getResponseText().trim();
  if (!token) return;

  PropertiesService.getScriptProperties().setProperty(PROP_TOKEN, token);
  ui.alert('Saved', 'Try Jadauco → Publish to website now.', ui.ButtonSet.OK);
}

/**
 * Run once from the editor after pasting this in, to grant the permissions it needs.
 *
 * Deliberately does not call `onOpen`. Apps Script works out which permissions to ask for by
 * reading the code, not by watching it run, so any function will do — and `onOpen` builds a menu
 * in a spreadsheet UI that the editor does not have, which leaves "Running script…" on screen
 * with nothing to click. Touching the two services instead both grants the scopes and reports
 * whether they actually work.
 */
function setUp() {
  var name = SpreadsheetApp.getActiveSpreadsheet().getName();
  var files = jadaucoReadDriveFiles();

  Logger.log('Spreadsheet: ' + name);
  Logger.log(
    files === null
      ? 'Drive folder could NOT be read. Check DRIVE_FOLDER_ID, and that the folder is shared.'
      : 'Drive folder: ' + files.length + ' files found.'
  );
  Logger.log('Now reload the spreadsheet — the Jadauco menu appears on open.');
}


// ════════════════════════════════════════════════════════════════════════════════════════════
// CHECKING THE CATALOGUE
//
// Runs the same rules the publish runs, before the publish runs, and points at the exact cell
// that is wrong.
//
// This replaced a formula in a "Check" column. The formula was one unreadable expression that
// Sheets rejected outright, and it could never see the Drive folder — so the three mistakes
// that actually cost a publish (a filename not in Drive, one photo on two products, a photo
// nothing uses) were exactly the ones it could not catch. Apps Script runs as the client, so
// it can list the folder and check all three.
//
// The rules are plain JavaScript with no Apps Script API in them, which is what lets
// `scripts/sheet/validation.test.mjs` load this very file and check it agrees, rule for rule,
// with `scripts/sync/schema.mjs`. A second implementation that silently disagreed with the real
// gate would be worse than no check at all.
// ════════════════════════════════════════════════════════════════════════════════════════════

/** The Drive folder holding the product photos. Must match catalogue.config.json. */
var DRIVE_FOLDER_ID = '1LXjqKtybjcGfG7vHhqdJv2ORRwi2ugIl';

/** The tab the products live on. */
var CATALOGUE_TAB = 'catalogue';

var CATEGORY_CODES = {
  NK: 'Necklaces',
  ER: 'Earrings',
  BG: 'Bangles',
  RG: 'Rings',
  TK: 'Maang tikka',
  PY: 'Payal',
};

var MIN_DESCRIPTION_WORDS = 40;
var MAX_SEO_DESCRIPTION = 160;

// ── the rules ───────────────────────────────────────────────────────────────────────────────
// Pure functions over plain objects. No SpreadsheetApp, no DriveApp — see the header.

function jadaucoWordCount(text) {
  var trimmed = String(text == null ? '' : text).replace(/\s+/g, ' ').replace(/^ | $/g, '');
  return trimmed === '' ? 0 : trimmed.split(' ').length;
}

function jadaucoIsBlank(value) {
  return value === null || value === undefined || String(value) === '';
}

/** A date cell is either a real Date from Sheets or a YYYY-MM-DD string typed by hand. */
function jadaucoIsDate(value) {
  if (value instanceof Date) return !isNaN(value.getTime());
  if (typeof value === 'number') return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value));
}

/**
 * A tick box reads back as a real boolean, but the same column reads back as the *text* "TRUE"
 * for as long as it takes someone to re-apply the tick boxes after a CSV import — which is
 * exactly when they are most likely to run a check. Accept both.
 */
function jadaucoIsTicked(value) {
  return value === true || String(value).toUpperCase() === 'TRUE';
}

function jadaucoIsNumber(value) {
  if (typeof value === 'number') return true;
  if (jadaucoIsBlank(value)) return false;
  return !isNaN(Number(String(value).replace(/[\s,]/g, '')));
}

function jadaucoNumber(value) {
  return Number(String(value).replace(/[\s,]/g, ''));
}

/**
 * Every problem with one row.
 *
 * @param {Object} row       the row, keyed by column header
 * @param {Object} context   { codes: {code: count}, names: {name: count}, driveFiles: [names],
 *                             photoOwners: {filename: [skus]} }
 * @returns {Array} of { column, message }
 */
function jadaucoCheckRow(row, context) {
  var problems = [];
  var add = function (column, message) { problems.push({ column: column, message: message }); };

  var sku = String(row['Product Code'] || '');
  if (sku === '') return problems; // an empty row is not a product

  var status = String(row['Status'] || '').toLowerCase();
  var isDraft = status === 'draft';

  if (!/^JD-[A-Z][A-Z]-[0-9][0-9][0-9]+$/.test(sku)) {
    add('Product Code', 'Product Code "' + sku + '" must look like JD-NK-001 — JD, two capital letters, then at least three digits.');
  } else if (!CATEGORY_CODES[sku.substring(3, 5)]) {
    add('Product Code', 'The letters "' + sku.substring(3, 5) + '" are not a category. Use one of: ' + jadaucoCodeList() + '.');
  }

  if ((context.codes[sku] || 0) > 1) {
    add('Product Code', 'Product Code "' + sku + '" is used on more than one row. Every product needs its own.');
  }

  if (status === '') {
    add('Status', 'Status is empty. Pick live, draft or archived.');
  } else if (status !== 'live' && status !== 'draft' && status !== 'archived') {
    add('Status', 'Status is "' + row['Status'] + '". It must be live, draft or archived.');
  }

  var name = String(row['Product Name'] || '');
  if (name === '') {
    add('Product Name', 'Product Name is empty.');
  } else if (name.length < 3 || name.length > 70) {
    add('Product Name', 'Product Name is ' + name.length + ' characters; it must be between 3 and 70.');
  } else if ((context.names[name.toLowerCase()] || 0) > 1) {
    add('Product Name', 'Another product is also called "' + name + '", so the two pages would want the same web address.');
  }

  if (!jadaucoIsBlank(row['Selling Price']) && !jadaucoIsNumber(row['Selling Price'])) {
    add('Selling Price', 'Selling Price is "' + row['Selling Price'] + '", which is not a number. Type just the digits, or leave it empty for "Price on enquiry".');
  }
  if (!jadaucoIsBlank(row['List Price']) && !jadaucoIsNumber(row['List Price'])) {
    add('List Price', 'List Price is "' + row['List Price'] + '", which is not a number.');
  }
  if (jadaucoIsNumber(row['Selling Price']) && jadaucoIsNumber(row['List Price'])
      && jadaucoNumber(row['List Price']) <= jadaucoNumber(row['Selling Price'])) {
    add('List Price', 'List Price (' + row['List Price'] + ') must be higher than Selling Price (' + row['Selling Price'] + '). It is the crossed-out "was" price.');
  }

  if (jadaucoIsBlank(row['Publish Date'])) {
    add('Publish Date', 'Publish Date is empty. Use YYYY-MM-DD.');
  } else if (!jadaucoIsDate(row['Publish Date'])) {
    add('Publish Date', 'Publish Date is "' + row['Publish Date'] + '", which is not a date. Use YYYY-MM-DD.');
  }

  if (!jadaucoIsBlank(row['Sequence'])) {
    var seq = jadaucoNumber(row['Sequence']);
    if (!jadaucoIsNumber(row['Sequence']) || seq < 1 || Math.floor(seq) !== seq) {
      add('Sequence', 'Sequence is "' + row['Sequence'] + '". It must be a whole number of 1 or more, or empty.');
    }
  }

  var seo = String(row['SEO Description'] || '');
  if (seo.length > MAX_SEO_DESCRIPTION) {
    add('SEO Description', 'SEO Description is ' + seo.length + ' characters; the maximum is ' + MAX_SEO_DESCRIPTION + '.');
  }

  // S-5 — a draft may be half-finished. That is what makes it a draft.
  if (!isDraft) {
    var images = jadaucoSplitList(row['Images']);
    if (images.length === 0) {
      add('Images', 'Images is empty. Add the photo filenames from Drive, or set Status to draft.');
    } else if (context.driveFiles) {
      for (var i = 0; i < images.length; i++) {
        var file = images[i];
        if (context.driveFiles.indexOf(file) !== -1) {
          var owners = context.photoOwners[file] || [];
          if (owners.length > 1) {
            add('Images', '"' + file + '" is also used by ' + jadaucoOthers(owners, sku) + '. Each photo belongs to one product.');
          }
          continue;
        }
        var near = jadaucoNearMiss(file, context.driveFiles);
        add('Images', near
          ? '"' + file + '" is not in Drive, but "' + near + '" is. Filenames must match exactly, capitals included.'
          : '"' + file + '" is not in the Drive folder. Check the spelling, or upload the photo.');
      }
    }

    var count = jadaucoWordCount(row['Description']);
    if (count < MIN_DESCRIPTION_WORDS) {
      add('Description', 'Description is ' + count + ' words; the minimum is ' + MIN_DESCRIPTION_WORDS + '. This is the biggest single thing deciding whether Google finds the page.');
    }
  }

  return problems;
}

function jadaucoOthers(owners, sku) {
  var out = [];
  for (var i = 0; i < owners.length; i++) if (owners[i] !== sku) out.push(owners[i]);
  return out.join(', ');
}

function jadaucoCodeList() {
  var out = [];
  for (var code in CATEGORY_CODES) out.push(code + ' ' + CATEGORY_CODES[code]);
  return out.join(', ');
}

function jadaucoSplitList(value) {
  if (jadaucoIsBlank(value)) return [];
  return String(value).split(',').map(function (s) { return s.replace(/^\s+|\s+$/g, ''); })
    .filter(function (s) { return s !== ''; });
}

/** Case and extension are what people actually get wrong, so name the near miss. */
function jadaucoNearMiss(filename, driveFiles) {
  var lower = filename.toLowerCase();
  for (var i = 0; i < driveFiles.length; i++) {
    if (driveFiles[i].toLowerCase() === lower) return driveFiles[i];
  }
  return null;
}

/** Whole-catalogue checks: the ones a single row cannot see. */
function jadaucoCheckAll(rows, driveFiles) {
  var context = { codes: {}, names: {}, driveFiles: driveFiles || null, photoOwners: {} };

  for (var i = 0; i < rows.length; i++) {
    var sku = String(rows[i]['Product Code'] || '');
    if (sku === '') continue;
    context.codes[sku] = (context.codes[sku] || 0) + 1;

    var name = String(rows[i]['Product Name'] || '').toLowerCase();
    if (name !== '') context.names[name] = (context.names[name] || 0) + 1;

    if (String(rows[i]['Status'] || '').toLowerCase() === 'draft') continue;
    var images = jadaucoSplitList(rows[i]['Images']);
    for (var j = 0; j < images.length; j++) {
      if (!context.photoOwners[images[j]]) context.photoOwners[images[j]] = [];
      if (context.photoOwners[images[j]].indexOf(sku) === -1) context.photoOwners[images[j]].push(sku);
    }
  }

  var results = [];
  var heroes = [];
  for (var k = 0; k < rows.length; k++) {
    var problems = jadaucoCheckRow(rows[k], context);
    if (problems.length) results.push({ row: rows[k].__row, sku: rows[k]['Product Code'], problems: problems });
    if (jadaucoIsTicked(rows[k]['Hero']) && String(rows[k]['Status'] || '').toLowerCase() === 'live') {
      heroes.push(rows[k]['Product Code']);
    }
  }

  var warnings = [];
  if (heroes.length > 1) {
    warnings.push(heroes.length + ' products have Hero ticked (' + heroes.join(', ')
      + '), but the homepage has room for one. ' + heroes[0] + ' would be used.');
  }
  if (driveFiles) {
    var unused = [];
    for (var f = 0; f < driveFiles.length; f++) {
      if (!context.photoOwners[driveFiles[f]]) unused.push(driveFiles[f]);
    }
    if (unused.length) {
      warnings.push(unused.length + ' photo' + (unused.length === 1 ? ' is' : 's are')
        + ' in Drive but used by no product: ' + unused.slice(0, 6).join(', ')
        + (unused.length > 6 ? ', and ' + (unused.length - 6) + ' more' : '') + '.');
    }
  }

  return { results: results, warnings: warnings };
}

// ── the spreadsheet side ────────────────────────────────────────────────────────────────────

/** Read the catalogue tab into plain objects keyed by header. */
function jadaucoReadCatalogue() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CATALOGUE_TAB);
  if (!sheet) {
    throw new Error('There is no tab called "' + CATALOGUE_TAB + '". Rename the products tab to that.');
  }

  var values = sheet.getDataRange().getValues();
  var headers = values[0];

  // The tick boxes and the Status dropdown are applied to whole columns, and that alone can make
  // Sheets call a thousand rows "data". Without this trim, three products would still be read,
  // built into objects and painted over a thousand rows — all of it work about nothing.
  var lastRow = 0;
  for (var v = values.length - 1; v >= 1; v--) {
    var hasContent = false;
    for (var k = 0; k < values[v].length; k++) {
      if (String(values[v][k]) !== '') { hasContent = true; break; }
    }
    if (hasContent) { lastRow = v; break; }
  }

  var trimmedHeaders = [];
  for (var h = 0; h < headers.length; h++) trimmedHeaders.push(String(headers[h]).replace(/^\s+|\s+$/g, ''));

  var rows = [];
  for (var r = 1; r <= lastRow; r++) {
    var row = { __row: r + 1 };
    for (var c = 0; c < trimmedHeaders.length; c++) row[trimmedHeaders[c]] = values[r][c];
    rows.push(row);
  }
  return { sheet: sheet, headers: trimmedHeaders, rows: rows };
}

/** Filenames in the Drive folder. Returns null if the folder cannot be read, rather than lying. */
function jadaucoReadDriveFiles() {
  try {
    var files = DriveApp.getFolderById(DRIVE_FOLDER_ID).getFiles();
    var names = [];
    while (files.hasNext()) names.push(files.next().getName());
    return names;
  } catch (err) {
    return null;
  }
}

/**
 * The menu item. Highlights every cell at fault, puts the reason in the cell's note, and shows a
 * summary. Clears its own previous marks first, so a fixed row stops being red.
 */
function checkCatalogue() {
  var data = jadaucoReadCatalogue();
  var driveFiles = jadaucoReadDriveFiles();
  var report = jadaucoCheckAll(data.rows, driveFiles);

  jadaucoPaintMarks(data, report);

  var lines = [];
  if (report.results.length === 0) {
    lines.push('Every row is good. ' + data.rows.length + ' checked.');
  } else {
    lines.push(report.results.length + ' row' + (report.results.length === 1 ? '' : 's')
      + ' need fixing. The cells are marked red — hover one to read why.');
    lines.push('');
    for (var r = 0; r < report.results.length && r < 12; r++) {
      var res = report.results[r];
      lines.push('Row ' + res.row + ' (' + (res.sku || 'no code') + ')');
      for (var q = 0; q < res.problems.length; q++) lines.push('   · ' + res.problems[q].message);
    }
    if (report.results.length > 12) lines.push('… and ' + (report.results.length - 12) + ' more rows.');
  }

  if (driveFiles === null) {
    lines.push('');
    lines.push('Note: the Drive folder could not be read, so photo filenames were not checked. '
      + 'Everything else was.');
  }

  if (report.warnings.length) {
    lines.push('');
    lines.push('Worth a look, but they will not stop a publish:');
    for (var w = 0; w < report.warnings.length; w++) lines.push('   · ' + report.warnings[w]);
  }

  jadaucoTellUser('Catalogue check', lines.join('\n'));
}

/**
 * Show a dialog, or fall back to the log.
 *
 * Run from the Apps Script editor there is no spreadsheet UI to draw a dialog in, and the run
 * sits on "Running script…" forever with only Cancel and Dismiss. Falling back to the log means
 * running it from the wrong place still gives an answer instead of appearing to hang.
 */
function jadaucoTellUser(title, message) {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.alert(title, message, ui.ButtonSet.OK);
  } catch (err) {
    Logger.log(title + '\n\n' + message);
    Logger.log('(Shown here because this was run from the editor. Use the Jadauco menu in the '
      + 'spreadsheet to get it as a dialog.)');
  }
}

function jadaucoColumnIndex(headers, name) {
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).replace(/^\s+|\s+$/g, '') === name) return i;
  }
  return -1;
}

/**
 * Paint every mark in two writes.
 *
 * The obvious version — `cell.setBackground(); cell.setNote();` per problem — is what made this
 * take minutes instead of seconds. Every one of those is a separate round trip to Google, and a
 * catalogue with twenty faults across three columns is a hundred and twenty of them. Building the
 * whole grid in memory and handing it over once costs two calls no matter how big the catalogue
 * gets, and it clears the previous run's marks in the same stroke rather than in two more.
 */
function jadaucoPaintMarks(data, report) {
  var rowCount = data.rows.length;
  var width = data.headers.length;
  if (rowCount < 1 || width < 1) return;

  var byRow = {};
  if (report) {
    for (var i = 0; i < report.results.length; i++) {
      byRow[report.results[i].row] = report.results[i].problems;
    }
  }

  var backgrounds = [];
  var notes = [];
  for (var r = 0; r < rowCount; r++) {
    var bg = [];
    var note = [];
    for (var c = 0; c < width; c++) {
      bg.push(null); // null resets to the sheet's own colour, so the client's bands survive
      note.push('');
    }

    var problems = byRow[data.rows[r].__row];
    if (problems) {
      for (var p = 0; p < problems.length; p++) {
        var colIndex = jadaucoColumnIndex(data.headers, problems[p].column);
        if (colIndex === -1) continue;
        bg[colIndex] = '#f4c7c3';
        // More than one fault can land on one cell, so append rather than overwrite.
        note[colIndex] = note[colIndex] ? note[colIndex] + '\n\n' + problems[p].message : problems[p].message;
      }
    }

    backgrounds.push(bg);
    notes.push(note);
  }

  var range = data.sheet.getRange(2, 1, rowCount, width);
  range.setBackgrounds(backgrounds);
  range.setNotes(notes);
}

/** Clears the red without running a check — the menu's undo. Same two writes, no problems. */
function clearCatalogueMarks() {
  var data = jadaucoReadCatalogue();
  jadaucoPaintMarks(data, null);
  jadaucoTellUser('Jadauco', 'Check marks cleared.');
}
