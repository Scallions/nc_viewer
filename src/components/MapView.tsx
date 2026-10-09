import { useEffect, useMemo, useRef, useState } from 'react';
import {
  geoEquirectangular, geoGraticule, geoMercator, geoOrthographic, geoPath, geoStereographic,
  type GeoProjection,
} from 'd3-geo';
import { colorFor, type ColormapName } from '../lib/colormap';
import { PLOT_THEME } from '../lib/uiTheme';

export const PROJECTIONS = [
  { id: 'equirectangular', label: '等距圆柱' },
  { id: 'mercator', label: '墨卡托' },
  { id: 'orthographic', label: '正交地球' },
  { id: 'stereographic', label: '极射（北极）' },
] as const;
export type ProjectionId = (typeof PROJECTIONS)[number]['id'];

interface MapViewProps {
  data: Float64Array;
  nx: number;
  ny: number;
  lons: number[] | null;
  lats: number[] | null;
  colormap: ColormapName;
  vmin: number;
  vmax: number;
  onProbe?: (lon: number, lat: number, value: number) => void;
}

function normLon(lon: number): number {
  let x = lon % 360;
  if (x > 180) x -= 360;
  if (x < -180) x += 360;
  return x;
}

/** binary search in monotonic array; returns fractional index or NaN if out of range */
function locate(arr: number[], x: number): number {
  const n = arr.length;
  if (n < 2) return NaN;
  const asc = arr[n - 1] >= arr[0];
  const lo = asc ? arr[0] : arr[n - 1];
  const hi = asc ? arr[n - 1] : arr[0];
  if (x < lo || x > hi) return NaN;
  let a = 0, b = n - 1;
  if (!asc) {
    // search on reversed logic
    while (b - a > 1) {
      const m = (a + b) >> 1;
      if (arr[m] >= x) a = m; else b = m;
    }
    const t = (arr[a] - x) / (arr[a] - arr[b]);
    return a + t;
  }
  while (b - a > 1) {
    const m = (a + b) >> 1;
    if (arr[m] <= x) a = m; else b = m;
  }
  const t = (x - arr[a]) / (arr[b] - arr[a]);
  return a + t;
}

