# insert.py <part.py>: put (or replace) a builder section before the finishing marker; sections keyed by their first line
import sys
p = 'build_furn-trophy.py'; s = open(p, encoding='utf-8').read()
part = open(sys.argv[1], encoding='utf-8').read().rstrip('\n') + '\n\n'
head = part.split('\n', 1)[0]
marker = '# ================================================================== finishing and export'
if head in s:
    i = s.index(head); j = s.index('# ==================================================================', i + len(head))
    s = s[:i] + part + s[j:]
else:
    s = s.replace(marker, part + marker, 1)
open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('inserted', head[:80])
