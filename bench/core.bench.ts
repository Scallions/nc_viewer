import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'vitest';
import {
  downsamplePlane, findLonLatAxes, geoRolesFor, getProfile, getSlice2D,
  getSlice2DAxes, getVolume3D, parseNcFile,
} from '../src/lib/ncService';
import { colorFor, colormapColors, type ColormapName } from '../src/lib/colormap';
import type { NcDataset } from '../src/lib/ncTypes';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, '../test-data');

function load(name: string): Uint8Array {
  const p = resolve(dataDir, name);
  if (!existsSync(p)) throw new Error(`missing fixture: ${p}`);
  return new Uint8Array(readFileSync(p));
}

/** Run `fn` `iters` times and report the median wall time in ms. */
async function bench(label: string, iters: number, fn: () => unknown | Promise<unknown>) {
  // warm up (JIT + caches) so the first call doesn't dominate
  await fn();
  const samples: number[] = [];
  for (let i = 0; i < iters; i++) {
    const t0 = performance.now();
    await fn();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  const min = samples[0];
  const max = samples[samples.length - 1];
  // eslint-disable-next-line no-console
  console.log(
    `  ${label.padEnd(46)} median ${median.toFixed(2).padStart(8)} ms` +
    `   min ${min.toFixed(2).padStart(7)}   max ${max.toFixed(2).padStart(8)}`,
  );
  return median;
}

describe('NetCDF parse', () => {
  it('parses NetCDF-3 sample3.nc', async () => {
    const bytes = load('sample3.nc');
    const ds = await bench('parse sample3.nc (NetCDF-3)', 10, () => parseNcFile(bytes, 'sample3.nc'));
    if (!ds) throw new Error('no dataset');
  });

  it('parses NetCDF-4 sample4.nc (groups)', async () => {
    const bytes = load('sample4.nc');
    await bench('parse sample4.nc (NetCDF-4)', 10, () => parseNcFile(bytes, 'sample4.nc'));
  });

  it('parses NetCDF-4 sample_vol.nc (4D)', async () => {
    const bytes = load('sample_vol.nc');
    await bench('parse sample_vol.nc (4D)', 10, () => parseNcFile(bytes, 'sample_vol.nc'));
  });
});

describe('Slicing', () => {
  let ds3: NcDataset;
  let ds4: NcDataset;
  let dsVol: NcDataset;

  it('loads fixtures', async () => {
    ds3 = await parseNcFile(load('sample3.nc'), 'sample3.nc');
    ds4 = await parseNcFile(load('sample4.nc'), 'sample4.nc');
    dsVol = await parseNcFile(load('sample_vol.nc'), 'sample_vol.nc');
  });

  it('slices a 3D plane (NetCDF-3)', async () => {
    // NetCDF-3 variables are addressed by bare name (no leading slash)
    await bench('getSlice2D temperature[0]', 20, () => getSlice2D(ds3, 'temperature', { time: 0 }));
  });

  it('slices a 3D plane (NetCDF-4)', async () => {
    await bench('getSlice2D precip[0]', 20, () => getSlice2D(ds4, '/precip', { time: 0 }));
  });

  it('slices a group variable', async () => {
    await bench('getSlice2DAxes ocean/salinity', 20,
      () => getSlice2DAxes(ds4, '/ocean/salinity', 0, 1, {}));
  });

  it('slices arbitrary axes of a 4D var', async () => {
    await bench('getSlice2DAxes temp[depth,lat]', 20,
      () => getSlice2DAxes(dsVol, '/temp', 1, 2, { time: 0 }));
  });
});

describe('Profiles & volumes', () => {
  let dsVol: NcDataset;
  it('loads fixture', async () => {
    dsVol = await parseNcFile(load('sample_vol.nc'), 'sample_vol.nc');
  });

  it('extracts a vertical profile', async () => {
    await bench('getProfile temp[depth]', 20, () => getProfile(dsVol, '/temp', 1, { time: 0, lat: 0, lon: 0 }));
  });

  it('builds a 3D volume', async () => {
    await bench('getVolume3D temp', 5, () => getVolume3D(dsVol, '/temp', 1, 2, 3, { time: 0 }));
  });
});

describe('Geo detection', () => {
  let dsVol: NcDataset;
  it('loads fixture', async () => {
    dsVol = await parseNcFile(load('sample_vol.nc'), 'sample_vol.nc');
  });
  it('detects roles and lon/lat axes', async () => {
    const v = dsVol.variables.find((x) => x.shortName === 'temp')!;
    await bench('geoRolesFor temp', 20, () => geoRolesFor(dsVol, v));
    await bench('findLonLatAxes temp', 20, () => findLonLatAxes(dsVol, v));
  });
});

describe('Downsampling & colormap', () => {
  it('downsamples a 2000x2000 plane to <=600', async () => {
    const n = 2000;
    const data = new Float64Array(n * n);
    for (let i = 0; i < data.length; i++) data[i] = Math.sin(i * 0.001);
    const result = downsamplePlane(data, n, n);
    await bench(`downsamplePlane ${n}x${n} -> 600`, 5, () => downsamplePlane(data, n, n));
    if (result.nx > 600 || result.ny > 600) throw new Error('downsample failed to cap size');
    if (result.data.length !== result.nx * result.ny) throw new Error('bad output shape');
  });

  it('maps values to colors', async () => {
    await bench('colorFor x100k', 5, () => {
      let acc = 0;
      for (let i = 0; i < 100_000; i++) {
        const c = colorFor(i % 100, 0, 100, 'cividis');
        if (c) acc += c[0];
      }
      return acc;
    });
  });

  it('builds a colormap LUT', async () => {
    await bench('colormapColors 256 (cividis)', 20,
      () => colormapColors('cividis' as ColormapName, 256));
  });
});
