# Renders the Calmer Card demo video from anonymized screenshots.
# Usage: python make_video.py SHOTS_DIR MUSIC.wav OUT.mp4 [--preview]
#
# Each shot is a browser screenshot captured as two half-width retina crops (NAME_L.png and
# NAME_R.png). Coordinates below are in the browser's screenshot frame (1384x868 for the first
# capture session, "A"; 1413x840 for the second, "B"). Camera rects are (x, y, width); the height
# follows from 16:9.
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1920, 1080, 30
S = 2.0  # master pixels per frame unit
XF = 0.25  # crossfade seconds
ERA = {'A': (1384, 868), 'B': (1413, 840)}
FONT_DIR = Path.home() / 'Library/Fonts'
F = {
    'title': ImageFont.truetype(str(FONT_DIR / 'Poppins-SemiBold.otf'), 84),
    'sub': ImageFont.truetype(str(FONT_DIR / 'Poppins-Regular.otf'), 38),
    'num': ImageFont.truetype(str(FONT_DIR / 'Poppins-Medium.otf'), 30),
    'cap': ImageFont.truetype(str(FONT_DIR / 'Poppins-SemiBold.otf'), 48),
    'tag': ImageFont.truetype(str(FONT_DIR / 'Poppins-SemiBold.otf'), 26),
    'count': ImageFont.truetype(str(FONT_DIR / 'Poppins-SemiBold.otf'), 36),
    'capi': ImageFont.truetype(str(FONT_DIR / 'Poppins-SemiBoldItalic.otf'), 48),
    'url': ImageFont.truetype(str(FONT_DIR / 'Poppins-Medium.otf'), 34),
}
BEFORE, AFTER, INK = (180, 35, 24), (6, 118, 71), (15, 23, 42)


def full(era):
    return (0, 0, ERA[era][0])


def shot(name, era, dur, cams, caption, tag, counter=None, ripples=(), closeups=(), img=None, cap_top=False, focus=None):
    caps = caption if isinstance(caption, list) else [(0, caption)]
    return dict(kind='shot', name=name, img=img or name, era=era, dur=dur, cams=cams, caps=caps,
                tag=tag, counter=counter, ripples=list(ripples), closeups=list(closeups), cap_top=cap_top,
                focus=focus if (focus is None or isinstance(focus, list)) else [(0, focus)])


def card(title, sub, dur, bg, num=None, url=None, icon=False, tone='intro', big=False):
    return dict(kind='card', title=title, sub=sub, dur=dur, bg=bg, num=num, url=url, icon=icon, tone=tone, big=big)


B_FULL, A_FULL = full('B'), full('A')
# Flow structure: OLD card, old shots, NEW card, new shots. Zooms are gentle (max ~1.35x).
def flow_card(task):
    return card(task, '', 2.4, None, tone='intro', big=True)


def old_card(task):
    return card('With current Swapcard', '', 1.75, None, tone='old')


def new_card(task=''):
    return card('With Calmer Card', task, 1.5, None, tone='new')


# Each shot holds long enough to read. Most are static; a spotlight dims everything except the
# part that matters (focus = (x0, y0, x1, y1) in the screenshot frame, or [(u, rect), ...]).
STILL_A, STILL_B = [(0, A_FULL)], [(0, B_FULL)]

