---
name: thai-docx-layout-16pt
description: "(แทน thai-docx-layout) ใช้ทุกครั้งที่สร้างหรือแก้ไฟล์ Word ภาษาไทย: TH Sarabun New เท่านั้น ขนาด 16 pt ทั้งเอกสาร (หัวข้อใช้ตัวหนา), A4 แนวตั้ง, ขอบ 1.5/1.5/1/1 นิ้ว, กระจายแบบไทย, เยื้อง 1.27 ซม., ตัดคำ, ตารางไม่ตกขอบ และตรวจก่อนส่ง"
---

# การจัดหน้าเอกสาร Word ภาษาไทย (วิทยานิพนธ์/งานวิจัย) — ฉบับ 16 pt

## When to use
ทุกครั้งที่สร้างหรือแก้ไฟล์ Word ภาษาไทย (วิทยานิพนธ์ รายงานวิจัย แบบสอบถาม) ทั้งสร้างใหม่ด้วย python-docx และแก้ไฟล์ที่เปิดอยู่ใน Word ผ่าน execute_office_js ใช้แทน skill `thai-docx-layout` เดิม (ถ้าขัดกัน ให้ยึดฉบับนี้)

## ข้อกำหนดตายตัว
| รายการ | ค่า |
|---|---|
| กระดาษ | A4 แนวตั้งเสมอ (11906 x 16838 twips) ห้ามแนวนอน |
| ระยะขอบ | ซ้าย 1.5", บน 1.5", ขวา 1", ล่าง 1" (2160/2160/1440/1440 twips) |
| พื้นที่พิมพ์ | กว้าง 8306 twips (14.65 ซม.) ทุกอย่างต้องไม่เกิน |
| ฟอนต์ | **TH Sarabun New เท่านั้น** ทุก run ตั้งครบ ascii, hAnsi, cs, eastAsia รวมถึงสไตล์ Normal |
| ขนาด | **16 pt ทั้งเอกสาร ไม่มีข้อยกเว้น** — เนื้อหา หัวข้อ ชื่อบท ชื่อตาราง ที่มา และในตาราง ห้ามใช้ 14/18/20 pt |
| ตัวหนา | เฉพาะหัวข้อ ชื่อบท และหัวตาราง (ยังคง 16 pt) |
| ภาษา | ทุก run ตั้ง `w:lang w:bidi="th-TH"` และ `w:szCs`/`w:bCs` คู่กับ `w:sz`/`w:b` เสมอ |
| การจัดย่อหน้า | เนื้อหาใช้ `w:jc w:val="thaiDistribute"` |
| ย่อหน้าแรก | first-line indent 1.27 ซม. (36 pt) ห้ามใช้แท็บหรือเคาะวรรค |
| หัวข้อ/ชื่อตาราง | ชิดซ้ายหรือกึ่งกลาง ไม่ใช้ thaiDistribute |

## กฎกันหน้าเพี้ยน
1. **ตัดคำไทยด้วย ZWSP (U+200B)** ระหว่างคำไทยด้วย `pythainlp` (`newmm`) ไม่แทรกในตัวเลข/อังกฤษ/กลางคำ ถ้าไม่มี pythainlp ให้แจ้งผู้ใช้ และแทรก ZWSP ด้วยมืออย่างน้อยในเซลล์ตารางที่ Word ตัดกลางคำ
2. **ตาราง fixed layout** `w:tblLayout type="fixed"` ผลรวม gridCol/tcW ≤ 8306 ห้าม autofit **ห้ามลดฟอนต์ต่ำกว่า 16 pt** — ให้ปรับสัดส่วนคอลัมน์หรือย่อหัวคอลัมน์แทน ไม่หมุนหน้ากระดาษ
3. **รูปภาพกว้าง ≤ 5.77 นิ้ว** จัดกึ่งกลาง

## ตารางที่ 16 pt
- คอลัมน์ที่ข้อความยาวที่สุดให้กว้างที่สุด ตรวจด้วยตาว่าไม่มีคำตกบรรทัดเดี่ยว
- ป้ายที่มีวงเล็บภาษาอังกฤษ ใช้ soft line break (Shift+Enter) ก่อนวงเล็บ ให้ทุกแถวเป็นแบบเดียวกัน
- เลขอ้างอิง เช่น "หัวข้อ 2.1.3" ใช้ non-breaking space (U+00A0)

## ขั้นตอน — สร้างไฟล์ใหม่ (python-docx)
1. `pip install python-docx pythainlp --break-system-packages`
2. ใช้สคริปต์ `thai_layout.py` ด้านล่าง (`setup_document`, `add_para`, `fix_table`)
3. รัน `check_layout(path)` ต้องได้ลิสต์ว่าง
4. แปลง PDF (`soffice --headless --convert-to pdf`) ตรวจด้วยตาว่าไม่ตกขอบ ตารางไม่ล้น หัวข้อไม่ค้างท้ายหน้า
5. แจ้งผู้ใช้สั้น ๆ
Done when: `check_layout` ว่าง และตรวจ PDF แล้ว

