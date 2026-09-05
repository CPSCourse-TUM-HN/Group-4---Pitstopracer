#!/usr/bin/env python3
"""Assemble the new Pit-Stop Racer Pro deck from the template parts + reusable
blocks lifted verbatim out of the previous deck."""
import io, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PRES = os.path.dirname(HERE)
OLD = os.path.join(PRES, 'pitstop-deck-v1.html')
OUT = os.path.join(PRES, 'pitstop-deck.html')

src = io.open(OLD, encoding='utf-8').read().split('\n')

def block(a, b):
    """1-based inclusive line range from the old deck."""
    return '\n'.join(src[a-1:b])

CSS      = block(8, 563)      # whole design system
DEFS     = block(1171, 1197)  # hidden svg <defs>
TRACKVAR = block(1202, 1202)  # var TRACK = {...};
GRIP     = block(1300, 1327)  # gripChart()
PHOTO1   = block(603, 603)    # <img class="jr-photo-1" ...>
PHOTO5   = block(663, 663)    # <img class="jr-photo-5" ...>

assert 'jr-photo-1' in PHOTO1 and 'jr-photo-5' in PHOTO5
assert TRACKVAR.strip().startswith('var TRACK')
assert 'function gripChart' in GRIP
# the as-built system triggers rain from the app, so relabel the humidity axis
GRIP = GRIP.replace('simulated humidity \u2192', 'wetness \u2192').replace('pit trigger', 'wet threshold')
assert 'id="jetracer"' in DEFS

track_literal = TRACKVAR.strip()[len('var TRACK ='):].rstrip().rstrip(';')

p1 = io.open(os.path.join(HERE, 'p1.html'), encoding='utf-8').read()
p2 = io.open(os.path.join(HERE, 'p2.html'), encoding='utf-8').read()
p3 = io.open(os.path.join(HERE, 'p3.html'), encoding='utf-8').read()
p4 = io.open(os.path.join(HERE, 'p4.js'), encoding='utf-8').read()

p1 = p1.replace('/*__CSS__*/', CSS)
p3 = p3.replace('<!--__DEFS__-->', DEFS)
p3 = p3.replace('<!--__PHOTO1__-->', PHOTO1.strip())
p3 = p3.replace('<!--__PHOTO5__-->', PHOTO5.strip())
p4 = p4.replace('/*__TRACK__*/', track_literal)
p4 = p4.replace('/*__GRIP__*/', GRIP)

for token in ('/*__CSS__*/', '<!--__DEFS__-->', '<!--__PHOTO1__-->',
              '<!--__PHOTO5__-->', '/*__TRACK__*/', '/*__GRIP__*/'):
    for part in (p1, p2, p3, p4):
        assert token not in part, 'unsubstituted token: ' + token

html = p1 + p2 + p3 + p4
io.open(OUT, 'w', encoding='utf-8').write(html)
print('wrote %s (%.1f KB)' % (OUT, len(html) / 1024.0))
