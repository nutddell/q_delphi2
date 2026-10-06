/**
 * stat3.gs — สรุปผลข้อมูลและคำนวณค่าสถิติ (Median / IQR / ฉันทามติ) สำหรับ stat3.html
 * ทำเหมือน stat2.gs ทุกประการ แต่ใช้กับข้อมูลรอบที่ 3 สำหรับนำเสนอผลการวิจัย
 *
 * แยกออกจาก code.gs / stat2.gs / delphi3.gs โดยเจตนา เพื่อไม่ให้ไปปะปน/เสี่ยงกระทบ
 * ระบบรับแบบสอบถามที่ทำงานอยู่ — ไฟล์นี้ "อ่านอย่างเดียว" จากชีต response_r3
 * ไม่มีจุดใดเขียนทับหรือแก้ไขข้อมูลในชีตนั้นเลย
 *
 * โครงสร้างข้อมูล 3 ชั้น (เหมือน stat2):
 *   1) response_r3  ต้นทางจริงของรอบ 3 (รหัสผู้เชี่ยวชาญ + คำตอบ 70 ข้อ + ข้อเสนอแนะ
 *                   ไม่มีข้อมูลทั่วไปอยู่แล้วตั้งแต่ต้น) — อ่านอย่างเดียว
 *   2) raw3         คัดลอกมาเฉพาะคำตอบ 70 ข้อ สร้าง/อัปเดตอัตโนมัติทุกครั้งที่คำนวณสถิติ
 *                   โดยดึงจาก response_r3 ล่าสุดเสมอ
 *   3) stat3        ผลสรุปค่าสถิติ (N, Median, Q1, Q3, IQR, ฉันทามติ) ต่อข้อ บันทึกเมื่อกด
 *                   "บันทึกผลลงชีต" ใน stat3.html — ใช้เป็นผลสรุปสุดท้ายสำหรับนำเสนองานวิจัย
 *
 * วิธีติดตั้ง (ทำต่อจาก code.gs / delphi3.gs ที่ติดตั้งอยู่แล้ว)
 * 1. ใน Apps Script editor เดิม กด + ข้าง "ไฟล์" เลือก Script ตั้งชื่อไฟล์ว่า "stat3"
 *    แล้ววางเนื้อหาไฟล์นี้ทั้งหมดลงไป
 * 2. กด + ข้าง "ไฟล์" อีกครั้ง เลือก HTML ตั้งชื่อไฟล์ว่า "stat3"
 *    แล้ววางเนื้อหาไฟล์ stat3.html ทั้งหมดลงไป
 * 3. เปิด code.gs เดิม เพิ่ม 1 บรรทัดใน pageMap ของ doGet():
 *      'stat3': { file: 'stat3', title: 'สรุปผลข้อมูลและค่าสถิติ (Median / IQR) - รอบที่ 3' },
 *    (ผมได้ส่ง code.gs เวอร์ชันที่เพิ่มบรรทัดนี้ให้แล้ว วางทับได้เลย)
 * 4. Deploy > Manage deployments > แก้ไข (ไอคอนดินสอ) > Version "New version" > Deploy
 * 5. เปิดหน้าสรุปสถิติที่ <Web app URL>?page=stat3
 *
 * ไฟล์นี้ใช้ค่า/ฟังก์ชันที่ประกาศไว้แล้วในไฟล์อื่นแบบอ่านอย่างเดียว (ไม่ประกาศซ้ำ):
 *   - จาก code.gs: getSpreadsheet_(), ITEM_LABELS
 *   - จาก delphi3.gs: DELPHI3_SHEET_NAME (= 'response_r3')
 *   - จาก stat2.gs: median_(), quartile_(), round2_(), computeItemStats_()
 *     (ฟังก์ชันคำนวณสถิติล้วน ไม่มีผลข้างเคียง ใช้เกณฑ์ฉันทามติเดียวกับรอบ 2 คือ IQR <= 1
 *     เพื่อให้เทียบผลระหว่างรอบได้ตรงกัน จึงไม่ประกาศซ้ำ)
 */