## ขั้นตอน — แก้ไฟล์ที่เปิดใน Word (execute_office_js)
1. ตรวจ `sections.items[0].pageSetup`: A4, Portrait, ขอบ 108/108/72/72 pt
2. สไตล์ Normal: `font.name = "TH Sarabun New"`, `font.size = 16`
3. วนทุกย่อหน้า (รวมในตาราง) ตั้ง `font.name`/`font.size = 16` แล้วอ่านกลับ ถ้ายังไม่ใช่ 16 (มักเป็น run ที่มี `<w:cs/>` แต่ไม่มี `w:szCs`) ให้แก้ OOXML ของย่อหน้านั้น: ใส่ `<w:rFonts>` ครบ 4 ค่า + `<w:sz w:val="32"/><w:szCs w:val="32"/>` แล้ว `insertOoxml(..., "Replace")` ตรวจว่าไม่เกิดย่อหน้าว่างเกินในเซลล์ จากนั้นตั้ง font.name ซ้ำทุกย่อหน้า
4. ย่อหน้าเนื้อหาที่ขึ้นต้นด้วยแท็บ: ลบแท็บนำหน้า ตั้ง `firstLineIndent = 36`
5. ตรวจ `w:jc` ใน OOXML ของย่อหน้าเนื้อหาต้องเป็น `thaiDistribute` (Office.js รายงาน "Unknown")
6. ตาราง: ตรวจ `tblLayout fixed` และผลรวม gridCol ≤ 8306 ปรับด้วย `cell.columnWidth` (pt) ทุกแถว
7. ลบย่อหน้าว่างเกินที่ไม่มีรูป/อ็อบเจกต์ ใช้ spaceBefore/After แทน
8. `verify_doc_visual` ตรวจตาราง คำตกบรรทัดเดี่ยว และขอบ
Done when: ทุกย่อหน้ารายงาน `16 | TH Sarabun New` และ visual check ไม่พบตารางล้นขอบ

## การจัดไฟล์
- คนละบท/หัวข้อใหญ่ แยกไฟล์
- ชื่อไฟล์ลงท้ายวันที่ (DDMMYYYY ค.ศ.) และเวอร์ชัน เช่น `บทที่2_2.3_แนวคิดสมรรถนะ_02112026_v1.docx`

