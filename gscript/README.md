# แบบสอบถามเดลฟาย รอบที่ 2 — Google Apps Script Web App

โปรเจกต์นี้แปลงแบบสอบถาม `delphi_round2_survey.html` ให้เป็นเว็บแอปที่รันบน
Google Apps Script และบันทึกคำตอบทุกฉบับลง Google Sheet โดยอัตโนมัติ

## โครงสร้างไฟล์

- `Code.gs` — server-side script: `doGet()` เสิร์ฟหน้าเว็บ, `submitSurvey()`
  รับข้อมูลจากฟอร์มแล้วบันทึกเป็นแถวใหม่ในชีตชื่อ `Responses`
- `Index.html` — หน้าฟอร์ม (เนื้อหาเดียวกับ `delphi_round2_survey.html` เดิม)
  ที่แก้ปุ่ม "ส่งแบบสอบถาม" ให้เรียก `google.script.run.submitSurvey(...)`
  แทนการแสดงหน้าขอบคุณแบบไม่บันทึกข้อมูล
- `appsscript.json` — manifest กำหนดค่าเว็บแอป (deploy แบบให้ทุกคนเข้าถึงได้
  โดยไม่ต้องล็อกอิน)

## วิธีติดตั้ง (ผ่านเว็บ script.google.com)

1. สร้าง Google Sheet ใหม่ (ไฟล์นี้จะเป็นที่เก็บคำตอบ) ตั้งชื่อตามต้องการ เช่น
   "ผลตอบแบบสอบถามเดลฟาย รอบที่ 2"
2. ในชีตนั้น ไปที่เมนู **ส่วนขยาย (Extensions) → Apps Script**
3. ในโปรเจกต์ Apps Script ที่เปิดขึ้นมา ลบไฟล์ `Code.gs` เริ่มต้นแล้วสร้างไฟล์
   ใหม่ตามชื่อในโฟลเดอร์นี้:
   - สร้างไฟล์สคริปต์ชื่อ `Code` แล้ววางเนื้อหาไฟล์ `Code.gs`
   - สร้างไฟล์ HTML ชื่อ `Index` แล้ววางเนื้อหาไฟล์ `Index.html`
   - เปิดไฟล์ `appsscript.json` (ต้องเปิดใช้งาน "Show appsscript.json" ผ่าน
     ไอคอนฟันเฟือง Project Settings → Show "appsscript.json" manifest file
     in editor) แล้วแทนที่ด้วยเนื้อหาไฟล์ `appsscript.json` ในโฟลเดอร์นี้
4. บันทึกโปรเจกต์ทั้งหมด (Ctrl/Cmd+S)
5. กด **Deploy → New deployment**
   - เลือกประเภท **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** (หรือ Anyone with Google account ถ้าต้องการ
     จำกัดผู้ตอบ)
   - กด Deploy แล้วอนุญาตสิทธิ์การเข้าถึง (authorize) ตามที่ระบบขอ
6. คัดลอกลิงก์ **Web app URL** ที่ได้ แล้วส่งให้ผู้เชี่ยวชาญที่จะตอบแบบสอบถาม

เมื่อมีผู้ตอบแบบสอบถามและกด "ส่งแบบสอบถาม" ระบบจะสร้างชีตชื่อ `Responses`
ในสเปรดชีตเดียวกัน พร้อมสร้างหัวตารางอัตโนมัติในการบันทึกครั้งแรก
(คอลัมน์ `timestamp` + ข้อมูลส่วนที่ 1 + ทุกรหัสข้อคำถาม P.../O.../CM.../Co.../CT...
+ `part3_suggestion`) และเพิ่มแถวใหม่ทุกครั้งที่มีการส่งฟอร์ม

## วิธีติดตั้งด้วย clasp (ทางเลือกสำหรับสาย dev)

หากต้องการพัฒนา/deploy จากเครื่องด้วย [clasp](https://github.com/google/clasp):

```bash
npm install -g @google/clasp
clasp login
cd gscript
clasp create --type webapp --title "Delphi Round 2 Survey" --rootDir .
clasp push
clasp deploy
```

`clasp create --type webapp` จะสร้างสเปรดชีตแบบ standalone ให้ใหม่
หากต้องการผูกกับ Google Sheet ที่มีอยู่แล้ว ให้ใช้ `clasp clone <scriptId>`
ของสคริปต์ที่ผูกกับสเปรดชีตนั้นแทน

## หมายเหตุ

- ทุกครั้งที่แก้จำนวน/รหัสข้อคำถามใน `Index.html` (ตัวแปร `SECTIONS`) ให้ลบชีต
  `Responses` เดิมทิ้งก่อนส่งฟอร์มครั้งแรก ไม่เช่นนั้นหัวตารางเดิมจะไม่ตรงกับ
  ข้อคำถามชุดใหม่ (สคริปต์จะเติมค่าตามหัวตารางที่มีอยู่แล้วในชีตเสมอ)
- ใช้ `LockService` เพื่อป้องกันข้อมูลชนกันเมื่อมีผู้ตอบพร้อมกันหลายคน