TIMELINE = [
    card('Making Swapcard less painful', '', 1.35, None, tone='intro'),

    flow_card('Booking a 1:1'),
    old_card(''),
    shot('b_person', 'B', 3.0, STILL_B, 'Open their profile and click Meet.', 'before', 1,
         [(0.55, (653, 347))], focus=(470, 40, 950, 380)),
    shot('b_meet', 'B', 3.6, STILL_B, 'Four time slots. Is your day free? No idea. See more slots.', 'before', 2,
         [(0.7, (580, 488))], focus=(500, 395, 955, 505)),
    shot('b_more', 'B', 3.4, STILL_B, 'Another dialog of buttons. Pick one and hope.', 'before', 3,
         [(0.7, (753, 525))], focus=(458, 155, 955, 683)),
    shot('b_loc', 'B', 3.0, STILL_B, 'A third dialog, just for the location.', 'before', 4,
         [(0.65, (706, 373))], focus=(458, 240, 955, 600)),
    shot('b_desc', 'B', 5.0, STILL_B,
         [(0, 'Only now does it warn you: it clashes with dinner 😬'),
          (0.5, 'Add a description and send.')], 'before', 5,
         [(0.8, (845, 700))], focus=[(0, (458, 345, 955, 400)), (0.5, (458, 460, 955, 725))], cap_top=True),
    shot('b_sent', 'B', 3.2, STILL_B, 'Sent: five clicks, three dialogs, and a clash.', 'before', 5,
         focus=(458, 390, 955, 505)),
    new_card(),
    shot('new_book_panel', 'A', 3.4, STILL_A, 'Their profile opens in a side panel. Click Book a 1:1.', 'after',
         ripples=[(0.55, (990, 143))], focus=(935, 52, 1384, 162)),
    shot('new_book_sun', 'B', 4.2, [(0, B_FULL), (1, (560, 40, 1060))], 'Your own day, with times you’re both free. Clashes crossed out.', 'after',
         focus=(965, 165, 1400, 540)),
    shot('new_book_slot', 'B', 3.2, STILL_B, 'Pick a slot and a meeting spot.', 'after',
         ripples=[(0.1, (1311, 328))], focus=(965, 160, 1400, 700)),
    shot('new_book_msg', 'B', 3.0, [(0, (0, 45, 1413))], 'Add a note and send.', 'after',
         ripples=[(0.7, (1048, 808))], focus=(965, 690, 1400, 830), cap_top=True),
    shot('new_book_sent', 'B', 3.0, STILL_B, 'Done. Not a single dialog.', 'after',
         focus=(965, 160, 1400, 230)),

    flow_card('Deciding on a meeting request'),
    old_card(''),
    shot('old_home', 'B', 3.0, STILL_B, 'Click the bell to see your requests.', 'before', 1,
         [(0.55, (1242, 26))], focus=(1205, 4, 1280, 50)),
    shot('old_bell', 'B', 3.0, STILL_B, 'Click their name to learn more.', 'before', 2,
         [(0.6, (1161, 670))], focus=(1053, 535, 1405, 760)),
    shot('old_meeting', 'B', 3.4, STILL_B, 'The meeting page 😢. Click their name *again*.', 'before', 3,
         [(0.6, (440, 405))], focus=(290, 120, 1125, 515)),
    shot('old_profile', 'B', 3.0, STILL_B, 'Their bio is cut off. Click See more.', 'before', 4,
         [(0.6, (493, 733))], focus=(458, 630, 955, 750), cap_top=True),
    shot('old_profile2', 'B', 3.2, STILL_B, 'Goals and how they help: cut off too. See more.', 'before', 5,
         focus=(458, 650, 955, 835), cap_top=True),
    shot('old_profile3', 'B', 3.2, STILL_B, 'Their links are all the way at the bottom. Scroll.', 'before', 5,
         focus=(458, 470, 955, 545)),
    shot('old_list', 'B', 3.4, STILL_B, 'Are you free then? Open My Schedule, switch to Calendar.', 'before', 7,
         [(0.55, (366, 221))], focus=(180, 150, 440, 260)),
    shot('old_sun', 'B', 3.0, STILL_B, 'Scroll to Sunday afternoon.', 'before', 7,
         focus=(986, 495, 1218, 548)),
    shot('old_back', 'B', 3.0, STILL_B, 'Back to the bell to find the request.', 'before', 8,
         [(0.55, (1242, 26))], focus=(1205, 4, 1280, 50)),
    shot('old_accept', 'B', 3.0, STILL_B, 'Finally, click Accept.', 'before', 9,
         [(0.6, (1099, 549))], focus=(1053, 345, 1405, 570)),
    new_card(),
    shot('new_inbox', 'A', 17.0, STILL_A,
         [(0, 'One unified inbox, with everything you need shown by default.'),
          (0.2, 'So much more peaceful 🧘'),
          (0.36, 'Your day around the proposed time: free or not, at a glance.'),
          (0.68, 'Their full profile right beside it, to judge if they’re worth meeting.')],
         'after', focus=[(0, (0, 54, 282, 600)), (0.2, (0, 54, 282, 600)), (0.36, (284, 60, 1008, 430)), (0.68, (1018, 60, 1370, 868))],
         closeups=[('new_inbox_card', (284, 64, 1006, 424)), ('new_inbox_profile', (1024, 64, 1366, 444))]),

    dict(kind='outro', dur=6.5, tone='intro',
         title='Calmer Card', sub='A free Chrome extension for Swapcard',
         bullets=['1 click to install',
                  'Works on top of your current Swapcard. No new app or website :)',
                  'Makes your life less painful 🧘']),
]

