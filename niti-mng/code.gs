/**
 * niti-mng : แบบประเมินความสอดคล้องของแบบสอบถามเพื่อการวิจัย (IOC)
 * เรื่อง การพัฒนารูปแบบศักยภาพของผู้จัดการนิติบุคคลในการบริหารระบบการดูแลอาคารที่พักอาศัย
 * ในยุคเศรษฐกิจดิจิทัล
 *
 * ใช้งานด้วย Google Apps Script (Web App) : code.gs + index.html
 * ผู้ใช้ ioc1 - ioc5 (ไม่ใช้รหัสผ่าน ตอบได้คนละ 1 ครั้ง บันทึกสถานะไว้ในชีต user_status)
 */

// ===== ตั้งค่า =====
// ใส่ ID ของ Google Sheet ที่ต้องการเก็บคำตอบ (ถ้าว่างไว้ จะใช้ชีตที่ผูกกับสคริปต์
// หรือสร้างชีตใหม่ให้อัตโนมัติในครั้งแรก)
var SPREADSHEET_ID = '1tNwd8OYORSbz3E288KTOuLcKISjDDoNiEboyP2VTBmA';
var SHEET_RESPONSES = 'responses';
var SHEET_SUMMARY = 'ioc_summary';
var SHEET_STATUS = 'user_status';
var LETTER_FOLDER_NAME = 'niti-mng หนังสือตอบรับผู้เชี่ยวชาญ';

// ข้อความหนังสือตอบรับการเป็นผู้เชี่ยวชาญ
var LETTER = {
  title: 'หนังสือตอบรับการเป็นผู้เชี่ยวชาญ',
  body: 'ในการตรวจสอบคุณภาพของแบบสอบถาม ด้วยวิธีการ IOC งานวิทยานิพนธ์ เรื่อง การพัฒนารูปแบบศักยภาพของผู้จัดการนิติบุคคลในการบริหารระบบการดูแลอาคารที่พักอาศัยในยุคเศรษฐกิจดิจิทัล ของนักศึกษาปริญญาเอก นายพยัคฆ์ อุ่นใหม่ สาขาวิชาการพัฒนาธุรกิจอุตสาหกรรมและทรัพยากรมนุษย์ คณะพัฒนาธุรกิจและอุตสาหกรรม มหาวิทยาลัยเทคโนโลยีพระจอมเกล้าพระนครเหนือ'
};

// คอลัมน์ในชีต user_status
var STATUS_HEADER = ['username', 'status', 'ชื่อผู้เชี่ยวชาญ', 'เวลาที่ส่ง', 'ตำแหน่ง', 'หน่วยงาน', 'หนังสือตอบรับ (Google Doc)'];

// ผู้เชี่ยวชาญ IOC (ไม่ใช้รหัสผ่าน)
var USERS = ['ioc1', 'ioc2', 'ioc3', 'ioc4', 'ioc5'];

// ===== ข้อคำถาม (ตามต้นฉบับ ห้ามแก้ไข) =====
var PART1 = [
  'เพศ',
  'อายุ',
  'ระดับการศึกษาสูงสุด',
  'ตำแหน่งหรือลักษณะงานปัจจุบัน',
  'ประสบการณ์ด้านการบริหารนิติบุคคลหรือที่พักอาศัย'
];

var GROUP_NAMES = {
  K: 'ความรู้และความเข้าใจ',
  S: 'ทักษะและความสามารถในการบริหารจัดการ',
  A: 'คุณลักษณะและพฤติกรรมที่พึงประสงค์',
  I: 'ศักยภาพเชิงบูรณาการและการตัดสินใจ'
};

