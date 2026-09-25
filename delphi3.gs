/**
 * delphi3.gs — แบบสอบถามเทคนิคเดลฟาย รอบที่ 3 (ให้ข้อมูลป้อนกลับ Median/IQR จากรอบ 2)
 *
 * แยกไฟล์อิสระจาก code.gs และ stat2.gs โดยเจตนา (ตามหลักการเดียวกับ stat2.gs):
 *   - เขียนคำตอบรอบ 3 ลงชีตใหม่ "response_r3" เท่านั้น ไม่แตะ response_r2 / raw2 / stat2
 *   - อ่านผลสรุป Median/IQR ของรอบ 2 จากชีต "stat2" แบบอ่านอย่างเดียว (read-only)
 *     ไม่มีจุดใดในไฟล์นี้เขียนทับ/แก้ไขข้อมูลในชีตอื่นนอกจาก response_r3
 *   - ไม่เก็บข้อมูลทั่วไป (ส่วนที่ 1) ซ้ำอีก เพราะมีอยู่แล้วในชีตของรอบก่อนหน้า
 *     (response / response_r2) และเชื่อมด้วยรหัสผู้เชี่ยวชาญ (expert_code) แทน
 *
 * ไฟล์นี้อ้างอิงตัวช่วยที่ประกาศไว้แล้วใน code.gs แบบอ่านอย่างเดียว (ไม่ประกาศซ้ำ
 * และไม่แก้ไข): getSpreadsheet_(), ITEM_LABELS, VALID_EXPERT_CODES
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
 * อ่านผลสรุป Median/IQR ของรอบ 2 จากชีต "stat2" (สร้างจากหน้า stat2.html) มาให้
 * delphi3.html แสดงเป็นข้อมูลป้อนกลับประกอบการพิจารณาตอบคำถามรอบ 3 ต่อแต่ละข้อ
 * อ่านอย่างเดียว ไม่แก้ไขชีต stat2 แต่อย่างใด
 *
 * คอลัมน์ของ stat2 (ตามที่ stat2.gs สร้างไว้):
 * [ข้อที่, ข้อความ, N, Median, Q1, Q3, IQR, Min, Max, ฉันทามติ]
 */
function getRound2StatsForDelphi3() {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(DELPHI3_STAT_SOURCE_SHEET);
  const items = {};

  if (!sheet || sheet.getLastRow() < 2) {
    return { hasData: false, items: items };
  }

  const values = sheet.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const num = Number(row[0]);
    if (!num) continue;
    items[num] = {
      n: row[2],
      median: row[3],
      q1: row[4],
      q3: row[5],
      iqr: row[6],
      min: row[7],
      max: row[8],
      consensus: row[9] === 'ใช่' ? true : (row[9] === 'ไม่ใช่' ? false : null)
    };
  }

  return { hasData: true, items: items };
}
