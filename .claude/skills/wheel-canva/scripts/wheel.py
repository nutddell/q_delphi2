#!/usr/bin/env python3
"""
wheel.py — สร้าง operations สำหรับ Canva MCP (edit-design) เพื่อวาด "วงล้อโมเดล" แบบหลายวงแหวน
ทุกชิ้นเป็น element แยกกัน (shape ต่อเสี้ยว, text ต่อข้อความ) — ไม่มีภาพแบน

คำสั่ง (ไฟล์ทั้งหมดเขียนลงโฟลเดอร์ WORK):
  plan   spec.json --out WORK [--size N] [--curved-aspect] [--opt '{json}']   -> plan.json + preview.png
  texts  WORK --page PAGE_ID [--batch 90]     -> ops_text_add_K.json (add_text หมุนแล้ว + BLOCK width + ชดเชยการโต)
  shapes WORK --page PAGE_ID [--batch 75]     -> ops_shapes_K.json (insert_shape กรอบพอดีชิ้น)
  locs   WORK K ID1 ID2 ...                   -> บันทึก id ข้อความชุด K (ตามลำดับใน response) + ops_text_fmt_K.json
  format WORK RESPONSE_FILE...                -> ดึง id จากไฟล์ response อัตโนมัติ + ops_text_fmt_*.json
  front  WORK [--batches 1,2]                 -> ops_front.json (layer_element front ของข้อความ)
  merge  OUT.json IN1.json IN2.json ...       -> รวม ops หลายไฟล์เป็น call เดียว
  check  WORK RESPONSE_FILE [--tol 4]         -> ตรวจศูนย์กลาง/การตัดบรรทัดของข้อความ + ops_fix.json

หลักที่ทดสอบแล้วกับ Canva (ดู references/canva-behavior.md):
  * add_text: left/top = กล่อง "ก่อนหมุน"; หมุนรอบจุดกึ่งกลางกล่อง
  * position_element: left/top = กรอบสี่เหลี่ยมแนวแกน (AABB) ของกล่อง "หลังหมุน" (ต่างจาก add_text!)
  * format_text บนข้อความที่หมุนแล้ว: ขอบบน (ในแกนของข้อความ) คงที่ กล่องโตลง -> จุดกึ่งกลางเลื่อน (h1-h0)/2 ตามแกนลงของข้อความ
  * format_text บนข้อความ NATURAL (ไม่ใส่ width) ที่หมุนแล้ว: ความกว้างไม่ขยาย -> ตัดทีละตัวอักษร (ห้ามใช้)
  * ความสูงกล่อง = fs*(1.2 + (n-1)*line_height); ค่าเริ่มต้น add_text = 16px, lh 1.4 -> 18.8 + 22*(n-1)
"""
import argparse, json, math, os, re, sys, unicodedata

# ---------------------------------------------------------------- text metrics
# ค่า em ต่อ 1 ตัวอักษร ของฟอนต์ค่าเริ่มต้นที่ add_text ใช้ (วัดจาก Canva จริง)
def char_em(c):
    cat = unicodedata.category(c)
    if cat == 'Mn':
        return 0.0                         # สระบน/ล่าง วรรณยุกต์ ไม่กินที่
    if '฀' <= c <= '๿':
        return 0.60
    if c == ' ':
        return 0.26
    if c in '.,:;':
        return 0.28
    if c in '()[]':
        return 0.33
    if c in '-/':
        return 0.36
    if c.isdigit():
        return 0.57
    if c.isupper():
        return 0.70 if c in 'MW' else 0.66
    if c.islower():
        return 0.56
    return 0.6

def est_w(s, fs):
    return max(sum(char_em(c) for c in line) for line in s.split('\n')) * fs

def text_h(fs, n, lh):
    return fs * (1.2 + (n - 1) * lh)

INIT_FS, INIT_H1, INIT_HSTEP = 16, 18.8, 22.0   # สถานะทันทีหลัง add_text

def init_h(n):
    return INIT_H1 + INIT_HSTEP * (n - 1)

# ---------------------------------------------------------------- Thai word split
def words(s):
    """แบ่งคำไทยสำหรับตัดบรรทัด; ผู้ใช้บังคับจุดตัดเองได้ด้วย '|' หรือ '\\n'"""
    if '\n' in s:
        return None
    if '|' in s:
        return [w for w in s.split('|') if w]
    try:
        from pythainlp.tokenize import word_tokenize
        toks = word_tokenize(s, engine='newmm', keep_whitespace=True)
    except Exception:
        toks = re.findall(r'\s+|[A-Za-z0-9().,/-]+|[^\sA-Za-z0-9().,/-]', s)
    # รวมโทเคนที่ห้ามขึ้นต้นบรรทัด (ช่องว่าง, วงเล็บปิด) เข้ากับคำก่อนหน้า
    # และห้ามจบบรรทัดด้วยคำนำหน้า/คำเชื่อม (การ ความ ให้ ใน ... ) -> ติดกับคำถัดไป
    out, glue = [], False
    for t in toks:
        if out and (glue or t.isspace() or t[0] in ').,'):
            out[-1] += t
        else:
            out.append(t)
        glue = t.strip() in NO_BREAK_AFTER or bool(re.fullmatch(r'\d+(\.\d+)*\.?', t.strip()))
    return out

NO_BREAK_AFTER = {'การ', 'ความ', 'ให้', 'ใน', 'ต่อ', 'ของ', 'จิต', 'ผู้', 'นัก', 'ที่', 'แห่ง', 'เพื่อ', 'กับ', 'ด้าน'}

