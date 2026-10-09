import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE, LOCALES, LOCALE_LABELS, MESSAGES, detectLocale, interpolate,
  isLocale, translate, type MessageKey,
} from './i18n';

describe('locale metadata', () => {
  it('exposes zh and en', () => {
    expect([...LOCALES]).toEqual(['zh', 'en']);
    expect(LOCALE_LABELS.zh).toBe('中文');
    expect(LOCALE_LABELS.en).toBe('English');
  });

  it('isLocale accepts only known locales', () => {
    expect(isLocale('zh')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(42)).toBe(false);
  });
});

describe('message catalogue', () => {
  const zhKeys = Object.keys(MESSAGES.zh).sort();
  const enKeys = Object.keys(MESSAGES.en).sort();

  it('has the same keys in every locale', () => {
    expect(enKeys).toEqual(zhKeys);
  });

  it('has no empty messages', () => {
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(MESSAGES[locale])) {
        expect(value, `${locale}.${key} is empty`).not.toBe('');
      }
    }
  });

  it('keeps placeholders consistent across locales', () => {
    const placeholders = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort();
    for (const key of zhKeys as MessageKey[]) {
      expect(placeholders(MESSAGES.en[key]), `placeholders differ for ${key}`)
        .toEqual(placeholders(MESSAGES.zh[key]));
    }
  });
});

describe('interpolate', () => {
  it('replaces named placeholders', () => {
    expect(interpolate('{a} + {b}', { a: 1, b: 2 })).toBe('1 + 2');
  });

  it('repeats a placeholder used twice', () => {
    expect(interpolate('{x}-{x}', { x: 'z' })).toBe('z-z');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(interpolate('{a} {b}', { a: 'A' })).toBe('A {b}');
  });

  it('returns the template unchanged without params', () => {
    expect(interpolate('plain text')).toBe('plain text');
  });
});

describe('translate', () => {
  it('translates in each locale', () => {
    expect(translate('zh', 'app.openFile')).toBe('打开文件');
    expect(translate('en', 'app.openFile')).toBe('Open file');
  });

  it('interpolates parameters', () => {
    expect(translate('zh', 'app.footerCounts', { vars: 3, dims: 2 })).toBe('3 变量 · 2 维度');
    expect(translate('en', 'app.footerCounts', { vars: 3, dims: 2 })).toBe('3 variables · 2 dimensions');
  });

  it('falls back to the key for unknown messages', () => {
    expect(translate('en', 'not.a.real.key' as MessageKey)).toBe('not.a.real.key');
  });
});

describe('detectLocale', () => {
  it('maps Chinese tags to zh', () => {
    expect(detectLocale('zh')).toBe('zh');
    expect(detectLocale('zh-CN')).toBe('zh');
    expect(detectLocale('ZH-Hant')).toBe('zh');
  });

  it('maps non-Chinese tags to en', () => {
    expect(detectLocale('en-US')).toBe('en');
    expect(detectLocale('fr')).toBe('en');
  });

  it('falls back to the default locale when no tag is given', () => {
    expect(detectLocale('')).toBe(DEFAULT_LOCALE);
    expect(detectLocale(null)).toBe(DEFAULT_LOCALE);
    expect(detectLocale(undefined)).toBe(DEFAULT_LOCALE);
  });
});