export default function MapView({ data, nx, ny, lons, lats, colormap, vmin, vmax, onProbe }: MapViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [projId, setProjId] = useState<ProjectionId>('equirectangular');
  const [size, setSize] = useState({ w: 600, h: 400 });
  const probeRef = useRef(onProbe);
  probeRef.current = onProbe;

  const lonArr = useMemo(() => {
    if (lons && lons.length === nx) return lons.map(normLon);
    return Array.from({ length: nx }, (_, i) => -180 + (360 * i) / Math.max(1, nx - 1));
  }, [lons, nx]);
  const latArr = useMemo(() => {
    if (lats && lats.length === ny) return [...lats];
    return Array.from({ length: ny }, (_, i) => 90 - (180 * i) / Math.max(1, ny - 1));
  }, [lats, ny]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(200, r.width), h: Math.max(200, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { w, h } = size;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let proj: GeoProjection;
    if (projId === 'mercator') proj = geoMercator();
    else if (projId === 'orthographic') proj = geoOrthographic().rotate([0, -15]).clipAngle(90);
    else if (projId === 'stereographic') proj = geoStereographic().rotate([0, -90]).clipAngle(180 - 1e-3);
    else proj = geoEquirectangular();
    proj.fitExtent([[4, 4], [canvas.width - 4, canvas.height - 4]], { type: 'Sphere' } as never);

    const img = ctx.createImageData(canvas.width, canvas.height);
    const px = img.data;
    const invert = proj.invert!.bind(proj);
    // `invert` is defined across the whole canvas for most projections: outside
    // the sphere it returns longitudes beyond ±180 that wrap back onto the data
    // range and repaint the field (two or more copies side by side). A genuine
    // inverse point must project forward back onto the same pixel, so use that
    // round-trip as a domain test for every projection.
    const invertInDomain = (x: number, y: number): [number, number] | null => {
      const ll = invert([x, y]);
      if (!ll) return null;
      const back = proj([ll[0], ll[1]]);
      if (!back || Math.abs(back[0] - x) > 0.5 || Math.abs(back[1] - y) > 0.5) return null;
      return ll;
    };
    // precompute lon index helper: lonArr may wrap; build sorted copy
    const order = lonArr.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
    const sortedLon = order.map((o) => o[0]);

    for (let py = 0; py < canvas.height; py++) {
      for (let pxx = 0; pxx < canvas.width; pxx++) {
        const ll = invertInDomain(pxx, py);
        const o = (py * canvas.width + pxx) * 4;
        if (!ll) {
          px[o + 3] = 0;
          continue;
        }
        let [lon, lat] = ll;
        lon = normLon(lon);
        const fi = locate(sortedLon, lon);
        const fj = locate(latArr, lat);
        if (!Number.isFinite(fi) || !Number.isFinite(fj)) {
          px[o + 3] = 0;
          continue;
        }
        // bilinear in (sorted lon, lat) space -> map back to data indices
        const i0 = Math.floor(fi), i1 = Math.min(sortedLon.length - 1, i0 + 1);
        const j0 = Math.floor(fj), j1 = Math.min(latArr.length - 1, j0 + 1);
        const ti = fi - i0, tj = fj - j0;
        const di0 = order[i0][1], di1 = order[i1][1];
        const v00 = data[j0 * nx + di0], v10 = data[j0 * nx + di1];
        const v01 = data[j1 * nx + di0], v11 = data[j1 * nx + di1];
        const vals = [v00, v10, v01, v11].filter(Number.isFinite);
        if (vals.length === 0) {
          px[o + 3] = 0;
          continue;
        }
        const a = Number.isFinite(v00) ? v00 : vals[0];
        const b = Number.isFinite(v10) ? v10 : vals[0];
        const c = Number.isFinite(v01) ? v01 : vals[0];
        const d = Number.isFinite(v11) ? v11 : vals[0];
        const val = a * (1 - ti) * (1 - tj) + b * ti * (1 - tj) + c * (1 - ti) * tj + d * ti * tj;
        const col = colorFor(val, vmin, vmax, colormap);
        if (!col) {
          px[o + 3] = 0;
          continue;
        }
        px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // graticule
    ctx.strokeStyle = 'rgba(98,107,120,0.3)';
    ctx.lineWidth = 1;
    const path = geoPath(proj, ctx);
    ctx.beginPath();
    path(geoGraticule().step([30, 30])());
    ctx.stroke();
    // sphere outline only for globe-like projections
    if (projId === 'orthographic' || projId === 'stereographic') {
      ctx.strokeStyle = PLOT_THEME.line;
      ctx.beginPath();
      path({ type: 'Sphere' });
      ctx.stroke();
    } else {
      ctx.strokeStyle = PLOT_THEME.line;
      ctx.strokeRect(4.5, 4.5, canvas.width - 9, canvas.height - 9);
    }
  }, [data, nx, ny, lonArr, latArr, colormap, vmin, vmax, projId, size]);

  const onMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || !probeRef.current) return;
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = (e.clientX - r.left) * dpr;
    const py = (e.clientY - r.top) * dpr;
    let proj: GeoProjection;
    if (projId === 'mercator') proj = geoMercator();
    else if (projId === 'orthographic') proj = geoOrthographic().rotate([0, -15]).clipAngle(90);
    else if (projId === 'stereographic') proj = geoStereographic().rotate([0, -90]).clipAngle(180 - 1e-3);
    else proj = geoEquirectangular();
    proj.fitExtent([[4, 4], [canvas.width - 4, canvas.height - 4]], { type: 'Sphere' } as never);
    const ll = proj.invert!([px, py]);
    if (!ll) return;
    // reject out-of-domain inversions (see the round-trip test in the renderer)
    const back = proj([ll[0], ll[1]]);
    if (!back || Math.abs(back[0] - px) > 0.5 || Math.abs(back[1] - py) > 0.5) return;
    const lon = normLon(ll[0]);
    const lat = ll[1];
    // nearest sample
    let bi = 0, bd = Infinity;
    for (let i = 0; i < nx; i++) {
      const d = Math.abs(lonArr[i] - lon);
      if (d < bd) { bd = d; bi = i; }
    }
    let bj = 0, be = Infinity;
    for (let j = 0; j < ny; j++) {
      const d = Math.abs(latArr[j] - lat);
      if (d < be) { be = d; bj = j; }
    }
    probeRef.current(lon, lat, data[bj * nx + bi]);
  };

  return (
    <div className="flex h-full w-full flex-col">
      <div aria-label="地图投影" className="flex shrink-0 flex-wrap items-center gap-1 px-2 pb-3">
        <span className="mr-2 text-[11px] text-muted">投影</span>
        {PROJECTIONS.map((p) => (
          <button
            key={p.id}
            onClick={() => setProjId(p.id)}
            aria-pressed={projId === p.id}
            className="view-tab"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div ref={wrapRef} className="min-h-0 flex-1">
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} onMouseMove={onMove} />
      </div>
    </div>
  );
}