def wrap(s, fs, max_w, max_lines):
    """คืนรายการบรรทัดที่สมดุลที่สุด (บรรทัดน้อยที่สุดก่อน) หรือ None ถ้าไม่พอดี"""
    if '\n' in s:
        lines = s.split('\n')
        return lines if (len(lines) <= max_lines and est_w(s, fs) <= max_w) else None
    ws = words(s)
    W = [est_w(w, fs) for w in ws]
    n = len(ws)
    for k in range(1, max_lines + 1):
        # DP: แบ่ง ws เป็น k ช่วง ลดความยาวบรรทัดสูงสุด
        best = {}
        def seg(i, j):
            t = ''.join(ws[i:j]).strip()
            return est_w(t, fs), t
        INF = (1e18, None)
        dp = [[INF] * (n + 1) for _ in range(k + 1)]
        dp[0][0] = (0, [])
        for p in range(1, k + 1):
            for j in range(1, n + 1):
                for i in range(p - 1, j):
                    if dp[p - 1][i][1] is None:
                        continue
                    w, t = seg(i, j)
                    if w > max_w:
                        continue
                    cand = max(dp[p - 1][i][0], w)
                    if cand < dp[p][j][0]:
                        dp[p][j] = (cand, dp[p - 1][i][1] + [t])
        if dp[k][n][1] is not None:
            return dp[k][n][1]
    return None

# ---------------------------------------------------------------- geometry
def norm(a):
    while a > 180: a -= 360
    while a < -180: a += 360
    return a

def upright(a):
    """มุมหมุนที่ทำให้ข้อความไม่กลับหัว: บังคับให้อยู่ใน [-90, 90)"""
    return ((a + 90) % 180) - 90

def pol(cx, cy, r, a):
    t = math.radians(a)
    return cx + r * math.cos(t), cy + r * math.sin(t)

def lighten(hexc, f):
    h = hexc.lstrip('#'); r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return '#%02X%02X%02X' % tuple(int(v + (255 - v) * f) for v in (r, g, b))

def lum(hexc):
    h = hexc.lstrip('#'); r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def ink(bg):
    return '#FFFFFF' if lum(bg) < 0.42 else '#1A1A1A'

def wedge(cx, cy, r_in, r_out, a0, a1):
    """donut sector -> (left, top, w, h, path) ในกรอบพอดีชิ้น (tight bbox) ไม่ใช่กรอบทั้งวง"""
    pts = [pol(cx, cy, r, a) for r in (r_in, r_out) for a in (a0, a1)]
    k = math.ceil(a0 / 90) * 90
    while k < a1:
        pts.append(pol(cx, cy, r_out, k)); k += 90
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    L, T = min(xs), min(ys); W, H = max(xs) - L, max(ys) - T
    def P(r, a):
        x, y = pol(cx, cy, r, a); return f"{x - L:.1f} {y - T:.1f}"
    large = 1 if (a1 - a0) > 180 else 0
    if r_in <= 0.5:
        d = f"M {P(0, a0)} L {P(r_out, a0)} A {r_out:.1f} {r_out:.1f} 0 {large} 1 {P(r_out, a1)} Z"
    else:
        d = (f"M {P(r_out, a0)} A {r_out:.1f} {r_out:.1f} 0 {large} 1 {P(r_out, a1)} "
             f"L {P(r_in, a1)} A {r_in:.1f} {r_in:.1f} 0 {large} 0 {P(r_in, a0)} Z")
    return L, T, W, H, d

def circle(cx, cy, r):
    d = f"M 0 {r:.2f} A {r:.2f} {r:.2f} 0 1 1 {2 * r:.2f} {r:.2f} A {r:.2f} {r:.2f} 0 1 1 0 {r:.2f} Z"
    return cx - r, cy - r, 2 * r, 2 * r, d

def chevrons(a=34, h=30, t=13, gap=26, n=2):
    parts = []
    for i in range(n):
        x = i * gap
        parts.append(f"M {x} 0 L {x + t} 0 L {x + a + t} {h} L {x + t} {2 * h} L {x} {2 * h} L {x + a} {h} Z")
    return (n - 1) * gap + a + t, 2 * h, ' '.join(parts)

# ---------------------------------------------------------------- planning
DEFAULTS = dict(
    size=3000, start_angle=-90, angle_mode='items',       # items = มุมตามจำนวนข้อย่อย, equal = เท่ากันทุกด้าน
    r_center=0.140, r_a=0.205, r_b=0.395, r_c=0.447,      # สัดส่วนของ size
    arrow=True, r_arrow=0.475, arrow_w=9, arrow_color='#21958A',
    center_color='#F4B183', sep_color='#FFFFFF', sep_w=4,
    pad=10, gap_code=14,
    fs_item=(40, 20), fs_name=(40, 22), fs_code_ratio=1.18, fs_aspect_code=(96, 50), fs_aspect_name=(40, 24),
    fs_title=(78, 36), name_lh=1.12, title_lh=1.15, max_name_lines=4,
    curved_aspect=False,
)

