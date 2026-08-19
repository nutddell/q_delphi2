/**
 * Delphi Round 2 survey web app.
 * Serves Index.html and stores each submission as a row in the "Responses"
 * sheet of the spreadsheet this script is bound to.
 */

var SHEET_NAME = 'Responses';
var QUESTION_SHEET_NAME = 'คำถามอ้างอิง';
var STAT_SHEET_NAME = 'สรุปผลสถิติ';
var USERNAME_HEADER = 'username';
var RESPONDENT_PATTERN = /^res(0[1-9]|1[0-9]|2[01])$/;

// Shared passcode gating the /?page=stat statistics page. This is only
// light, obscurity-level protection (no real user accounts in Apps
// Script web apps) — change it before deploying, and don't rely on it
// for anything more sensitive than "keep the 21 respondents from seeing
// aggregate results early."
var STAT_ACCESS_KEY = 'CHANGE_ME_ADMIN_KEY';

function doGet(e) {
  var page = e && e.parameter && e.parameter.page;

  if (page === 'stat') {
    return HtmlService.createHtmlOutputFromFile('Stat')
      .setTitle('สรุปผลสถิติ — เดลฟาย รอบที่ 2')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

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

/**
 * Throws unless `key` matches STAT_ACCESS_KEY. Called at the top of every
 * server function the Stat page uses, so the underlying data is never
 * returned to a client that hasn't supplied the passcode — the page shell
 * itself is public, but its content is not.
 */
function checkStatAccess_(key) {
  if (String(key || '') !== STAT_ACCESS_KEY) {
    throw new Error('รหัสผ่านไม่ถูกต้อง');
  }
}

function round2_(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Linear-interpolation percentile, i.e. the same method as Google
 * Sheets' PERCENTILE.INC/QUARTILE.INC (p=0.5 gives the standard median),
 * so a researcher cross-checking a single item in Sheets sees the same
 * number this returns. `sorted` must already be sorted ascending.
 */
function percentile_(sorted, p) {
  var n = sorted.length;
  if (n === 0) return null;
  if (n === 1) return sorted[0];
  var idx = p * (n - 1);
  var lower = Math.floor(idx);
  var upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  var weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Reads every response row and computes, per item: n, median, Q1, Q3,
 * IQR (Q3-Q1) and mean, plus whether it passes the round's stated
 * criteria (median >= 3.50 and IQR <= 1.50, per the instructions shown
 * on the survey page). Cheap enough (≤21 respondents × 127 items) to
 * recompute on every request rather than caching.
 */
function computeStatistics_() {
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();

  var headers = [];
  var data = [];
  if (lastRow > 0) {
    var lastCol = sheet.getLastColumn();
    headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    if (lastRow > 1) {
      data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    }
  }

  var usernameCol = headers.indexOf(USERNAME_HEADER);
  var seenUsers = {};
  data.forEach(function (row) {
    if (usernameCol === -1) return;
    var u = String(row[usernameCol] || '').trim().toLowerCase();
    if (u) seenUsers[u] = true;
  });

  var items = [];
  SECTIONS.forEach(function (sec) {
    sec.items.forEach(function (item) {
      var col = headers.indexOf(item.code);
      var values = [];
      if (col !== -1) {
        data.forEach(function (row) {
          var raw = row[col];
          var num = typeof raw === 'number' ? raw : parseFloat(raw);
          if (raw !== '' && !isNaN(num)) values.push(num);
        });
      }
      values.sort(function (a, b) { return a - b; });

      var n = values.length;
      var median = n ? percentile_(values, 0.5) : null;
      var q1 = n ? percentile_(values, 0.25) : null;
      var q3 = n ? percentile_(values, 0.75) : null;
      var iqr = (q1 !== null && q3 !== null) ? (q3 - q1) : null;
      var mean = n ? values.reduce(function (s, v) { return s + v; }, 0) / n : null;
      var pass = median !== null && iqr !== null && median >= 3.5 && iqr <= 1.5;

      items.push({
        code: item.code,
        level: item.level,
        sectionKey: sec.key,
        sectionTitle: sec.title,
        text: item.text,
        n: n,
        median: median !== null ? round2_(median) : null,
        q1: q1 !== null ? round2_(q1) : null,
        q3: q3 !== null ? round2_(q3) : null,
        iqr: iqr !== null ? round2_(iqr) : null,
        mean: mean !== null ? round2_(mean) : null,
        pass: pass
      });
    });
  });

  return {
    respondentCount: Object.keys(seenUsers).length,
    totalRespondents: 21,
    items: items,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Called from Stat.html after the researcher enters the passcode.
 */
function getStatistics(key) {
  checkStatAccess_(key);
  return computeStatistics_();
}

/**
 * Called from Stat.html's "บันทึกผลลงชีต" button: snapshots the current
 * statistics into a "สรุปผลสถิติ" sheet tab so the researcher has a
 * dated, permanent record (overwrites the tab's previous content).
 */
function saveStatisticsToSheet(key) {
  checkStatAccess_(key);
  var stats = computeStatistics_();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(STAT_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(STAT_SHEET_NAME);
  sheet.clearContents();

  var rows = [[
    'ลำดับ', 'รหัสข้อ', 'หมวด/ด้าน', 'ระดับ', 'รายการข้อคำถาม',
    'จำนวนผู้ตอบ (n)', 'มัธยฐาน (Median)', 'Q1', 'Q3', 'IQR (Q3-Q1)',
    'ค่าเฉลี่ย (Mean)', 'ผลการพิจารณา'
  ]];
  stats.items.forEach(function (item, idx) {
    rows.push([
      idx + 1,
      item.code,
      item.sectionTitle,
      item.level === 'main' ? 'หลัก' : 'ย่อย',
      item.text,
      item.n,
      item.median,
      item.q1,
      item.q3,
      item.iqr,
      item.mean,
      item.pass ? 'ผ่านเกณฑ์' : 'ไม่ผ่านเกณฑ์'
    ]);
  });

  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, rows[0].length);

  return {
    status: 'ok',
    savedAt: new Date().toISOString(),
    respondentCount: stats.respondentCount
  };
}
