import { NetCDFReader } from 'netcdfjs';
import type { GeoRole, NcAttribute, NcDataset, NcDimension, NcVariable, Slice2D, Volume3D } from './ncTypes';

// h5wasm is loaded lazily to avoid bundling the 4MB wasm glue upfront.
// Vite: import from esm dist directly.
type H5WasmMod = typeof import('h5wasm');

let h5wasmPromise: Promise<H5WasmMod> | null = null;
function loadH5wasm(): Promise<H5WasmMod> {
  if (!h5wasmPromise) {
    h5wasmPromise = import('h5wasm');
  }
  return h5wasmPromise;
}

function isHdf5(bytes: Uint8Array): boolean {
  // HDF5 signature: 89 48 44 46 0d 0a 1a 0a
  return (
    bytes.length > 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x48 && bytes[2] === 0x44 && bytes[3] === 0x46 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  );
}

function isNetCdf3(bytes: Uint8Array): boolean {
  // magic "CDF\x01" or "CDF\x02"
  return bytes.length > 4 && bytes[0] === 0x43 && bytes[1] === 0x44 && bytes[2] === 0x46 && (bytes[3] === 0x01 || bytes[3] === 0x02);
}

function attrVal(v: unknown): unknown {
  if (Array.isArray(v) && v.length === 1) return v[0];
  return v;
}

// ---------- NetCDF-3 path (netcdfjs) ----------

function parseNetCdf3(bytes: Uint8Array, fileName: string): NcDataset {
  const reader = new NetCDFReader(bytes);
  const dims: NcDimension[] = reader.dimensions.map((d) => ({ name: d.name, size: d.size }));
  const variables: NcVariable[] = reader.variables.map((v) => {
    const shape = v.dimensions.map((id) => dims[id]?.size ?? 0);
    const dimList = v.dimensions.map((id) => dims[id]?.name ?? `dim${id}`);
    const attrs: NcAttribute[] = (v.attributes as unknown as { name: string; type: string; value: unknown }[]).map((a) => ({
      name: a.name,
      type: a.type,
      value: attrVal(a.value),
    }));
    return {
      name: v.name,
      shortName: v.name,
      dims: dimList,
      shape,
      dtype: v.type,
      attrs,
      group: '/',
      isCoord: dimList.length === 1 && dimList[0] === v.name,
    };
  });
  const globalAttributes: NcAttribute[] = reader.globalAttributes.map((a) => ({
    name: a.name,
    type: a.type,
    value: attrVal(a.value),
  }));
  return { fileName, format: 'netCDF-3', dimensions: dims, variables, globalAttributes, _handle: reader };
}

export function readVarData3(reader: NetCDFReader, varName: string): number[] {
  const raw = reader.getDataVariable(varName) as unknown[];
  const out: number[] = new Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const v = raw[i];
    out[i] = typeof v === 'number' ? v : Number(v);
  }
  return out;
}

// ---------- NetCDF-4 / HDF5 path (h5wasm) ----------

interface H5File {
  keys(): string[];
  get(name: string): unknown;
  attrs: Record<string, { json_value: unknown; value: unknown }>;
  close(): void;
}

function jsonAttr(a: { json_value: unknown; value: unknown }): unknown {
  try {
    const j = a.json_value;
    return j ?? a.value;
  } catch {
    return a.value;
  }
}

function dtypeToString(dtype: unknown): string {
  if (typeof dtype === 'string') {
    const m: Record<string, string> = {
      '<d': 'float64', '>d': 'float64', '<f': 'float32', '>f': 'float32',
      '<i8': 'int64', '<i4': 'int32', '<i2': 'int16', '<i1': 'int8',
      '<u8': 'uint64', '<u4': 'uint32', '<u2': 'uint16', '<u1': 'uint8',
      '|b1': 'bool',
    };
    if (m[dtype]) return m[dtype];
    if (/^[<>|][SU]\d*$/.test(dtype)) return 'string';
    if (dtype === 'Reference' || dtype === 'RegionReference') return 'reference';
    return dtype;
  }
  if (Array.isArray(dtype)) return 'compound';
  if (dtype && typeof dtype === 'object') return 'compound';
  return 'unknown';
}