def plan(spec, opt):
    S = opt['size']
    PW, PH = opt.get('page') or (S, S)          # หน้ากระดาษไม่จำเป็นต้องจัตุรัส (เช่น A3 แนวนอน) วงล้ออยู่กลางหน้า
    cx, cy = PW / 2, PH / 2
    ring_c = opt.get('item_ring', True)          # False = 2 วงแหวน (ด้าน + องค์ประกอบ) ไม่มีวงรหัสข้อย่อย
    weight = (lambda c: max(1, len(c['items']))) if ring_c else (lambda c: 1)
    R0, RA, RB, RC = (opt[k] * S for k in ('r_center', 'r_a', 'r_b', 'r_c'))
    pad, sepw = opt['pad'], opt['sep_w']
    shapes, texts = [], []
    aspects = spec['aspects']
    n_items = sum(weight(c) for a in aspects for c in a['components'])
    if opt['angle_mode'] == 'equal':
        a_span = [360 / len(aspects)] * len(aspects)
    else:
        a_span = [360 * sum(weight(c) for c in a['components']) / n_items for a in aspects]

    # ---- center circle
    L, T, W, H, d = circle(cx, cy, R0)
    shapes.append(dict(tag='center', left=L, top=T, width=W, height=H, path=d,
                       color=opt['center_color'], stroke_color=opt.get('center_stroke') or opt['sep_color'],
                       stroke_weight=opt.get('center_stroke_w') or sepw * 2))

    # ---- collect wedges and per-component geometry first (fonts are made uniform later)
    comp_geo, item_geo = [], []
    ang = opt['start_angle']
    for ai, a in enumerate(aspects):
        cols = a.get('colors') or [a['color'], lighten(a['color'], .45), lighten(a['color'], .72)]
        a0, a1 = ang, ang + a_span[ai]
        L, T, W, H, d = wedge(cx, cy, R0, RA, a0, a1)
        shapes.append(dict(tag=f'A:{a["code"]}', left=L, top=T, width=W, height=H, path=d,
                           color=cols[0], stroke_color=opt['sep_color'], stroke_weight=sepw))
        a['_geo'] = (a0, a1, cols)
        comps = a['components']
        if opt['angle_mode'] == 'equal_components':
            c_span = [a_span[ai] / len(comps)] * len(comps)
        else:
            tot = sum(weight(c) for c in comps)
            c_span = [a_span[ai] * weight(c) / tot for c in comps]
        cang = a0
        for ci, c in enumerate(comps):
            c0, c1 = cang, cang + c_span[ci]
            L, T, W, H, d = wedge(cx, cy, RA, RB, c0, c1)
            shapes.append(dict(tag=f'B:{c["code"]}:{ci}', left=L, top=T, width=W, height=H, path=d,
                               color=cols[1], stroke_color=opt['sep_color'], stroke_weight=sepw))
            comp_geo.append((c, c0, c1, cols))
            ni = len(c['items'])
            for ii, it in enumerate(c['items'] if ring_c else []):
                i0 = c0 + (c1 - c0) * ii / ni; i1 = c0 + (c1 - c0) * (ii + 1) / ni
                L, T, W, H, d = wedge(cx, cy, RB, RC, i0, i1)
                shapes.append(dict(tag=f'C:{it}', left=L, top=T, width=W, height=H, path=d,
                                   color=cols[2], stroke_color=opt['sep_color'], stroke_weight=sepw))
                item_geo.append((it, i0, i1, cols))
            cang = c1
        ang = a1

    # ---- outer arrow ring (4 arcs + double chevrons pointing clockwise)
    if opt['arrow']:
        RR = opt['r_arrow'] * S; aw = opt['arrow_w']
        for k in range(4):
            a0 = opt['start_angle'] + 90 * k
            L, T, W, H, d = wedge(cx, cy, RR - aw / 2, RR + aw / 2, a0, a0 + 90)
            shapes.append(dict(tag=f'ring:{k}', left=L, top=T, width=W, height=H, path=d,
                               color=opt['arrow_color'], stroke_weight=0))
        cw, ch, cd = chevrons()
        for k in range(4):
            a = opt['start_angle'] + 90 * k
            x, y = pol(cx, cy, RR, a)
            shapes.append(dict(tag=f'chev:{k}', left=x - cw / 2, top=y - ch / 2, width=cw, height=ch, path=cd,
                               color=opt['arrow_color'], stroke_weight=0, rotation=norm(a + 90)))

    # ---- ITEM codes (ring C): radial, uniform font
    fs_hi, fs_lo = opt['fs_item']
    def item_fit(it, i0, i1):
        L = (RC - RB) - 2 * pad
        T = 2 * RB * math.sin(math.radians(i1 - i0) / 2) - 2 * pad
        f = fs_hi
        while f > fs_lo and (est_w(it, f) > L or text_h(f, 1, 1) > T):
            f -= 1
        return f
    fs_item = min(item_fit(*g[:3]) for g in item_geo) if item_geo else fs_hi
    for it, i0, i1, cols in item_geo:
        am = (i0 + i1) / 2
        texts.append(radial(cx, cy, it, (RB + RC) / 2, am, fs_item, 1, 1.0, 'normal', ink(cols[2]),
                            box=(RC - RB) - pad, tag=f'item:{it}'))

    # ---- COMPONENT code + name (ring B)
    fs_hi, fs_lo = opt['fs_name']
    def comp_fit(c, c0, c1, f):
        fcode = round(f * opt['fs_code_ratio'])
        has_code = bool(c.get('code')) and opt.get('show_comp_code', True)
        code_len = est_w(c['code'], fcode) if has_code else 0
        r1 = RA + opt.get('name_pad_in', pad)
        r2 = RB - opt.get('name_pad_out', pad) - (code_len + opt['gap_code'] if has_code else 0)
        T = 2 * r1 * math.sin(math.radians(c1 - c0) / 2) - 2 * pad - sepw
        if has_code and text_h(fcode, 1, 1) > 2 * (RB - code_len) * math.sin(math.radians(c1 - c0) / 2) - 2 * pad:
            return None
        lines = wrap(c['name'], f, r2 - r1, opt['max_name_lines'])
        if not lines or text_h(f, len(lines), opt['name_lh']) > T:
            return None
        return lines, fcode, code_len, r1, r2
    fs_name = fs_hi
    while fs_name > fs_lo and not all(comp_fit(c, c0, c1, fs_name) for c, c0, c1, _ in comp_geo):
        fs_name -= 1
    for idx, (c, c0, c1, cols) in enumerate(comp_geo):
        res = comp_fit(c, c0, c1, fs_name)
        if res is None:   # ช่องแคบเกินที่ขนาดต่ำสุด: บีบเฉพาะชิ้นนี้ลงอีก
            f = fs_name
            while res is None and f > 10:
                f -= 1; res = comp_fit(c, c0, c1, f)
            print(f'WARN: {c["code"]} "{c["name"]}" ต้องลดฟอนต์เหลือ {f}px', file=sys.stderr)
        else:
            f = fs_name
        lines, fcode, code_len, r1, r2 = res
        am = (c0 + c1) / 2
        col = ink(cols[1])
        if code_len:
            texts.append(radial(cx, cy, c['code'], RB - pad - code_len / 2, am, fcode, 1, 1.0, 'bold', col,
                                box=code_len + 2 * pad, tag=f'code:{c["code"]}:{idx}'))
        txt = '\n'.join(lines)
        texts.append(radial(cx, cy, txt, (r1 + r2) / 2, am, f, len(lines), opt['name_lh'], opt.get('name_weight', 'normal'), opt.get('name_color') or col,
                            box=(r2 - r1) + 2 * pad, tag=f'name:{c["code"]}:{idx}'))

    # ---- ASPECT label แบบ block: ข้อความเดียวหลายบรรทัด (เช่น "1. ด้านความรู้และเทคนิค...") แนวสัมผัส ไม่กลับหัว
    if opt.get('aspect_style') == 'curved_block':
        # ชื่อด้านหลายบรรทัด โค้งตามวงทุกบรรทัด (1 element ต่อ 1 กลุ่มอักษร) — บรรทัดแรกอยู่ฝั่ง "หัวตัวอักษร"
        rm = (R0 + RA) / 2
        lh = opt.get('aspect_lh', 1.25)
        def cfit(a, f):
            a0, a1, cols = a['_geo']; am = (a0 + a1) / 2
            rot = upright(am + 90)
            up = (math.sin(math.radians(rot)), -math.cos(math.radians(rot)))
            s_ = 1 if up[0] * math.cos(math.radians(am)) + up[1] * math.sin(math.radians(am)) > 0 else -1
            label = a.get('label') or f"{a['code']} {a['name']}".strip()
            span_ok = (a1 - a0) - opt.get('arc_margin_deg', 6)
            for k in range(1, opt.get('max_aspect_lines', 3) + 1):
                tot = f * 1.2 + (k - 1) * f * lh
                if tot > (RA - R0) - 2 * pad: break
                r_in = rm - tot / 2 + f * 0.6          # รัศมีกึ่งกลางบรรทัดในสุด
                # ความยาวที่ยอมให้ต่อบรรทัด = ความยาวส่วนโค้งที่รัศมีของบรรทัดในสุด (คับสุด)
                lines = wrap(label, f, math.radians(span_ok) * r_in / 1.04, k)
                if not lines: continue
                radii = [rm + s_ * (tot / 2 - f * 0.6 - i * f * lh) for i in range(len(lines))]
                if all(math.degrees(est_w(l, f) * 1.04 / r) <= span_ok for l, r in zip(lines, radii)):
                    return lines, radii, am, s_, cols
            return None
        f = opt['fs_aspect_name'][0]
        while f > opt['fs_aspect_name'][1] and not all(cfit(a, f) for a in aspects):
            f -= 1
        fc = fn = f
        for a in aspects:
            res = cfit(a, f)
            if not res:
                print(f'WARN: ป้ายด้าน {a["code"]} โค้งไม่พอดีวงแหวน', file=sys.stderr); continue
            lines, radii, am, s_, cols = res
            col = opt.get('aspect_color') or ink(cols[0])
            for i, (ln, r) in enumerate(zip(lines, radii)):
                texts.extend(curved(cx, cy, ln, r, am, f, 'bold', col, s_, tag=f'aspect:{a["code"]}:L{i}'))
    elif opt.get('aspect_style') == 'block':
        rm = (R0 + RA) / 2
        def block_fit(a, f):
            a0, a1, cols = a['_geo']; am = (a0 + a1) / 2; rot = upright(am + 90)
            label = a.get('label') or f"{a['code']} {a['name']}".strip()
            for k in range(1, opt.get('max_aspect_lines', 3) + 1):
                # ความกว้างที่ยอมให้ = คอร์ดที่รัศมีด้านใน (ระวังกล่องตรงชนวงใน)
                lines = wrap(label, f, 2 * (R0 + pad) * math.sin(math.radians(min(a1 - a0, 170)) / 2) * 1.25, k)
                if not lines: continue
                txt = '\n'.join(lines); h = text_h(f, len(lines), opt['name_lh'])
                if rect_in_ring(cx, cy, pol(cx, cy, rm, am), rot, est_w(txt, f), h, R0 + pad, RA - pad):
                    return txt, len(lines), am, cols
            return None
        f = opt['fs_aspect_name'][0]
        while f > opt['fs_aspect_name'][1] and not all(block_fit(a, f) for a in aspects):
            f -= 1
        fc = fn = f
        for a in aspects:
            res = block_fit(a, f)
            if not res:
                print(f'WARN: ป้ายด้าน {a["code"]} ล้นวงแหวน', file=sys.stderr)
                continue
            txt, n, am, cols = res
            texts.append(dict(tag=f'aspect:{a["code"]}', text=txt, cx=pol(cx, cy, rm, am)[0], cy=pol(cx, cy, rm, am)[1],
                              rot=upright(am + 90), fs=f, n=n, lh=opt['name_lh'], weight='bold',
                              color=opt.get('aspect_color') or ink(cols[0]), W=est_w(txt, f) * 1.15 + f))
    else:
        rm = (R0 + RA) / 2
        def aspect_layout(a, fc, fn):
            a0, a1, cols = a['_geo']; am = (a0 + a1) / 2
            rot = upright(am + 90)
            up = (math.sin(math.radians(rot)), -math.cos(math.radians(rot)))
            outward = (math.cos(math.radians(am)), math.sin(math.radians(am)))
            s = 1 if up[0] * outward[0] + up[1] * outward[1] > 0 else -1   # 1 = หัวตัวอักษรชี้ออกนอกวง
            hc, hn = text_h(fc, 1, 1), text_h(fn, 1, 1); tot = hc + hn
            rc_code = rm + s * (tot / 2 - hc / 2); rc_name = rm - s * (tot / 2 - hn / 2)
            ok = all(rect_in_ring(cx, cy, pol(cx, cy, r, am), rot, est_w(txt, f), text_h(f, 1, 1), R0 + pad, RA - pad)
                     for txt, f, r in ((a['code'], fc, rc_code), (a['name'], fn, rc_name)))
            return ok, am, rot, s, rc_code, rc_name, cols
        fc, fn = opt['fs_aspect_code'][0], opt['fs_aspect_name'][0]
        while not all(aspect_layout(a, fc, fn)[0] for a in aspects):
            if fc <= opt['fs_aspect_code'][1] and fn <= opt['fs_aspect_name'][1]:
                print('WARN: ป้ายด้านล้นวงแหวน — เพิ่ม r_a หรือย่อชื่อด้าน', file=sys.stderr); break
            fc = max(opt['fs_aspect_code'][1], fc - 3); fn = max(opt['fs_aspect_name'][1], fn - 1)
        for a in aspects:
            ok, am, rot, s, rc_code, rc_name, cols = aspect_layout(a, fc, fn); col = ink(cols[0])
            texts.append(tangential(cx, cy, a['code'], rc_code, am, fc, 'bold', col, tag=f'acode:{a["code"]}'))
            if opt['curved_aspect']:
                texts.extend(curved(cx, cy, a['name'], rc_name, am, fn, 'normal', col, s, tag=f'aname:{a["code"]}'))
            else:
                texts.append(tangential(cx, cy, a['name'], rc_name, am, fn, 'normal', col, tag=f'aname:{a["code"]}'))

    # ---- title in center circle
    lines = spec['title'].split('\n')
    f = opt['fs_title'][0]
    while f > opt['fs_title'][1]:
        h = text_h(f, len(lines), opt['title_lh'])
        ok = h <= 1.45 * R0
        if ok:   # ทุกบรรทัดต้องอยู่ในวงกลม (คอร์ดที่ระดับบรรทัดนั้น)
            for k, ln in enumerate(lines):
                y = -h / 2 + f * 0.6 + k * f * opt['title_lh']
                yy = max(abs(y - f * 0.6), abs(y + f * 0.6))
                if yy >= R0 or est_w(ln, f) > 0.92 * 2 * math.sqrt(R0 ** 2 - yy ** 2) - 2 * pad:
                    ok = False; break
        if ok: break
        f -= 1
    texts.append(dict(tag='title', text=spec['title'], cx=cx, cy=cy, rot=0, fs=f, n=len(lines),
                      lh=opt['title_lh'], weight='bold', color=opt.get('title_color') or ink(opt['center_color']),
                      W=est_w(spec['title'], f) * 1.12 + 2 * f))
    order = {'ring': 0, 'chev': 1, 'C': 2, 'B': 3, 'A': 4, 'center': 5}   # วงลูกศรอยู่ล่างสุด, วงนอก->วงใน ให้ขอบขาววงในทับรอยต่อ
    shapes.sort(key=lambda s: order[s['tag'].split(':')[0]])
    return dict(size=S, page=(PW, PH), center=(cx, cy), radii=dict(center=R0, a=RA, b=RB, c=RC), shapes=shapes, texts=texts,
                fonts=dict(item=fs_item, name=fs_name, aspect_code=fc, aspect_name=fn, title=f))

