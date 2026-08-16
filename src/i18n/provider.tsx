"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { LANG_STORAGE_KEY, translate, type Lang } from "./";

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (path: string, params?: Record<string, string | number>) => string;
  locale: string;
  formatDate: (value: string | number | Date, opts?: Intl.DateTimeFormatOptions) => string;
  formatTime: (value: string | number | Date) => string;
  formatNumber: (value: number | null | undefined, opts?: Intl.NumberFormatOptions) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  // restore persisted preference after hydration (no SSR mismatch).
  // One-time initialization effect — the only render it triggers is
  // this provider's own subtree, so the cascading-render concern does
  // not apply.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore
      if (stored === "en" || stored === "es") setLangState(stored);
    } catch {
      // localStorage unavailable
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const locale = lang === "es" ? "es-419" : "en-US";
    return {
      lang,
      setLang,
      t: (path, params) => translate(lang, path, params),
      locale,
      formatDate: (v, opts) => {
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) return "—";
        return new Intl.DateTimeFormat(locale, {
          year: "numeric",
          month: "short",
          day: "numeric",
          ...opts,
        }).format(d);
      },
      formatTime: (v) => {
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) return "—";
        return new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(d);
      },
      formatNumber: (v, opts) =>
        v == null || Number.isNaN(v)
          ? "—"
          : new Intl.NumberFormat(locale, opts).format(v),
    };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