/** HDF5 / netCDF-4 internal bookkeeping attributes to hide from users. */
const INTERNAL_ATTRS = new Set([
  '_NCProperties', '_Netcdf4Coordinates', '_Netcdf4Dimid',
  'CLASS', 'NAME', 'REFERENCE_LIST', 'DIMENSION_LIST',
]);

function isInternalAttr(name: string): boolean {
  return name.startsWith('_') || INTERNAL_ATTRS.has(name);
}

function readAttrs(obj: { attrs?: Record<string, { json_value: unknown; value: unknown }> }): NcAttribute[] {
  return Object.entries(obj.attrs ?? {})
    .filter(([name]) => !isInternalAttr(name))
    .map(([name, a]) => ({ name, type: 'attr', value: jsonAttr(a) }));
}

async function parseNetCdf4(bytes: Uint8Array, fileName: string): Promise<NcDataset> {
  const h5 = await loadH5wasm();
  await h5.ready;
  const { FS } = h5 as unknown as { FS: { writeFile: (p: string, d: Uint8Array) => void; unlink: (p: string) => void } };
  const tmp = `/tmp_${Date.now()}_${Math.floor(Math.random() * 1e6)}.nc`;
  // copy because h5wasm may detach the buffer
  FS.writeFile(tmp, new Uint8Array(bytes));
  const H5FileCtor = (h5 as unknown as { File: new (p: string, m: string) => H5File }).File;
  const f = new H5FileCtor(tmp, 'r');
  try {
    const variables: NcVariable[] = [];
    const dims: NcDimension[] = [];
    const dimMap = new Map<string, number>();
    const globalAttributes: NcAttribute[] = readAttrs(f);

    const visit = (group: H5File, prefix: string) => {
      for (const key of group.keys()) {
        const obj = group.get(key) as {
          type?: string;
          shape?: number[] | null;
          dtype?: unknown;
          attrs?: Record<string, { json_value: unknown; value: unknown }>;
          keys?: () => string[];
          get?: (n: string) => unknown;
          get_attached_scales?: (i: number) => string[];
          get_dimension_labels?: () => (string | null)[];
        } | null;
        if (!obj) continue;
        const path = prefix === '/' ? `/${key}` : `${prefix}/${key}`;
        if (typeof obj.keys === 'function') {
          visit(obj as unknown as H5File, path);
        } else if (obj.shape !== undefined) {
          const shape = (obj.shape ?? []) as number[];
          const attrs: NcAttribute[] = readAttrs(obj);
          // dimension names: prefer HDF5 dimension scales / labels (netCDF-4),
          // then 1D self-naming (netCDF coordinate convention), fallback positional
          const dimsOfVar: string[] = shape.map((_len, i) => {
            try {
              const scales = obj.get_attached_scales?.(i);
              if (scales && scales.length > 0) {
                const s = scales[0].split('/').pop() ?? scales[0];
                if (s) return s;
              }
              const labels = obj.get_dimension_labels?.();
              const lab = labels?.[i];
              if (lab) return lab;
            } catch { /* ignore */ }
            if (shape.length === 1) return key;
            return `dim${i}`;
          });
          // register dims
          dimsOfVar.forEach((dn, i) => {
            if (!dimMap.has(`${dn}:${shape[i]}`)) {
              dimMap.set(`${dn}:${shape[i]}`, shape[i]);
              dims.push({ name: dn, size: shape[i] });
            }
          });
          const shortName = key;
          variables.push({
            name: path,
            shortName,
            dims: dimsOfVar,
            shape: [...shape],
            dtype: dtypeToString(obj.dtype),
            attrs,
            group: prefix,
            isCoord: shape.length === 1,
          });
        }
      }
    };
    visit(f, '/');

    // coordinate detection: 1D var whose shortName matches a dimension name used by others
    const dimNameSet = new Set<string>();
    for (const v of variables) {
      if (v.shape.length === 1) dimNameSet.add(v.shortName);
    }
    for (const v of variables) {
      if (v.shape.length === 1 && dimNameSet.has(v.shortName)) {
        v.isCoord = true;
        // rename its own dim to itself
        if (v.dims.length === 1) {
          const old = v.dims[0];
          v.dims = [v.shortName];
          const d = dims.find((x) => x.name === old && x.size === v.shape[0]);
          if (d) d.name = v.shortName;
        }
      }
    }
    return { fileName, format: 'netCDF-4/HDF5', dimensions: dims, variables, globalAttributes, _handle: { h5file: f, tmp } };
  } catch (e) {
    try { f.close(); } catch { /* ignore */ }
    try { FS.unlink(tmp); } catch { /* ignore */ }
    throw e;
  }
}