# The previous shot's click count, so the counter can tick up from it.
_prev = None
for _it in TIMELINE:
    if _it['kind'] == 'shot':
        _it['prev_count'] = _prev
        _prev = _it['counter'] if _it['counter'] is not None else _prev
    else:
        _prev = None if _it.get('tone') == 'intro' else _prev


# ---------- images ----------
_masters = {}


def master(shot_dir, img, era, closeups):
    key = (img, tuple(c[0] for c in closeups))
    if key in _masters:
        return _masters[key]
    left = Image.open(shot_dir / f'{img}_L.png').convert('RGB')
    right = Image.open(shot_dir / f'{img}_R.png').convert('RGB')
    h = min(left.height, right.height)
    st = Image.new('RGB', (left.width + right.width, h), 'white')
    st.paste(left.crop((0, 0, left.width, h)), (0, 0))
    st.paste(right.crop((0, 0, right.width, h)), (left.width, 0))
    fw, fh = ERA[era]
    m = st.resize((int(fw * S), int(fh * S)), Image.LANCZOS)
    for name, (x0, y0, x1, y1) in closeups:
        c = Image.open(shot_dir / f'{name}.png').convert('RGB')
        box = (int(x0 * S), int(y0 * S), int(x1 * S), int(y1 * S))
        m.paste(c.resize((box[2] - box[0], box[3] - box[1]), Image.LANCZOS), box[:2])
    _masters[key] = m
    return m


def ease(t):
    return 0.5 - 0.5 * np.cos(np.pi * max(0.0, min(1.0, t)))


def cam_at(cams, u, era):
    fw, fh = ERA[era]
    if u <= cams[0][0]:
        r = cams[0][1]
    elif u >= cams[-1][0]:
        r = cams[-1][1]
    else:
        for (t0, r0), (t1, r1) in zip(cams, cams[1:]):
            if t0 <= u <= t1:
                k = ease((u - t0) / (t1 - t0)) if t1 > t0 else 1
                r = tuple(a + (b - a) * k for a, b in zip(r0, r1))
                break
    x, y, w = r
    w = min(w, fw)
    h = w * 9 / 16
    x = max(0, min(x, fw - w))
    y = max(0, min(y, fh - h))
    return x, y, w, h


def pill(draw, xy, text, font, fill, color, pad=(22, 12), anchor='lt', radius=999):
    l, t, r, b = draw.textbbox((0, 0), text, font=font)
    tw, th = r - l, b - t
    x, y = xy
    w, h = tw + 2 * pad[0], th + 2 * pad[1]
    if anchor == 'mb':
        x, y = x - w / 2, y - h
    elif anchor == 'rt':
        x = x - w
    draw.rounded_rectangle((x, y, x + w, y + h), radius=min(radius, h / 2), fill=fill)
    draw.text((x + pad[0] - l, y + pad[1] - t), text, font=font, fill=color)


def wrap(draw, text, font, width):
    words, lines, cur = text.split(), [], ''
    for wd in words:
        test = (cur + ' ' + wd).strip()
        if draw.textlength(test, font=font) <= width:
            cur = test
        else:
            lines.append(cur)
            cur = wd
    lines.append(cur)
    return lines


# ---------- rich caption text: *italic* and emoji ----------
EMOJI_FONT = ImageFont.truetype('/System/Library/Fonts/Apple Color Emoji.ttc', 160)
_emoji_cache = {}


def is_emoji(ch):
    return ord(ch) >= 0x2190 and not ch.isalnum()