def rect_in_ring(cx, cy, c, rot, w, h, r_in, r_out):
    """กล่องข้อความ (หมุนแล้ว) ต้องอยู่ระหว่างวง r_in..r_out ทั้งกล่อง (เช็คมุมไกลสุด และจุดใกล้สุดของกล่อง)"""
    th = math.radians(rot); ux, uy = math.cos(th), math.sin(th); vx, vy = -uy, ux
    px, py = cx - c[0], cy - c[1]
    lu, lv = px * ux + py * uy, px * vx + py * vy           # จุดศูนย์กลางวงในแกนของกล่อง
    du = max(abs(lu) - w / 2, 0); dv = max(abs(lv) - h / 2, 0)
    near = math.hypot(du, dv)
    far = max(math.hypot(lu - sx * w / 2, lv - sy * h / 2) for sx in (-1, 1) for sy in (-1, 1))
    return near >= r_in and far <= r_out

def radial(cx, cy, text, r, am, fs, n, lh, weight, color, box, tag):
    x, y = pol(cx, cy, r, am)
    W = max(box, est_w(text, fs) * 1.15 + fs)
    return dict(tag=tag, text=text, cx=x, cy=y, rot=upright(am), fs=fs, n=n, lh=lh, weight=weight,
                color=color, W=W)

