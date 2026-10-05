"""Self-hosted UI fonts: downloads Fredoka (variable) and M PLUS Rounded 1c (500/700/800) from the google/fonts repo
(both SIL Open Font License 1.1), subsets them to what the game uses and writes woff2 files to src/ui/fonts/.
  python tools/fonts/build-fonts.py          (re-run when new Japanese text or symbols are added to the game)
Source TTFs are cached in tools/fonts/src/ (git-ignored). Needs fontTools + brotli (pip install fonttools brotli)."""
import os
import sys
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SRC = os.path.join(ROOT, 'tools', 'fonts', 'src')
OUT = os.path.join(ROOT, 'src', 'ui', 'fonts')
GF = 'https://github.com/google/fonts/raw/main/ofl/'
NL = chr(10)
FONTS = {
    'fredoka.ttf': GF + 'fredoka/Fredoka%5Bwdth,wght%5D.ttf',
    'mplus-500.ttf': GF + 'mplusrounded1c/MPLUSRounded1c-Medium.ttf',
    'mplus-700.ttf': GF + 'mplusrounded1c/MPLUSRounded1c-Bold.ttf',
    'mplus-800.ttf': GF + 'mplusrounded1c/MPLUSRounded1c-ExtraBold.ttf',
    'OFL-fredoka.txt': GF + 'fredoka/OFL.txt',
}


def fetch():
    os.makedirs(SRC, exist_ok=True)
    for name, url in FONTS.items():
        p = os.path.join(SRC, name)
        if not os.path.exists(p):
            print('download', url)
            urllib.request.urlretrieve(url, p)


def used_chars():
    """Every non-ASCII character in the game's source text (UI strings, labels, CSS content)."""
    chars = set()
    for base in (os.path.join(ROOT, 'src'), ROOT):
        for dirpath, dirnames, files in os.walk(base):
            if base == ROOT:
                dirnames[:] = []  # only index.html at the root
            for f in files:
                if base == ROOT and f != 'index.html':
                    continue
                if not f.endswith(('.js', '.css', '.html')):
                    continue
                with open(os.path.join(dirpath, f), encoding='utf-8', errors='ignore') as fh:
                    chars.update(c for c in fh.read() if ord(c) > 0x7e)
    return chars


def ranges(*spans):
    return [cp for a, b in spans for cp in range(a, b + 1)]


def write(src, dst, codepoints):
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']  # keep kerning, ligatures, kana features
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    font = subset.load_font(src, opts)
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=codepoints)
    sub.subset(font)
    subset.save_font(font, dst, opts)
    print(f'{os.path.relpath(dst, ROOT)}: {os.path.getsize(dst) // 1024} KB')


def main():
    fetch()
    os.makedirs(OUT, exist_ok=True)
    extra = sorted(ord(c) for c in used_chars())
    latin = ranges((0x20, 0x7e), (0xa0, 0x17f), (0x2010, 0x2027), (0x2030, 0x203a), (0x20ac, 0x20ac), (0x2122, 0x2122))
    # Fredoka: Latin text + whatever symbols the game uses that it has (missing ones fall back to M PLUS / system)
    write(os.path.join(SRC, 'fredoka.ttf'), os.path.join(OUT, 'fredoka.woff2'), latin + extra)
    # M PLUS Rounded 1c: Japanese labels (every kana, CJK punctuation, full-width forms, plus the kanji the game uses)
    jp = latin + ranges((0x3000, 0x303f), (0x3040, 0x309f), (0x30a0, 0x30ff), (0xff00, 0xffef)) + extra
    for w in (500, 700, 800):
        write(os.path.join(SRC, f'mplus-{w}.ttf'), os.path.join(OUT, f'mplus-{w}.woff2'), jp)
    # licences: Fredoka's OFL.txt as published; M PLUS's folder has no OFL.txt (METADATA.pb says OFL), so write its
    # copyright notice from the font's own name table above the same OFL 1.1 text
    ofl = open(os.path.join(SRC, 'OFL-fredoka.txt'), encoding='utf-8').read()
    with open(os.path.join(OUT, 'OFL-fredoka.txt'), 'w', encoding='utf-8', newline=NL) as f:
        f.write(ofl)
    body = ofl[ofl.index('This Font Software is licensed'):]
    tt = TTFont(os.path.join(SRC, 'mplus-500.ttf'))
    notice = tt['name'].getDebugName(0) or 'Copyright 2016 The M+ Project Authors.'
    with open(os.path.join(OUT, 'OFL-mplusrounded1c.txt'), 'w', encoding='utf-8', newline=NL) as f:
        f.write(notice.strip() + NL + NL + body)
    # the characters this subset was built for: tools/build-itch.mjs warns when the source gains ones that aren't here
    with open(os.path.join(OUT, 'chars.txt'), 'w', encoding='utf-8', newline=NL) as f:
        f.write(''.join(chr(c) for c in extra) + NL)
    kanji = [c for c in extra if 0x4e00 <= c <= 0x9fff]
    print(f'{len(extra)} non-ASCII characters from the source ({len(kanji)} kanji)')


if __name__ == '__main__':
    sys.exit(main())
