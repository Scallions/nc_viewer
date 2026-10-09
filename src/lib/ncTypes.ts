export interface NcAttribute {
  name: string;
  type: string;
  value: unknown;
}

export interface NcDimension {
  name: string;
  size: number;
}

export interface NcVariable {
  /** full path, e.g. "/temperature" or "temperature" */
  name: string;
  /** short display name */
  shortName: string;
  /** dimension names in order */
  dims: string[];
  /** shape in order */
  shape: number[];
  dtype: string;
  attrs: NcAttribute[];
  /** group path, e.g. "/" */
  group: string;
  /** is coordinate variable (1D with same name as dim) */
  isCoord: boolean;
}

export interface NcDataset {
  fileName: string;
  format: 'netCDF-3' | 'netCDF-4/HDF5' | 'unknown';
  dimensions: NcDimension[];
  variables: NcVariable[];
  globalAttributes: NcAttribute[];
  /** raw reader handle kept in memory (not serializable) */
  _handle?: unknown;
}

export interface Slice2D {
  /** values row-major [ny][nx] flattened */
  data: Float64Array;
  nx: number;
  ny: number;
  /** x/y coordinates if known */
  xCoords: number[] | null;
  yCoords: number[] | null;
  xName: string;
  yName: string;
  /** fixed indices for leading dims, e.g. { time: 0 } */
  fixed: Record<string, number>;
  /** which dim indices were used as y/x */
  yAxis: number;
  xAxis: number;
  min: number;
  max: number;
  mean: number;
}

export interface Volume3D {
  /** values in [nz][ny][nx] order flattened */
  data: Float64Array;
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

/** Geographic role of a dimension, if recognizable. */
export type GeoRole = 'lon' | 'lat' | 'vertical' | 'time' | null;
