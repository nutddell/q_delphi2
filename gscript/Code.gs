/**
 * Delphi Round 2 survey web app.
 * Serves Index.html and stores each submission as a row in the "Responses"
 * sheet of the spreadsheet this script is bound to.
 */

var SHEET_NAME = 'Responses';
var QUESTION_SHEET_NAME = 'คำถามอ้างอิง';
var USERNAME_HEADER = 'username';
var RESPONDENT_PATTERN = /^res(0[1-9]|1[0-9]|2[01])$/;

function doGet(e) {
  seedQuestionReferenceIfEmpty_();

  var template = HtmlService.createTemplateFromFile('Index');
  // Escape "</" so the JSON blob can't prematurely close the <script> tag
  // it's embedded in.
  template.sectionsJson = JSON.stringify(SECTIONS).replace(/<\//g, '<\\/');

  return template.evaluate()
    .setTitle('แบบสอบถามเทคนิคเดลฟาย รอบที่ 2')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  return sheet;
}

/**
 * Creates/fills the "คำถามอ้างอิง" sheet the first time the web app is
 * opened, so the researcher has every item code + question text next to
 * the Responses sheet without needing to read Index.html.
 */
function seedQuestionReferenceIfEmpty_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(QUESTION_SHEET_NAME);
  if (sheet && sheet.getLastRow() > 0) return;
  if (!sheet) sheet = ss.insertSheet(QUESTION_SHEET_NAME);
  writeQuestionReference_(sheet);
}

/**
 * Manual entry point: run this from the Apps Script editor (Run menu)
 * after changing Questions.gs to overwrite "คำถามอ้างอิง" with the
 * current question set.
 */
function refreshQuestionReference() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(QUESTION_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(QUESTION_SHEET_NAME);
  sheet.clearContents();
  writeQuestionReference_(sheet);
}

function writeQuestionReference_(sheet) {
  var rows = [['ลำดับ', 'รหัสข้อ', 'หมวด/ด้าน', 'ระดับ', 'รายการข้อคำถาม']];
  var order = 0;
  SECTIONS.forEach(function (sec) {
    sec.items.forEach(function (item) {
      order++;
      rows.push([order, item.code, sec.title, item.level === 'main' ? 'หลัก' : 'ย่อย', item.text]);
    });
  });
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, rows[0].length);
}

/**
 * Validates a respondent code against the res01..res21 pattern used for
 * the 21 experts in this Delphi round, normalizing case/whitespace.
 * Throws if the code doesn't match.
 */
function normalizeUsername_(username) {
  var value = String(username || '').trim().toLowerCase();
  if (!RESPONDENT_PATTERN.test(value)) {
    throw new Error('รหัสผู้เชี่ยวชาญไม่ถูกต้อง กรุณาระบุในรูปแบบ res01 ถึง res21');
  }
  return value;
}

/**
 * Looks up an existing response row for a (already-normalized) username.
 * Returns { timestamp } if found, or null.
 */
function findResponseRowByUsername_(username) {
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var usernameCol = headers.indexOf(USERNAME_HEADER);
  if (usernameCol === -1) return null;
  var timestampCol = headers.indexOf('timestamp');

  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  for (var i = 0; i < data.length; i++) {
    var value = String(data[i][usernameCol] || '').trim().toLowerCase();
    if (value === username) {
      return { timestamp: timestampCol !== -1 ? data[i][timestampCol] : null };
    }
  }
  return null;
}

/**
 * Called from the client's login step via google.script.run, before the
 * survey form is shown, so a respondent who already submitted sees a
 * "already answered" message instead of the form.
 */
function checkRespondentStatus(username) {
  var normalized = normalizeUsername_(username);
  var existing = findResponseRowByUsername_(normalized);
  return {
    alreadySubmitted: !!existing,
    submittedAt: existing && existing.timestamp ? new Date(existing.timestamp).toISOString() : null
  };
}

/**
 * Retrofits a "username" column into a Responses sheet whose header row
 * was already written by a version of this script that predates the
 * login feature. Existing rows keep their data; their username cell is
 * simply left blank since it was never captured at the time. No-op if
 * the column already exists.
 */
function ensureUsernameColumn_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) return;

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (headers.indexOf(USERNAME_HEADER) !== -1) return;

  var timestampCol = headers.indexOf('timestamp');
  if (timestampCol === -1) {
    sheet.insertColumnAfter(lastCol);
    sheet.getRange(1, lastCol + 1).setValue(USERNAME_HEADER);
  } else {
    var insertAt = timestampCol + 2; // 1-indexed column right after timestamp
    sheet.insertColumnBefore(insertAt);
    sheet.getRange(1, insertAt).setValue(USERNAME_HEADER);
  }
}

/**
 * Called from the client via google.script.run.
 * payload = { username: string, headers: string[], answers: { [key]: string } }
 * headers gives the canonical column order (excluding the timestamp and
 * username columns, which this function adds automatically).
 */
function submitSurvey(payload) {
  if (!payload || !Array.isArray(payload.headers) || typeof payload.answers !== 'object') {
    throw new Error('ข้อมูลที่ส่งมาไม่ถูกต้อง');
  }
  var username = normalizeUsername_(payload.username);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getSheet_();
    var hasHeaders = sheet.getLastRow() > 0 &&
      sheet.getRange(1, 1).getValue() !== '';

    if (!hasHeaders) {
      var headerRow = ['timestamp', USERNAME_HEADER].concat(payload.headers);
      sheet.getRange(1, 1, 1, headerRow.length).setValues([headerRow]);
      sheet.setFrozenRows(1);
    } else {
      ensureUsernameColumn_(sheet);
    }

    // Re-check for a duplicate inside the lock: the client-side check at
    // login time is only a UX convenience and can't prevent two
    // concurrent submissions under the same username.
    if (findResponseRowByUsername_(username)) {
      throw new Error('รหัส ' + username + ' เคยตอบแบบสอบถามนี้ไปแล้ว ไม่สามารถส่งซ้ำได้');
    }

    var existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var row = existingHeaders.map(function (header) {
      if (header === 'timestamp') return new Date();
      if (header === USERNAME_HEADER) return username;
      return Object.prototype.hasOwnProperty.call(payload.answers, header)
        ? payload.answers[header]
        : '';
    });

    sheet.appendRow(row);
    return { status: 'ok' };
  } finally {
    lock.releaseLock();
  }
}
