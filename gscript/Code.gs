/**
 * Delphi Round 2 survey web app.
 * Serves Index.html and stores each submission as a row in the "Responses"
 * sheet of the spreadsheet this script is bound to.
 */

var SHEET_NAME = 'Responses';
var QUESTION_SHEET_NAME = 'คำถามอ้างอิง';

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
 * Called from the client via google.script.run.
 * payload = { headers: string[], answers: { [key]: string } }
 * headers gives the canonical column order (excluding the timestamp
 * column, which this function adds automatically).
 */
function submitSurvey(payload) {
  if (!payload || !Array.isArray(payload.headers) || typeof payload.answers !== 'object') {
    throw new Error('ข้อมูลที่ส่งมาไม่ถูกต้อง');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getSheet_();
    var hasHeaders = sheet.getLastRow() > 0 &&
      sheet.getRange(1, 1).getValue() !== '';

    if (!hasHeaders) {
      var headerRow = ['timestamp'].concat(payload.headers);
      sheet.getRange(1, 1, 1, headerRow.length).setValues([headerRow]);
      sheet.setFrozenRows(1);
    }

    var existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var row = existingHeaders.map(function (header) {
      if (header === 'timestamp') return new Date();
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
