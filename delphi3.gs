/**
 * delphi3.gs — แบบสอบถามเทคนิคเดลฟาย รอบที่ 3 (ให้ข้อมูลป้อนกลับ Median/IQR จากรอบ 2
 * พร้อมคำตอบเดิมของผู้เชี่ยวชาญคนนั้น ๆ)
 *
 * แยกไฟล์อิสระจาก code.gs และ stat2.gs โดยเจตนา (ตามหลักการเดียวกับ stat2.gs):
 *   - เขียนคำตอบรอบ 3 ลงชีตใหม่ "response_r3" เท่านั้น ไม่แตะ response_r2 / raw2 / stat2
 *   - อ่านผลสรุป Median/IQR ของรอบ 2 จากชีต "stat2" แบบอ่านอย่างเดียว (read-only)
 *   - อ่านคำตอบเดิมของผู้เชี่ยวชาญแต่ละคนจากชีต "response_r2" แบบอ่านอย่างเดียวเช่นกัน
 *     ไม่มีจุดใดในไฟล์นี้เขียนทับ/แก้ไขข้อมูลในชีตอื่นนอกจาก response_r3
 *   - ไม่เก็บข้อมูลทั่วไป (ส่วนที่ 1) ซ้ำอีก เพราะมีอยู่แล้วในชีตของรอบก่อนหน้า
 *     (response / response_r2) และเชื่อมด้วยรหัสผู้เชี่ยวชาญ (expert_code) แทน
 *
 * ไฟล์นี้อ้างอิงตัวช่วยที่ประกาศไว้แล้วใน code.gs แบบอ่านอย่างเดียว (ไม่ประกาศซ้ำ
 * และไม่แก้ไข): getSpreadsheet_(), ITEM_LABELS, VALID_EXPERT_CODES, SHEET_NAME
 *
 * วิธีติดตั้ง
 * 1. ใน Apps Script editor เดิม กด + ข้าง "ไฟล์" เลือก Script ตั้งชื่อไฟล์ว่า "delphi3"
 *    แล้ววางเนื้อหาไฟล์นี้ทั้งหมดลงไป
 * 2. กด + ข้าง "ไฟล์" อีกครั้ง เลือก HTML ตั้งชื่อไฟล์ว่า "delphi3"
 *    แล้ววางเนื้อหาไฟล์ delphi3.html ทั้งหมดลงไป
 * 3. วางทับ code.gs เดิมด้วยไฟล์ airpollution_apps_script.gs เวอร์ชันล่าสุด
 *    (มี entry 'delphi3' ใน doGet() ให้แล้ว)
 * 4. ก่อนเปิดใช้งานจริง ต้องมีข้อมูลสรุปผลรอบ 2 อยู่ในชีต "stat2" แล้ว
 *    (เปิด <Web app URL>?page=stat2 แล้วกด "บันทึกผลลงชีต stat2" อย่างน้อย 1 ครั้ง)
 * 5. Deploy > Manage deployments > แก้ไข (ไอคอนดินสอ) > New version > Deploy
 * 6. เปิด <Web app URL>?page=delphi3
 */

const DELPHI3_SHEET_NAME = 'response_r3';       // ปลายทางคำตอบรอบ 3 (ใหม่ทั้งหมด)
const DELPHI3_STAT_SOURCE_SHEET = 'stat2';      // อ่านผลสรุปรอบ 2 มาแสดงเป็นข้อมูลป้อนกลับ (อ่านอย่างเดียว)

function buildDelphi3HeaderRow_() {
  const header = ['วันเวลาที่บันทึก (Server)', 'วันเวลาที่ส่ง (Client)', 'รหัสผู้เชี่ยวชาญ'];
  for (let i = 1; i <= 70; i++) {
    header.push('ข้อ ' + i + ' - ' + ITEM_LABELS[i]); // ITEM_LABELS มาจาก code.gs (อ่านอย่างเดียว)
  }
  header.push('ข้อเสนอแนะเพิ่มเติม');
  return header;
}

