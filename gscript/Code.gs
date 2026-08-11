/**
 * Delphi Round 2 survey web app.
 * Serves Index.html and stores each submission as a row in the "Responses"
 * sheet of the spreadsheet this script is bound to.
 */

var SHEET_NAME = 'Responses';

function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
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