var PART2 = [
  { code: 'MC01', name: 'การบริหารอาคาร ทรัพย์สิน และความปลอดภัย', groups: [
    { g: 'K', items: [
      'มีความรู้เกี่ยวกับหลักการทำงานของระบบวิศวกรรม ระบบประกอบอาคาร และระบบตรวจติดตามอาคารที่สำคัญ',
      'มีความรู้เกี่ยวกับหลักการบำรุงรักษาเชิงป้องกันและการบริหารวงจรชีวิตทรัพย์สิน',
      'มีความรู้เกี่ยวกับข้อกำหนดและมาตรฐานด้านความปลอดภัยและการตอบสนองเหตุฉุกเฉิน'
    ]},
    { g: 'S', items: [
      'สามารถจัดทำแผนบริหารอาคารให้สอดคล้องกับสภาพอาคารและความต้องการของผู้อยู่อาศัยได้',
      'สามารถวางแผนและควบคุมการบำรุงรักษาระบบอาคารและทรัพย์สินส่วนกลางได้',
      'สามารถใช้ข้อมูลจากระบบตรวจวัดหรือระบบแจ้งเตือนเพื่อวิเคราะห์ความผิดปกติของอาคารและประสานการแก้ไขได้',
      'สามารถประเมินและจัดลำดับความเสี่ยงที่อาจกระทบต่ออาคารและผู้อยู่อาศัยได้',
      'สามารถจัดทำแผนฉุกเฉินและแผนความต่อเนื่องในการดำเนินงานได้'
    ]},
    { g: 'A', items: [
      'ให้ความสำคัญกับความปลอดภัยของผู้อยู่อาศัยเป็นลำดับแรกในการปฏิบัติงาน',
      'มีความรอบคอบและรับผิดชอบในการตรวจสอบสภาพอาคารและทรัพย์สินส่วนกลาง',
      'สามารถควบคุมอารมณ์และปฏิบัติหน้าที่อย่างมีสติเมื่อเกิดสถานการณ์ฉุกเฉิน'
    ]},
    { g: 'I', items: [
      'สามารถใช้ข้อมูลสภาพอาคาร ประวัติการซ่อม และความเสี่ยงประกอบการวางแผนบำรุงรักษาได้',
      'สามารถตัดสินใจเลือกระหว่างการซ่อม การปรับปรุง และการทดแทนทรัพย์สินโดยพิจารณาต้นทุนตลอดอายุการใช้งานได้',
      'สามารถจัดลำดับงานเร่งด่วนโดยพิจารณาความปลอดภัย ผลกระทบ และทรัพยากรที่มีอยู่ได้',
      'สามารถทบทวนเหตุขัดข้องหรือเหตุฉุกเฉินและกำหนดมาตรการป้องกันการเกิดซ้ำได้'
    ]}
  ]},
  { code: 'MC02', name: 'การบริหารองค์กร กฎหมาย การเงิน และธรรมาภิบาล', groups: [
    { g: 'K', items: [
      'มีความรู้เกี่ยวกับกฎหมายอาคารชุด กฎหมายควบคุมอาคาร และกฎหมายที่เกี่ยวข้องกับการบริหารที่พักอาศัย',
      'มีความรู้เกี่ยวกับหลักการงบประมาณ การบัญชี การเงิน และการควบคุมภายในของนิติบุคคล',
      'มีความเข้าใจหลักธรรมาภิบาล การป้องกันผลประโยชน์ทับซ้อน และความรับผิดชอบต่อผู้มีส่วนได้ส่วนเสีย'
    ]},
    { g: 'S', items: [
      'สามารถตีความและนำกฎหมาย ข้อบังคับ และมติที่ประชุมไปใช้กับการปฏิบัติงานได้อย่างถูกต้อง',
      'สามารถจัดทำแผนงานและงบประมาณประจำปีให้เชื่อมโยงกับเป้าหมายของนิติบุคคลได้',
      'สามารถติดตามรายรับ รายจ่าย กระแสเงินสด และสถานะลูกหนี้ของนิติบุคคลได้',
      'สามารถกำหนดขอบเขตงานและเกณฑ์ประเมินข้อเสนอในการจัดซื้อจัดจ้างได้',
      'สามารถจัดทำและนำเสนอรายงานผลการดำเนินงานต่อคณะกรรมการและเจ้าของร่วมได้'
    ]},
    { g: 'A', items: [
      'ปฏิบัติหน้าที่โดยยึดหลักความถูกต้อง เป็นธรรม และคำนึงถึงประโยชน์ส่วนรวม',
      'แสดงความโปร่งใสและพร้อมให้ตรวจสอบในการบริหารเงินและทรัพยากรของนิติบุคคล',
      'รักษาความลับและใช้ข้อมูลของนิติบุคคลอย่างรับผิดชอบ'
    ]},
    { g: 'I', items: [
      'สามารถประเมินผลกระทบทางกฎหมาย การเงิน และการดำเนินงานก่อนตัดสินใจเรื่องสำคัญได้',
      'สามารถจัดสรรงบประมาณโดยคำนึงถึงความจำเป็น ความคุ้มค่า ความเสี่ยง และความเป็นธรรมได้',
      'สามารถจัดการสถานการณ์ผลประโยชน์ทับซ้อนโดยยึดหลักธรรมาภิบาลได้',
      'สามารถแปลงมติที่ประชุมเป็นแผนปฏิบัติงานที่มีผู้รับผิดชอบ กรอบเวลา และการติดตามผลที่ชัดเจนได้'
    ]}
  ]},
  { code: 'MC03', name: 'การบริหารบุคลากร การบริการ และชุมชนที่พักอาศัย', groups: [
    { g: 'K', items: [
      'มีความรู้เกี่ยวกับหลักภาวะผู้นำ การบริหารบุคลากร และการประเมินผลการปฏิบัติงาน',
      'มีความเข้าใจหลักการบริหารผู้รับเหมาและการกำหนดระดับการให้บริการ',
      'มีความเข้าใจหลักการบริการ การจัดการข้อร้องเรียน และการบริหารความขัดแย้งในชุมชน'
    ]},
    { g: 'S', items: [
      'สามารถกำหนดบทบาท มอบหมายงาน และสื่อสารความคาดหวังแก่ทีมงานได้อย่างชัดเจน',
      'สามารถติดตามผล ให้ข้อมูลย้อนกลับ และพัฒนาศักยภาพของบุคลากรได้',
      'สามารถกำหนดตัวชี้วัดและประเมินผลงานของผู้รับเหมาหรือผู้ให้บริการภายนอกได้',
      'สามารถรับฟัง วิเคราะห์ และสื่อสารแนวทางแก้ไขข้อร้องเรียนได้อย่างเป็นกลาง',
      'สามารถเจรจา ไกล่เกลี่ย และประสานความร่วมมือระหว่างผู้มีส่วนได้ส่วนเสียได้'
    ]},
    { g: 'A', items: [
      'มีจิตบริการและแสดงความเอาใจใส่ต่อความต้องการของผู้อยู่อาศัย',
      'เคารพความแตกต่างและปฏิบัติต่อผู้เกี่ยวข้องอย่างเท่าเทียม',
      'แสดงความรับผิดชอบต่อผลการทำงานของทีมงานและผู้ให้บริการที่อยู่ภายใต้การกำกับ'
    ]},
    { g: 'I', items: [
      'สามารถจำแนกเรื่องที่รับแจ้งว่าเป็นคำขอบริการ ข้อร้องเรียน การฝ่าฝืนกฎ เหตุฉุกเฉิน หรือประเด็นกฎหมายได้',
      'สามารถเลือกแนวทางจัดการความขัดแย้งโดยคำนึงถึงข้อเท็จจริง สิทธิของคู่กรณี และประโยชน์ส่วนรวมได้',
      'สามารถเชื่อมโยงข้อมูลสะท้อนกลับของผู้อยู่อาศัยกับการปรับปรุงกระบวนการบริการได้',
      'สามารถสร้างความร่วมมือระหว่างทีมงาน ผู้รับเหมา คณะกรรมการ และผู้อยู่อาศัยเพื่อแก้ปัญหาร่วมกันได้'
    ]}
  ]},
  { code: 'MC04', name: 'การบริหารสิ่งแวดล้อม พลังงาน และความยั่งยืน', groups: [
    { g: 'K', items: [
      'มีความรู้เกี่ยวกับการจัดการของเสีย น้ำเสีย คุณภาพอากาศ และเหตุรำคาญในที่พักอาศัย',
      'มีความรู้เกี่ยวกับหลักการจัดการพลังงาน น้ำ และทรัพยากรของอาคาร',
      'มีความเข้าใจแนวคิดความยั่งยืนและผลกระทบด้านสิ่งแวดล้อมจากการบริหารอาคาร'
    ]},
    { g: 'S', items: [
      'สามารถจัดระบบคัดแยก จัดเก็บ และกำจัดของเสียภายในอาคารได้อย่างเหมาะสม',
      'สามารถติดตามและวิเคราะห์ข้อมูลการใช้ไฟฟ้า น้ำ และทรัพยากรของอาคารได้',
      'สามารถกำหนดมาตรการลดการใช้พลังงานและทรัพยากรโดยไม่กระทบต่อบริการที่จำเป็นได้',
      'สามารถกำกับดูแลระบบน้ำเสีย คุณภาพอากาศ พื้นที่สีเขียว และการควบคุมสัตว์รบกวนได้',
      'สามารถสื่อสารและสร้างการมีส่วนร่วมของผู้อยู่อาศัยในการจัดการสิ่งแวดล้อมได้'
    ]},
    { g: 'A', items: [
      'ตระหนักถึงผลกระทบด้านสิ่งแวดล้อมจากการตัดสินใจบริหารอาคาร',
      'ใช้ทรัพยากรของนิติบุคคลอย่างประหยัดและรับผิดชอบ',
      'สนับสนุนการมีส่วนร่วมของชุมชนในการดูแลสิ่งแวดล้อมอย่างต่อเนื่อง'
    ]},
    { g: 'I', items: [
      'สามารถประเมินความคุ้มค่าของโครงการประหยัดพลังงานโดยพิจารณาต้นทุน ผลประหยัด และผลกระทบต่อผู้ใช้อาคารได้',
      'สามารถใช้ข้อมูลการใช้ทรัพยากรเพื่อกำหนดเป้าหมายและติดตามผลด้านสิ่งแวดล้อมได้',
      'สามารถจัดสมดุลระหว่างคุณภาพการอยู่อาศัย ค่าใช้จ่าย และเป้าหมายด้านความยั่งยืนได้',
      'สามารถจัดทำแนวทางตอบสนองต่อปัญหาสิ่งแวดล้อมที่กระทบต่อสุขภาวะของผู้อยู่อาศัยได้'
    ]}
  ]},
  { code: 'MC05', name: 'เทคโนโลยีดิจิทัล ข้อมูล และนวัตกรรม', groups: [
    { g: 'K', items: [
      'มีความรู้เกี่ยวกับ BMS, IoT, Smart Meter และระบบตรวจติดตามสภาพอาคารแบบอัตโนมัติ',
      'มีความรู้เกี่ยวกับ CCTV, Video Analytics, Access Control, LPR และระบบแจ้งเหตุหรือป้องกันอัคคีภัยที่เชื่อมต่อแบบดิจิทัล',
      'มีความเข้าใจระบบบริการเจ้าของร่วม เช่น แอปพลิเคชันลูกบ้าน ระบบผู้มาติดต่อ ระบบจองพื้นที่ส่วนกลาง และการชำระเงินดิจิทัล'
    ]},
    { g: 'S', items: [
      'สามารถเลือกและประยุกต์ใช้เทคโนโลยีอาคารอัจฉริยะให้เหมาะกับสภาพอาคารและปัญหาที่ต้องการแก้ไขได้',
      'สามารถใช้ข้อมูลจาก Smart Meter, IoT, CCTV หรือระบบควบคุมอาคารเพื่อติดตามประสิทธิภาพและความปลอดภัยได้',
      'สามารถใช้แพลตฟอร์มดิจิทัลเพื่อสื่อสาร รับแจ้งงาน จองบริการ และอำนวยความสะดวกแก่เจ้าของร่วมได้',
      'สามารถกำหนดสิทธิการเข้าถึงและแนวทางคุ้มครองข้อมูลจาก CCTV ทะเบียนรถ ผู้มาติดต่อ และข้อมูลผู้อยู่อาศัยได้',
      'สามารถประเมินความพร้อมของระบบ บุคลากร และกระบวนการก่อนเชื่อมต่อหรือนำเทคโนโลยีใหม่มาใช้ได้'
    ]},
    { g: 'A', items: [
      'เปิดรับการเรียนรู้และปรับตัวต่อการเปลี่ยนแปลงทางเทคโนโลยี',
      'ใช้ข้อมูลและเทคโนโลยีอย่างมีจริยธรรมและคำนึงถึงความเป็นส่วนตัว',
      'ตรวจสอบความถูกต้องของข้อมูลก่อนนำไปใช้สื่อสารหรือตัดสินใจ'
    ]},
    { g: 'I', items: [
      'สามารถเลือกเทคโนโลยีโดยพิจารณาปัญหา งบประมาณ ความปลอดภัย ความเป็นส่วนตัว และความสะดวกของเจ้าของร่วมได้',
      'สามารถเชื่อมโยงข้อมูลจาก BMS, IoT, CCTV, Access Control และระบบบริการลูกบ้านเพื่อค้นหาสาเหตุของปัญหาได้',
      'สามารถประเมินผลลัพธ์ของเทคโนโลยีจากประสิทธิภาพ ความปลอดภัย คุณภาพบริการ ความพึงพอใจ และความคุ้มค่าได้',
      'สามารถจัดทำแผนรองรับเมื่อระบบดิจิทัลหรือระบบอาคารอัจฉริยะขัดข้องเพื่อให้บริการสำคัญดำเนินต่อได้'
    ]}
  ]}
];

