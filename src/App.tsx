import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, ChartNoAxesColumn, ChevronRight, Database, FileCode2, FileImage,
  FileSpreadsheet, FolderOpen, Grid2X2, Info, Layers, LoaderCircle,
  Map, Pause, Play, SlidersHorizontal, Upload, X, type LucideIcon,
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile, stat } from '@tauri-apps/plugin-fs';
import Heatmap from './components/Heatmap';
import { COLORMAPS, colorFor, type ColormapName } from './lib/colormap';
import { LOCALES, LOCALE_LABELS, type MessageKey } from './lib/i18n';
import { useI18n } from './lib/i18nContext';
import Inspector from './components/Inspector';
import VarTree from './components/VarTree';
import MapView from './components/MapView';
import ProfileView from './components/ProfileView';
import VolumeView from './components/VolumeView';
import {
  closeDataset, downsamplePlane, findLonLatAxes, geoRolesFor, getProfile,
  getSlice2DAxes, getSlice2D, getVolume3D, parseNcFile,
  type ProfileLine,
} from './lib/ncService';
import {
  LARGE_FILE_BYTES, hasBackend, isBackendDataset, openBackend,
} from './lib/ncBackend';
import type { GeoRole, NcDataset, Slice2D, Volume3D } from './lib/ncTypes';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

interface Probe {
  x: number;
  y: number;
  value: number;
}

type ViewMode = 'slice' | 'map' | 'profile' | 'volume';

const VIEW_TABS: { id: ViewMode; labelKey: MessageKey; icon: LucideIcon }[] = [
  { id: 'slice', labelKey: 'view.slice', icon: Grid2X2 },
  { id: 'map', labelKey: 'view.map', icon: Map },
  { id: 'profile', labelKey: 'view.profile', icon: ChartNoAxesColumn },
  { id: 'volume', labelKey: 'view.volume', icon: Box },
];