def tangential(cx, cy, text, r, am, fs, weight, color, tag):
    x, y = pol(cx, cy, r, am)
    return dict(tag=tag, text=text, cx=x, cy=y, rot=upright(am + 90), fs=fs, n=1, lh=1.0, weight=weight,
                color=color, W=est_w(text, fs) * 1.15 + fs)

def curved(cx, cy, text, r, am, fs, weight, color, s, tag):
    """ข้อความโค้งตามวง: 1 element ต่อ 1 กลุ่มอักษร (พยัญชนะ+สระบน/ล่าง+วรรณยุกต์)"""
    cl = []
    for ch in text:
        if cl and unicodedata.category(ch) == 'Mn': cl[-1] += ch
        else: cl.append(ch)
    ws = [est_w(c, fs) * 1.04 for c in cl]
    total = sum(ws)
    span = math.degrees(total / r)
    out, acc = [], 0
    for k, (c, w) in enumerate(zip(cl, ws)):
        off = -span / 2 + math.degrees((acc + w / 2) / r)
        a = am + off if s > 0 else am - off       # ครึ่งล่าง: เดินทวนเข็มเพื่อให้อ่านซ้าย->ขวา
        x, y = pol(cx, cy, r, a)
        rot = norm(a + 90) if s > 0 else norm(a - 90)
        if c.strip():
          out.append(dict(tag=f'{tag}:{k}', text=c, cx=x, cy=y, rot=rot, fs=fs, n=1, lh=1.0, weight=weight,
                        color=color, W=max(w * 1.6, fs)))
        acc += w
    return out