// ===== Web App =====
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('niti-mng | แบบประเมิน IOC')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** รายการข้อทั้งหมดแบบแบน (ใช้ทั้งฝั่งหน้าเว็บและหัวคอลัมน์ชีต) */
function getItems_() {
  var list = [];
  PART1.forEach(function (t, i) {
    list.push({ id: 'p1_' + (i + 1), part: 1, no: i + 1, text: t });
  });
  var no = 0;
  PART2.forEach(function (mc) {
    mc.groups.forEach(function (gr) {
      gr.items.forEach(function (t) {
        no++;
        list.push({ id: 'p2_' + no, part: 2, no: no, mc: mc.code, g: gr.g, text: t });
      });
    });
  });
  return list;
}

function getQuestions() {
  return { part1: PART1, part2: PART2, groupNames: GROUP_NAMES };
}

function getSpreadsheet_() {
  if (SPREADSHEET_ID) return SpreadsheetApp.openById(SPREADSHEET_ID);
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.create('niti-mng ผลการประเมิน IOC');
  props.setProperty('SPREADSHEET_ID', ss.getId());
  return ss;
}

function getResponseSheet_() {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(SHEET_RESPONSES);
  if (!sh) {
    sh = ss.insertSheet(SHEET_RESPONSES);
    var header = ['timestamp', 'username', 'ชื่อผู้เชี่ยวชาญ'];
    getItems_().forEach(function (it) {
      var label = (it.part === 1 ? 'ส่วนที่1 ข้อ' : 'ส่วนที่2 ข้อ') + it.no;
      header.push(label + ' (IOC)');
      header.push(label + ' ข้อเสนอแนะ');
    });
    header.push('ส่วนที่3 ข้อเสนอแนะเพิ่มเติม');
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#fde047');
    sh.setFrozenRows(1);
  }
  return sh;
}