export async function parseNcFile(bytes: Uint8Array, fileName: string): Promise<NcDataset> {
  if (isHdf5(bytes)) {
    return parseNetCdf4(bytes, fileName);
  }
  if (isNetCdf3(bytes)) {
    return parseNetCdf3(bytes, fileName);
  }
  // try netcdfjs anyway (may throw), else try hdf5
  try {
    return parseNetCdf3(bytes, fileName);
  } catch {
    return parseNetCdf4(bytes, fileName);
  }
}

export function closeDataset(ds: NcDataset) {
  const h = ds._handle as { h5file?: { close(): void }; tmp?: string } | undefined;
  if (h?.h5file) {
    try { h.h5file.close(); } catch { /* ignore */ }
    if (h.tmp) {
      loadH5wasm().then((m) => {
        try { (m as unknown as { FS: { unlink(p: string): void } }).FS.unlink(h.tmp!); } catch { /* ignore */ }
      }).catch(() => undefined);
    }
  }
}

// ---------- slicing ----------

function prod(a: number[]): number {
  return a.reduce((x, y) => x * y, 1);
}

function statsOf(a: Float64Array): { min: number; max: number; mean: number } {
  let min = Infinity, max = -Infinity, sum = 0, n = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    if (!Number.isFinite(x)) continue;
    if (x < min) min = x;
    if (x > max) max = x;
    sum += x; n++;
  }
  if (n === 0) return { min: NaN, max: NaN, mean: NaN };
  return { min, max, mean: sum / n };
}

/** Locate an HDF5 dataset node by netCDF path (walks groups). */
function getH5Node(ds: NcDataset, varPath: string): { slice: (r: unknown[]) => unknown; value: unknown } | null {
  const h = ds._handle as { h5file: H5File };
  let node: unknown = h.h5file;
  for (const part of varPath.split('/').filter(Boolean)) {
    node = (node as H5File).get(part);
    if (!node) break;
  }
  return node as { slice: (r: unknown[]) => unknown; value: unknown } | null;
}

/** Read the full variable as float64 (row-major). Used for netCDF-3 and fallbacks. */
async function readFullFlat(ds: NcDataset, v: NcVariable): Promise<Float64Array> {
  if (ds.format === 'netCDF-3') {
    const reader = ds._handle as NetCDFReader;
    return Float64Array.from(readVarData3(reader, v.shortName));
  }
  const d = getH5Node(ds, v.name);
  if (!d) throw new Error(`dataset not found: ${v.name}`);
  return toFloat64(d.value);
}

/** Extract an arbitrary [yAxis x xAxis] plane from a row-major full array. */
function extractPlane(
  flat: Float64Array, shape: number[],
  yAxis: number, xAxis: number, fixedIdx: number[],
): Float64Array {
  const rank = shape.length;
  const ny = shape[yAxis], nx = shape[xAxis];
  // row-major strides
  const strides = new Array<number>(rank);
  let s = 1;
  for (let i = rank - 1; i >= 0; i--) { strides[i] = s; s *= shape[i]; }
  const out = new Float64Array(ny * nx);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let off = 0;
      for (let d = 0; d < rank; d++) {
        const k = d === yAxis ? j : d === xAxis ? i : fixedIdx[d];
        off += k * strides[d];
      }
      out[j * nx + i] = flat[off];
    }
  }
  return out;
}

/** Extract a 2D slice: last two dims are y,x; leading dims fixed by `fixed` (default 0). */
export async function getSlice2D(ds: NcDataset, varName: string, fixed: Record<string, number> = {}): Promise<Slice2D> {
  const v = ds.variables.find((x) => x.name === varName);
  if (!v) throw new Error(`variable not found: ${varName}`);
  const rank = v.shape.length;
  if (rank < 2) throw new Error(`variable ${varName} is ${rank}D, need >= 2D for heatmap`);
  return getSlice2DAxes(ds, varName, rank - 2, rank - 1, fixed);
}