# ---------------------------------------------------------------- op emitters
def r1(v): return round(v, 1)

def add_text_op(t, page):
    """วางกล่องตั้งต้น (16px) ให้หลัง format_text แล้วจุดกึ่งกลางตกตรงเป้าพอดี"""
    h0, h1 = init_h(t['n']), text_h(t['fs'], t['n'], t['lh'])
    th = math.radians(t['rot'])
    down = (-math.sin(th), math.cos(th))
    c0x = t['cx'] - (h1 - h0) / 2 * down[0]
    c0y = t['cy'] - (h1 - h0) / 2 * down[1]
    t['init'] = (r1(c0x - t['W'] / 2), r1(c0y - h0 / 2))
    return dict(type='add_text', page_id=page, text=t['text'], left=t['init'][0], top=t['init'][1],
                width=r1(t['W']), rotation=r1(t['rot']))

def fmt_op(t, loc):
    f = dict(font_size=int(t['fs']), font_weight=t['weight'], color=t['color'], text_align='center')
    if t['n'] > 1: f['line_height'] = t['lh']
    return dict(type='format_text', locator_id=loc, formatting=f)

def batches(lst, n):
    return [lst[i:i + n] for i in range(0, len(lst), n)]

# ---------------------------------------------------------------- response parsing
def load_doc(path):
    """อ่าน element ทั้งหมดจากไฟล์ผลลัพธ์ edit-design/read-design (รองรับไฟล์ที่ถูกตัดกลางทาง:
    สแกนหา object ของ element ทีละตัว จึงยังได้ element ที่อยู่ก่อนจุดตัด)"""
    raw = open(path, encoding='utf-8').read()
    texts = [raw]
    try:
        d = json.loads(raw)
        if isinstance(d, list):   # รูปแบบ content blocks [{"type":"text","text":"..."}]
            texts = [b.get('text', '') for b in d if isinstance(b, dict)]
        elif isinstance(d, dict):
            texts = [json.dumps(d, ensure_ascii=False)]
    except Exception:
        pass
    els, seen = [], set()
    dec = json.JSONDecoder()
    for t in texts:
        for m in re.finditer(r'\{"id":"LB', t):
            try:
                o, _ = dec.raw_decode(t, m.start())
            except Exception:
                continue
            if 'locator_id' in o and o['locator_id'] not in seen:
                seen.add(o['locator_id']); els.append(o)
    return els

def chars(e):
    return ''.join(r.get('characters', '') for r in e.get('textRegions', []))