function normUser_(u) {
  return String(u || '').trim().toLowerCase();
}

function checkUser_(user) {
  user = normUser_(user);
  if (USERS.indexOf(user) === -1) throw new Error('ไม่พบชื่อผู้ใช้นี้ในระบบ (ใช้ ioc1 - ioc5)');
  return user;
}

/** ชีตสถานะผู้ใช้ : username | status | ชื่อผู้เชี่ยวชาญ | เวลาที่ส่ง */
function getStatusSheet_() {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(SHEET_STATUS);
  if (!sh) {
    sh = ss.insertSheet(SHEET_STATUS);
    sh.setFrozenRows(1);
  }
  if (sh.getRange(1, STATUS_HEADER.length).getValue() !== STATUS_HEADER[STATUS_HEADER.length - 1]) {
    sh.getRange(1, 1, 1, STATUS_HEADER.length).setValues([STATUS_HEADER])
      .setFontWeight('bold').setBackground('#fde047');
  }
  // เติมผู้ใช้ที่ยังไม่มีในชีต
  var last = sh.getLastRow();
  var have = last >= 2 ? sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return normUser_(r[0]); }) : [];
  var add = USERS.filter(function (u) { return have.indexOf(u) === -1; })
    .map(function (u) { return [u, 'ยังไม่ตอบ', '', '']; });
  if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, 4).setValues(add);
  return sh;
}

