"""Design multi-circle collision hulls per geometry, printed as JS.

Each hull is a list of circles in LOCAL space (x right, y up), scaled so
1.0 = the geometry's bounding radius. The physics body stores `hull` and
rotates it by b.angle each frame; circle-vs-circle contact between hulls
replaces the single-sphere approximation.

Shapes map onto their 3D forms:
  hexbolt  hex prism   -> 2 stacked circles (flat-ish top/bottom)
  capsule  capsule     -> 2 end circles + mid circle
  box      cube        -> 4 circles at face centres (squarish envelope)
  sphere   gyro ball   -> 1 circle (true circle, keep)
  cyl      canister    -> 3 vertical circles
  bell     thruster    -> 3 circles, radius growing downward (nozzle)
  torus    antenna     -> 4 circles ON the ring (hollow centre!)
  dodeca   fuel tank   -> 7 circles (centre + 6 at 0.72)
  cyl2     service mod -> 3 slim circles
  cone     command mod -> 4 circles shrinking upward
  booster  launch veh  -> 3 circles: slim top, fat mid, slim bottom
"""
import io, math

def ring(n, r, radius):
    return [(r * math.cos(2 * math.pi * i / n - math.pi / 2),
             r * math.sin(2 * math.pi * i / n - math.pi / 2), radius) for i in range(n)]

HULLS = {
    'hexbolt': [(0, 0.3, 0.88), (0, -0.3, 0.88)],
    'capsule': [(0, 0.42, 0.42), (0, 0, 0.42), (0, -0.42, 0.42)],
    'box':     [(0, 0.5, 0.5), (0, -0.5, 0.5), (0.5, 0, 0.5), (-0.5, 0, 0.5)],
    'sphere':  [(0, 0, 1.0)],
    'cyl':     [(0, 0.42, 0.72), (0, 0, 0.72), (0, -0.42, 0.72)],
    'bell':    [(0, 0.55, 0.44), (0, 0, 0.72), (0, -0.55, 1.02)],
    'torus':   ring(4, 0.72, 0.30),
    'dodeca':  [(0, 0, 0.72)] + ring(6, 0.55, 0.5),
    'cyl2':    [(0, 0.5, 0.56), (0, 0, 0.56), (0, -0.5, 0.56)],
    'cone':    [(0, -0.5, 0.92), (0, -0.15, 0.72), (0, 0.2, 0.48), (0, 0.5, 0.22)],
    'octa':    [(0, 0.35, 0.72), (0, -0.35, 0.72), (0.35, 0, 0.72), (-0.35, 0, 0.72)],
    'booster': [(0, 0.5, 0.44), (0, 0, 0.6), (0, -0.48, 0.5)],
}

lines = []
lines.append('  /* ══ shape-true collision hulls ══════════════════════════════')
lines.append('     Circles in local space (x right, y up), 1.0 == bounding')
lines.append('     radius. World circles = rotate by b.angle, scale by L.r.')
lines.append('     Circle-vs-circle between hulls replaces the one-sphere')
lines.append('     approximation, so tori have holes, nozzles taper and')
lines.append('     capsules roll. */')
lines.append('  var HULLS = {')
for k, v in HULLS.items():
    pts = ', '.join('[%.2f, %.2f, %.2f]' % c for c in v)
    lines.append('    %s: [%s],' % (k, pts))
lines.append('  };')

out = '\n'.join(lines)
io.open('tools/_hulls.js.txt', 'w', encoding='utf-8').write(out)
print(out)
