"""Generate the app icon: a globe rendered as a cividis heatmap with graticule.

    python tools/gen_icon.py
    npx tauri icon src-tauri/app-icon.svg

Writes src-tauri/app-icon.svg (source for `tauri icon`) and public/favicon.svg.
Colors match the `cividis` stops in src/lib/colormap.ts.
"""
import math
import pathlib

STOPS = ['#00224e', '#35456c', '#7d7c78', '#b4b4a2', '#fee838']
def hx(c): return [int(c[i:i+2], 16) for i in (1, 3, 5)]
def cividis(t):
    t = min(max(t, 0), 1) * (len(STOPS) - 1)
    i = min(int(t), len(STOPS) - 2); f = t - i
    a, b = hx(STOPS[i]), hx(STOPS[i + 1])
    return '#%02x%02x%02x' % tuple(round(a[k] + (b[k] - a[k]) * f) for k in range(3))

C, R, N = 512, 336, 12  # center, globe radius, heatmap cells per side
x0 = C - R; cell = 2 * R / N
cells = []
for j in range(N):
    for i in range(N):
        cx = x0 + (i + .5) * cell; cy = x0 + (j + .5) * cell
        dy = (C - cy) / R; dx = (cx - C) / R
        lat = math.asin(max(-1, min(1, dy)))
        cl = math.cos(lat)
        lon = math.asin(max(-1, min(1, dx / cl))) if cl > 1e-6 else 0
        v = cl ** 5 * 0.98 + 0.09 * math.sin(2.4 * lon + 1.8 * lat) - 0.02
        cells.append(f'<rect x="{x0 + i*cell:.1f}" y="{x0 + j*cell:.1f}" width="{cell+0.6:.1f}" height="{cell+0.6:.1f}" fill="{cividis(v)}"/>')

grat = []
for lat in (-60, -30, 0, 30, 60):
    y = C - R * math.sin(math.radians(lat)); hw = R * math.cos(math.radians(lat))
    grat.append(f'<line x1="{C-hw:.1f}" y1="{y:.1f}" x2="{C+hw:.1f}" y2="{y:.1f}"/>')
grat.append(f'<line x1="{C}" y1="{C-R}" x2="{C}" y2="{C+R}"/>')
for lon in (30, 60):
    grat.append(f'<ellipse cx="{C}" cy="{C}" rx="{R*math.sin(math.radians(lon)):.1f}" ry="{R}"/>')

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2b3644"/>
      <stop offset="1" stop-color="#171c24"/>
    </linearGradient>
    <radialGradient id="shade" cx="0.36" cy="0.32" r="0.78">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.08"/>
      <stop offset="0.55" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.30"/>
    </radialGradient>
    <clipPath id="globe"><circle cx="{C}" cy="{C}" r="{R}"/></clipPath>
  </defs>
  <rect x="64" y="64" width="896" height="896" rx="208" fill="url(#bg)"/>
  <g clip-path="url(#globe)">
    {chr(10).join('    ' + c for c in cells).strip()}
    <g fill="none" stroke="#ffffff" stroke-opacity="0.32" stroke-width="7">
      {chr(10).join('      ' + g for g in grat).strip()}
    </g>
    <circle cx="{C}" cy="{C}" r="{R}" fill="url(#shade)"/>
  </g>
  <circle cx="{C}" cy="{C}" r="{R}" fill="none" stroke="#e8ecf2" stroke-width="18"/>
</svg>
'''
root = pathlib.Path(__file__).resolve().parent.parent
for out in (root / 'src-tauri' / 'app-icon.svg', root / 'public' / 'favicon.svg'):
    out.write_text(svg, encoding='utf-8', newline='\n')
    print('wrote', out.relative_to(root))