export default function App() {
  const { t, locale, setLocale } = useI18n();
  const [ds, setDs] = useState<NcDataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [slice, setSlice] = useState<Slice2D | null>(null);
  const [sliceLoading, setSliceLoading] = useState(false);
  const [fixed, setFixed] = useState<Record<string, number>>({});
  const [playing, setPlaying] = useState(false);
  const [colormap, setColormap] = useState<ColormapName>('cividis');
  const [vmin, setVmin] = useState<string>('');
  const [vmax, setVmax] = useState<string>('');
  const [probe, setProbe] = useState<Probe | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('slice');
  const [lonLat, setLonLat] = useState<{ lon: number; lat: number } | null>(null);
  const [roles, setRoles] = useState<GeoRole[]>([]);
  const [mapSlice, setMapSlice] = useState<Slice2D | null>(null);
  const [profile, setProfile] = useState<ProfileLine | null>(null);
  const [profileAxis, setProfileAxis] = useState<number>(-1);
  const [volume, setVolume] = useState<Volume3D | null>(null);
  const [volumeAxes, setVolumeAxes] = useState<[number, number, number] | null>(null);
  const [volumeMode, setVolumeMode] = useState<'slices' | 'surface'>('slices');
  const [iso, setIso] = useState<string>('');
  const [viewLoading, setViewLoading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const playTimer = useRef<number | null>(null);

  const variable = useMemo(
    () => ds?.variables.find((v) => v.name === selected) ?? null,
    [ds, selected],
  );

  const applyDataset = useCallback((parsed: NcDataset) => {
    setDs(parsed);
    const first = parsed.variables.find((v) => !v.isCoord && v.shape.length >= 2)
      ?? parsed.variables.find((v) => v.shape.length >= 2)
      ?? parsed.variables[0] ?? null;
    setSelected(first?.name ?? null);
    setFixed({});
    setProbe(null);
    setViewMode('slice');
    setMapSlice(null);
    setProfile(null);
    setProfileAxis(-1);
    setVolume(null);
    setVolumeAxes(null);
    setLonLat(null);
    setRoles([]);
  }, []);

  const loadBytes = useCallback(async (bytes: Uint8Array, name: string) => {
    setLoading(true);
    setError(null);
    try {
      if (ds) closeDataset(ds);
      const parsed = await parseNcFile(bytes, name);
      applyDataset(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [ds, applyDataset]);

  /** Large local files go through the Rust backend (range reads, no full load). */
  const loadPath = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      if (ds) closeDataset(ds);
      const parsed = await openBackend(path);
      applyDataset(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [ds, applyDataset]);

  const handleSelect = useCallback((name: string) => {
    setSelected(name);
    setFixed({});
    setProbe(null);
    setMapSlice(null);
    setProfile(null);
    setProfileAxis(-1);
    setVolume(null);
    setVolumeAxes(null);
  }, []);

  const openFile = useCallback(async () => {
    setError(null);
    try {
      if (isTauri) {
        const path = await open({ multiple: false, filters: [{ name: 'NetCDF', extensions: ['nc', 'nc4', 'cdf', 'h5', 'hdf5'] }] });
        if (typeof path !== 'string' || !path) return;
        const size = await fileSize(path);
        // Large files: stream from disk instead of loading GBs into memory.
        if (hasBackend() && (size === null || size >= LARGE_FILE_BYTES)) {
          await loadPath(path);
        } else {
          const data = await readFile(path);
          const name = path.split(/[\\/]/).pop() ?? path;
          await loadBytes(data, name);
        }
      } else {
        fileInput.current?.click();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [loadBytes, loadPath]);

  const onWebFile = useCallback(async (f: File) => {
    const buf = new Uint8Array(await f.arrayBuffer());
    await loadBytes(buf, f.name);
  }, [loadBytes]);

  useEffect(() => {
    let dragDepth = 0;
    const h = (e: DragEvent) => e.preventDefault();
    const enter = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.types.includes('Files')) {
        dragDepth++;
        setDragging(true);
      }
    };
    const leave = () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      dragDepth = 0;
      setDragging(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) void onWebFile(f);
    };
    window.addEventListener('dragover', h);
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', h);
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [onWebFile]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.code === 'Space' && (e.target as HTMLElement)?.tagName !== 'INPUT' && (e.target as HTMLElement)?.tagName !== 'SELECT') {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // base slice (slice mode)
  useEffect(() => {
    if (!ds || !selected) {
      setSlice(null);
      return;
    }
    let cancelled = false;
    setSliceLoading(true);
    getSlice2D(ds, selected, fixed)
      .then((s) => { if (!cancelled) { setSlice(s); setProbe(null); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setSliceLoading(false); });
    return () => { cancelled = true; };
  }, [ds, selected, fixed]);

  // geo roles + lon/lat detection
  useEffect(() => {
    if (!ds || !variable) {
      setLonLat(null);
      setRoles([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await geoRolesFor(ds, variable);
        if (cancelled) return;
        setRoles(r);
        const ll = await findLonLatAxes(ds, variable);
        if (!cancelled) setLonLat(ll);
      } catch {
        if (!cancelled) { setRoles([]); setLonLat(null); }
      }
    })();
    return () => { cancelled = true; };
  }, [ds, variable]);

  // map slice (lon/lat plane)
  useEffect(() => {
    if (viewMode !== 'map' || !ds || !selected || !lonLat) {
      return;
    }
    let cancelled = false;
    setViewLoading(true);
    getSlice2DAxes(ds, selected, lonLat.lat, lonLat.lon, fixed)
      .then((s) => { if (!cancelled) setMapSlice(s); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setViewLoading(false); });
    return () => { cancelled = true; };
  }, [viewMode, ds, selected, fixed, lonLat]);

  // profile axis default: first vertical, else first dim
  useEffect(() => {
    if (viewMode !== 'profile' || !variable) return;
    if (profileAxis < 0 || profileAxis >= variable.shape.length) {
      const vi = roles.indexOf('vertical');
      setProfileAxis(vi >= 0 ? vi : 0);
    }
  }, [viewMode, variable, roles, profileAxis]);

  // profile data
  useEffect(() => {
    if (viewMode !== 'profile' || !ds || !selected || profileAxis < 0) return;
    let cancelled = false;
    setViewLoading(true);
    getProfile(ds, selected, profileAxis, fixed)
      .then((p) => { if (!cancelled) setProfile(p); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setViewLoading(false); });
    return () => { cancelled = true; };
  }, [viewMode, ds, selected, profileAxis, fixed]);

  // volume axes default: [vertical|0, lat|ny-2, lon|nx-1]
  useEffect(() => {
    if (viewMode !== 'volume' || !variable) return;
    if (volumeAxes) return;
    const rank = variable.shape.length;
    if (rank < 3) return;
    const vi = roles.indexOf('vertical');
    const z = vi >= 0 ? vi : 0;
    let y = rank - 2, x = rank - 1;
    if (lonLat) {
      // ensure x=lon, y=lat when possible
      x = lonLat.lon;
      y = lonLat.lat;
      if (z === x || z === y) {
        const others = variable.shape.map((_, i) => i).filter((i) => i !== x && i !== y);
        if (others.length > 0) {
          // pick first non-xy as z
          const nz = others[0];
          setVolumeAxes([nz, y, x]);
          return;
        }
      }
    }
    if (z === x || z === y) {
      const others = variable.shape.map((_, i) => i).filter((i) => i !== x && i !== y);
      setVolumeAxes([others[0] ?? 0, y, x]);
    } else {
      setVolumeAxes([z, y, x]);
    }
  }, [viewMode, variable, roles, lonLat, volumeAxes]);

  // volume data
  useEffect(() => {
    if (viewMode !== 'volume' || !ds || !selected || !volumeAxes) return;
    let cancelled = false;
    setViewLoading(true);
    getVolume3D(ds, selected, volumeAxes[0], volumeAxes[1], volumeAxes[2], fixed)
      .then((v) => { if (!cancelled) setVolume(v); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setViewLoading(false); });
    return () => { cancelled = true; };
  }, [viewMode, ds, selected, volumeAxes, fixed]);

  // reset volume axes when variable changes
  useEffect(() => {
    setVolumeAxes(null);
    setVolume(null);
  }, [selected]);

  // animation dim: first dim not in current plane
  const animDim = useMemo(() => {
    if (!variable) return null;
    const rank = variable.shape.length;
    if (rank < 3) return null;
    let skip = new Set<number>([rank - 2, rank - 1]);
    if (viewMode === 'map' && lonLat) skip = new Set([lonLat.lat, lonLat.lon]);
    else if (viewMode === 'profile' && profileAxis >= 0) skip = new Set([profileAxis]);
    else if (viewMode === 'volume' && volumeAxes) skip = new Set(volumeAxes);
    for (let i = 0; i < rank; i++) {
      if (!skip.has(i)) return { name: variable.dims[i], len: variable.shape[i] };
    }
    return null;
  }, [variable, viewMode, lonLat, profileAxis, volumeAxes]);

  useEffect(() => {
    if (playing && animDim) {
      playTimer.current = window.setInterval(() => {
        setFixed((f) => {
          const cur = f[animDim.name] ?? 0;
          return { ...f, [animDim.name]: (cur + 1) % animDim.len };
        });
      }, 300);
    }
    return () => {
      if (playTimer.current) window.clearInterval(playTimer.current);
      playTimer.current = null;
    };
  }, [playing, animDim]);

  useEffect(() => {
    if (!animDim) setPlaying(false);
  }, [animDim]);

  const preview = useMemo(() => {
    if (!slice) return null;
    return downsamplePlane(slice.data, slice.nx, slice.ny);
  }, [slice]);

  const mapPreview = useMemo(() => {
    if (!mapSlice) return null;
    return downsamplePlane(mapSlice.data, mapSlice.nx, mapSlice.ny);
  }, [mapSlice]);

  // sliders: dims not in current plane
  const sliderDims = useMemo(() => {
    if (!variable) return [] as { name: string; len: number }[];
    const rank = variable.shape.length;
    let skip = new Set<number>();
    if (viewMode === 'slice') skip = new Set([rank - 2, rank - 1]);
    else if (viewMode === 'map' && lonLat) skip = new Set([lonLat.lat, lonLat.lon]);
    else if (viewMode === 'profile' && profileAxis >= 0) skip = new Set([profileAxis]);
    else if (viewMode === 'volume' && volumeAxes) skip = new Set(volumeAxes);
    else skip = new Set([rank - 2, rank - 1]);
    return variable.dims
      .map((d, i) => ({ name: d, len: variable.shape[i], i }))
      .filter((x) => !skip.has(x.i));
  }, [variable, viewMode, lonLat, profileAxis, volumeAxes]);

  const activeStats = viewMode === 'map' && mapSlice ? mapSlice : slice;

  const exportCsv = useCallback(() => {
    if (viewMode === 'profile' && profile && variable) {
      const rows = [`${profile.coordName},${variable.shortName}`, ...profile.coords.map((c, i) => `${c},${profile.values[i]}`)];
      downloadText(rows.join('\n'), `${variable.shortName}_profile.csv`, 'text/csv');
      return;
    }
    const s = viewMode === 'map' ? mapSlice : slice;
    if (!s || !variable) return;
    const rows: string[] = [];
    for (let j = 0; j < s.ny; j++) {
      const row: string[] = [];
      for (let i = 0; i < s.nx; i++) row.push(String(s.data[j * s.nx + i]));
      rows.push(row.join(','));
    }
    downloadText(rows.join('\n'), `${variable.shortName}_slice.csv`, 'text/csv');
  }, [slice, mapSlice, profile, variable, viewMode]);

  const exportPng = useCallback(() => {
    const s = viewMode === 'map' ? mapSlice : slice;
    if (!s || !variable) return;
    const lo = vmin === '' ? s.min : Number(vmin);
    const hi = vmax === '' ? s.max : Number(vmax);
    const canvas = document.createElement('canvas');
    canvas.width = s.nx;
    canvas.height = s.ny;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(s.nx, s.ny);
    for (let i = 0; i < s.nx * s.ny; i++) {
      const c = colorFor(s.data[i], lo, hi, colormap);
      const o = i * 4;
      if (!c) {
        img.data[o + 3] = 0;
      } else {
        img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${variable.shortName}_${viewMode}.png`;
    a.click();
  }, [slice, mapSlice, variable, viewMode, vmin, vmax, colormap]);

  const exportAttrs = useCallback(() => {
    if (!ds) return;
    downloadText(JSON.stringify({
      file: ds.fileName,
      format: ds.format,
      dimensions: ds.dimensions,
      variables: ds.variables.map((v) => ({
        name: v.name, shortName: v.shortName, dims: v.dims, shape: v.shape,
        dtype: v.dtype, attrs: v.attrs, group: v.group, isCoord: v.isCoord,
      })),
      globalAttributes: ds.globalAttributes,
    }, null, 2), `${ds.fileName}.meta.json`, 'application/json');
  }, [ds]);

  const vminNum = vmin === '' ? null : Number(vmin);
  const vmaxNum = vmax === '' ? null : Number(vmax);
  const effVmin = vminNum ?? activeStats?.min ?? 0;
  const effVmax = vmaxNum ?? activeStats?.max ?? 1;

  const canMap = !!lonLat && !!variable && variable.shape.length >= 2;
  const canProfile = !!variable && variable.shape.length >= 2;
  const canVolume = !!variable && variable.shape.length >= 3;

  const tabDisabled = (m: ViewMode): boolean => {
    if (m === 'map') return !canMap;
    if (m === 'profile') return !canProfile;
    if (m === 'volume') return !canVolume;
    return false;
  };

  return (
    <div className="relative flex h-full flex-col bg-canvas text-ink">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
        <div className="flex shrink-0 items-center gap-2.5">
          <Grid2X2 size={23} strokeWidth={1.8} className="text-ink" aria-hidden="true" />
          <span className="text-[15px] font-semibold tracking-tight">NC Viewer</span>
          <span className="header-subtitle ml-1 text-[11px] text-faint">{t('app.subtitle')}</span>
        </div>
        <div className="mx-1 h-5 w-px shrink-0 bg-line" />
        <button
          onClick={openFile}
          disabled={loading}
          className="btn btn-primary"
        >
          <FolderOpen size={15} aria-hidden="true" />{t('app.openFile')}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".nc,.nc4,.cdf,.h5,.hdf5"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onWebFile(f);
            e.target.value = '';
          }}
        />
        <div className="flex min-w-0 flex-1 items-center gap-2 text-[12px] text-muted">
          {ds && <><ChevronRight size={14} className="shrink-0 text-faint" aria-hidden="true" /><span className="truncate" title={ds.fileName}>{ds.fileName}</span><span className="file-format shrink-0 rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted">{ds.format}</span></>}
        </div>
        <span className="export-label text-[11px] text-faint">{t('app.export')}</span>
        <button onClick={exportCsv} disabled={!activeStats && !(viewMode === 'profile' && profile)} title={t('app.exportCsv')} aria-label={t('app.exportCsv')} className="btn">
          <FileSpreadsheet size={14} aria-hidden="true" />CSV
        </button>
        <button onClick={exportPng} disabled={!(viewMode === 'slice' || viewMode === 'map') || !activeStats} title={t('app.exportPng')} aria-label={t('app.exportPng')} className="btn">
          <FileImage size={14} aria-hidden="true" />PNG
        </button>
        <button onClick={exportAttrs} disabled={!ds} title={t('app.exportJson')} aria-label={t('app.exportJson')} className="btn">
          <FileCode2 size={14} aria-hidden="true" />JSON
        </button>
        <div className="mx-1 h-5 w-px shrink-0 bg-line" />
        <div role="group" aria-label={t('app.language')} className="flex shrink-0 items-center gap-0.5">
          {LOCALES.map((l) => (
            <button
              key={l}
              onClick={() => setLocale(l)}
              aria-pressed={locale === l}
              className="view-tab px-2 py-1 text-[11px]"
            >
              {LOCALE_LABELS[l]}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div role="alert" className="flex shrink-0 items-center gap-3 border-b border-red-200 bg-red-50 px-4 py-2 text-[12px] text-red-700">
          <Info size={15} className="shrink-0" aria-hidden="true" /><span className="min-w-0 flex-1 break-all">{error}</span><button aria-label={t('app.dismissError')} className="rounded p-1 hover:bg-red-100" onClick={() => setError(null)}><X size={15} /></button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside aria-label={t('tree.title')} className="sidebar-left flex shrink-0 flex-col border-r border-line bg-surface">
          <div className="panel-heading"><Layers size={15} className="text-muted" aria-hidden="true" />{t('tree.title')}</div>
          {ds ? (
            <VarTree ds={ds} selected={selected} onSelect={handleSelect} />
          ) : (
            <div className="px-4 py-6 text-[12px] leading-6 text-muted">{t('tree.emptyHint')}</div>
          )}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col bg-canvas">
          {variable && (slice || viewMode !== 'slice') ? (
            <>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 pb-3 pt-5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <h1 className="truncate text-[17px] font-semibold tracking-tight" title={variable.name}>{variable.shortName}</h1>
                  <span className="shrink-0 rounded border border-line bg-surface px-2 py-0.5 font-mono text-[10px] text-muted">{variable.shape.length}D · {variable.dtype}</span>
                </div>
                {activeStats && <div className="flex flex-wrap gap-4 text-[11px] text-muted">
                  <span>{t('stats.min')} <span className="stat-value ml-1">{fmt(activeStats.min)}</span></span>
                  <span>{t('stats.max')} <span className="stat-value ml-1">{fmt(activeStats.max)}</span></span>
                  <span>{t('stats.mean')} <span className="stat-value ml-1">{fmt(activeStats.mean)}</span></span>
                </div>}
              </div>
              {/* view tabs */}
              <div aria-label={t('app.viewModeLabel')} className="flex shrink-0 flex-wrap items-center gap-1 border-b border-line px-4 pb-2">
                {VIEW_TABS.map((tab) => {
                  const dis = tabDisabled(tab.id);
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      disabled={dis}
                      aria-pressed={viewMode === tab.id}
                      onClick={() => setViewMode(tab.id)}
                      title={dis ? t('app.viewUnsupported') : t(tab.labelKey)}
                      className="view-tab"
                    >
                      <Icon size={14} strokeWidth={1.7} aria-hidden="true" />{t(tab.labelKey)}
                    </button>
                  );
                })}
                {viewMode === 'map' && lonLat && variable && (
                  <span className="ml-2 font-mono text-[11px] text-muted">
                    {variable.dims[lonLat.lat]} × {variable.dims[lonLat.lon]}
                  </span>
                )}
                {viewMode === 'profile' && variable && profileAxis >= 0 && (
                  <label className="ml-2 flex items-center gap-1 text-[12px] text-muted">
                    {t('profile.axis')}
                    <select
                      value={profileAxis}
                      onChange={(e) => setProfileAxis(Number(e.target.value))}
                      className="field max-w-40"
                    >
                      {variable.dims.map((d, i) => (
                        <option key={d + i} value={i}>{d} ({variable.shape[i]}){roles[i] ? ` · ${roles[i]}` : ''}</option>
                      ))}
                    </select>
                  </label>
                )}
                {viewMode === 'volume' && volume && (
                  <span className="ml-2 font-mono text-[11px] text-muted">
                    {volume.zName} × {volume.yName} × {volume.xName} · {volume.nx}×{volume.ny}×{volume.nz}
                  </span>
                )}
              </div>

              {/* dim sliders */}
              {sliderDims.length > 0 && (
                <div className="shrink-0 space-y-2 border-b border-line bg-surface px-5 py-3">
                  {sliderDims.map((d) => (
                    <div key={d.name} className="flex items-center gap-2 text-[12px]">
                      <span className="w-24 truncate font-mono text-muted" title={d.name}>{d.name}</span>
                      <input
                        type="range"
                        aria-label={t('controls.indexAria', { name: d.name })}
                        min={0}
                        max={d.len - 1}
                        value={fixed[d.name] ?? 0}
                        onChange={(e) => setFixed((f) => ({ ...f, [d.name]: Number(e.target.value) }))}
                        className="h-1 flex-1 accent-accent"
                      />
                      <span className="w-14 text-right font-mono text-ink">{fixed[d.name] ?? 0} / {d.len - 1}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* viewport */}
              <div className="data-viewport relative min-h-0 flex-1">
                {viewMode === 'slice' && preview && slice && (
                  <Heatmap
                    data={preview.data}
                    nx={preview.nx}
                    ny={preview.ny}
                    xCoords={slice.xCoords}
                    yCoords={slice.yCoords}
                    xName={slice.xName}
                    yName={slice.yName}
                    colormap={colormap}
                    vmin={Number.isFinite(vminNum) ? vminNum : null}
                    vmax={Number.isFinite(vmaxNum) ? vmaxNum : null}
                    onProbe={(x, y, value) => setProbe({ x, y, value })}
                  />
                )}
                {viewMode === 'map' && mapPreview && mapSlice && (
                  <MapView
                    data={mapPreview.data}
                    nx={mapPreview.nx}
                    ny={mapPreview.ny}
                    lons={mapSlice.xCoords}
                    lats={mapSlice.yCoords}
                    colormap={colormap}
                    vmin={Number.isFinite(effVmin) ? effVmin : mapSlice.min}
                    vmax={Number.isFinite(effVmax) ? effVmax : mapSlice.max}
                    onProbe={(x, y, value) => setProbe({ x, y, value })}
                  />
                )}
                {viewMode === 'map' && !mapSlice && (
                  <CenterNote text={viewLoading ? t('map.computing') : t('map.noGeo')} />
                )}
                {viewMode === 'profile' && profile && variable && (
                  <ProfileView
                    profile={profile}
                    varName={variable.shortName}
                    fixLabel={sliderDims.map((d) => `${d.name}=${fixed[d.name] ?? 0}`).join(' ') || t('profile.allFixed')}
                  />
                )}
                {viewMode === 'profile' && !profile && (
                  <CenterNote text={viewLoading ? t('profile.computing') : t('profile.empty')} />
                )}
                {viewMode === 'volume' && volume && (
                  <VolumeView
                    volume={volume}
                    colormap={colormap}
                    vmin={Number.isFinite(effVmin) ? effVmin : volume.min}
                    vmax={Number.isFinite(effVmax) ? effVmax : volume.max}
                    iso={iso === '' ? (volume.min + volume.max) / 2 : Number(iso)}
                    mode={volumeMode}
                  />
                )}
                {viewMode === 'volume' && !volume && (
                  <CenterNote text={viewLoading ? t('volume.loading') : t('volume.need3d')} />
                )}
                {(sliceLoading || viewLoading) && (
                  <div role="status" className="absolute right-3 top-2 flex items-center gap-1.5 rounded border border-line bg-surface px-2 py-1 text-[11px] text-muted"><LoaderCircle size={12} className="animate-spin" aria-hidden="true" />{t('app.loading')}</div>
                )}
                {probe && (viewMode === 'slice' || viewMode === 'map') && activeStats && (
                  <div className="pointer-events-none absolute bottom-2 left-3 rounded border border-line bg-surface/95 px-2 py-1 font-mono text-[11px] text-ink">
                    {activeStats.xName}={fmt(probe.x)} · {activeStats.yName}={fmt(probe.y)} · {t('probe.value')}={fmt(probe.value)}
                  </div>
                )}
              </div>

              {/* bottom control bar */}
              <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-surface px-4 py-3 text-[12px]">
                {animDim ? (
                  <button
                    onClick={() => setPlaying((p) => !p)}
                    className="btn"
                    aria-pressed={playing}
                  >
                    {playing ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}{playing ? t('controls.pause') : t('controls.play')} <kbd className="rounded border border-line px-1 text-[10px] text-faint">{t('controls.space')}</kbd>
                  </button>
                ) : (
                  <span className="text-muted">{variable.shape.length <= 2 ? t('controls.noTimeDim') : t('controls.noAnimDim')}</span>
                )}
                <label className="flex items-center gap-1.5 text-muted">
                  {t('controls.colormap')}
                  <select
                    value={colormap}
                    onChange={(e) => setColormap(e.target.value as ColormapName)}
                    className="field"
                  >
                    {COLORMAPS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-1 text-muted">
                  min
                  <input
                    value={vmin}
                    onChange={(e) => setVmin(e.target.value)}
                    placeholder={activeStats ? fmt(activeStats.min) : ''}
                    className="field w-20 font-mono"
                  />
                </label>
                <label className="flex items-center gap-1 text-muted">
                  max
                  <input
                    value={vmax}
                    onChange={(e) => setVmax(e.target.value)}
                    placeholder={activeStats ? fmt(activeStats.max) : ''}
                    className="field w-20 font-mono"
                  />
                </label>
                {(vmin !== '' || vmax !== '') && (
                  <button onClick={() => { setVmin(''); setVmax(''); }} className="text-muted hover:text-ink">{t('controls.reset')}</button>
                )}
                {viewMode === 'volume' && (
                  <>
                    <label className="flex items-center gap-1.5 text-muted">
                      {t('volume.mode')}
                      <select
                        value={volumeMode}
                        onChange={(e) => setVolumeMode(e.target.value as 'slices' | 'surface')}
                        className="field"
                      >
                        <option value="slices">{t('volume.modeSlices')}</option>
                        <option value="surface">{t('volume.modeSurface')}</option>
                      </select>
                    </label>
                    {volumeMode === 'surface' && volume && (
                      <label className="flex items-center gap-1 text-muted">
                        {t('volume.iso')}
                        <input
                          value={iso}
                          onChange={(e) => setIso(e.target.value)}
                          placeholder={fmt((volume.min + volume.max) / 2)}
                          className="field w-20 font-mono"
                        />
                      </label>
                    )}
                  </>
                )}
                <div className="flex-1" />
                <span className="font-mono text-muted">
                  {viewMode === 'slice' && preview && slice && (
                    <>{preview.nx} × {preview.ny}{preview.nx !== slice.nx ? ` ${t('app.downsampledFrom', { nx: slice.nx, ny: slice.ny })}` : ''}</>
                  )}
                  {viewMode === 'map' && mapPreview && mapSlice && (
                    <>{t('app.mapProjection', { nx: mapPreview.nx, ny: mapPreview.ny })}</>
                  )}
                  {viewMode === 'profile' && profile && (
                    <>{t('app.profilePoints', { n: profile.coords.length })}</>
                  )}
                  {viewMode === 'volume' && volume && (
                    <>{t('app.volumeShape', { nx: volume.nx, ny: volume.ny, nz: volume.nz })}</>
                  )}
                </span>
              </div>
            </>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
              {ds ? <div className="text-center"><Grid2X2 size={28} className="mx-auto mb-4 text-faint" aria-hidden="true" /><p className="text-[14px] font-medium">{t('empty.selectVar')}</p><p className="mt-2 text-[12px] text-muted">{t('empty.selectVarHint')}</p></div> : <EmptyHint loading={loading} onOpen={openFile} />}
            </div>
          )}
        </main>

        <aside aria-label={t('inspector.title')} className="sidebar-right flex shrink-0 flex-col border-l border-line bg-surface">
          <div className="panel-heading"><SlidersHorizontal size={15} className="text-muted" aria-hidden="true" />{t('inspector.title')}</div>
          {ds ? (
            <Inspector variable={variable} globalAttrs={ds.globalAttributes} />
          ) : (
            <div className="px-4 py-6 text-[12px] leading-6 text-muted">{t('inspector.emptyHint')}<br />{t('inspector.emptyHint2')}<div className="mt-5 border-t border-line pt-4 text-[11px] text-faint">{t('inspector.globalHint')}</div></div>
          )}
        </aside>
      </div>

      <footer className="flex h-8 shrink-0 items-center gap-2 border-t border-line bg-surface px-4 text-[11px] text-muted">
        <span className={`h-1.5 w-1.5 rounded-full ${ds ? 'bg-emerald-600' : 'bg-faint'}`} />
        <span>{loading ? t('app.parsing') : ds ? t('app.footerCounts', { vars: ds.variables.length, dims: ds.dimensions.length }) : t('app.ready')}</span>
        {ds && isBackendDataset(ds) && (
          <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent" title={t('app.streamingTitle')}>{t('app.streaming')}</span>
        )}
        <div className="flex-1" />
        <Database size={12} className="text-faint" aria-hidden="true" /><span>{isTauri ? t('app.desktop') : t('app.webPreview')}</span>
      </footer>
      {dragging && <div className="pointer-events-none absolute inset-2 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent-soft/95"><div className="text-center"><Upload size={32} className="mx-auto mb-3 text-accent" aria-hidden="true" /><p className="text-[18px] font-semibold text-accent">{t('drop.release')}</p><p className="mt-2 text-[12px] text-muted">NetCDF-3 / NetCDF-4 / HDF5</p></div></div>}
    </div>
  );
}

function downloadText(text: string, filename: string, type: string) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** File size in bytes via Tauri fs plugin; null when unavailable. */
async function fileSize(path: string): Promise<number | null> {
  try {
    const s = await stat(path);
    return s.size ?? null;
  } catch {
    return null;
  }
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return 'NaN';
  return String(+v.toPrecision(6));
}

function CenterNote({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center text-[13px] text-muted">{text}</div>
  );
}

function EmptyHint({ loading, onOpen }: { loading: boolean; onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <div className="welcome-card text-center">
      <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-xl border border-line bg-canvas">
        {loading ? <LoaderCircle size={25} className="animate-spin text-muted" aria-hidden="true" /> : <FolderOpen size={25} strokeWidth={1.5} className="text-muted" aria-hidden="true" />}
      </div>
      <h1 className="text-[22px] font-semibold tracking-tight">{loading ? t('empty.loadingTitle') : t('empty.title')}</h1>
      <p className="mt-3 text-[13px] leading-6 text-muted">{loading ? t('empty.loadingHint') : t('empty.hint')}</p>
      <button onClick={onOpen} disabled={loading} className="btn btn-primary mt-6 px-5 py-2.5">
        <FolderOpen size={15} aria-hidden="true" />{t('empty.choose')}
      </button>
      <div className="mt-5 text-[11px] text-faint">{t('empty.formats')}</div>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-line pt-5 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><Grid2X2 size={13} aria-hidden="true" />{t('empty.featSlice')}</span><span className="flex items-center gap-1.5"><Map size={13} aria-hidden="true" />{t('empty.featMap')}</span><span className="flex items-center gap-1.5"><Box size={13} aria-hidden="true" />{t('empty.featVolume')}</span>
      </div>
    </div>
  );
}
