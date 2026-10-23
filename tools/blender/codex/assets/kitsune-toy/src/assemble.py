"""Concatenate src/p*.py (sorted, skipping *_ref.py) into build_kitsune-toy.py (LF line endings).   python src/assemble.py"""
import glob, os
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
parts = sorted(p for p in glob.glob(os.path.join(HERE, 'p*.py')) if not p.endswith('_ref.py'))
txt = ''
for p in parts:
    with open(p, encoding='utf-8') as f: s = f.read().replace('\r\n', '\n')
    txt += s if s.endswith('\n') else s + '\n'
with open(os.path.join(ROOT, 'build_kitsune-toy.py'), 'w', encoding='utf-8', newline='\n') as f: f.write(txt)
print('assembled', len(parts), 'parts,', txt.count('\n'), 'lines:', ', '.join(os.path.basename(p) for p in parts))