# ---------------------------------------------------------------- CLI
def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('plan'); p.add_argument('spec'); p.add_argument('--out', required=True)
    p.add_argument('--size', type=int); p.add_argument('--curved-aspect', action='store_true')
    p.add_argument('--opt', help='JSON ของค่าที่ต้องการทับ DEFAULTS')
    p = sub.add_parser('shapes'); p.add_argument('dir'); p.add_argument('--page', required=True); p.add_argument('--batch', type=int, default=75)
    p = sub.add_parser('texts'); p.add_argument('dir'); p.add_argument('--page', required=True); p.add_argument('--batch', type=int, default=90)
    p = sub.add_parser('locs'); p.add_argument('dir'); p.add_argument('batch_no', type=int); p.add_argument('ids', nargs='+')
    p = sub.add_parser('front'); p.add_argument('dir'); p.add_argument('--batches')
    p = sub.add_parser('merge'); p.add_argument('out'); p.add_argument('files', nargs='+')
    p = sub.add_parser('format'); p.add_argument('dir'); p.add_argument('responses', nargs='+'); p.add_argument('--batch', type=int, default=180); p.add_argument('--only-batch', type=int, help='สร้าง fmt เฉพาะข้อความชุดนี้')
    p = sub.add_parser('check'); p.add_argument('dir'); p.add_argument('response'); p.add_argument('--tol', type=float, default=4)
    a = ap.parse_args()

    if a.cmd == 'plan':
        spec = json.load(open(a.spec, encoding='utf-8'))
        opt = dict(DEFAULTS); opt.update(spec.get('options', {}))
        if a.opt: opt.update(json.loads(a.opt))
        if a.size: opt['size'] = a.size
        if a.curved_aspect: opt['curved_aspect'] = True
        for k in ('fs_item', 'fs_name', 'fs_aspect_code', 'fs_aspect_name', 'fs_title'):
            if isinstance(opt[k], (int, float)): opt[k] = (opt[k], opt[k])
        os.makedirs(a.out, exist_ok=True)
        pl = plan(spec, opt)
        json.dump(pl, open(os.path.join(a.out, 'plan.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(f"size={pl['size']} shapes={len(pl['shapes'])} texts={len(pl['texts'])} fonts={pl['fonts']}")
        try:
            preview(pl, os.path.join(a.out, 'preview.png'))
            print('preview ->', os.path.join(a.out, 'preview.png'))
        except Exception as ex:
            print('preview skipped:', ex)

    elif a.cmd == 'shapes':
        pl = json.load(open(os.path.join(a.dir, 'plan.json'), encoding='utf-8'))
        ops = []
        for s in pl['shapes']:
            o = dict(type='insert_shape', page_id=a.page, left=r1(s['left']), top=r1(s['top']),
                     width=r1(s['width']), height=r1(s['height']), path=s['path'],
                     view_box_width=r1(s['width']), view_box_height=r1(s['height']), color=s['color'])
            if s.get('stroke_weight'):
                o['stroke_color'] = s['stroke_color']; o['stroke_weight'] = s['stroke_weight']
            if s.get('rotation'): o['rotation'] = r1(s['rotation'])
            ops.append(o)
        for i, b in enumerate(batches(ops, a.batch), 1):
            fn = os.path.join(a.dir, f'ops_shapes_{i}.json')
            json.dump(b, open(fn, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
            print(fn, len(b))

    elif a.cmd == 'texts':
        fn_plan = os.path.join(a.dir, 'plan.json')
        pl = json.load(open(fn_plan, encoding='utf-8'))
        pl['page'] = a.page
        ops = [add_text_op(t, a.page) for t in pl['texts']]
        for i, b in enumerate(batches(list(range(len(ops))), a.batch), 1):
            for k in b: pl['texts'][k]['batch'] = i
            fn = os.path.join(a.dir, f'ops_text_add_{i}.json')
            json.dump([ops[k] for k in b], open(fn, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
            print(fn, len(b))
        json.dump(pl, open(fn_plan, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    elif a.cmd == 'locs':
        # บันทึก element id ของข้อความชุดที่ i ตามลำดับที่ปรากฏใน response (ลำดับ = ลำดับที่ add)
        fn_plan = os.path.join(a.dir, 'plan.json')
        pl = json.load(open(fn_plan, encoding='utf-8'))
        ids = [x.split('-')[-1] for x in re.split(r'[\s,]+', ' '.join(a.ids)) if x]
        ts = [t for t in pl['texts'] if t.get('batch') == a.batch_no]
        if len(ids) != len(ts):
            sys.exit(f'จำนวน id ({len(ids)}) ไม่เท่ากับจำนวนข้อความในชุด {a.batch_no} ({len(ts)})')
        for t, i in zip(ts, ids):
            t['locator'] = f"{pl['page']}-{i}"
        json.dump(pl, open(fn_plan, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        ops = [fmt_op(t, t['locator']) for t in ts]
        fn = os.path.join(a.dir, f'ops_text_fmt_{a.batch_no}.json')
        json.dump(ops, open(fn, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        print(fn, len(ops))

    elif a.cmd == 'front':
        pl = json.load(open(os.path.join(a.dir, 'plan.json'), encoding='utf-8'))
        want = set(int(x) for x in a.batches.split(',')) if a.batches else None
        ops = [dict(type='layer_element', locator_id=t['locator'], position='front')
               for t in pl['texts'] if t.get('locator') and (want is None or t.get('batch') in want)]
        fn = os.path.join(a.dir, 'ops_front.json')
        json.dump(ops, open(fn, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        print(fn, len(ops))

    elif a.cmd == 'merge':
        ops = [o for f in a.files for o in json.load(open(f, encoding='utf-8'))]
        json.dump(ops, open(a.out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        print(a.out, len(ops))

    elif a.cmd == 'format':
        fn_plan = os.path.join(a.dir, 'plan.json')
        pl = json.load(open(fn_plan, encoding='utf-8'))
        els = [e for r in a.responses for e in load_doc(r) if e.get('type') == 'text']
        idx = {}
        for e in els:
            idx.setdefault((chars(e), round(e['left'], 1), round(e['top'], 1)), e)
        ops, miss = [], []
        for t in pl['texts']:
            if a.only_batch and t.get('batch') != a.only_batch:
                continue
            e = idx.get((t['text'], t['init'][0], t['init'][1]))
            if not e:
                # fallback: ข้อความเดียวกัน ที่ตำแหน่งใกล้ที่สุด
                # สำรอง: ข้อความเดียวกันที่ตำแหน่งต่างกันไม่เกิน 1px เท่านั้น (ห้ามจับคู่ตัวอักษรซ้ำจากที่อื่น)
                cands = [x for x in els if chars(x) == t['text']
                         and abs(x['left'] - t['init'][0]) < 1 and abs(x['top'] - t['init'][1]) < 1]
                if cands:
                    e = cands[0]
            if not e:
                miss.append(t['tag']); continue
            t['locator'] = e['locator_id']
            ops.append(fmt_op(t, e['locator_id']))
            idx.pop((t['text'], round(e['left'], 1), round(e['top'], 1)), None)
        json.dump(pl, open(fn_plan, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        for i, b in enumerate(batches(ops, a.batch), 1):
            fn = os.path.join(a.dir, f'ops_text_fmt_{i}.json')
            json.dump(b, open(fn, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
            print(fn, len(b))
        if miss: print('MISSING (ไม่พบใน response):', miss)

    elif a.cmd == 'check':
        pl = json.load(open(os.path.join(a.dir, 'plan.json'), encoding='utf-8'))
        els = {e['locator_id']: e for e in load_doc(a.response)}
        # locator ใน group เปลี่ยนเป็น GROUP-CHILD: จับคู่ด้วย id ท้าย
        tail = {k.split('-')[-1]: v for k, v in els.items()}
        fixes, bad = [], 0
        for t in pl['texts']:
            loc = t.get('locator')
            e = els.get(loc) or (tail.get(loc.split('-')[-1]) if loc else None)
            if not e:
                print('?? not found', t['tag']); continue
            ex, ey = e['left'] + e['width'] / 2, e['top'] + e['height'] / 2
            hp = text_h(t['fs'], t['n'], t['lh'])
            dx, dy, dh = ex - t['cx'], ey - t['cy'], e['height'] - hp
            wrapped = dh > 0.6 * t['fs']
            if abs(dx) > a.tol or abs(dy) > a.tol or wrapped:
                bad += 1
                print(f"{t['tag']:<16} d=({dx:+.1f},{dy:+.1f}) h={e['height']:.1f}/{hp:.1f}{'  WRAPPED' if wrapped else ''}")
                if wrapped:
                    fixes.append(dict(type='resize_element', locator_id=e['locator_id'], width=r1(e['width'] * 1.35)))
                # position_element ใช้กรอบ AABB หลังหมุน
                th = math.radians(e['rotation']); w, h = e['width'] * (1.35 if wrapped else 1), hp
                aw = abs(w * math.cos(th)) + abs(h * math.sin(th)); ah = abs(w * math.sin(th)) + abs(h * math.cos(th))
                fixes.append(dict(type='position_element', locator_id=e['locator_id'],
                                  left=r1(t['cx'] - aw / 2), top=r1(t['cy'] - ah / 2)))
        json.dump(fixes, open(os.path.join(a.dir, 'ops_fix.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        print(f'checked {len(pl["texts"])} texts, {bad} off; fixes -> ops_fix.json ({len(fixes)} ops)')

# ---------------------------------------------------------------- local preview (PIL) — ตรวจเลย์เอาต์ก่อนยิง Canva
def preview(pl, out, scale=0.4):
    from PIL import Image, ImageDraw, ImageFont
    PW, PH = pl.get('page') or (pl['size'], pl['size']); k = scale
    img = Image.new('RGB', (int(PW * k), int(PH * k)), 'white'); dr = ImageDraw.Draw(img)
    cx, cy = pl['center']
    def fill_wedge(s):
        # วาดจาก path แบบหยาบ: สุ่มจุดตามขอบ
        pts = path_points(s['path'])
        rot = s.get('rotation', 0)
        if rot:
            ccx, ccy = s['width'] / 2, s['height'] / 2; th = math.radians(rot)
            pts = [(ccx + (x - ccx) * math.cos(th) - (y - ccy) * math.sin(th),
                    ccy + (x - ccx) * math.sin(th) + (y - ccy) * math.cos(th)) for x, y in pts]
        poly = [((s['left'] + x) * k, (s['top'] + y) * k) for x, y in pts]
        dr.polygon(poly, fill=s['color'], outline=s.get('stroke_color') if s.get('stroke_weight') else None)
    for s in pl['shapes']: fill_wedge(s)
    font = None
    for fp in ('/usr/share/fonts/truetype/thai/Sarabun-Regular.ttf', '/usr/share/fonts/truetype/tlwg/Garuda.ttf',
               '/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf'):
        if os.path.exists(fp): font = fp; break
    for t in pl['texts']:
        h = text_h(t['fs'], t['n'], t['lh']) * k; w = est_w(t['text'], t['fs']) * k
        th = math.radians(t['rot'])
        corners = [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
        poly = [(t['cx'] * k + x * math.cos(th) - y * math.sin(th), t['cy'] * k + x * math.sin(th) + y * math.cos(th)) for x, y in corners]
        dr.polygon(poly, outline='#D00000')
    img.save(out)

def path_points(d):
    toks = re.findall(r'[MLAZ]|-?\d+\.?\d*', d)
    pts, i, cur = [], 0, (0, 0)
    while i < len(toks):
        c = toks[i]
        if c in 'ML':
            cur = (float(toks[i + 1]), float(toks[i + 2])); pts.append(cur); i += 3
        elif c == 'A':
            rx = float(toks[i + 1]); large, sweep = int(toks[i + 4]), int(toks[i + 5])
            end = (float(toks[i + 6]), float(toks[i + 7]))
            pts.extend(arc_pts(cur, end, rx, large, sweep)); cur = end; i += 8
        else:
            i += 1
    return pts

def arc_pts(p0, p1, r, large, sweep, n=24):
    (x0, y0), (x1, y1) = p0, p1
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2; dx, dy = x1 - x0, y1 - y0; q = math.hypot(dx, dy)
    if q == 0 or q > 2 * r + 1e-6: return [p1]
    h = math.sqrt(max(r * r - (q / 2) ** 2, 0)); ux, uy = -dy / q, dx / q
    sgn = 1 if large != sweep else -1
    ccx, ccy = mx + sgn * h * ux, my + sgn * h * uy
    a0 = math.atan2(y0 - ccy, x0 - ccx); a1 = math.atan2(y1 - ccy, x1 - ccx)
    if sweep and a1 < a0: a1 += 2 * math.pi
    if not sweep and a1 > a0: a1 -= 2 * math.pi
    return [(ccx + r * math.cos(a0 + (a1 - a0) * j / n), ccy + r * math.sin(a0 + (a1 - a0) * j / n)) for j in range(1, n + 1)]

if __name__ == '__main__':
    main()