function findStatusRow_(sh, user) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var vals = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) if (normUser_(vals[i][0]) === user) return i + 2;
  return -1;
}

function hasSubmitted_(user) {
  var sh = getStatusSheet_();
  var row = findStatusRow_(sh, user);
  return row > 0 && String(sh.getRange(row, 2).getValue()) === 'ตอบแล้ว';
}

function markSubmitted_(user, name, position, org) {
  var sh = getStatusSheet_();
  var row = findStatusRow_(sh, user);
  if (row < 0) { row = sh.getLastRow() + 1; sh.getRange(row, 1).setValue(user); }
  sh.getRange(row, 2, 1, 5).setValues([['ตอบแล้ว', name, new Date(), position, org]]);
}

/** เรียกจากหน้าเว็บ: เข้าสู่ระบบด้วยชื่อผู้ใช้ และตรวจสถานะการตอบ */
function login(user) {
  user = checkUser_(user);
  return { ok: true, user: user, submitted: hasSubmitted_(user) };
}

/** เรียกจากหน้าเว็บ: บันทึกคำตอบ */
function submitResponse(user, payload) {
  user = checkUser_(user);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (hasSubmitted_(user)) {
      return { ok: false, duplicate: true, message: 'ผู้ใช้ ' + user + ' ได้ตอบแบบประเมินแล้ว ไม่สามารถตอบซ้ำได้' };
    }
    var name = String(payload.name || '').trim();
    var position = String(payload.position || '').trim();
    var org = String(payload.org || '').trim();
    if (!name) throw new Error('กรุณากรอกชื่อผู้เชี่ยวชาญ');
    if (!position) throw new Error('กรุณากรอกตำแหน่ง');
    if (!org) throw new Error('กรุณากรอกหน่วยงาน');
    var row = [new Date(), user, name];
    getItems_().forEach(function (it) {
      var raw = payload.ratings ? payload.ratings[it.id] : null;
      var v = Number(raw);
      if (raw === '' || raw == null || [1, 0, -1].indexOf(v) === -1) {
        throw new Error('ยังไม่ได้ให้ความคิดเห็นในข้อ ' + (it.part === 1 ? 'ส่วนที่ 1 ข้อ ' : 'ส่วนที่ 2 ข้อ ') + it.no);
      }
      row.push(v);
      row.push(String((payload.comments && payload.comments[it.id]) || '').trim());
    });
    row.push(String(payload.part3 || '').trim());
    getResponseSheet_().appendRow(row);
    markSubmitted_(user, name, position, org);
    SpreadsheetApp.flush();
    try { updateSummary(); } catch (e) { console.error(e); }
  } finally {
    lock.releaseLock();
  }
  var letter = null;
  try { letter = getLetter(user); } catch (e) { console.error(e); }
  return { ok: true, message: 'บันทึกคำตอบเรียบร้อยแล้ว ขอขอบพระคุณเป็นอย่างสูง', letter: letter };
}

