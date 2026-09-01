/**
 * Delphi survey web app (rounds 2 and 3).
 * Serves Index.html (round 2), Round3.html (round 3), Stat.html and
 * StatR3.html (their respective statistics pages), and stores each
 * submission as a row in a per-round sheet of the spreadsheet this
 * script is bound to.
 */

var SHEET_NAME = 'Responses';
var SHEET_NAME_R3 = 'Responses_R3';
var QUESTION_SHEET_NAME = 'คำถามอ้างอิง';
var STAT_SHEET_NAME = 'สรุปผลสถิติ';
var STAT_SHEET_NAME_R3 = 'สรุปผลสถิติ รอบ 3';
var USERNAME_HEADER = 'username';
var RESPONDENT_PATTERN = /^res(0[1-9]|1[0-9]|2[01])$/;

// Shared passcode gating the /?page=stat and /?page=statr3 statistics
// pages. This is only light, obscurity-level protection (no real user
// accounts in Apps Script web apps) — change it before deploying, and
// don't rely on it for anything more sensitive than "keep the 21
// respondents from seeing aggregate results early."
var STAT_ACCESS_KEY = 'CHANGE_ME_ADMIN_KEY';

function doGet(e) {
  var page = e && e.parameter && e.parameter.page;

  if (page === 'stat') {
    return HtmlService.createHtmlOutputFromFile('Stat')
      .setTitle('สรุปผลสถิติ — เดลฟาย รอบที่ 2')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (page === 'statr3') {
    return HtmlService.createHtmlOutputFromFile('StatR3')
      .setTitle('สรุปผลสถิติ — เดลฟาย รอบที่ 3')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (page === 'round3') {
    var r3Template = HtmlService.createTemplateFromFile('Round3');
    r3Template.sectionsJson = JSON.stringify(SECTIONS).replace(/<\//g, '<\\/');
    return r3Template.evaluate()
      .setTitle('แบบสอบถามเทคนิคเดลฟาย รอบที่ 3')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (page === 'printround3') {
    return HtmlService.createHtmlOutputFromFile('PrintRound3')
      .setTitle('พิมพ์แบบสอบถามรอบที่ 3')
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

function getNamedSheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function getSheet_() {
  return getNamedSheet_(SHEET_NAME);
}

function getSheetR3_() {
  return getNamedSheet_(SHEET_NAME_R3);
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
 * Looks up an existing response row for a (already-normalized) username
 * in the given sheet. Returns { timestamp, rowValues, headers } if
 * found, or null. rowValues/headers let callers pull out that
 * respondent's individual answers (see getOwnAnswersMap_).
 */
function findResponseRowInSheetByUsername_(sheet, username) {
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
      return {
        timestamp: timestampCol !== -1 ? data[i][timestampCol] : null,
        headers: headers,
        rowValues: data[i]
      };
    }
  }
  return null;
}

/**
 * Round 2 convenience wrapper kept for the existing round-2 call sites.
 */
function findResponseRowByUsername_(username) {
  var found = findResponseRowInSheetByUsername_(getSheet_(), username);
  return found ? { timestamp: found.timestamp } : null;
}

/**
 * Builds a { itemCode: answerValue } map of one respondent's answers in
 * the given sheet (skipping the timestamp/username columns). Returns {}
 * if that username has no row there.
 */
function getOwnAnswersMap_(sheet, username) {
  var found = findResponseRowInSheetByUsername_(sheet, username);
  if (!found) return {};
  var map = {};
  found.headers.forEach(function (header, idx) {
    if (header === 'timestamp' || header === USERNAME_HEADER) return;
    map[header] = found.rowValues[idx];
  });
  return map;
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
 * Reads a researcher-maintained "explain" column (added by hand next to
 * the auto-generated statistics columns in a สรุปผลสถิติ sheet) and
 * returns { itemCode: explanationText }. Returns {} if that sheet or
 * column doesn't exist yet, or has no รหัสข้อ column to match against.
 */
function getExplanationMap_(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return {};

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return {};

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var explainCol = headers.indexOf('explain');
  var codeCol = headers.indexOf('รหัสข้อ');
  if (explainCol === -1 || codeCol === -1) return {};

  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var map = {};
  data.forEach(function (row) {
    var code = row[codeCol];
    var explain = row[explainCol];
    if (code && explain) map[code] = String(explain).trim();
  });
  return map;
}

/**
 * Round 3 login step: blocks a respondent who already submitted round 3
 * the same way checkRespondentStatus does for round 2, but otherwise
 * returns their own round-2 answers plus the round-2 group median/IQR
 * per item, so Round3.html can pre-fill each question with their prior
 * answer and show it alongside the group's consensus stats.
 */
function checkRound3Status(username) {
  var normalized = normalizeUsername_(username);

  var r3Sheet = getSheetR3_();
  var existingR3 = findResponseRowInSheetByUsername_(r3Sheet, normalized);
  if (existingR3) {
    return {
      alreadySubmitted: true,
      submittedAt: existingR3.timestamp ? new Date(existingR3.timestamp).toISOString() : null
    };
  }

  var r2Sheet = getSheet_();
  var ownAnswers = getOwnAnswersMap_(r2Sheet, normalized);
  var r2Stats = computeStatisticsForSheet_(r2Sheet);
  var explainMap = getExplanationMap_(STAT_SHEET_NAME);
  var groupStats = {};
  r2Stats.items.forEach(function (item) {
    groupStats[item.code] = {
      n: item.n,
      median: item.median,
      q1: item.q1,
      q3: item.q3,
      iqr: item.iqr,
      pass: item.pass,
      explain: explainMap[item.code] || ''
    };
  });

  return {
    alreadySubmitted: false,
    ownAnswers: ownAnswers,
    groupStats: groupStats
  };
}

/**
 * Called from PrintRound3.html after the researcher enters the admin
 * passcode and a respondent's username: builds the same per-item data
 * checkRound3Status would (own round-2 answer, round-2 group median/
 * Q1/Q3/IQR/pass, and the researcher's "explain" note if any) as a flat
 * list ready to lay out on a printable A4 page — for the respondents
 * who'd rather mark a paper form by hand than use the web app.
 * Requires STAT_ACCESS_KEY since it exposes one respondent's own answers
 * plus the group's aggregate stats, same sensitivity as the Stat pages.
 */
function getPrintRound3Data(key, username) {
  checkStatAccess_(key);
  var normalized = normalizeUsername_(username);

  var r2Sheet = getSheet_();
  var ownAnswers = getOwnAnswersMap_(r2Sheet, normalized);
  var r2Stats = computeStatisticsForSheet_(r2Sheet);
  var explainMap = getExplanationMap_(STAT_SHEET_NAME);

  var items = r2Stats.items.map(function (item) {
    return {
      code: item.code,
      level: item.level,
      sectionKey: item.sectionKey,
      sectionTitle: item.sectionTitle,
      text: item.text,
      n: item.n,
      median: item.median,
      q1: item.q1,
      q3: item.q3,
      iqr: item.iqr,
      pass: item.pass,
      explain: explainMap[item.code] || '',
      ownAnswer: Object.prototype.hasOwnProperty.call(ownAnswers, item.code) ? ownAnswers[item.code] : ''
    };
  });

  return {
    username: normalized,
    items: items,
    generatedAt: new Date().toISOString()
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
 * Shared row-append logic for both rounds' submit endpoints: writes the
 * header row on first use (or retrofits the username column into an
 * older header row), re-checks for a duplicate username inside the
 * caller's lock, then appends the answer row. Throws on a duplicate.
 */
function appendSurveyRow_(sheet, username, payload, duplicateMessage) {
  var hasHeaders = sheet.getLastRow() > 0 &&
    sheet.getRange(1, 1).getValue() !== '';

  if (!hasHeaders) {
    var headerRow = ['timestamp', USERNAME_HEADER].concat(payload.headers);
    sheet.getRange(1, 1, 1, headerRow.length).setValues([headerRow]);
    sheet.setFrozenRows(1);
  } else {
    ensureUsernameColumn_(sheet);
  }

  if (findResponseRowInSheetByUsername_(sheet, username)) {
    throw new Error(duplicateMessage);
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
    appendSurveyRow_(
      getSheet_(),
      username,
      payload,
      'รหัส ' + username + ' เคยตอบแบบสอบถามนี้ไปแล้ว ไม่สามารถส่งซ้ำได้'
    );
    return { status: 'ok' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Round 3 counterpart of submitSurvey(), writing to the separate
 * Responses_R3 sheet instead of Responses so round-2 data is never
 * touched.
 */
function submitRound3Survey(payload) {
  if (!payload || !Array.isArray(payload.headers) || typeof payload.answers !== 'object') {
    throw new Error('ข้อมูลที่ส่งมาไม่ถูกต้อง');
  }
  var username = normalizeUsername_(payload.username);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    appendSurveyRow_(
      getSheetR3_(),
      username,
      payload,
      'รหัส ' + username + ' เคยตอบแบบสอบถามรอบที่ 3 นี้ไปแล้ว ไม่สามารถส่งซ้ำได้'
    );
    return { status: 'ok' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Throws unless `key` matches STAT_ACCESS_KEY. Called at the top of every
 * server function the Stat pages use, so the underlying data is never
 * returned to a client that hasn't supplied the passcode — the page shell
 * itself is public, but its content is not.
 */
function checkStatAccess_(key) {
  if (String(key || '') !== STAT_ACCESS_KEY) {
    throw new Error('รหัสผ่านไม่ถูกต้อง');
  }
}

function roundTo2_(n) {
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
 * Reads every response row of the given sheet and computes, per item:
 * n, median, Q1, Q3, IQR (Q3-Q1) and mean, plus whether it passes the
 * stated criteria (median >= 3.50 and IQR <= 1.50, per the instructions
 * shown on the survey pages). Cheap enough (≤21 respondents × 127 items)
 * to recompute on every request rather than caching.
 */
function computeStatisticsForSheet_(sheet) {
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
        median: median !== null ? roundTo2_(median) : null,
        q1: q1 !== null ? roundTo2_(q1) : null,
        q3: q3 !== null ? roundTo2_(q3) : null,
        iqr: iqr !== null ? roundTo2_(iqr) : null,
        mean: mean !== null ? roundTo2_(mean) : null,
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

function computeStatistics_() {
  return computeStatisticsForSheet_(getSheet_());
}

function computeStatisticsR3_() {
  return computeStatisticsForSheet_(getSheetR3_());
}

/**
 * Called from Stat.html after the researcher enters the passcode.
 */
function getStatistics(key) {
  checkStatAccess_(key);
  return computeStatistics_();
}

/**
 * Called from StatR3.html after the researcher enters the passcode.
 */
function getStatisticsR3(key) {
  checkStatAccess_(key);
  return computeStatisticsR3_();
}

var STAT_FIXED_COLS = 12; // ลำดับ..ผลการพิจารณา, in that order (see below)

/**
 * Shared snapshot-writer used by both saveStatisticsToSheet() and
 * saveStatisticsR3ToSheet(): overwrites the given sheet tab with the
 * current statistics table. Any columns the researcher added by hand
 * beyond the fixed statistics columns (e.g. an "explain" column of
 * per-item notes) are read back out and re-applied after the rewrite,
 * matched by รหัสข้อ, so re-saving stats never wipes them out.
 */
function writeStatSnapshot_(sheetName, stats) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  var extraHeaders = [];
  var preservedByCode = {};
  var oldLastRow = sheet.getLastRow();
  var oldLastCol = sheet.getLastColumn();
  if (oldLastRow > 0 && oldLastCol > STAT_FIXED_COLS) {
    var oldHeaderRow = sheet.getRange(1, 1, 1, oldLastCol).getValues()[0];
    extraHeaders = oldHeaderRow.slice(STAT_FIXED_COLS);
    if (oldLastRow > 1) {
      var oldData = sheet.getRange(2, 1, oldLastRow - 1, oldLastCol).getValues();
      oldData.forEach(function (row) {
        var code = row[1]; // รหัสข้อ column
        if (code) preservedByCode[code] = row.slice(STAT_FIXED_COLS);
      });
    }
  }

  sheet.clearContents();

  var rows = [[
    'ลำดับ', 'รหัสข้อ', 'หมวด/ด้าน', 'ระดับ', 'รายการข้อคำถาม',
    'จำนวนผู้ตอบ (n)', 'มัธยฐาน (Median)', 'Q1', 'Q3', 'IQR (Q3-Q1)',
    'ค่าเฉลี่ย (Mean)', 'ผลการพิจารณา'
  ].concat(extraHeaders)];

  stats.items.forEach(function (item, idx) {
    var extra = preservedByCode[item.code] || extraHeaders.map(function () { return ''; });
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
    ].concat(extra));
  });

  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, rows[0].length);
}

/**
 * Called from Stat.html's "บันทึกผลลงชีต" button: snapshots the current
 * statistics into a "สรุปผลสถิติ" sheet tab so the researcher has a
 * dated, permanent record (overwrites the tab's previous content).
 */
function saveStatisticsToSheet(key) {
  checkStatAccess_(key);
  var stats = computeStatistics_();
  writeStatSnapshot_(STAT_SHEET_NAME, stats);
  return {
    status: 'ok',
    savedAt: new Date().toISOString(),
    respondentCount: stats.respondentCount
  };
}

/**
 * Round 3 counterpart of saveStatisticsToSheet(), writing to
 * "สรุปผลสถิติ รอบ 3" instead.
 */
function saveStatisticsR3ToSheet(key) {
  checkStatAccess_(key);
  var stats = computeStatisticsR3_();
  writeStatSnapshot_(STAT_SHEET_NAME_R3, stats);
  return {
    status: 'ok',
    savedAt: new Date().toISOString(),
    respondentCount: stats.respondentCount
  };
}
