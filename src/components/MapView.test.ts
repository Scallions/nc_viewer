import { describe, expect, it } from 'vitest';
import { computeExtent, locate, normLon } from './MapView';

describe('normLon', () => {
  it('keeps longitudes already in range', () => {
    expect(normLon(0)).toBe(0);
    expect(normLon(90)).toBe(90);
    expect(normLon(-90)).toBe(-90);
    expect(normLon(180)).toBe(180);
    expect(normLon(-180)).toBe(-180);
  });

  it('wraps longitudes beyond ±180', () => {
    expect(normLon(190)).toBe(-170);
    expect(normLon(-190)).toBe(170);
    expect(normLon(360)).toBe(0);
    expect(normLon(540)).toBe(180);
    expect(normLon(-540)).toBe(-180);
  });

  it('always returns a value within [-180, 180]', () => {
    for (let x = -1000; x <= 1000; x += 7) {
      const v = normLon(x);
      expect(v).toBeGreaterThanOrEqual(-180);
      expect(v).toBeLessThanOrEqual(180);
    }
  });
});

describe('locate', () => {
  const asc = [0, 10, 20, 30, 40];

  it('returns exact indices on grid points', () => {
    expect(locate(asc, 0)).toBeCloseTo(0, 10);
    expect(locate(asc, 20)).toBeCloseTo(2, 10);
    expect(locate(asc, 40)).toBeCloseTo(4, 10);
  });

  it('interpolates between grid points', () => {
    expect(locate(asc, 5)).toBeCloseTo(0.5, 10);
    expect(locate(asc, 25)).toBeCloseTo(2.5, 10);
  });

  it('returns NaN outside the array range', () => {
    expect(Number.isNaN(locate(asc, -1))).toBe(true);
    expect(Number.isNaN(locate(asc, 41))).toBe(true);
  });

  it('handles descending arrays', () => {
    const desc = [40, 30, 20, 10, 0];
    expect(locate(desc, 40)).toBeCloseTo(0, 10);
    expect(locate(desc, 0)).toBeCloseTo(4, 10);
    expect(locate(desc, 25)).toBeCloseTo(1.5, 10);
    expect(Number.isNaN(locate(desc, 41))).toBe(true);
  });

  it('returns NaN for arrays shorter than two elements', () => {
    expect(Number.isNaN(locate([], 0))).toBe(true);
    expect(Number.isNaN(locate([5], 5))).toBe(true);
  });
});

describe('computeExtent', () => {
  it('computes the bounding box of the samples', () => {
    const e = computeExtent([-75, -50, -10], [85, 70, 55]);
    expect(e.lon0).toBe(-75);
    expect(e.lon1).toBe(-10);
    expect(e.lat0).toBe(55);
    expect(e.lat1).toBe(85);
  });

  it('flags a full-globe extent as global', () => {
    const e = computeExtent([-180, 0, 180], [-90, 0, 90]);
    expect(e.global).toBe(true);
  });

  it('does not flag a polar band spanning all longitudes as global', () => {
    const e = computeExtent([-180, 0, 180], [60, 75, 89]);
    expect(e.global).toBe(false);
  });

  it('does not flag a regional field as global', () => {
    expect(computeExtent([-75, -10], [55, 85]).global).toBe(false);
  });

  it('falls back to the whole sphere when everything is NaN', () => {
    const e = computeExtent([NaN, NaN], [NaN]);
    expect(e.lon0).toBe(-180);
    expect(e.lon1).toBe(180);
    expect(e.lat0).toBe(-90);
    expect(e.lat1).toBe(90);
  });

  it('ignores non-finite samples when computing the box', () => {
    const e = computeExtent([NaN, -30, 40, NaN], [NaN, 10, 50]);
    expect(e.lon0).toBe(-30);
    expect(e.lon1).toBe(40);
    expect(e.lat0).toBe(10);
    expect(e.lat1).toBe(50);
  });
});
