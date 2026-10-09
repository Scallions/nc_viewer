export const COLORMAPS = [
  'viridis', 'plasma', 'inferno', 'magma', 'cividis',
  'turbo', 'jet', 'hot', 'cool', 'RdYlBu',
] as const;
export type ColormapName = (typeof COLORMAPS)[number];

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// compact colormap stops (5-9 colors each), interpolated
const STOPS: Record<ColormapName, string[]> = {
  viridis: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'],
  plasma: ['#0d0887', '#7e03a8', '#cc4778', '#f89540', '#f0f921'],
  inferno: ['#000004', '#57106e', '#bc3754', '#f98e09', '#fcffa4'],
  magma: ['#000004', '#51127c', '#b5367a', '#fb8861', '#fcfdbf'],
  cividis: ['#00224e', '#35456c', '#7d7c78', '#b4b4a2', '#fee838'],
  turbo: ['#30123b', '#1ae4b6', '#a4fc3c', '#fb8022', '#7a0403'],
  jet: ['#00008f', '#0020ff', '#00ffff', '#ffff00', '#ff0000', '#800000'],
  hot: ['#000000', '#ff0000', '#ffff00', '#ffffff'],
  cool: ['#00ffff', '#ff00ff'],
  RdYlBu: ['#d73027', '#fee090', '#e0f3f8', '#4575b4'],
};

const CACHE = new Map<ColormapName, [number, number, number][]>();

function lut(name: ColormapName, steps = 256): [number, number, number][] {
  const hit = CACHE.get(name);
  if (hit) return hit;
  const stops = STOPS[name].map(hexToRgb);
  const out: [number, number, number][] = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const seg = Math.min(stops.length - 2, Math.floor(t * (stops.length - 1)));
    const f = t * (stops.length - 1) - seg;
    const a = stops[seg], b = stops[seg + 1];
    out.push([
      Math.round(a[0] + (b[0] - a[0]) * f),
      Math.round(a[1] + (b[1] - a[1]) * f),
      Math.round(a[2] + (b[2] - a[2]) * f),
    ]);
  }
  CACHE.set(name, out);
  return out;
}

export function colormapColors(name: ColormapName, steps = 64): string[] {
  return lut(name, steps).map(([r, g, b]) => `rgb(${r},${g},${b})`);
}

/** Map a value to [r,g,b] via colormap. NaN -> null. */
export function colorFor(
  value: number, min: number, max: number, name: ColormapName,
): [number, number, number] | null {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
  const table = lut(name);
  const t = Math.min(1, Math.max(0, (value - min) / (max - min)));
  return table[Math.round(t * (table.length - 1))];
}