/**
 * Extract an arbitrary 2D plane [yAxis x xAxis], fixing all other dims.
 * yAxis/xAxis are dim indices into the variable's shape.
 */
export async function getSlice2DAxes(
  ds: NcDataset, varName: string, yAxis: number, xAxis: number,
  fixed: Record<string, number> = {},
): Promise<Slice2D> {
  const v = ds.variables.find((x) => x.name === varName);
  if (!v) throw new Error(`variable not found: ${varName}`);
  const rank = v.shape.length;
  if (rank < 2) throw new Error(`variable ${varName} is ${rank}D, need >= 2D`);
  if (yAxis === xAxis) throw new Error('yAxis and xAxis must differ');
  if (yAxis < 0 || yAxis >= rank || xAxis < 0 || xAxis >= rank) throw new Error('axis out of range');

  const idx: number[] = v.dims.map((d, i) => Math.min(fixed[d] ?? 0, Math.max(0, v.shape[i] - 1)));
  const ny = v.shape[yAxis];
  const nx = v.shape[xAxis];

  let plane: Float64Array | null = null;
  if (ds.format !== 'netCDF-3' && yAxis === rank - 2 && xAxis === rank - 1) {
    // fast path: server-side slice, result is already the 2D plane
    const d = getH5Node(ds, v.name);
    if (!d) throw new Error(`dataset not found: ${varName}`);
    if (rank === 2) {
      plane = toFloat64(d.value);
    } else {
      const ranges: unknown[] = idx.map((k, i) => (i < rank - 2 ? [k, k + 1] : []));
      plane = toFloat64(d.slice(ranges));
    }
  } else if (ds.format !== 'netCDF-3') {
    // general path via server-side slice; h5wasm keeps dim order, squeeze singletons
    const d = getH5Node(ds, v.name);
    if (!d) throw new Error(`dataset not found: ${varName}`);
    const ranges: unknown[] = idx.map((k, i) => (i === yAxis || i === xAxis ? [] : [k, k + 1]));
    const raw = toFloat64(d.slice(ranges));
    if (yAxis < xAxis) {
      plane = raw.slice(0, ny * nx);
    } else {
      // output order is [xAxis..yAxis..] = [nx][ny], transpose to [ny][nx]
      const t = new Float64Array(ny * nx);
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          t[j * nx + i] = raw[i * ny + j] ?? NaN;
        }
      }
      plane = t;
    }
  } else {
    const flat = await readFullFlat(ds, v);
    const total = prod(v.shape);
    const src = flat.length === total ? flat : (() => {
      const padded = new Float64Array(total).fill(NaN);
      padded.set(flat.subarray(0, Math.min(flat.length, total)));
      return padded;
    })();
    plane = extractPlane(src, v.shape, yAxis, xAxis, idx);
  }

  const { min, max, mean } = statsOf(plane);

  // coordinate lookup: find 1D vars matching y/x dim names
  const yDim = v.dims[yAxis];
  const xDim = v.dims[xAxis];
  const xCoords = await readCoord(ds, xDim, nx);
  const yCoords = await readCoord(ds, yDim, ny);

  return { data: plane, nx, ny, xCoords, yCoords, xName: xDim, yName: yDim, fixed: { ...fixed }, yAxis, xAxis, min, max, mean };
}

async function readCoord(ds: NcDataset, dimName: string, len: number): Promise<number[] | null> {
  const c = ds.variables.find((x) => x.shortName === dimName && x.shape.length === 1 && x.shape[0] === len);
  if (!c) return null;
  try {
    if (ds.format === 'netCDF-3') {
      const reader = ds._handle as NetCDFReader;
      return readVarData3(reader, c.shortName);
    }
    const d = getH5Node(ds, c.name);
    if (!d) return null;
    return Array.from(toFloat64(d.value));
  } catch {
    return null;
  }
}

/** Public: read a 1D coordinate variable by dimension name (best effort). */
export async function readCoordPublic(ds: NcDataset, dimName: string): Promise<number[] | null> {
  const c = ds.variables.find((x) => x.shortName === dimName && x.shape.length === 1);
  if (!c) return null;
  return readCoord(ds, dimName, c.shape[0]);
}