function getOrCreateDelphi3Sheet_() {
  const ss = getSpreadsheet_(); // มาจาก code.gs (อ่านอย่างเดียว ไม่แก้ไข)
  let sheet = ss.getSheetByName(DELPHI3_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(DELPHI3_SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    const header = buildDelphi3HeaderRow_();
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * เรียกจาก delphi3.html ผ่าน google.script.run เพื่อบันทึกคำตอบรอบ 3
 * (ไม่มีข้อมูลทั่วไป/ส่วนที่ 1 — มีแค่รหัสผู้เชี่ยวชาญ + คำตอบ 70 ข้อ + ข้อเสนอแนะ)
 */
function submitDelphi3Response(data) {
  const code = (data.expert_code || '').toString().trim().toLowerCase();
  if (VALID_EXPERT_CODES.indexOf(code) === -1) { // มาจาก code.gs (อ่านอย่างเดียว)
    throw new Error('รหัสผู้เชี่ยวชาญไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
  }

  const sheet = getOrCreateDelphi3Sheet_();
  const row = [new Date(), data.timestamp_client || '', code];
  for (let i = 1; i <= 70; i++) {
    row.push(data['q' + i] || '');
  }
  row.push(data.suggestion || '');

  sheet.appendRow(row);
  return { status: 'success' };
}

/**
 * อ่านผลสรุป Median/IQR ของรอบ 2 จากชีต "stat2" มาให้ delphi3.html แสดงเป็น
 * ข้อมูลป้อนกลับประกอบการพิจารณาตอบคำถามรอบ 3 ต่อแต่ละข้อ พร้อมทั้งคำตอบเดิม
 * ของผู้เชี่ยวชาญคนที่ล็อกอินอยู่ (อ่านจาก response_r2) อ่านอย่างเดียวทั้งคู่
 * ไม่แก้ไขชีต stat2 หรือ response_r2 แต่อย่างใด
 *
 * คอลัมน์ของ stat2 (ตามที่ stat2.gs สร้างไว้):
 * [ข้อที่, ข้อความ, N, Median, Q1, Q3, IQR, Min, Max, ฉันทามติ]
 */
function getRound2StatsForDelphi3(expertCode) {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(DELPHI3_STAT_SOURCE_SHEET);
  const items = {};
  let hasData = false;

  if (sheet && sheet.getLastRow() >= 2) {
    hasData = true;
    const values = sheet.getDataRange().getValues();
    for (let r = 1; r < values.length; r++) {
      const row = values[r];
      const num = Number(row[0]);
      if (!num) continue;
      items[num] = {
        median: row[3],
        q1: row[4],
        q3: row[5],
        iqr: row[6],
        consensus: row[9] === 'ใช่' ? true : (row[9] === 'ไม่ใช่' ? false : null)
      };
    }
  }

  return {
    hasData: hasData,
    items: items,
    ownAnswers: getOwnRound2Answers_(expertCode)
  };
}

/**
 * อ่านคำตอบเดิม (70 ข้อ) ของผู้เชี่ยวชาญรหัสที่ระบุ จากชีต "response_r2" (อ่านอย่างเดียว)
 * ถ้ามีคำตอบมากกว่า 1 แถวสำหรับรหัสเดียวกัน จะใช้แถวล่าสุด (แถวที่อยู่ล่างสุด)
 */
function getOwnRound2Answers_(expertCode) {
  const code = (expertCode || '').toString().trim().toLowerCase();
  const answers = {};
  if (!code) return answers;

  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEET_NAME); // response_r2 จาก code.gs (อ่านอย่างเดียว)
  if (!sheet || sheet.getLastRow() < 2) return answers;

  const values = sheet.getDataRange().getValues();
  const header = values[0];

  let codeColIdx = -1;
  header.forEach(function (h, idx) {
    if (String(h).trim() === 'รหัสผู้เชี่ยวชาญ') codeColIdx = idx;
  });
  if (codeColIdx === -1) return answers;

  const itemColByNum = {};
  header.forEach(function (h, idx) {
    const m = String(h).match(/^ข้อ (\d+) - /);
    if (m) itemColByNum[parseInt(m[1], 10)] = idx;
  });

  let matchedRow = null;
  for (let r = 1; r < values.length; r++) {
    const rowCode = String(values[r][codeColIdx] || '').trim().toLowerCase();
    if (rowCode === code) {
      matchedRow = values[r]; // เก็บแถวล่าสุดที่ตรงกันไว้เรื่อย ๆ
    }
  }
  if (!matchedRow) return answers;

  for (let i = 1; i <= 70; i++) {
    const colIdx = itemColByNum[i];
    if (colIdx === undefined) continue;
    const v = matchedRow[colIdx];
    if (v !== '' && v !== null && v !== undefined) {
      answers[i] = Number(v);
    }
  }
  return answers;
}
