import { describe, expect, it } from 'vitest';
import { COLORMAPS, colorFor, colormapColors } from './colormap';

describe('COLORMAPS', () => {
  it('exposes a non-empty, unique list', () => {
    expect(COLORMAPS.length).toBeGreaterThan(0);
    expect(new Set(COLORMAPS).size).toBe(COLORMAPS.length);
  });

  it('includes the default scientific colormap', () => {
    expect(COLORMAPS).toContain('cividis');
  });
});

describe('colormapColors', () => {
  it('returns the requested number of rgb colours', () => {
    const colors = colormapColors('viridis', 8);
    expect(colors).toHaveLength(8);
    for (const c of colors) expect(c).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
  });

  it('defaults to 64 steps', () => {
    expect(colormapColors('viridis')).toHaveLength(64);
  });

  it('is deterministic across calls', () => {
    expect(colormapColors('turbo', 16)).toEqual(colormapColors('turbo', 16));
  });

  it('differs between colormaps', () => {
    expect(colormapColors('viridis', 4)).not.toEqual(colormapColors('magma', 4));
  });

  it('does not let one resolution poison another (cache is keyed by steps)', () => {
    // regression: a table built for few steps used to be reused for more
    colormapColors('cividis', 8);
    expect(colormapColors('cividis', 64)).toHaveLength(64);
    expect(colormapColors('cividis', 8)).toHaveLength(8);
  });
});

describe('colorFor', () => {
  const range: [number, number] = [0, 100];

  it('returns an RGB triple in 0..255', () => {
    const c = colorFor(50, ...range, 'viridis');
    expect(c).not.toBeNull();
    expect(c!).toHaveLength(3);
    for (const ch of c!) {
      expect(ch).toBeGreaterThanOrEqual(0);
      expect(ch).toBeLessThanOrEqual(255);
      expect(Number.isInteger(ch)).toBe(true);
    }
  });

  it('clamps values below min to the first colour', () => {
    expect(colorFor(-50, ...range, 'viridis')).toEqual(colorFor(0, ...range, 'viridis'));
  });

  it('clamps values above max to the last colour', () => {
    expect(colorFor(500, ...range, 'viridis')).toEqual(colorFor(100, ...range, 'viridis'));
  });

  it('returns null for non-finite values', () => {
    expect(colorFor(NaN, ...range, 'viridis')).toBeNull();
    expect(colorFor(Infinity, ...range, 'viridis')).toBeNull();
    expect(colorFor(-Infinity, ...range, 'viridis')).toBeNull();
  });

  it('returns null when the range is degenerate', () => {
    expect(colorFor(5, 10, 10, 'viridis')).toBeNull();
    expect(colorFor(5, 10, 5, 'viridis')).toBeNull();
  });

  it('is deterministic', () => {
    expect(colorFor(37.5, ...range, 'plasma')).toEqual(colorFor(37.5, ...range, 'plasma'));
  });

  it('is unaffected by a prior colormapColors call with fewer steps', () => {
    // regression: colorFor uses a 256-entry LUT; a smaller table must not leak in
    const before = colorFor(37.5, ...range, 'turbo');
    colormapColors('turbo', 8);
    expect(colorFor(37.5, ...range, 'turbo')).toEqual(before);
  });
});
