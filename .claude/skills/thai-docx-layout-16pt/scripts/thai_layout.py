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