def emoji_img(ch, size):
    key = (ch, size)
    if key not in _emoji_cache:
        im = Image.new('RGBA', (200, 200), (0, 0, 0, 0))
        ImageDraw.Draw(im).text((100, 100), ch, font=EMOJI_FONT, embedded_color=True, anchor='mm')
        im = im.crop(im.getbbox() or (0, 0, 1, 1))
        r = size / max(im.size)
        _emoji_cache[key] = im.resize((max(1, int(im.width * r)), max(1, int(im.height * r))), Image.LANCZOS)
    return _emoji_cache[key]


def tokens(text):
    """Words as (text, kind) with kind 'n' (normal), 'i' (italic) or 'e' (emoji)."""
    out, italic = [], False
    for word in text.split(' '):
        w = word
        start_i, end_i = w.startswith('*'), w.rstrip('.,!?:;').endswith('*')
        w = w.replace('*', '')
        if start_i:
            italic = True
        parts, cur = [], ''
        for ch in w:
            if is_emoji(ch) or ch in '️‍':
                if cur:
                    parts.append((cur, 'i' if italic else 'n'))
                    cur = ''
                if ch not in '️‍':
                    parts.append((ch, 'e'))
            else:
                cur += ch
        if cur:
            parts.append((cur, 'i' if italic else 'n'))
        out.append(parts)
        if end_i:
            italic = False
    return out


def word_width(d, parts):
    return sum(48 if k == 'e' else d.textlength(t, font=F['capi' if k == 'i' else 'cap']) for t, k in parts)


def wrap_rich(d, text, width):
    space = d.textlength(' ', font=F['cap'])
    lines, cur, cw = [], [], 0
    for wd in tokens(text):
        ww = word_width(d, wd)
        if cur and cw + space + ww > width:
            lines.append(cur)
            cur, cw = [], 0
        cw += (space if cur else 0) + ww
        cur.append(wd)
    lines.append(cur)
    return lines


def line_width(d, line):
    space = d.textlength(' ', font=F['cap'])
    return sum(word_width(d, w) for w in line) + space * (len(line) - 1)


