import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  geoAlbers, geoAzimuthalEqualArea, geoAzimuthalEquidistant, geoConicConformal,
  geoConicEqualArea, geoConicEquidistant, geoEqualEarth, geoEquirectangular,
  geoGnomonic, geoGraticule, geoMercator, geoNaturalEarth1, geoOrthographic,
  geoPath, geoStereographic, geoTransverseMercator, type GeoProjection,
} from 'd3-geo';
import { colorFor, type ColormapName } from '../lib/colormap';
import { PLOT_THEME } from '../lib/uiTheme';

interface ProjectionDef {
  id: string;
  label: string;
  group: string;
  make: () => GeoProjection;
  /** wrap the sphere in a clip circle (azimuthal family) */
  clip?: boolean;
  /** draw a spherical outline instead of a rectangular frame */
  globe?: boolean;
  /** conic projections take two standard parallels */
  parallels?: boolean;
  /** rotate latitude as well (azimuthal / transverse) */
  tilt?: boolean;
}

export const PROJECTION_GROUPS = ['圆柱 / 伪圆柱', '方位', '圆锥'] as const;

export const PROJECTIONS: ProjectionDef[] = [
  { id: 'equirectangular', label: '等距圆柱', group: '圆柱 / 伪圆柱', make: geoEquirectangular },
  { id: 'mercator', label: '墨卡托', group: '圆柱 / 伪圆柱', make: geoMercator },
  { id: 'transverseMercator', label: '横轴墨卡托', group: '圆柱 / 伪圆柱', make: geoTransverseMercator, tilt: true },
  { id: 'naturalEarth1', label: '自然地球', group: '圆柱 / 伪圆柱', make: geoNaturalEarth1 },
  { id: 'equalEarth', label: '等积地球', group: '圆柱 / 伪圆柱', make: geoEqualEarth },

  { id: 'orthographic', label: '正交地球', group: '方位', make: geoOrthographic, clip: true, globe: true, tilt: true },
  { id: 'azimuthalEquidistant', label: '等距方位', group: '方位', make: geoAzimuthalEquidistant, clip: true, globe: true, tilt: true },
  { id: 'azimuthalEqualArea', label: '等积方位', group: '方位', make: geoAzimuthalEqualArea, clip: true, globe: true, tilt: true },
  { id: 'stereographic', label: '极射', group: '方位', make: geoStereographic, clip: true, globe: true, tilt: true },
  { id: 'gnomonic', label: '球心', group: '方位', make: geoGnomonic, clip: true, globe: true, tilt: true },

  { id: 'albers', label: '阿尔伯斯等积', group: '圆锥', make: geoAlbers, parallels: true, globe: true },
  { id: 'conicEqualArea', label: '圆锥等积', group: '圆锥', make: geoConicEqualArea, parallels: true, globe: true },
  { id: 'conicConformal', label: '兰勃特等角', group: '圆锥', make: geoConicConformal, parallels: true, globe: true },
  { id: 'conicEquidistant', label: '圆锥等距', group: '圆锥', make: geoConicEquidistant, parallels: true, globe: true },
];
export type ProjectionId = (typeof PROJECTIONS)[number]['id'];

export interface ProjectionSettings {
  id: ProjectionId;
  /** geographic centre of the view (degrees) */
  centerLon: number;
  centerLat: number;
  /** >1 zooms in past the fitted extent */
  zoom: number;
  /** clip circle radius for the azimuthal family (degrees) */
  clipAngle: number;
  /** standard parallels for conic projections (degrees) */
  parallel1: number;
  parallel2: number;
  /** fit the projection to the data extent instead of the whole sphere */
  fitToData: boolean;
}

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

interface Extent {
  lon0: number; lon1: number; lat0: number; lat1: number;
  global: boolean;
}

const PAD = 4;
const SPHERE = { type: 'Sphere' } as const;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
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

/** Bounding box of the sample coordinates (in lon/lat degrees). */
function computeExtent(lonArr: number[], latArr: number[]): Extent {
  let lon0 = Infinity, lon1 = -Infinity, lat0 = Infinity, lat1 = -Infinity;
  for (const v of lonArr) { if (Number.isFinite(v)) { if (v < lon0) lon0 = v; if (v > lon1) lon1 = v; } }
  for (const v of latArr) { if (Number.isFinite(v)) { if (v < lat0) lat0 = v; if (v > lat1) lat1 = v; } }
  if (!Number.isFinite(lon0)) { lon0 = -180; lon1 = 180; }
  if (!Number.isFinite(lat0)) { lat0 = -90; lat1 = 90; }
  // only a full globe (all longitudes *and* all latitudes) defeats a data fit;
  // a latitude band spanning every longitude (e.g. a polar cap) still fits well
  return { lon0, lon1, lat0, lat1, global: lon1 - lon0 > 300 && lat1 - lat0 > 175 };
}