// ===== หนังสือตอบรับการเป็นผู้เชี่ยวชาญ =====
function getLetterFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('LETTER_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* สร้างใหม่ */ }
  }
  var folder = DriveApp.createFolder(LETTER_FOLDER_NAME);
  props.setProperty('LETTER_FOLDER_ID', folder.getId());
  return folder;
}

function letterLinks_(docId, info) {
  return {
    name: info.name, position: info.position, org: info.org,
    title: LETTER.title, body: LETTER.body,
    pdfUrl: 'https://docs.google.com/document/d/' + docId + '/export?format=pdf',
    docxUrl: 'https://docs.google.com/document/d/' + docId + '/export?format=docx'
  };
}

function createLetterDoc_(user, info) {
  var doc = DocumentApp.create('หนังสือตอบรับผู้เชี่ยวชาญ - ' + info.name + ' (' + user + ')');
  doc.setMarginTop(72).setMarginBottom(72).setMarginLeft(108).setMarginRight(72);
  var body = doc.getBody();
  body.clear();
  var base = {};
  base[DocumentApp.Attribute.FONT_FAMILY] = 'Sarabun';
  base[DocumentApp.Attribute.FONT_SIZE] = 16;
  base[DocumentApp.Attribute.BOLD] = false;
  base[DocumentApp.Attribute.LINE_SPACING] = 1.15;
  base[DocumentApp.Attribute.SPACING_AFTER] = 0;
  base[DocumentApp.Attribute.SPACING_BEFORE] = 0;

  function para(text, align, opts) {
    var pa = body.appendParagraph(text);
    pa.setAttributes(base);
    pa.setAlignment(align || DocumentApp.HorizontalAlignment.LEFT);
    opts = opts || {};
    if (opts.bold) pa.setBold(true);
    if (opts.indent) pa.setIndentFirstLine(opts.indent);
    if (opts.indentStart) pa.setIndentStart(opts.indentStart);
    if (opts.after) pa.setSpacingAfter(opts.after);
    return pa;
  }
  var C = DocumentApp.HorizontalAlignment.CENTER;

  para(LETTER.title, C, { bold: true, after: 18 });
  para('ข้าพเจ้า ' + info.name + ' ' + info.position + ' ' + info.org, null, { indent: 54 });
  para('☑ ยินดีเป็นผู้เชี่ยวชาญ                    ☐ ไม่ยินดีเป็นผู้เชี่ยวชาญ',
       DocumentApp.HorizontalAlignment.LEFT, { indentStart: 54 });
  para(LETTER.body, null, { indent: 54, after: 36 });
  para('ลงชื่อ ................................................', C, { indentStart: 180 });
  para('(' + info.name + ')', C, { indentStart: 180 });
  para(info.position, C, { indentStart: 180 });
  para(info.org, C, { indentStart: 180 });
  // ลบย่อหน้าว่างแรกที่ Docs สร้างไว้
  if (body.getNumChildren() > 1 && body.getChild(0).asParagraph().getText() === '') body.removeChild(body.getChild(0));
  doc.saveAndClose();

  var file = DriveApp.getFileById(doc.getId());
  getLetterFolder_().addFile(file);
  DriveApp.getRootFolder().removeFile(file);
  // ให้ผู้เชี่ยวชาญดาวน์โหลดได้จากลิงก์ (ดูได้อย่างเดียว)
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return doc.getId();
}

