/**
 * Google Apps Script backend + page host for airpollution_survey.html + stat2.html
 *
 * วิธีติดตั้ง
 * 1. เปิด Google Sheet ที่จะใช้เก็บข้อมูล (ตั้งชื่อไฟล์ เช่น "airpollution")
 * 2. เมนู Extensions > Apps Script
 * 3. วางไฟล์นี้ทับไฟล์ code.gs (Code.gs) ทั้งหมด
 * 4. กด + ข้าง "ไฟล์" เลือก HTML ตั้งชื่อไฟล์ว่า "airpollution_survey"
 *    (ต้องตั้งชื่อนี้เป๊ะ ๆ เพราะ doGet() ด้านล่างอ้างอิงชื่อไฟล์นี้)
 *    แล้ววางเนื้อหาไฟล์ airpollution_survey.html ทั้งหมดลงไป
 * 5. กด + ข้าง "ไฟล์" อีกครั้ง เลือก HTML ตั้งชื่อไฟล์ว่า "stat2"
 *    แล้ววางเนื้อหาไฟล์ stat2.html ทั้งหมดลงไป (หน้านี้ใช้สรุปผล/คำนวณ Median, IQR)
 * 6. *** สำคัญ *** ระบุ SPREADSHEET_ID ด้านล่างนี้ให้ตรงกับ Sheet ที่จะใช้เก็บข้อมูล
 *    คัดลอกจาก URL ของ Sheet เช่น
 *    https://docs.google.com/spreadsheets/d/นี่คือSPREADSHEET_ID/edit
 *    (ถ้าไม่ระบุ สคริปต์จะพยายามใช้ SpreadsheetApp.getActiveSpreadsheet() แทน
 *    ซึ่งจะหาไม่เจอ/บันทึกข้อมูลไม่ได้ ถ้าโปรเจกต์ Apps Script นี้ไม่ได้ถูกสร้างจาก
 *    เมนู Extensions > Apps Script ภายในตัว Sheet นั้นโดยตรง — เป็นสาเหตุที่พบบ่อย
 *    ที่สุดของอาการ "หน้าเว็บรันได้แต่บันทึกข้อมูลไม่ได้")
 * 7. กด Deploy > New deployment > เลือกประเภท "Web app"
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 8. เปิด Web app URL ที่ได้ ควรเห็นหน้าแบบสอบถามทันที (ไม่ใช่ JSON)
 *    เปิดหน้าสรุปสถิติที่ <Web app URL>?page=stat2
 * 9. ทุกครั้งที่แก้โค้ดนี้หรือแก้ไฟล์ HTML ต้องกด Deploy > Manage deployments
 *    > แก้ไข (ไอคอนดินสอ) > เลือก Version "New version" > Deploy
 *    เพื่ออัปเดต URL เดิมให้ใช้โค้ด/หน้าล่าสุด
 *
 * หมายเหตุ: ชื่อ sheet ข้อมูลดิบเปลี่ยนจาก "response_r2" เป็น "raw2" ถ้ามีข้อมูล
 * เก่าอยู่ใน "response_r2" ให้เปลี่ยนชื่อแท็บนั้นเป็น "raw2" เอง (คลิกขวาที่แท็บ >
 * เปลี่ยนชื่อ) เพื่อให้ข้อมูลเดิมยังถูกใช้คำนวณสถิติต่อได้ ไม่เช่นนั้นสคริปต์จะสร้าง
 * แท็บ "raw2" ใหม่แบบว่างเปล่าให้เอง
 */

const SPREADSHEET_ID = 'PASTE_YOUR_SPREADSHEET_ID_HERE'; // จาก URL ของ Google Sheet
const SHEET_NAME = 'raw2'; // เก็บข้อมูลดิบ (raw) ของทุกคำตอบ
const STAT_SHEET_NAME = 'stat2'; // เก็บผลสรุปค่าสถิติ (Median / IQR) ต่อข้อ
const CONSENSUS_IQR_THRESHOLD = 1; // เกณฑ์ฉันทามติแบบเดลฟายทั่วไป: IQR <= 1 ถือว่าฉันทามติ (ปรับได้ตามเกณฑ์งานวิจัย)

