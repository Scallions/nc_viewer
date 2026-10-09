import { describe, expect, it } from 'vitest';
import { downsamplePlane, guessGeoRole } from './ncService';

describe('guessGeoRole', () => {
  it('recognises longitude by name', () => {
    expect(guessGeoRole('lon', null, null)).toBe('lon');
    expect(guessGeoRole('longitude', null, null)).toBe('lon');
    expect(guessGeoRole('x', null, null)).toBe('lon');
  });

  it('recognises latitude by name', () => {
    expect(guessGeoRole('lat', null, null)).toBe('lat');
    expect(guessGeoRole('latitude', null, null)).toBe('lat');
    expect(guessGeoRole('y', null, null)).toBe('lat');
  });

  it('recognises longitude and latitude by units', () => {
    expect(guessGeoRole('coord_a', null, 'degrees_east')).toBe('lon');
    expect(guessGeoRole('coord_b', null, 'degrees_north')).toBe('lat');
  });

  it('recognises time by name and units', () => {
    expect(guessGeoRole('time', null, null)).toBe('time');
    expect(guessGeoRole('t', null, null)).toBe('time');
    expect(guessGeoRole('when', null, 'hours since 2000-01-01')).toBe('time');
  });

  it('recognises vertical dimensions', () => {
    for (const name of ['depth', 'lev', 'level', 'plev', 'height', 'pressure', 'sigma']) {
      expect(guessGeoRole(name, null, null), name).toBe('vertical');
    }
    expect(guessGeoRole('z_axis', null, 'm')).toBe('vertical');
    expect(guessGeoRole('z_axis', null, 'hPa')).toBe('vertical');
  });

  it('falls back to value-range heuristics', () => {
    expect(guessGeoRole('d0', [-180, 0, 180], null)).toBe('lon');
    expect(guessGeoRole('d1', [-80, 0, 80], null)).toBe('lat');
  });

  it('returns null when nothing matches', () => {
    expect(guessGeoRole('foo', null, null)).toBeNull();
    expect(guessGeoRole('foo', [0], null)).toBeNull();
  });
});

describe('downsamplePlane', () => {
  it('returns the input unchanged when already small enough', () => {
    const data = new Float64Array([1, 2, 3, 4, 5, 6]);
    const out = downsamplePlane(data, 3, 2, 600);
    expect(out.nx).toBe(3);
    expect(out.ny).toBe(2);
    expect(Array.from(out.data)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('shrinks each side to at most maxSide', () => {
    const nx = 1200, ny = 800;
    const data = new Float64Array(nx * ny).fill(1);
    const out = downsamplePlane(data, nx, ny, 600);
    expect(out.nx).toBeLessThanOrEqual(600);
    expect(out.ny).toBeLessThanOrEqual(600);
    expect(out.data.length).toBe(out.nx * out.ny);
  });

  it('averages the values inside each output cell', () => {
    // 4x4 split into 2x2 blocks, each block filled with a constant value
    const block = [
      [1, 1, 3, 3],
      [1, 1, 3, 3],
      [5, 5, 7, 7],
      [5, 5, 7, 7],
    ];
    const data = new Float64Array(block.flat());
    const out = downsamplePlane(data, 4, 4, 2);
    expect(out.nx).toBe(2);
    expect(out.ny).toBe(2);
    // each output cell is the mean of its 2x2 block
    expect(Array.from(out.data)).toEqual([1, 3, 5, 7]);
  });

  it('averages a mixed block', () => {
    const data = new Float64Array([1, 2, 3, 4]);
    const out = downsamplePlane(data, 2, 2, 1);
    expect(out.data[0]).toBeCloseTo(2.5, 10);
  });

  it('ignores NaN when averaging', () => {
    const data = new Float64Array([1, NaN, NaN, 3]);
    const out = downsamplePlane(data, 2, 2, 1);
    expect(out.nx).toBe(1);
    expect(out.ny).toBe(1);
    expect(out.data[0]).toBeCloseTo(2, 10);
  });

  it('produces NaN when an output cell is entirely NaN', () => {
    const data = new Float64Array([NaN, NaN, NaN, NaN]);
    const out = downsamplePlane(data, 2, 2, 1);
    expect(Number.isNaN(out.data[0])).toBe(true);
  });
});
