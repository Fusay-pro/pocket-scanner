import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Lang } from '../i18n';

export type Theme = 'light' | 'dark';
export type AnalyticsRange = '7d' | '30d' | 'all';

interface Settings {
  lang: Lang;
  theme: Theme;
  analyticsRange: AnalyticsRange;
  lowStockThreshold: number;
  currencySymbol: string;
  expiryWarningDays: number;
  defaultUnit: string;
  aiApiKey: string;
}

interface SettingsCtx extends Settings {
  setLang: (l: Lang) => void;
  setTheme: (t: Theme) => void;
  setAnalyticsRange: (r: AnalyticsRange) => void;
  setLowStockThreshold: (n: number) => void;
  setCurrencySymbol: (s: string) => void;
  setExpiryWarningDays: (n: number) => void;
  setDefaultUnit: (s: string) => void;
  setAiApiKey: (k: string) => void;
}

const Ctx = createContext<SettingsCtx>({} as SettingsCtx);

const LS_KEY = 'pocket_scanner_settings';
const DEFAULTS: Settings = { lang: 'en', theme: 'light', analyticsRange: '7d', lowStockThreshold: 5, currencySymbol: '฿', expiryWarningDays: 7, defaultUnit: 'pcs', aiApiKey: '' };

function load(): Settings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULTS;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Settings>(load);

  function update(partial: Partial<Settings>) {
    setS(prev => {
      const next = { ...prev, ...partial };
      localStorage.setItem(LS_KEY, JSON.stringify(next));
      return next;
    });
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', s.theme);
  }, [s.theme]);

  return (
    <Ctx.Provider value={{
      ...s,
      setLang:               l => update({ lang: l }),
      setTheme:              t => update({ theme: t }),
      setAnalyticsRange:     r => update({ analyticsRange: r }),
      setLowStockThreshold:  n => update({ lowStockThreshold: n }),
      setCurrencySymbol:     s => update({ currencySymbol: s }),
      setExpiryWarningDays:  n => update({ expiryWarningDays: n }),
      setDefaultUnit:        s => update({ defaultUnit: s }),
      setAiApiKey:           (k: string) => update({ aiApiKey: k }),
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useSettings = () => useContext(Ctx);