function extentObject(e: Extent): unknown {
  // a longitude-global band is fitted as the full -180..180 strip
  const lon0 = e.lon1 - e.lon0 > 300 ? -180 : e.lon0;
  const lon1 = e.lon1 - e.lon0 > 300 ? 180 : e.lon1;
  const { lat0, lat1 } = e;
  // Use a MultiPoint sampled along the boundary rather than a Polygon: d3
  // treats polygon edges as great-circle arcs, which badly misrepresents
  // constant-latitude edges (especially near the poles) and skews fitExtent.
  const n = 32;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const lon = lon0 + (lon1 - lon0) * t;
    const lat = lat0 + (lat1 - lat0) * t;
    pts.push([lon, lat0], [lon, lat1], [lon0, lat], [lon1, lat]);
  }
  return { type: 'MultiPoint', coordinates: pts };
}

function defOf(id: ProjectionId): ProjectionDef {
  return PROJECTIONS.find((p) => p.id === id) ?? PROJECTIONS[0];
}

/** Build a projection with the user's centre / clip / parallels applied (unfitted). */
function createProjection(s: ProjectionSettings): GeoProjection {
  const def = defOf(s.id);
  const proj = def.make();
  const cLon = clamp(s.centerLon, -360, 360);
  const cLat = clamp(s.centerLat, -90, 90);
  proj.rotate(def.tilt ? [-cLon, -cLat] : [-cLon, 0]);
  if (def.clip) {
    const maxClip = s.id === 'gnomonic' ? 85 : 179;
    proj.clipAngle(clamp(s.clipAngle, 1, maxClip));
  }
  if (def.parallels) {
    const p1 = clamp(s.parallel1, -89, 89);
    const p2 = clamp(s.parallel2, -89, 89);
    (proj as GeoProjection & { parallel?: (p: number[]) => void }).parallel?.([p1, p2]);
  }
  return proj;
}

/** Fit a projection into the canvas, optionally zoomed past the target extent. */
function fitProjection(
  proj: GeoProjection, W: number, H: number,
  zoom: number, target: unknown,
): void {
  const cx = W / 2, cy = H / 2;
  const z = clamp(zoom, 1, 20);
  const hw = Math.max(1, W / 2 - PAD) / z;
  const hh = Math.max(1, H / 2 - PAD) / z;
  proj.fitExtent([[cx - hw, cy - hh], [cx + hw, cy + hh]], target as never);
}