function toFloat64(out: unknown): Float64Array {
  if (out instanceof Float64Array) return out;
  if (out instanceof Float32Array) return Float64Array.from(out);
  if (ArrayBuffer.isView(out)) {
    const a = out as unknown as ArrayLike<number>;
    const r = new Float64Array(a.length);
    for (let i = 0; i < a.length; i++) r[i] = Number(a[i]);
    return r;
  }
  if (Array.isArray(out)) {
    const flat = (out as unknown[]).flat(Infinity) as unknown[];
    const r = new Float64Array(flat.length);
    for (let i = 0; i < flat.length; i++) {
      const x = flat[i];
      r[i] = typeof x === 'bigint' ? Number(x) : Number(x);
    }
    return r;
  }
  // h5wasm slice() returns a plain object with numeric keys, not an array
  if (out && typeof out === 'object') {
    const keys = Object.keys(out as Record<string, unknown>).filter((k) => /^\d+$/.test(k));
    if (keys.length > 0) {
      keys.sort((a, b) => Number(a) - Number(b));
      const last = Number(keys[keys.length - 1]);
      if (keys.length === last + 1) {
        const o = out as Record<string, unknown>;
        const r = new Float64Array(keys.length);
        for (let i = 0; i < keys.length; i++) {
          const x = o[String(i)];
          r[i] = typeof x === 'bigint' ? Number(x) : Number(x);
        }
        return r;
      }
    }
  }
  if (typeof out === 'number') return new Float64Array([out]);
  return new Float64Array(0);
}

/** Downsample a 2D plane for fast preview (max ~600x600). Returns {data,nx,ny}. */
export function downsamplePlane(data: Float64Array, nx: number, ny: number, maxSide = 600): { data: Float64Array; nx: number; ny: number } {  if (nx <= maxSide && ny <= maxSide) return { data, nx, ny };
  const sx = Math.ceil(nx / maxSide);
  const sy = Math.ceil(ny / maxSide);
  const ox = Math.ceil(nx / sx);
  const oy = Math.ceil(ny / sy);
  const out = new Float64Array(ox * oy);
  for (let j = 0; j < oy; j++) {
    for (let i = 0; i < ox; i++) {
      let sum = 0, n = 0;
      for (let dj = 0; dj < sy; dj++) {
        for (let di = 0; di < sx; di++) {
          const x = i * sx + di, y = j * sy + dj;
          if (x >= nx || y >= ny) continue;
          const val = data[y * nx + x];
          if (Number.isFinite(val)) { sum += val; n++; }
        }
      }
      out[j * ox + i] = n ? sum / n : NaN;
    }
  }
  return { data: out, nx: ox, ny: oy };
}

// ---------- geo roles ----------

/** Guess the geographic role of a dimension from its name, units and values. */
export function guessGeoRole(
  dimName: string,
  coordValues: number[] | null,
  coordUnits: string | null,
): GeoRole {
  const n = dimName.toLowerCase();
  const u = (coordUnits ?? '').toLowerCase();
  if (/^(lon|x|longitude)$/.test(n) || u.includes('degree_east') || u.includes('degrees_east')) return 'lon';
  if (/^(lat|y|latitude)$/.test(n) || u.includes('degree_north') || u.includes('degrees_north')) return 'lat';
  if (/^(time|t)$/.test(n) || u.includes('since')) return 'time';
  if (/^(lev|level|plev|depth|z|height|altitude|pressure|sigma|isobaric)$/.test(n)
    || /^(pa|hpa|m|km|mb|millibar)$/.test(u.trim()) || u.includes('meter') || u.includes('pascal')) return 'vertical';
  // value-range heuristics
  if (coordValues && coordValues.length > 1) {
    let lo = Infinity, hi = -Infinity;
    for (const x of coordValues) {
      if (!Number.isFinite(x)) continue;
      if (x < lo) lo = x;
      if (x > hi) hi = x;
    }
    if (Number.isFinite(lo)) {
      if (lo >= -180 && hi <= 360 && hi - lo > 60) {
        // ambiguous lon/lat range; prefer name hint already handled; default lon-like -> lat check
        if (lo >= -90 && hi <= 90) return 'lat';
        return 'lon';
      }
      if (lo >= -90 && hi <= 90 && hi - lo >= 20) return 'lat';
    }
  }
  return null;
}