// ข้อความเต็มของแต่ละข้อ (1-70) ใช้สร้างหัวตารางให้อ่านเข้าใจง่ายโดยไม่ต้องเปิดไฟล์แบบสอบถามประกอบ
const ITEM_LABELS = {
  1:'มีความรู้เกี่ยวกับสถานการณ์มลพิษอากาศในปัจจุบันและผลกระทบที่เกี่ยวข้อง',
  2:'มีความรู้เกี่ยวกับประเภทและแหล่งกำเนิดของมลพิษอากาศ ตลอดจนหลักการป้องกันมลพิษอากาศเบื้องต้น',
  3:'มีความรู้เกี่ยวกับองค์ประกอบคุณสมบัติทางกายภาพและทางเคมีของมลพิษอากาศแต่ละประเภท',
  4:'มีความรู้เกี่ยวกับกฎหมายควบคุมมลพิษทางอากาศของโรงงานอุตสาหกรรมในประเทศไทย',
  5:'มีความรู้เกี่ยวกับหลักเกณฑ์การจำแนกชนิดและขนาดของโรงงานตามประกาศกระทรวงอุตสาหกรรม',
  6:'มีความรู้เกี่ยวกับการจัดทำรายงานการตรวจสอบและควบคุมกำกับดูแลการทำงานของระบบบำบัดมลพิษอากาศ',
  7:'มีความรู้เกี่ยวกับการจัดทำรายงานผลการวิเคราะห์ปริมาณสารมลพิษอากาศตามหลักเกณฑ์และวิธีการที่กรมโรงงานอุตสาหกรรมกำหนด',
  8:'มีความรู้เกี่ยวกับแนวทางการลดมลพิษอากาศตั้งแต่แหล่งกำเนิดในกระบวนการผลิต',
  9:'มีความรู้เกี่ยวกับผังกระบวนการผลิตและจุดที่มีโอกาสก่อให้เกิดมลพิษอากาศในแต่ละขั้นตอน',
  10:'มีความรู้เกี่ยวกับการตรวจสอบชนิดและประเภทของเชื้อเพลิงและวัตถุดิบที่ใช้ในกระบวนการผลิตของโรงงาน',
  11:'มีความรู้เกี่ยวกับความสัมพันธ์ระหว่างการเปลี่ยนแปลงวัตถุดิบหรือเชื้อเพลิงกับปริมาณและชนิดของมลพิษอากาศที่เกิดขึ้น',
  12:'มีความรู้เกี่ยวกับการประเมินปริมาณการปล่อยมลพิษอากาศจากกระบวนการผลิต (Emission Estimation)',
  13:'มีความรู้เกี่ยวกับหลักสมดุลมวลสาร สมดุลพลังงาน และสมดุลสารเคมี เพื่อใช้ประเมินแหล่งกำเนิด ปริมาณมลพิษอากาศ และภาระมลพิษที่เข้าสู่ระบบบำบัดมลพิษอากาศของโรงงาน',
  14:'มีความรู้เกี่ยวกับหลักการจัดการ การบำบัด และการควบคุมระบบบำบัดมลพิษอากาศตามมาตรฐานสิ่งแวดล้อม',
  15:'มีความรู้เกี่ยวกับวิธีการบำบัดมลพิษอากาศทั้งทางกายภาพ ทางเคมี และทางชีวภาพ',
  16:'มีความรู้เกี่ยวกับหลักการเทคโนโลยีสะอาดและการบริหารจัดการระบบบำบัดมลพิษอากาศ',
  17:'มีความรู้เกี่ยวกับแนวทางการบริหารจัดการมลพิษอากาศอย่างเป็นระบบและต่อเนื่อง',
  18:'มีความรู้เกี่ยวกับเทคนิคการควบคุมระบบบำบัดหรือกำจัดมลพิษอากาศ',
  19:'มีความรู้เกี่ยวกับเครื่องจักรและอุปกรณ์ของระบบบำบัดมลพิษอากาศในโรงงาน',
  20:'มีความรู้เกี่ยวกับหลักการบำรุงรักษาเชิงป้องกันของเครื่องจักรและอุปกรณ์ในระบบบำบัดมลพิษอากาศ',
  21:'มีความรู้เกี่ยวกับการประเมินลักษณะของมลพิษอากาศและการตรวจสอบประสิทธิภาพของระบบบำบัดมลพิษอากาศ',
  22:'มีความรู้เกี่ยวกับการวิเคราะห์และจัดการปัญหาที่เกิดขึ้นกับระบบบำบัดมลพิษอากาศ',
  23:'มีความรู้เกี่ยวกับการเก็บตัวอย่างและการวิเคราะห์คุณภาพอากาศ',
  24:'มีความรู้เกี่ยวกับการประเมินและการบริหารจัดการความเสี่ยงด้านมลพิษอากาศในโรงงาน',
  25:'มีความรู้เกี่ยวกับการประยุกต์ใช้เทคโนโลยีดิจิทัล เช่น อินเทอร์เน็ตของสรรพสิ่ง (IoT) และปัญญาประดิษฐ์ (AI) ในระบบบำบัดมลพิษอากาศ',
  26:'มีความรู้เกี่ยวกับระบบตรวจวัดมลพิษอากาศ CEMS (Continuous Emission Monitoring System) ของกรมโรงงานอุตสาหกรรม',
  27:'มีความรู้เกี่ยวกับการจัดทำแผนงานและพัฒนาแนวทางแก้ไขปัญหาของระบบบำบัดมลพิษอากาศ',
  28:'มีความรู้เกี่ยวกับการจัดทำแผนฉุกเฉินและแนวทางตอบโต้เหตุการณ์ผิดปกติของระบบบำบัดมลพิษอากาศ',
  29:'มีความรู้เกี่ยวกับความปลอดภัย อาชีวอนามัย และสิ่งแวดล้อมที่เกี่ยวข้องกับการปฏิบัติงานของระบบบำบัดมลพิษอากาศ',
  30:'มีความรู้เกี่ยวกับมาตรฐานความปลอดภัยในการทำงานกับสารเคมีและก๊าซอันตรายที่เกี่ยวข้องกับระบบบำบัดมลพิษอากาศ',
  31:'สามารถอ่าน วิเคราะห์ และตีความข้อมูลจากเครื่องมือหรือระบบตรวจวัดมลพิษอากาศได้อย่างถูกต้อง',
  32:'สามารถเก็บตัวอย่างและวิเคราะห์คุณภาพอากาศได้',
  33:'สามารถตรวจสอบชนิดและประเภทของเชื้อเพลิงและวัตถุดิบที่ใช้ในกระบวนการผลิตของโรงงานได้',
  34:'สามารถประเมินลักษณะของมลพิษอากาศ และตรวจสอบประสิทธิภาพของระบบป้องกันและบำบัดมลพิษอากาศของโรงงานได้',
  35:'สามารถวิเคราะห์กระบวนการผลิตและความคุ้มค่า พร้อมทั้งเสนอแนวทางลดมลพิษอากาศในโรงงานได้',
  36:'สามารถประยุกต์ใช้หลักการเทคโนโลยีการผลิตที่สะอาด (Cleaner Technology) เพื่อลดปริมาณมลพิษอากาศจากแหล่งกำเนิดในกระบวนการผลิตได้',
  37:'สามารถวิเคราะห์ปัญหาและให้ข้อเสนอแนะเพื่อแก้ไขหรือปรับปรุงการจัดการระบบบำบัดมลพิษอากาศได้อย่างเหมาะสม',
  38:'สามารถวิเคราะห์สาเหตุของความผิดปกติของระบบบำบัดมลพิษอากาศ และกำหนดแนวทางแก้ไขได้อย่างเป็นขั้นตอน',
  39:'สามารถประยุกต์ใช้เทคโนโลยีดิจิทัล เช่น อินเทอร์เน็ตของสรรพสิ่ง (IoT) และปัญญาประดิษฐ์ (AI) ในระบบบำบัดมลพิษอากาศได้',
  40:'สามารถอ่านค่าแนวโน้ม (Trend) และตรวจสอบสัญญาณเตือน (Alarm) จากระบบดิจิทัลเพื่อคาดการณ์และป้องกันความผิดปกติของระบบล่วงหน้าได้',
  41:'สามารถวิเคราะห์สาเหตุของความบกพร่องในระบบบำบัดมลพิษอากาศจากข้อมูลการเดินระบบ สภาพเครื่องจักร อุปกรณ์ และกระบวนการผลิต เพื่อกำหนดแนวทางแก้ไขหรือปรับปรุงระบบได้อย่างเหมาะสม',
  42:'สามารถวิเคราะห์มลพิษอากาศ ตามหลักเกณฑ์ที่กรมโรงงานอุตสาหกรรมกำหนดได้',
  43:'สามารถตรวจสอบและลงนามรับรองรายงานผลการวิเคราะห์มลพิษอากาศตามที่กฎหมายกำหนดได้',
  44:'สามารถจัดทำแผนการปฏิบัติงานของระบบบำบัดมลพิษอากาศได้',
  45:'สามารถวางแผนบำรุงรักษาเชิงป้องกันเครื่องจักรและอุปกรณ์ของระบบบำบัดมลพิษอากาศได้',
  46:'สามารถวางแผนและจัดสรรทรัพยากรบุคคล งบประมาณ และเวลา สำหรับการดำเนินงานของระบบบำบัดมลพิษอากาศได้',
  47:'สามารถจัดทำแผนรองรับสถานการณ์ฉุกเฉินของระบบบำบัดมลพิษอากาศได้',
  48:'สามารถถ่ายทอดความรู้หรือฝึกอบรมผู้ปฏิบัติงานเกี่ยวกับระบบบำบัดมลพิษอากาศได้',
  49:'สามารถจัดทำคู่มือปฏิบัติงานสำหรับผู้ปฏิบัติประจำระบบบำบัดมลพิษอากาศได้',
  50:'สามารถให้คำปรึกษาแนะนำผู้ปฏิบัติงานรุ่นใหม่ในการควบคุมระบบบำบัดมลพิษอากาศได้',
  51:'มีจิตสำนึกด้านสิ่งแวดล้อมและความปลอดภัยในการปฏิบัติงาน และให้ความสำคัญกับการป้องกันมลพิษอากาศอย่างต่อเนื่อง',
  52:'มีความรับผิดชอบต่องานที่ได้รับมอบหมายเป็นอย่างดี',
  53:'มีระเบียบวินัยและปฏิบัติตามกฎระเบียบขององค์กร',
  54:'มีความรอบคอบในการใช้ข้อมูลและรายงานผลการตรวจวัดโดยยึดหลักความถูกต้องและความโปร่งใส',
  55:'มีความน่าเชื่อถือและเป็นที่ไว้วางใจของผู้บังคับบัญชาและผู้ร่วมงาน',
  56:'มีจรรยาบรรณในการปฏิบัติงานต่อหน้าที่และงานที่ได้รับมอบหมาย',
  57:'สามารถแก้ไขปัญหาที่เกิดขึ้นในงานได้',
  58:'มีความละเอียดรอบคอบในการปฏิบัติงานและกระบวนการทำงานโดยรวม',
  59:'สามารถตัดสินใจภายใต้สถานการณ์ที่ไม่ชัดเจนและซับซ้อนได้',
  60:'สามารถปฏิบัติงานให้บรรลุผลสัมฤทธิ์ได้',
  61:'มีภาวะผู้นำที่ดี',
  62:'มีมนุษยสัมพันธ์ที่ดีและสามารถทำงานร่วมกับเพื่อนร่วมงานได้อย่างราบรื่น',
  63:'สามารถทำงานร่วมกับผู้อื่นที่มีความคิดเห็นแตกต่างได้อย่างสร้างสรรค์',
  64:'มีความคิดริเริ่มสร้างสรรค์ และสามารถนำเสนอแนวคิดหรือแนวทางใหม่ที่เป็นประโยชน์ต่อการพัฒนางานและองค์กร',
  65:'มีความพร้อมในการเรียนรู้และปรับตัวต่อเทคโนโลยีใหม่ที่เกี่ยวข้องกับระบบบำบัดมลพิษอากาศ',
  66:'มีความยืดหยุ่นและสามารถปรับตัวต่อสถานการณ์ต่าง ๆ ได้',
  67:'สามารถจัดลำดับความสำคัญของงานได้อย่างเหมาะสม',
  68:'มีวิสัยทัศน์ในการวางแผนพัฒนาระบบบำบัดมลพิษอากาศให้สอดคล้องกับทิศทางเทคโนโลยีและกฎหมาย',
  69:'สามารถบริหารจัดการงานในปัจจุบันโดยคำนึงถึงผลกระทบในระยะยาวได้',
  70:'ให้ความสำคัญกับการพัฒนางานอย่างต่อเนื่องในการปฏิบัติงาน'
};