export default function MapView({ data, nx, ny, lons, lats, colormap, vmin, vmax, onProbe }: MapViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
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

  const extent = useMemo(() => computeExtent(lonArr, latArr), [lonArr, latArr]);

  const [settings, setSettings] = useState<ProjectionSettings>(() => ({
    id: 'equirectangular',
    centerLon: 0, centerLat: 0, zoom: 1,
    clipAngle: 90, parallel1: 20, parallel2: 60, fitToData: true,
  }));
  // until the user picks a projection explicitly, follow the data: a polar
  // dataset opens on a projection that actually shows it well
  const autoProj = useRef(true);

  // whenever the data extent changes, seed sensible defaults (esp. the centre,
  // so a polar dataset opens centred on its own region)
  useEffect(() => {
    const cLat = extent.lat0 + (extent.lat1 - extent.lat0) / 2;
    setSettings((s) => {
      const next: ProjectionSettings = {
        ...s,
        centerLon: extent.lon0 + (extent.lon1 - extent.lon0) / 2,
        centerLat: cLat,
        parallel1: clamp(extent.lat0, -80, 80),
        parallel2: clamp(extent.lat1, -80, 80),
      };
      if (autoProj.current) {
        // polar cap -> azimuthal; otherwise keep the plain rectangular default
        if (Math.abs(cLat) > 60 && extent.lat1 - extent.lat0 < 90) {
          next.id = 'azimuthalEquidistant';
          next.clipAngle = 90;
        } else {
          next.id = 'equirectangular';
        }
      }
      return next;
    });
  }, [extent]);

  const target = useMemo(
    () => (settings.fitToData && !extent.global ? extentObject(extent) : SPHERE),
    [settings.fitToData, extent],
  );

  const buildProj = useCallback((W: number, H: number): GeoProjection => {
    const proj = createProjection(settings);
    fitProjection(proj, W, H, settings.zoom, target);
    return proj;
  }, [settings, target]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(200, r.width), h: Math.max(200, r.height) });
    };
    measure();
    const ro = new ResizeObserver(measure);
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

    const def = defOf(settings.id);
    const proj = buildProj(canvas.width, canvas.height);

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

    // graticule — pick a step that suits the displayed span
    const span = Math.max(extent.lon1 - extent.lon0, extent.lat1 - extent.lat0);
    const step = span > 200 ? 30 : span > 90 ? 15 : span > 30 ? 5 : 2;
    ctx.strokeStyle = 'rgba(98,107,120,0.3)';
    ctx.lineWidth = 1;
    const path = geoPath(proj, ctx);
    ctx.beginPath();
    path(geoGraticule().step([step, step])());
    ctx.stroke();
    // spherical outline for globe-like projections, rectangle frame otherwise
    ctx.strokeStyle = PLOT_THEME.line;
    ctx.beginPath();
    if (def.globe) {
      path(SPHERE);
    } else {
      ctx.strokeRect(4.5, 4.5, canvas.width - 9, canvas.height - 9);
    }
    ctx.stroke();
  }, [data, nx, ny, lonArr, latArr, colormap, vmin, vmax, settings, extent, target, buildProj, size]);

  const onMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || !probeRef.current) return;
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = (e.clientX - r.left) * dpr;
    const py = (e.clientY - r.top) * dpr;
    const proj = buildProj(canvas.width, canvas.height);
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

  const def = defOf(settings.id);
  const patch = (p: Partial<ProjectionSettings>) => setSettings((s) => ({ ...s, ...p }));
  const selectProjection = (id: ProjectionId) => {
    autoProj.current = false;
    patch({ id, zoom: 1 });
  };
  const resetView = () => patch({
    zoom: 1,
    centerLon: extent.lon0 + (extent.lon1 - extent.lon0) / 2,
    centerLat: extent.lat0 + (extent.lat1 - extent.lat0) / 2,
  });
  const numberField = (
    label: string, value: number, min: number, max: number, stepSize: number,
    onSet: (v: number) => void, unit = '°',
  ) => (
    <label className="flex items-center gap-1 text-muted">
      {label}
      <input
        type="number"
        aria-label={label}
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : ''}
        min={min} max={max} step={stepSize}
        onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onSet(v); }}
        className="field w-16 font-mono"
      />
      {unit}
    </label>
  );

  return (
    <div className="flex h-full w-full flex-col">
      <div aria-label="地图投影" className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 px-2 pb-2 text-[11px]">
        <label className="flex items-center gap-1.5 text-muted">
          投影
          <select
            aria-label="投影"
            value={settings.id}
            onChange={(e) => selectProjection(e.target.value as ProjectionId)}
            className="field"
          >
            {PROJECTION_GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {PROJECTIONS.filter((p) => p.group === g).map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {numberField('中心经度', settings.centerLon, -360, 360, 1, (v) => patch({ centerLon: v }))}
        {numberField('中心纬度', settings.centerLat, -90, 90, 1, (v) => patch({ centerLat: v }))}
        {numberField('缩放', settings.zoom, 1, 20, 0.1, (v) => patch({ zoom: v }), '×')}
        {def.clip && numberField('裁剪角', settings.clipAngle, 1, def.id === 'gnomonic' ? 85 : 179, 1, (v) => patch({ clipAngle: v }))}
        {def.parallels && numberField('标准纬线 1', settings.parallel1, -89, 89, 1, (v) => patch({ parallel1: v }))}
        {def.parallels && numberField('标准纬线 2', settings.parallel2, -89, 89, 1, (v) => patch({ parallel2: v }))}
        <label className="flex items-center gap-1.5 text-muted">
          <input
            type="checkbox"
            checked={settings.fitToData}
            disabled={extent.global}
            onChange={(e) => patch({ fitToData: e.target.checked })}
          />
          适应数据范围
        </label>
        <button className="btn btn-quiet" onClick={resetView}>重置视图</button>
      </div>
      <div ref={wrapRef} className="min-h-0 flex-1">
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} onMouseMove={onMove} />
      </div>
    </div>
  );
}
