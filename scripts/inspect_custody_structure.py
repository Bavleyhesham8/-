import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from scripts.import_access_phase_b import access_connect, fetch_all

ac = access_connect()
_, custody_headers = fetch_all(ac, 'راس العهدة')
_, staff = fetch_all(ac, 'الموظفين')
ac.close()

# Mask personal words with generic placeholders
for h in custody_headers:
    cnum = h.get('رقم العهدة')
    txt = h.get('العهدة') or ''
    # extract structure: words separated by slash or spaces
    parts = [p.strip() for p in txt.split('/')]
    masked_parts = []
    for p in parts:
        words = p.split()
        masked_words = []
        for w in words:
            if w in ('عهدة', 'مبلغ', 'طرف', 'الاستاذ', 'استاذ', 'السيد', 'جنيه', 'الف', 'فقط', 'لا', 'غير'):
                masked_words.append(w)
            elif w.isdigit():
                masked_words.append('<NUM>')
            else:
                masked_words.append(f'<TEXT_{len(w)}>')
        masked_parts.append(' '.join(masked_words))
    print(f"Header ID={cnum}: {' / '.join(masked_parts)}")

