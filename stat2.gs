/**
 * stat2.gs — สรุปผลข้อมูลและคำนวณค่าสถิติ (Median / IQR) สำหรับ stat2.html
 *
 * แยกออกจาก code.gs โดยเจตนา เพื่อไม่ให้ไปปะปน/เสี่ยงกระทบระบบรับแบบสอบถามที่
 * ทำงานอยู่แล้ว (เก็บข้อมูลลงชีต "response_r2" ผ่าน code.gs) — ไฟล์นี้ "อ่านอย่างเดียว"
 * จากชีต response_r2 ไม่มีจุดใดเขียนทับหรือแก้ไขข้อมูลในชีตนั้นเลย
 *
 * โครงสร้างข้อมูล 3 ชั้น:
 *   1) response_r2  ต้นทางจริง (มีทั้งข้อมูลทั่วไป + คำตอบ 70 ข้อ) — อ่านอย่างเดียว
 *   2) raw2         คัดลอกมาเฉพาะคำตอบ 70 ข้อ (ไม่มีข้อมูลทั่วไป) สร้าง/อัปเดตอัตโนมัติ
 *                   ทุกครั้งที่คำนวณสถิติ โดยดึงจาก response_r2 ล่าสุดเสมอ
 *   3) stat2        ผลสรุปค่าสถิติ (N, Median, Q1, Q3, IQR) ต่อข้อ บันทึกเมื่อกด
 *                   "บันทึกผลลงชีต" ใน stat2.html
 *
 * วิธีติดตั้ง (ทำต่อจาก code.gs ที่ติดตั้งอยู่แล้ว โดยไม่ต้องแก้ code.gs เพิ่ม)
 * 1. ใน Apps Script editor เดิม กด + ข้าง "ไฟล์" เลือก Script ตั้งชื่อไฟล์ว่า "stat2"
 *    แล้ววางเนื้อหาไฟล์นี้ทั้งหมดลงไป
 * 2. กด + ข้าง "ไฟล์" อีกครั้ง เลือก HTML ตั้งชื่อไฟล์ว่า "stat2"
 *    แล้ววางเนื้อหาไฟล์ stat2.html ทั้งหมดลงไป
 * 3. Deploy > Manage deployments > แก้ไข (ไอคอนดินสอ) > Version "New version" > Deploy
 * 4. เปิดหน้าสรุปสถิติที่ <Web app URL>?page=stat2
 *
 * ไฟล์นี้ใช้ค่าคงที่ SPREADSHEET_ID, SHEET_NAME (= 'response_r2') และฟังก์ชัน
 * getSpreadsheet_() / ITEM_LABELS ที่ประกาศไว้ใน code.gs อยู่แล้ว (อ่านอย่างเดียว
 * ไม่มีการแก้ไขค่าเหล่านั้น) จึงไม่ต้องประกาศซ้ำในไฟล์นี้
 */

const RAW2_SHEET_NAME = 'raw2';   // คัดลอกเฉพาะคำตอบ 70 ข้อจาก response_r2 (ไม่มีข้อมูลทั่วไป)
const STAT2_SHEET_NAME = 'stat2'; // ผลสรุปค่าสถิติ Median / IQR ต่อข้อ
const STAT2_CONSENSUS_IQR_THRESHOLD = 1; // เกณฑ์ฉันทามติแบบเดลฟายทั่วไป: IQR <= 1 (ปรับได้ตามเกณฑ์งานวิจัย)

/**
 * อ่าน response_r2 (อ่านอย่างเดียว) แล้วคัดลอกเฉพาะคอลัมน์คำตอบ 70 ข้อ (จับคู่จากหัวตาราง
 * รูปแบบ "ข้อ N - ...") ไปเขียนทับ sheet "raw2" ทั้งหมด ไม่แตะ response_r2 แต่อย่างใด
 */
function syncRaw2FromResponseR2_() {
  const ss = getSpreadsheet_();
  const responseSheet = ss.getSheetByName(SHEET_NAME); // SHEET_NAME = 'response_r2' จาก code.gs
  const values = (responseSheet && responseSheet.getLastRow() >= 1)
    ? responseSheet.getDataRange().getValues()
    : [];
  const header = values.length ? values[0] : [];
  const dataRows = values.length > 1 ? values.slice(1) : [];

  const itemColByNum = {};
  header.forEach(function (h, idx) {
    const m = String(h).match(/^ข้อ (\d+) - /);
    if (m) itemColByNum[parseInt(m[1], 10)] = idx;
  });

  const raw2Header = [];
  for (let i = 1; i <= 70; i++) raw2Header.push('ข้อ' + i);

  const raw2Rows = dataRows.map(function (row) {
    const out = [];
    for (let i = 1; i <= 70; i++) {
      const colIdx = itemColByNum[i];
      out.push(colIdx !== undefined ? row[colIdx] : '');
    }
    return out;
  });

  let raw2Sheet = ss.getSheetByName(RAW2_SHEET_NAME);
  if (!raw2Sheet) {
    raw2Sheet = ss.insertSheet(RAW2_SHEET_NAME);
  }
  raw2Sheet.clearContents();
  raw2Sheet.getRange(1, 1, 1, raw2Header.length).setValues([raw2Header]);
  raw2Sheet.setFrozenRows(1);
  if (raw2Rows.length) {
    raw2Sheet.getRange(2, 1, raw2Rows.length, raw2Header.length).setValues(raw2Rows);
  }

  return raw2Sheet;
}

