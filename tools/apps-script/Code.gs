/**
 * Jadauco — publish the catalogue from inside the spreadsheet.
 *
 * T-27/T-28. Bound to the catalogue sheet. Gives the client a Jadauco menu with a
 * "Publish to website" item, so the whole workflow — photos into Drive, a row in the sheet,
 * publish — happens in Google, and they never open GitHub.
 *
 * Setup: Extensions → Apps Script, paste this in, then run `setUp` once from the editor and
 * approve the permissions it asks for. See doc/sheet/SHEET-SETUP.md.
 */

var REPO = 'cloudalgo/jadauco'; // owner/repo
var EVENT_TYPE = 'sync-catalogue'; // must match repository_dispatch types in the workflow
var DEBOUNCE_MINUTES = 10;

var PROP_TOKEN = 'GITHUB_TOKEN';
var PROP_DIRTY = 'PENDING_CHANGES';
var PROP_LAST = 'LAST_PUBLISHED_AT';

/** Adds the menu. Runs automatically whenever the spreadsheet is opened. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Jadauco')
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

/** Run once from the editor after pasting this in, to grant the permissions it needs. */
function setUp() {
  onOpen();
  Logger.log('Menu created. Now set the token, then turn on automatic publishing if wanted.');
}