/** Roles for every dim of a variable. */
export async function geoRolesFor(ds: NcDataset, v: NcVariable): Promise<GeoRole[]> {
  const out: GeoRole[] = [];
  for (const d of v.dims) {
    const coord = ds.variables.find((x) => x.shortName === d && x.shape.length === 1);
    const units = coord
      ? String(coord.attrs.find((a) => a.name === 'units')?.value ?? '')
      : null;
    const values = await readCoord(ds, d, ds.dimensions.find((x) => x.name === d)?.size ?? coord?.shape[0] ?? 0);
    out.push(guessGeoRole(d, values, units || null));
  }
  return out;
}

/** Find lon/lat axis indices for a variable, or null if not recognizable. */
export async function findLonLatAxes(ds: NcDataset, v: NcVariable): Promise<{ lon: number; lat: number } | null> {
  const roles = await geoRolesFor(ds, v);
  const lon = roles.indexOf('lon');
  const lat = roles.indexOf('lat');
  if (lon >= 0 && lat >= 0) return { lon, lat };
  return null;
}

// ---------- profiles & volumes ----------

export interface ProfileLine {
  /** coordinate along the profile axis */
  coords: number[];
  values: number[];
  coordName: string;
}

/**
 * Extract a 1D profile along `axis` at fixed indices for all other dims.
 * Used for 经度-高度 / 纬度-高度剖面 (fix lon/lat, vary vertical).
 */
export async function getProfile(
  ds: NcDataset, varName: string, axis: number,
  fixed: Record<string, number> = {},
): Promise<ProfileLine> {
  const v = ds.variables.find((x) => x.name === varName);
  if (!v) throw new Error(`variable not found: ${varName}`);
  const rank = v.shape.length;
  if (axis < 0 || axis >= rank) throw new Error('axis out of range');
  const idx: number[] = v.dims.map((d, i) => Math.min(fixed[d] ?? 0, Math.max(0, v.shape[i] - 1)));
  const n = v.shape[axis];
  let values: Float64Array;
  if (ds.format !== 'netCDF-3') {
    const d = getH5Node(ds, v.name);
    if (!d) throw new Error(`dataset not found: ${varName}`);
    const ranges: unknown[] = idx.map((k, i) => (i === axis ? [] : [k, k + 1]));
    values = toFloat64(d.slice(ranges)).slice(0, n);
  } else {
    const flat = await readFullFlat(ds, v);
    const total = prod(v.shape);
    const src = flat.length === total ? flat : (() => {
      const p = new Float64Array(total).fill(NaN);
      p.set(flat.subarray(0, Math.min(flat.length, total)));
      return p;
    })();
    // strides
    const strides = new Array<number>(rank);
    let s = 1;
    for (let i = rank - 1; i >= 0; i--) { strides[i] = s; s *= v.shape[i]; }
    values = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      let off = 0;
      for (let dd = 0; dd < rank; dd++) off += (dd === axis ? k : idx[dd]) * strides[dd];
      values[k] = src[off];
    }
  }
  const coordName = v.dims[axis];
  const coords = (await readCoord(ds, coordName, n)) ?? Array.from({ length: n }, (_, i) => i);
  return { coords, values: Array.from(values), coordName };
}

/**
 * Read a 3D volume [z][y][x] for 3D rendering. For >3D vars, leading dims fixed.
 * Downsamples each side to maxSide for preview.
 */
