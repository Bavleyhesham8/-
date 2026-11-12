import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from scripts.import_access_phase_b import access_connect, fetch_all
import re

ac = access_connect()
_, custody_headers = fetch_all(ac, 'راس العهدة')
_, staff = fetch_all(ac, 'الموظفين')
ac.close()

print("--- PATTERN ANALYSIS ---")
staff_tokens = {}
for s in staff:
    raw = s.get('اسم الموظف / العامل') or ''
    tokens = set(re.findall(r'\w+', raw))
    staff_tokens[s.get('رقم الموظف')] = tokens

for h in custody_headers:
    cnum = h.get('رقم العهدة')
    raw = h.get('العهدة') or ''
    # Check prefixes
    has_slash = '/' in raw
    has_ohda_word = 'عهدة' in raw
    tokens = set(re.findall(r'\w+', raw)) - {'عهدة', 'العهدة', 'مبلغ', 'طرف'}
    # matches with staff tokens
    matches = []
    for emp_num, stokens in staff_tokens.items():
        overlap = tokens & stokens
        if len(overlap) >= 2: # at least 2 name components match
            matches.append((emp_num, len(overlap)))
        elif len(overlap) == 1:
            matches.append((emp_num, 1))
    print(f"Header ID={cnum}: len={len(raw)}, has_slash={has_slash}, has_prefix_word={has_ohda_word}, candidate_matches={matches}")

