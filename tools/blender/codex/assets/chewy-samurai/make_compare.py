"""Same-scale comparisons against refs/sheet.png (Option E) and against today's chewy-b.

    python make_compare.py

Crops are computed, not eyeballed: on the sheet, crown y = 97 px, ground y = 492 px (395 px = 1.20 m); on the ortho
renders (render_views.py), 1000 px = 1.40 m with z = 0.66 m at row 500. Every crop spans z from -0.02 to 1.32 m and
+-0.49 m about the figure's centre line, so all tiles share one scale.
"""
import subprocess, sys, os
T = os.path.dirname(os.path.abspath(__file__))
CMP = 'D:/projects/chewy-life-3d/.claude/skills/toybox-character/scripts/compare.py'
SHEET = os.path.join(T, 'refs', 'sheet.png')
MPP = 1.20 / 395                          # sheet metres per pixel
Z_TOP, Z_BOT, HALF = 1.32, -.02, .49
def sheet_box(cx):
    y0 = 492 - Z_TOP / MPP; y1 = 492 - Z_BOT / MPP
    return f'{cx - HALF / MPP:.1f},{y0:.1f},{cx + HALF / MPP:.1f},{y1:.1f}'
def render_box():
    ppm = 1000 / 1.40
    y0 = 500 - (Z_TOP - .66) * ppm; y1 = 500 - (Z_BOT - .66) * ppm
    return f'{350 - HALF * ppm:.1f},{y0:.1f},{350 + HALF * ppm:.1f},{y1:.1f}'
P = lambda *a: os.path.join(T, *a)
# sheet centre lines (px): front head centre 193.5; side, the model's y = 0 sits at 865 (nose matched); back 1195
jobs = {
    'cmp-front': [f'SHEET E front::{SHEET}::{sheet_box(193.5)}', f'MODEL front::{P("preview", "body_front.png")}::{render_box()}'],
    'cmp-side': [f'SHEET E side::{SHEET}::{sheet_box(865.2)}', f'MODEL side::{P("preview", "body_side.png")}::{render_box()}'],
    'cmp-back': [f'SHEET E back::{SHEET}::{sheet_box(1195)}', f'MODEL back::{P("preview", "body_back.png")}::{render_box()}'],
    'cmp-34': [f'SHEET E 3/4::{SHEET}::{sheet_box(540)}', f'MODEL 3/4::{P("preview", "body_34.png")}::{render_box()}'],
    'cmp-today': [f'TODAY chewy-b front::{P("today", "body_front.png")}::{render_box()}', f'SAMURAI front::{P("preview", "body_front.png")}::{render_box()}',
                  f'TODAY side::{P("today", "body_side.png")}::{render_box()}', f'SAMURAI side::{P("preview", "body_side.png")}::{render_box()}'],
}
for name, items in jobs.items():
    subprocess.run([sys.executable, CMP, P('preview', name + '.png'), '--h', '640'] + items, check=True)