/** เรียกจากหน้าเว็บ: คืนลิงก์ดาวน์โหลดหนังสือตอบรับ (สร้างให้ถ้ายังไม่มี) */
function getLetter(user) {
  user = checkUser_(user);
  var sh = getStatusSheet_();
  var row = findStatusRow_(sh, user);
  if (row < 0 || String(sh.getRange(row, 2).getValue()) !== 'ตอบแล้ว') {
    throw new Error('ต้องส่งแบบประเมินก่อน จึงจะดาวน์โหลดหนังสือตอบรับได้');
  }
  var v = sh.getRange(row, 1, 1, STATUS_HEADER.length).getValues()[0];
  var info = { name: String(v[2]), position: String(v[4]), org: String(v[5]) };
  var link = String(v[6] || '');
  var m = link.match(/\/d\/([a-zA-Z0-9_-]+)/);
  var docId = m ? m[1] : '';
  if (docId) {
    try { DriveApp.getFileById(docId); } catch (e) { docId = ''; }
  }
  if (!docId) {
    docId = createLetterDoc_(user, info);
    sh.getRange(row, 7).setValue('https://docs.google.com/document/d/' + docId + '/edit');
  }
  return letterLinks_(docId, info);
}

/** สร้าง/ปรับปรุงชีตสรุปค่า IOC รายข้อ (รันเองได้จากเมนู Run) */
function updateSummary() {
  var ss = getSpreadsheet_();
  var rs = getResponseSheet_();
  var items = getItems_();
  var last = rs.getLastRow();
  var data = last >= 2 ? rs.getRange(2, 1, last - 1, rs.getLastColumn()).getValues() : [];
  var sh = ss.getSheetByName(SHEET_SUMMARY) || ss.insertSheet(SHEET_SUMMARY);
  sh.clear();
  var out = [['ส่วน', 'องค์ประกอบ', 'กลุ่ม', 'ข้อ', 'รายการ', 'จำนวนผู้ตอบ', '+1', '0', '-1', 'ผลรวม', 'IOC', 'ผลการพิจารณา']];
  items.forEach(function (it, idx) {
    var col = 3 + idx * 2;
    var n = 0, p = 0, z = 0, m = 0;
    data.forEach(function (r) {
      var v = r[col];
      if (v === '' || v == null) return;
      n++;
      if (Number(v) === 1) p++; else if (Number(v) === 0) z++; else if (Number(v) === -1) m++;
    });
    var sum = p - m;
    var ioc = n ? sum / n : '';
    out.push([
      it.part === 1 ? 'ส่วนที่ 1' : 'ส่วนที่ 2',
      it.mc || '', it.g || '', it.no, it.text, n, p, z, m, sum,
      ioc === '' ? '' : Math.round(ioc * 100) / 100,
      ioc === '' ? '' : (ioc >= 0.5 ? 'ผ่านเกณฑ์ (≥ 0.50)' : 'ควรปรับปรุง')
    ]);
  });
  sh.getRange(1, 1, out.length, out[0].length).setValues(out);
  sh.getRange(1, 1, 1, out[0].length).setFontWeight('bold').setBackground('#fde047');
  sh.setFrozenRows(1);
  sh.setColumnWidth(5, 480);
}
