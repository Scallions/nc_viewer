import { invoke } from '@tauri-apps/api/core';
import type { NcAttribute, NcDataset, NcDimension, NcVariable, Slice2D } from './ncTypes';

/**
 * Backend (Rust) path for large files.
 *
 * The pure-frontend readers (netcdfjs / h5wasm) must load the entire file into
 * WASM memory. For multi-hundred-MB / GB files that either freezes the tab or
 * blows the WASM heap. The Rust `netcdf-reader` backend instead keeps the file
 * on disk and reads only the requested hyperslab, so opening + slicing a 1.3GB
 * file stays in the sub-millisecond range.
 *
 * We decide per file: files above `LARGE_FILE_BYTES` use the backend. The web
 * (non-Tauri) build has no backend, so it always uses the frontend readers.
 */

export const LARGE_FILE_BYTES = 64 * 1024 * 1024; // 64 MB

export function hasBackend(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

interface BackendVar {
  name: string;
  shortName: string;
  dims: string[];
  shape: number[];
  dtype: string;
  attrs: NcAttribute[];
  group: string;
  isCoord: boolean;
}

interface BackendMeta {
  format: 'netCDF-3' | 'netCDF-4/HDF5' | 'unknown';
  dimensions: NcDimension[];
  variables: BackendVar[];
  globalAttributes: NcAttribute[];
}

interface BackendSlice {
  data: number[];
  nx: number;
  ny: number;
  xCoords: number[] | null;
  yCoords: number[] | null;
  xName: string;
  yName: string;
  min: number;
  max: number;
  mean: number;
}

/** Open a file via the Rust backend (metadata only — no data is read). */
export async function openBackend(path: string): Promise<NcDataset> {
  const meta = await invoke<BackendMeta>('nc_meta', { path });
  const variables: NcVariable[] = meta.variables.map((v) => ({
    name: v.name,
    shortName: v.shortName,
    dims: v.dims,
    shape: v.shape,
    dtype: v.dtype,
    attrs: v.attrs,
    group: v.group,
    isCoord: v.isCoord,
  }));
  return {
    fileName: path.split(/[\\/]/).pop() ?? path,
    format: meta.format,
    dimensions: meta.dimensions,
    variables,
    globalAttributes: meta.globalAttributes,
    // the handle is just the path: every read reopens the file cheaply
    _handle: { backendPath: path },
  };
}

export function isBackendDataset(ds: NcDataset): boolean {
  const h = ds._handle as { backendPath?: string } | undefined;
  return !!h?.backendPath;
}

export function backendPathOf(ds: NcDataset): string {
  const h = ds._handle as { backendPath?: string } | undefined;
  if (!h?.backendPath) throw new Error('not a backend dataset');
  return h.backendPath;
}

/** Read an arbitrary [yAxis x xAxis] plane from a backend dataset. */
export async function getSliceBackend(
  ds: NcDataset, varName: string, yAxis: number, xAxis: number,
  fixed: Record<string, number>,
): Promise<Slice2D> {
  const path = backendPathOf(ds);
  const v = ds.variables.find((x) => x.name === varName);
  if (!v) throw new Error(`variable not found: ${varName}`);
  const fixedVec: number[] = v.dims.map((d, i) => {
    if (i === yAxis || i === xAxis) return 0;
    return Math.min(fixed[d] ?? 0, Math.max(0, v.shape[i] - 1));
  });
  const res = await invoke<BackendSlice>('nc_slice_2d', {
    path,
    var: varName,
    yAxis,
    xAxis,
    fixed: fixedVec,
  });
  return {
    data: Float64Array.from(res.data),
    nx: res.nx,
    ny: res.ny,
    xCoords: res.xCoords,
    yCoords: res.yCoords,
    xName: res.xName,
    yName: res.yName,
    fixed: { ...fixed },
    yAxis,
    xAxis,
    min: res.min,
    max: res.max,
    mean: res.mean,
  };
}

/** Read a 1D coordinate variable by dimension name. */
export async function getCoordBackend(ds: NcDataset, dim: string): Promise<number[] | null> {
  try {
    return await invoke<number[]>('nc_coord', { path: backendPathOf(ds), dim });
  } catch {
    return null;
  }
}

export interface BackendProfile {
  coords: number[];
  values: number[];
  coordName: string;
}

/** Read a 1D profile along `axis`, fixing every other dim. */
export async function getProfileBackend(
  ds: NcDataset, varName: string, axis: number, fixed: Record<string, number>,
): Promise<BackendProfile> {
  const v = ds.variables.find((x) => x.name === varName);
  if (!v) throw new Error(`variable not found: ${varName}`);
  const fixedVec = v.dims.map((d, i) =>
    i === axis ? 0 : Math.min(fixed[d] ?? 0, Math.max(0, v.shape[i] - 1)),
  );
  return invoke<BackendProfile>('nc_profile', {
    path: backendPathOf(ds), var: varName, axis, fixed: fixedVec,
  });
}

export interface BackendVolume {
  data: number[];
  nx: number;
  ny: number;
  nz: number;
  xCoords: number[] | null;
  yCoords: number[] | null;
  zCoords: number[] | null;
  xName: string;
  yName: string;
  zName: string;
  min: number;
  max: number;
  mean: number;
}

/** Read a downsampled [z][y][x] volume via strided hyperslabs. */
export async function getVolumeBackend(
  ds: NcDataset, varName: string, zAxis: number, yAxis: number, xAxis: number,
  fixed: Record<string, number>, maxSide = 96,
): Promise<BackendVolume> {
  const v = ds.variables.find((x) => x.name === varName);
  if (!v) throw new Error(`variable not found: ${varName}`);
  const fixedVec = v.dims.map((d, i) =>
    i === zAxis || i === yAxis || i === xAxis
      ? 0
      : Math.min(fixed[d] ?? 0, Math.max(0, v.shape[i] - 1)),
  );
  return invoke<BackendVolume>('nc_volume', {
    path: backendPathOf(ds), var: varName,
    zAxis, yAxis, xAxis, fixed: fixedVec, maxSide,
  });
}