function buildHeaderRow() {
  const header = ['วันเวลาที่บันทึก (Server)', 'วันเวลาที่ส่ง (Client)', 'รหัสผู้เชี่ยวชาญ', 'เพศ', 'อายุ', 'คุณวุฒิการศึกษา', 'ประเภทหน่วยงาน', 'ชื่อหน่วยงาน', 'ประสบการณ์ทำงาน'];
  for (let i = 1; i <= 70; i++) {
    header.push('ข้อ ' + i + ' - ' + ITEM_LABELS[i]);
  }
  header.push('ข้อเสนอแนะเพิ่มเติม');
  return header;
}

function getSpreadsheet_() {
  if (SPREADSHEET_ID && SPREADSHEET_ID.indexOf('PASTE_YOUR') !== 0) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('ไม่พบ Spreadsheet ที่เชื่อมต่อ กรุณาตั้งค่า SPREADSHEET_ID ที่ด้านบนของไฟล์นี้ให้ตรงกับ Sheet ที่ต้องการบันทึกข้อมูล');
  }
  return ss;
}

function getOrCreateSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    const header = buildHeaderRow();
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

const VALID_EXPERT_CODES = Array.from({length: 21}, (_, i) => 'air' + String(i + 1).padStart(2, '0'));

function appendResponseRow_(data) {
  const code = (data.expert_code || '').toString().trim().toLowerCase();
  if (VALID_EXPERT_CODES.indexOf(code) === -1) {
    throw new Error('รหัสผู้เชี่ยวชาญไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
  }
  data.expert_code = code;

  const sheet = getOrCreateSheet_();

  const row = [
    new Date(),
    data.timestamp_client || '',
    data.expert_code || '',
    data.gender || '',
    data.age || '',
    data.edu || '',
    data.org_type || '',
    data.org_name || '',
    data.exp || ''
  ];
  for (let i = 1; i <= 70; i++) {
    row.push(data['q' + i] || '');
  }
  row.push(data.suggestion || '');

  sheet.appendRow(row);
}

/**
 * เรียกจากฝั่งหน้าเว็บผ่าน google.script.run เมื่อหน้า airpollution_survey.html
 * ถูก serve โดย Apps Script โดยตรง (วิธีที่แนะนำ ไม่ติดปัญหา CORS)
 */
function submitAirpollutionResponse(data) {
  appendResponseRow_(data);
  return { status: 'success' };
}

/**
 * เผื่อกรณีนำ airpollution_survey.html ไปโฮสต์แยกที่อื่น (เช่น GitHub Pages)
 * แล้วยิง fetch() เข้ามาที่ Web app URL นี้โดยตรงแทน google.script.run
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    appendResponseRow_(data);

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/* ============================================================
   ตอนที่ 2 (stat2.html): คำนวณค่าสถิติ Median / IQR จากข้อมูลดิบ
   ใน sheet "raw2" แล้วบันทึกผลสรุปลง sheet "stat2"
   ============================================================ */

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
    consensus: iqr !== null ? (iqr <= CONSENSUS_IQR_THRESHOLD) : null
  };
}

