import { describe, expect, it } from 'vitest';
import { downsampleProfile } from './ProfileView';

const seq = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('downsampleProfile', () => {
  it('returns the input untouched when short enough', () => {
    const coords = seq(100);
    const values = coords.map((c) => c * 2);
    const out = downsampleProfile(coords, values);
    expect(out.downsampled).toBe(false);
    expect(out.coords).toBe(coords);
    expect(out.values).toBe(values);
  });

  it('decimates long series and flags it', () => {
    const n = 60_000;
    const out = downsampleProfile(seq(n), seq(n).map((i) => Math.sin(i / 100)));
    expect(out.downsampled).toBe(true);
    expect(out.coords.length).toBeLessThanOrEqual(4_000);
    expect(out.coords.length).toBeGreaterThan(2_000);
    expect(out.coords.length).toBe(out.values.length);
  });

  it('preserves the global min and max', () => {
    const n = 20_000;
    const values = seq(n).map((i) => (i === 12_345 ? 999 : i === 6_789 ? -999 : Math.sin(i)));
    const out = downsampleProfile(seq(n), values);
    expect(Math.max(...out.values)).toBe(999);
    expect(Math.min(...out.values)).toBe(-999);
  });

  it('keeps coordinates and values paired and in order', () => {
    const n = 10_000;
    const coords = seq(n);
    const values = seq(n).map((i) => i * i);
    const out = downsampleProfile(coords, values);
    for (let i = 0; i < out.coords.length; i++) {
      expect(out.values[i]).toBe(out.coords[i] * out.coords[i]);
    }
    for (let i = 1; i < out.coords.length; i++) {
      expect(out.coords[i]).toBeGreaterThan(out.coords[i - 1]);
    }
  });

  it('carries NaN buckets through as NaN', () => {
    const n = 10_000;
    const out = downsampleProfile(seq(n), new Array<number>(n).fill(NaN));
    expect(out.downsampled).toBe(true);
    expect(out.values.every((v) => Number.isNaN(v))).toBe(true);
  });
});