## สคริปต์ thai_layout.py
```python
import re
from docx import Document
from docx.shared import Twips, Cm
from docx.enum.section import WD_ORIENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

FONT = "TH Sarabun New"
SIZE = 16
PAGE_W, PAGE_H = 11906, 16838
M_LEFT, M_TOP, M_RIGHT, M_BOTTOM = 2160, 2160, 1440, 1440
USABLE_W = PAGE_W - M_LEFT - M_RIGHT  # 8306
ZWSP = "\u200b"
THAI = re.compile(r"[\u0e00-\u0e7f]")

def _child(parent, tag):
    el = parent.find(qn(tag))
    if el is None:
        el = OxmlElement(tag)
        seq = getattr(parent, "_tag_seq", ())
        if tag in seq:
            parent.insert_element_before(el, *seq[seq.index(tag) + 1:])
        else:
            parent.append(el)
    return el

def thai_rpr(rPr, bold=None):
    f = _child(rPr, "w:rFonts")
    for a in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        f.set(qn(a), FONT)
    if bold is not None:
        for t in ("w:b", "w:bCs"):
            _child(rPr, t).set(qn("w:val"), "1" if bold else "0")
    for t in ("w:sz", "w:szCs"):
        _child(rPr, t).set(qn("w:val"), str(SIZE * 2))
    lang = _child(rPr, "w:lang")
    lang.set(qn("w:val"), "en-US"); lang.set(qn("w:bidi"), "th-TH")

def setup_document(doc):
    for s in doc.sections:
        s.orientation = WD_ORIENT.PORTRAIT
        s.page_width, s.page_height = Twips(PAGE_W), Twips(PAGE_H)
        s.left_margin, s.top_margin = Twips(M_LEFT), Twips(M_TOP)
        s.right_margin, s.bottom_margin = Twips(M_RIGHT), Twips(M_BOTTOM)
    for st in doc.styles:
        if st.type in (1, 2):
            thai_rpr(_child(st.element, "w:rPr"))

def add_breaks(text):
    if not THAI.search(text):
        return text
    from pythainlp.tokenize import word_tokenize
    out = []
    for w in word_tokenize(text.replace(ZWSP, ""), engine="newmm", keep_whitespace=True):
        if out and THAI.search(w[0]) and THAI.search(out[-1][-1]):
            out.append(ZWSP)
        out.append(w)
    return "".join(out)

def add_para(doc_or_cell, text, bold=None, align="thaiDistribute", first_line_cm=None):
    p = doc_or_cell.add_paragraph()
    _child(p._p.get_or_add_pPr(), "w:jc").set(qn("w:val"), align)
    if first_line_cm:
        p.paragraph_format.first_line_indent = Cm(first_line_cm)
    r = p.add_run(add_breaks(text))
    thai_rpr(r._r.get_or_add_rPr(), bold)
    return p

def fix_table(table, widths=None):
    n = len(table.columns)
    widths = widths or [1] * n
    scale = USABLE_W / sum(widths)
    widths = [int(w * scale) for w in widths]
    widths[-1] += USABLE_W - sum(widths)
    table.autofit = False
    tblPr = table._tbl.tblPr
    w = _child(tblPr, "w:tblW"); w.set(qn("w:w"), str(USABLE_W)); w.set(qn("w:type"), "dxa")
    _child(tblPr, "w:tblLayout").set(qn("w:type"), "fixed")
    for g, wd in zip(table._tbl.tblGrid.findall(qn("w:gridCol")), widths):
        g.set(qn("w:w"), str(wd))
    for row in table.rows:
        for cell, wd in zip(row.cells, widths):
            cw = _child(cell._tc.get_or_add_tcPr(), "w:tcW")
            cw.set(qn("w:w"), str(wd)); cw.set(qn("w:type"), "dxa")

def check_layout(path):
    doc, issues = Document(path), []
    for i, s in enumerate(doc.sections):
        if (s.page_width.twips, s.page_height.twips) != (PAGE_W, PAGE_H):
            issues.append(f"section {i}: ไม่ใช่ A4 แนวตั้ง")
        if (s.left_margin.twips, s.top_margin.twips, s.right_margin.twips, s.bottom_margin.twips) != (M_LEFT, M_TOP, M_RIGHT, M_BOTTOM):
            issues.append(f"section {i}: ระยะขอบไม่ตรง")
    for i, t in enumerate(doc.tables):
        total = sum(int(g.get(qn("w:w"))) for g in t._tbl.tblGrid.findall(qn("w:gridCol")))
        lay = t._tbl.tblPr.find(qn("w:tblLayout"))
        if total > USABLE_W:
            issues.append(f"table {i}: กว้าง {total} เกิน {USABLE_W}")
        if lay is None or lay.get(qn("w:type")) != "fixed":
            issues.append(f"table {i}: ยังไม่ล็อก fixed layout")
    for sh in doc.inline_shapes:
        if sh.width.twips > USABLE_W:
            issues.append("รูปภาพกว้างเกินพื้นที่พิมพ์")
    for r in doc.element.body.iter(qn("w:r")):
        txt = "".join(t.text or "" for t in r.findall(qn("w:t")))
        if not txt.strip():
            continue
        rPr = r.find(qn("w:rPr"))
        f = rPr.find(qn("w:rFonts")) if rPr is not None else None
        if f is None or f.get(qn("w:cs")) != FONT or f.get(qn("w:ascii")) != FONT:
            issues.append(f"run ไม่ใช่ {FONT}: {txt[:20]}"); break
        sz = rPr.find(qn("w:sz")); szcs = rPr.find(qn("w:szCs"))
        if sz is None or szcs is None or sz.get(qn("w:val")) != str(SIZE*2) or szcs.get(qn("w:val")) != str(SIZE*2):
            issues.append(f"run ไม่ใช่ {SIZE} pt: {txt[:20]}"); break
        if re.search(r"[\u0e00-\u0e7f]{40,}", txt):
            issues.append(f"ข้อความไทยยาวไม่มีจุดตัดคำ: {txt[:20]}"); break
    return issues
```

## ตัวอย่าง
```python
from thai_layout import *
doc = Document(); setup_document(doc)
add_para(doc, "บทที่ 2", bold=True, align="center")
add_para(doc, "เนื้อหาย่อหน้าแรก ...", first_line_cm=1.27)
t = doc.add_table(rows=1, cols=3); t.style = "Table Grid"
for cell, head in zip(t.rows[0].cells, ["ข้อ", "รายการสมรรถนะ", "มัธยฐาน"]):
    cell.paragraphs[0]._p.getparent().remove(cell.paragraphs[0]._p)
    add_para(cell, head, bold=True, align="center")
fix_table(t, [1, 5, 1.5])
doc.save("ชื่อไฟล์_10112026_v1.docx")
assert check_layout("ชื่อไฟล์_10112026_v1.docx") == []
```