function getRawRows_() {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return { header: [], rows: [] };
  const values = sheet.getDataRange().getValues();
  return { header: values[0], rows: values.slice(1) };
}

/**
 * คำนวณสรุปสถิติทุกข้อ (ไม่บันทึกลงชีต) — ใช้แสดงผลแบบพรีวิวได้ทันทีโดยไม่ต้องกดบันทึก
 */
function computeStatSummary() {
  const raw = getRawRows_();
  const header = raw.header;
  const rows = raw.rows;

  const itemColByNum = {};
  header.forEach(function (h, idx) {
    const m = String(h).match(/^ข้อ (\d+) - /);
    if (m) itemColByNum[parseInt(m[1], 10)] = idx;
  });

  const items = [];
  for (let i = 1; i <= 70; i++) {
    const colIdx = itemColByNum[i];
    const values = colIdx !== undefined ? rows.map(function (r) { return r[colIdx]; }) : [];
    const stats = computeItemStats_(values);
    items.push(Object.assign({ num: i, text: ITEM_LABELS[i] || '' }, stats));
  }

  return {
    totalResponses: rows.length,
    generatedAt: new Date().toISOString(),
    items: items
  };
}

/**
 * คำนวณสรุปสถิติทุกข้อ แล้วบันทึกผลลง sheet "stat2" (เขียนทับผลเดิมทั้งหมดทุกครั้ง)
 * เรียกจาก stat2.html ผ่าน google.script.run
 */