export async function getVolume3D(
  ds: NcDataset, varName: string,
  zAxis: number, yAxis: number, xAxis: number,
  fixed: Record<string, number> = {},
  maxSide = 96,
): Promise<Volume3D> {
  const v = ds.variables.find((x) => x.name === varName);
  if (!v) throw new Error(`variable not found: ${varName}`);
  const rank = v.shape.length;
  if (rank < 3) throw new Error(`variable ${varName} is ${rank}D, need >= 3D for volume`);
  const axes = [zAxis, yAxis, xAxis];
  if (new Set(axes).size !== 3) throw new Error('axes must differ');
  for (const a of axes) {
    if (a < 0 || a >= rank) throw new Error('axis out of range');
  }
  const idx: number[] = v.dims.map((d, i) => Math.min(fixed[d] ?? 0, Math.max(0, v.shape[i] - 1)));
  const [nz0, ny0, nx0] = [v.shape[zAxis], v.shape[yAxis], v.shape[xAxis]];

  let vol: Float64Array;
  if (ds.format !== 'netCDF-3') {
    const d = getH5Node(ds, v.name);
    if (!d) throw new Error(`dataset not found: ${varName}`);
    const ranges: unknown[] = idx.map((k, i) => (axes.includes(i) ? [] : [k, k + 1]));
    const raw = toFloat64(d.slice(ranges));
    // h5wasm output order follows original dim order restricted to axes.
    // Reorder to [z][y][x].
    const order = [...axes].sort((a, b) => a - b); // output axis order
    const sizes = order.map((a) => v.shape[a]);
    const pos = new Map(order.map((a, i) => [a, i]));
    const pz = pos.get(zAxis)!, py = pos.get(yAxis)!, px = pos.get(xAxis)!;
    const ostr = [1, 1, 1];
    ostr[2] = 1;
    ostr[1] = sizes[2];
    ostr[0] = sizes[1] * sizes[2];
    vol = new Float64Array(nz0 * ny0 * nx0);
    for (let z = 0; z < nz0; z++) {
      for (let y = 0; y < ny0; y++) {
        for (let x = 0; x < nx0; x++) {
          const c = [0, 0, 0];
          c[pz] = z; c[py] = y; c[px] = x;
          const off = c[0] * ostr[0] + c[1] * ostr[1] + c[2] * ostr[2];
          vol[(z * ny0 + y) * nx0 + x] = raw[off] ?? NaN;
        }
      }
    }
  } else {
    const flat = await readFullFlat(ds, v);
    const total = prod(v.shape);
    const src = flat.length === total ? flat : (() => {
      const p = new Float64Array(total).fill(NaN);
      p.set(flat.subarray(0, Math.min(flat.length, total)));
      return p;
    })();
    const strides = new Array<number>(rank);
    let s = 1;
    for (let i = rank - 1; i >= 0; i--) { strides[i] = s; s *= v.shape[i]; }
    vol = new Float64Array(nz0 * ny0 * nx0);
    for (let z = 0; z < nz0; z++) {
      for (let y = 0; y < ny0; y++) {
        for (let x = 0; x < nx0; x++) {
          let off = 0;
          for (let dd = 0; dd < rank; dd++) {
            const k = dd === zAxis ? z : dd === yAxis ? y : dd === xAxis ? x : idx[dd];
            off += k * strides[dd];
          }
          vol[(z * ny0 + y) * nx0 + x] = src[off];
        }
      }
    }
  }

  // downsample
  const sz = Math.ceil(nz0 / maxSide), sy = Math.ceil(ny0 / maxSide), sx = Math.ceil(nx0 / maxSide);
  let nx = nx0, ny = ny0, nz = nz0, data = vol;
  if (sz > 1 || sy > 1 || sx > 1) {
    nx = Math.ceil(nx0 / sx); ny = Math.ceil(ny0 / sy); nz = Math.ceil(nz0 / sz);
    const out = new Float64Array(nx * ny * nz);
    for (let z = 0; z < nz; z++) {
      for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
          let sum = 0, nn = 0;
          for (let dz = 0; dz < sz; dz++) {
            for (let dy = 0; dy < sy; dy++) {
              for (let dx = 0; dx < sx; dx++) {
                const oz = z * sz + dz, oy = y * sy + dy, ox = x * sx + dx;
                if (oz >= nz0 || oy >= ny0 || ox >= nx0) continue;
                const val = vol[(oz * ny0 + oy) * nx0 + ox];
                if (Number.isFinite(val)) { sum += val; nn++; }
              }
            }
          }
          out[(z * ny + y) * nx + x] = nn ? sum / nn : NaN;
        }
      }
    }
    data = out;
  }

  const { min, max, mean } = statsOf(data);
  const zName = v.dims[zAxis], yName = v.dims[yAxis], xName = v.dims[xAxis];
  const zCoords = await readCoord(ds, zName, v.shape[zAxis]);
  const yCoords = await readCoord(ds, yName, v.shape[yAxis]);
  const xCoords = await readCoord(ds, xName, v.shape[xAxis]);
  return { data, nx, ny, nz, xCoords, yCoords, zCoords, xName, yName, zName, min, max, mean };
}