const RAW3_SHEET_NAME = 'raw3';   // คัดลอกเฉพาะคำตอบ 70 ข้อจาก response_r3
const STAT3_SHEET_NAME = 'stat3'; // ผลสรุปค่าสถิติ Median / IQR / ฉันทามติ ต่อข้อ (รอบ 3)

/**
 * อ่าน response_r3 (อ่านอย่างเดียว) แล้วคัดลอกเฉพาะคอลัมน์คำตอบ 70 ข้อ (จับคู่จากหัวตาราง
 * รูปแบบ "ข้อ N - ...") ไปเขียนทับ sheet "raw3" ทั้งหมด ไม่แตะ response_r3 แต่อย่างใด
 */
function syncRaw3FromResponseR3_() {
  const ss = getSpreadsheet_();
  const responseSheet = ss.getSheetByName(DELPHI3_SHEET_NAME); // = 'response_r3' จาก delphi3.gs
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

  const raw3Header = [];
  for (let i = 1; i <= 70; i++) raw3Header.push('ข้อ' + i);

  const raw3Rows = dataRows.map(function (row) {
    const out = [];
    for (let i = 1; i <= 70; i++) {
      const colIdx = itemColByNum[i];
      out.push(colIdx !== undefined ? row[colIdx] : '');
    }
    return out;
  });

  let raw3Sheet = ss.getSheetByName(RAW3_SHEET_NAME);
  if (!raw3Sheet) {
    raw3Sheet = ss.insertSheet(RAW3_SHEET_NAME);
  }
  raw3Sheet.clearContents();
  raw3Sheet.getRange(1, 1, 1, raw3Header.length).setValues([raw3Header]);
  raw3Sheet.setFrozenRows(1);
  if (raw3Rows.length) {
    raw3Sheet.getRange(2, 1, raw3Rows.length, raw3Header.length).setValues(raw3Rows);
  }

  return raw3Sheet;
}

/**
 * ซิงก์ raw3 จาก response_r3 ล่าสุด แล้วคำนวณสรุปสถิติทุกข้อ (ไม่บันทึกลงชีต stat3)
 * ใช้แสดงผลแบบพรีวิวได้ทันทีโดยไม่ต้องกดบันทึก — เรียกจาก stat3.html ผ่าน google.script.run
 */
function computeStatSummary3() {
  const raw3Sheet = syncRaw3FromResponseR3_();
  const values = raw3Sheet.getDataRange().getValues();
  const rows = values.length > 1 ? values.slice(1) : [];

  const items = [];
  for (let i = 1; i <= 70; i++) {
    const colIdx = i - 1; // raw3 คอลัมน์ 1..70 ตรงกับข้อ 1..70 เสมอ
    const values70 = rows.map(function (r) { return r[colIdx]; });
    const stats = computeItemStats_(values70); // ใช้ร่วมกับ stat2.gs
    items.push(Object.assign({ num: i, text: ITEM_LABELS[i] || '' }, stats));
  }

  return {
    totalResponses: rows.length,
    generatedAt: new Date().toISOString(),
    items: items
  };
}

/**
 * คำนวณสรุปสถิติทุกข้อ (ซิงก์ raw3 ให้ล่าสุดก่อนเสมอ) แล้วบันทึกผลลง sheet "stat3"
 * (เขียนทับผลเดิมทั้งหมดทุกครั้ง) — เรียกจาก stat3.html ผ่าน google.script.run
 */
function computeAndSaveStats3() {
  const summary = computeStatSummary3();
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(STAT3_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(STAT3_SHEET_NAME);
  }
  sheet.clearContents();

  const header = ['ข้อที่', 'ข้อความ', 'N (จำนวนผู้ตอบ)', 'Median', 'Q1', 'Q3', 'IQR', 'Min', 'Max', 'ฉันทามติ (IQR <= 1)'];
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