def draw_line(ov, d, line, x, ymid, a):
    space = d.textlength(' ', font=F['cap'])
    for j, wd in enumerate(line):
        for t, k in wd:
            if k == 'e':
                im = emoji_img(t, 48)
                if a < 255:
                    im = im.copy()
                    im.putalpha(im.getchannel('A').point(lambda v: v * a // 255))
                ov.alpha_composite(im, (int(x), int(ymid - im.height / 2)))
                x += 48
            else:
                f = F['capi' if k == 'i' else 'cap']
                d.text((x, ymid), t, font=f, fill=(255, 255, 255, a), anchor='lm')
                x += d.textlength(t, font=f)
        x += space


def render_shot(shot_dir, it, t):
    u = t / it['dur']
    m = master(shot_dir, it['img'], it['era'], it['closeups'])
    x, y, w, h = cam_at(it['cams'], u, it['era'])
    frame = m.crop((int(x * S), int(y * S), int((x + w) * S), int((y + h) * S))).resize((W, H), Image.BICUBIC).convert('RGBA')
    sc = W / w
    if it['focus']:
        # Spotlight: fades in, then glides to each new focus rect over 0.45 s.
        fr = it['focus'][0][1]
        for i in range(1, len(it['focus'])):
            fu, r1 = it['focus'][i]
            if u >= fu:
                k = ease(min(1, (u - fu) * it['dur'] / 0.45))
                fr = tuple(a + (b - a) * k for a, b in zip(fr, r1))
        alpha = ease(min(1, max(0, t - 0.15) / 0.4))
        pad = 10
        x0, y0 = (fr[0] - x) * sc - pad, (fr[1] - y) * sc - pad
        x1, y1 = (fr[2] - x) * sc + pad, (fr[3] - y) * sc + pad
        mask = Image.new('L', (W, H), int(150 * alpha))
        ImageDraw.Draw(mask).rounded_rectangle((x0, y0, x1, y1), radius=18, fill=0)
        mask = mask.filter(ImageFilter.GaussianBlur(6))
        dark = Image.new('RGBA', (W, H), (8, 12, 24, 255))
        dark.putalpha(mask)
        frame = Image.alpha_composite(frame, dark)
    ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    for (rt, (rx, ry)) in it['ripples']:
        dt = u * it['dur'] - rt * it['dur']
        if 0 <= dt <= 0.7:
            px, py = (rx - x) * sc, (ry - y) * sc
            k = dt / 0.7
            rad = 14 + 46 * k
            a = int(255 * (1 - k))
            d.ellipse((px - rad, py - rad, px + rad, py + rad), outline=(37, 99, 235, a), width=6)
            d.ellipse((px - 14, py - 14, px + 14, py + 14), fill=(37, 99, 235, int(110 * (1 - k))))
    # Tag (top left) and click counter (top right).
    # Caption (bottom), fading in when it changes.
    cap, since = it['caps'][0][1], it['caps'][0][0]
    for cu, ct in it['caps']:
        if u >= cu:
            cap, since = ct, cu
    alpha = min(1, (u - since) * it['dur'] / 0.25) if since > 0 else 1
    # Counter: a quiet dark pill beside the caption; the number ticks up with a small pulse.
    ctext, pulse = None, 0
    if it['counter'] is not None:
        c, prev = it['counter'], it.get('prev_count')
        if prev is not None and prev != c:
            k = min(1, max(0, (t - 0.35) / 0.45))
            shown = prev + (c - prev) * ease(k) if k < 1 else c
            shown = int(round(shown))
            pulse = np.sin(np.pi * k) if 0 < k < 1 else 0
        else:
            shown = c
        ctext = f'{shown} click{"s" if shown != 1 else ""}'
    cw = (d.textlength(ctext, font=F['count']) + 52) if ctext else 0
    gap = 16 if ctext else 0
    lines = wrap_rich(d, cap, W - 300 - cw - gap)
    lh = 64
    box_h = lh * len(lines) + 36
    box_w = max(line_width(d, ln) for ln in lines) + 72
    total = box_w + gap + cw
    bx = (W - total) / 2
    by = 90 if it['cap_top'] else H - 60 - box_h
    d.rounded_rectangle((bx, by, bx + box_w, by + box_h), radius=26, fill=(0, 0, 0, int(235 * alpha)))
    for i, ln in enumerate(lines):
        lw = line_width(d, ln)
        draw_line(ov, d, ln, bx + (box_w - lw) / 2, by + 18 + i * lh + lh / 2, int(255 * alpha))
    if ctext:
        cx = bx + box_w + gap
        ch = 72 + 10 * pulse
        cy0 = by + (box_h - ch) / 2
        d.rounded_rectangle((cx - 5 * pulse, cy0, cx + cw + 5 * pulse, cy0 + ch), radius=ch / 2,
                            fill=(0, 0, 0, 235), outline=(251, 191, 36, int(140 + 115 * pulse)), width=2)
        d.text((cx + cw / 2, cy0 + ch / 2), ctext, font=F['count'], fill=(253, 224, 140, 255), anchor='mm')
    return Image.alpha_composite(frame, ov).convert('RGB')


_card_bg = {}


TONES = {'intro': INK, 'old': (153, 27, 27), 'new': (4, 120, 87)}
F['big'] = ImageFont.truetype(str(FONT_DIR / 'Poppins-Bold.otf'), 140)


def render_card(shot_dir, it, t):
    img = Image.new('RGBA', (W, H), TONES[it['tone']] + (255,))
    ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    k = min(1, t / 0.25)  # quick, small rise-in
    dy = int(12 * (1 - ease(k)))
    a = int(255 * ease(k))
    big = it['tone'] in ('old', 'new') or it.get('big')
    cy = H / 2 - (30 if big else 20)
    if it['icon']:
        ic = Image.open(Path(__file__).resolve().parents[2] / 'icons/icon128.png').convert('RGBA').resize((120, 120), Image.LANCZOS)
        if a < 255:
            ic.putalpha(ic.getchannel('A').point(lambda v: v * a // 255))
        ov.alpha_composite(ic, (int(W / 2 - 60), int(cy - 190 + dy)))
    tf = F['big'] if big else F['title']
    if big:
        size = 140
        while size > 60 and d.textlength(it['title'], font=tf) > W - 240:
            size -= 6
            tf = ImageFont.truetype(str(FONT_DIR / 'Poppins-Bold.otf'), size)
    d.text((W / 2, cy + dy), it['title'], font=tf, fill=(255, 255, 255, a), anchor='mm')
    if it['sub']:
        d.text((W / 2, cy + (115 if big else 92) + dy), it['sub'], font=F['sub'], fill=(255, 255, 255, int(a * 0.8)), anchor='mm')
    if it['url']:
        pill(d, (W / 2, cy + 230 + dy), it['url'], F['url'], (255, 255, 255, int(a * 0.95)), INK, pad=(30, 16), anchor='mb')
    return Image.alpha_composite(img, ov).convert('RGB')


def render_outro(shot_dir, it, t):
    img = Image.new('RGBA', (W, H), TONES['intro'] + (255,))
    ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    a = int(255 * ease(min(1, t / 0.3)))
    ic = Image.open(Path(__file__).resolve().parents[2] / 'icons/icon128.png').convert('RGBA').resize((110, 110), Image.LANCZOS)
    ic.putalpha(ic.getchannel('A').point(lambda v: v * a // 255))
    ov.alpha_composite(ic, (int(W / 2 - 55), 150))
    d.text((W / 2, 330), it['title'], font=F['title'], fill=(255, 255, 255, a), anchor='mm')
    d.text((W / 2, 410), it['sub'], font=F['sub'], fill=(255, 255, 255, int(a * 0.8)), anchor='mm')
    # Bullets come in one by one, sliding up a little.
    lines = [wrap_rich(d, b, W - 600)[0] if line_width(d, wrap_rich(d, b, 4000)[0]) <= W - 400 else wrap_rich(d, b, 4000)[0] for b in it['bullets']]
    widths = [line_width(d, ln) for ln in lines]
    x0 = (W - max(widths) - 70) / 2
    for i, ln in enumerate(lines):
        k = ease(min(1, max(0, (t - 0.9 - i * 0.9) / 0.45)))
        if k <= 0:
            continue
        y = 540 + i * 110 + 20 * (1 - k)
        ba = int(255 * k)
        d.ellipse((x0, y - 22, x0 + 44, y + 22), fill=(16, 185, 129, ba))
        d.line([(x0 + 12, y + 1), (x0 + 19, y + 9), (x0 + 33, y - 8)], fill=(255, 255, 255, ba), width=5, joint='curve')
        draw_line(ov, d, ln, x0 + 70, y, ba)
    return Image.alpha_composite(img, ov).convert('RGB')


def render(shot_dir, it, t):
    if it['kind'] == 'outro':
        return render_outro(shot_dir, it, t)
    return render_shot(shot_dir, it, t) if it['kind'] == 'shot' else render_card(shot_dir, it, t)


def main():
    shot_dir, music, out = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
    preview = '--preview' in sys.argv
    starts, t = [], 0.0
    for it in TIMELINE:
        starts.append(t)
        t += it['dur'] - XF
    total = t + XF
    print(f'duration {total:.1f}s')
    if preview:  # one still per item, at 60% through
        for i, it in enumerate(TIMELINE):
            render(shot_dir, it, it['dur'] * 0.6).save(f'{out}.{i:02d}.jpg', quality=88)
        return
    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
                           '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-i', music,
                           '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium',
                           '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out],
                          stdin=subprocess.PIPE)
    for f in range(int(total * FPS)):
        tt = f / FPS
        live = [(i, tt - s) for i, s in enumerate(starts) if s <= tt < s + TIMELINE[i]['dur']]
        frames = [(render(shot_dir, TIMELINE[i], lt), i, lt) for i, lt in live[-2:]]
        img = frames[0][0]
        if len(frames) == 2:
            k = ease(min(1, frames[1][2] / XF))
            img = Image.blend(frames[0][0], frames[1][0], k)
        ff.stdin.write(np.asarray(img, dtype=np.uint8).tobytes())
    ff.stdin.close()
    ff.wait()


if __name__ == '__main__':
    main()
