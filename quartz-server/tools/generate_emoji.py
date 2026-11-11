"""Generate the pinned Unicode Extended_Pictographic table used by diary projection."""
from pathlib import Path
from urllib.request import urlopen
import re
root=Path(__file__).resolve().parents[1]
source='https://www.unicode.org/Public/16.0.0/ucd/emoji/emoji-data.txt'
with urlopen(source,timeout=15) as response: text=response.read(512000).decode()
ranges=[]
for line in text.splitlines():
 match=re.match(r'^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*Extended_Pictographic\b',line)
 if match:ranges.append((int(match[1],16),int(match[2] or match[1],16)))
if not ranges:raise ValueError('No Unicode ranges found')
ranges.sort()
merged=[]
for start,end in ranges:
 if merged and start<=merged[-1][1]+1:merged[-1]=(merged[-1][0],max(end,merged[-1][1]))
 else:merged.append((start,end))
ranges=merged
body='// Code generated from Unicode 16.0 emoji-data.txt; DO NOT EDIT.\n// Copyright © 2024 Unicode, Inc. See UNICODE_LICENSE.txt.\npackage emoji\n\nvar extendedPictographic=[][2]rune{\n'
body+=''.join(f'{{0x{a:X},0x{b:X}}},\n' for a,b in ranges)+'}\n'
(root/'internal/emoji/ranges.go').write_text(body)
with urlopen('https://www.unicode.org/license.txt',timeout=15) as response: license=response.read(64000).decode()
(root/'internal/emoji/UNICODE_LICENSE.txt').write_text(license)
print(f'Generated {len(ranges)} Unicode ranges')