function median_(sortedValues) {
  const n = sortedValues.length;
  if (n === 0) return null;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sortedValues[mid - 1] + sortedValues[mid]) / 2 : sortedValues[mid];
}

// Quartile แบบ median-of-halves (Tukey's hinges) เป็นวิธีที่ใช้ทั่วไปในงานวิจัยเทคนิคเดลฟาย
function quartile_(sortedValues, q) {
  const n = sortedValues.length;
  if (n === 0) return null;
  const mid = Math.floor(n / 2);
  if (q === 1) {
    return median_(sortedValues.slice(0, mid));
  }
  return median_(n % 2 === 0 ? sortedValues.slice(mid) : sortedValues.slice(mid + 1));
}

function round2_(v) {
  return v === null || v === undefined ? null : Math.round(v * 100) / 100;
}

function computeItemStats_(rawValues) {
  const nums = rawValues
    .map(function (v) { return Number(v); })
    .filter(function (v) { return !isNaN(v) && v >= 1 && v <= 5; })
    .sort(function (a, b) { return a - b; });

  const n = nums.length;
  const med = median_(nums);
  const q1 = quartile_(nums, 1);
  const q3 = quartile_(nums, 3);
  const iqr = (q1 !== null && q3 !== null) ? (q3 - q1) : null;

  return {
    n: n,
    median: round2_(med),
    q1: round2_(q1),
    q3: round2_(q3),
    iqr: round2_(iqr),
    min: n ? nums[0] : null,
    max: n ? nums[n - 1] : null,
    consensus: iqr !== null ? (iqr <= STAT2_CONSENSUS_IQR_THRESHOLD) : null
  };
}

/**
 * ซิงก์ raw2 จาก response_r2 ล่าสุด แล้วคำนวณสรุปสถิติทุกข้อ (ไม่บันทึกลงชีต stat2)
 * ใช้แสดงผลแบบพรีวิวได้ทันทีโดยไม่ต้องกดบันทึก — เรียกจาก stat2.html ผ่าน google.script.run
 */
function computeStatSummary() {
  const raw2Sheet = syncRaw2FromResponseR2_();
  const values = raw2Sheet.getDataRange().getValues();
  const rows = values.length > 1 ? values.slice(1) : [];

  const items = [];
  for (let i = 1; i <= 70; i++) {
    const colIdx = i - 1; // raw2 คอลัมน์ 1..70 ตรงกับข้อ 1..70 เสมอ (ควบคุมโครงสร้างเองทั้งหมด)
    const values70 = rows.map(function (r) { return r[colIdx]; });
    const stats = computeItemStats_(values70);
    items.push(Object.assign({ num: i, text: ITEM_LABELS[i] || '' }, stats));
  }

  return {
    totalResponses: rows.length,
    generatedAt: new Date().toISOString(),
    items: items
  };
}

/**
 * คำนวณสรุปสถิติทุกข้อ (ซิงก์ raw2 ให้ล่าสุดก่อนเสมอ) แล้วบันทึกผลลง sheet "stat2"
 * (เขียนทับผลเดิมทั้งหมดทุกครั้ง) — เรียกจาก stat2.html ผ่าน google.script.run
 */
function computeAndSaveStats() {
  const summary = computeStatSummary();
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(STAT2_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(STAT2_SHEET_NAME);
  }
  sheet.clearContents();

  const header = ['ข้อที่', 'ข้อความ', 'N (จำนวนผู้ตอบ)', 'Median', 'Q1', 'Q3', 'IQR', 'Min', 'Max', 'ฉันทามติ (IQR <= ' + STAT2_CONSENSUS_IQR_THRESHOLD + ')'];
  sheet.getRange(1, 1, 1, header.length).setValues([header]);
  sheet.setFrozenRows(1);

  const dataRows = summary.items.map(function (it) {
    return [it.num, it.text, it.n, it.median, it.q1, it.q3, it.iqr, it.min, it.max, it.consensus === null ? '' : (it.consensus ? 'ใช่' : 'ไม่ใช่')];
  });
  if (dataRows.length) {
    sheet.getRange(2, 1, dataRows.length, header.length).setValues(dataRows);
  }

  sheet.getRange(1, header.length + 2).setValue('คำนวณล่าสุด');
  sheet.getRange(2, header.length + 2).setValue(new Date());
  sheet.getRange(1, header.length + 3).setValue('จำนวนผู้ตอบทั้งหมด');
  sheet.getRange(2, header.length + 3).setValue(summary.totalResponses);

  return summary;
}