function computeAndSaveStats() {
  const summary = computeStatSummary();
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(STAT_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(STAT_SHEET_NAME);
  }
  sheet.clearContents();

  const header = ['ข้อที่', 'ข้อความ', 'N (จำนวนผู้ตอบ)', 'Median', 'Q1', 'Q3', 'IQR', 'Min', 'Max', 'ฉันทามติ (IQR <= ' + CONSENSUS_IQR_THRESHOLD + ')'];
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

/**
 * เปิด Web app URL ตรง ๆ -> ให้ serve หน้า airpollution_survey.html เลย
 * รองรับ query param ?page=xxx เผื่ออยากต่อยอด serve หน้าอื่นในโปรเจกต์เดียวกัน
 * เช่น ?page=stat2 -> stat2.html (หน้าสรุปสถิติ), ?page=delphi2 -> delphi_round2_survey.html, ?page=home -> index.html
 */
function doGet(e) {
  const pageMap = {
    'airpollution': { file: 'airpollution_survey', title: 'แบบสอบถามความคิดเห็น สมรรถนะผู้ควบคุมระบบบำบัดมลพิษอากาศ' },
    'stat2': { file: 'stat2', title: 'สรุปผลข้อมูลและค่าสถิติ (Median / IQR) - รอบที่ 2' },
    'delphi2': { file: 'delphi_round2_survey', title: 'แบบสอบถามเทคนิคเดลฟาย รอบที่ 2' },
    'home': { file: 'index', title: 'หน้าแรก' }
  };
  const requested = (e && e.parameter && e.parameter.page) || 'airpollution';
  const page = pageMap[requested] || pageMap['airpollution'];

  return HtmlService
    .createHtmlOutputFromFile(page.file)
    .setTitle(page.title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
