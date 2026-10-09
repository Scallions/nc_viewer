import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  resolveInitialLocale, storeLocale, translate,
  type Locale, type MessageKey,
} from './i18n';

export type TFunc = (key: MessageKey, params?: Record<string, string | number>) => string;

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TFunc;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(resolveInitialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    storeLocale(next);
  }, []);

  const value = useMemo<I18nValue>(() => ({
    locale,
    setLocale,
    t: (key, params) => translate(locale, key, params),
  }), [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Access the current locale, a setter and the `t()` translator. */
export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within <I18nProvider>');
  return ctx;
}
