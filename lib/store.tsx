'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { DATA, RANGES } from './data';
import type { SessionUser } from '@/lib/auth/session';

type Toast = { id: number; msg: string } | null;

interface CenterInfo {
  id: string;
  name: string;
  banglaName?: string | null;
  code: string;
  phone: string;
  city?: string | null;
  district?: string | null;
  logo?: string | null;
  branches: Array<{ id: string; name: string; isMain: boolean }>;
  branding?: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    logoUrl?: string | null;
  } | null;
}

type Ctx = {
  cls: string;
  setCls: (v: string) => void;
  range: (typeof RANGES)[number];
  setRangeId: (id: string) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  mobileNav: boolean;
  setMobileNav: (v: boolean) => void;
  toast: Toast;
  showToast: (msg: string) => void;
  lang: 'en' | 'bn';
  setLang: (v: 'en' | 'bn') => void;
  currentUser: SessionUser | null;
  currentCenter: CenterInfo | null;
  refreshAuth: () => Promise<void>;
};

const AppCtx = createContext<Ctx | null>(null);

const LS_KEY = 'alokito.coachingos.nextjs.prefs.v2';

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [cls, setClsRaw] = useState('all');
  const [rangeId, setRangeIdRaw] = useState('month');
  const [collapsed, setCollapsedRaw] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [lang, setLang] = useState<'en' | 'bn'>('bn'); // Default to Bangla as required
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [currentCenter, setCurrentCenter] = useState<CenterInfo | null>(null);
  const tt = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [hydrated, setHydrated] = useState(false);

  const fetchAuthInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated) {
          setCurrentUser(data.user);
          setCurrentCenter(data.center);
        } else {
          setCurrentUser(null);
          setCurrentCenter(null);
        }
      }
    } catch {
      // Ignore network errors in offline/dev
    }
  }, []);

  useEffect(() => {
    fetchAuthInfo();
  }, [fetchAuthInfo]);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(LS_KEY) || '{}');
      if (saved.cls && DATA.classes.some((c: any) => c.id === saved.cls)) setClsRaw(saved.cls);
      if (saved.rangeId) setRangeIdRaw(saved.rangeId);
      if (typeof saved.collapsed === 'boolean') setCollapsedRaw(saved.collapsed);
      if (saved.lang === 'en' || saved.lang === 'bn') setLang(saved.lang);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify({ cls, rangeId, collapsed, lang }));
    } catch {
      /* ignore */
    }
  }, [cls, rangeId, collapsed, lang, hydrated]);

  const showToast = useCallback((msg: string) => {
    setToast({ id: Date.now(), msg });
    clearTimeout(tt.current);
    tt.current = setTimeout(() => setToast(null), 2800);
  }, []);

  const range = RANGES.find((r) => r.id === rangeId) || RANGES[0];

  return (
    <AppCtx.Provider
      value={{
        cls,
        setCls: setClsRaw,
        range,
        setRangeId: setRangeIdRaw,
        collapsed,
        setCollapsed: setCollapsedRaw,
        mobileNav,
        setMobileNav,
        toast,
        showToast,
        lang,
        setLang,
        currentUser,
        currentCenter,
        refreshAuth: fetchAuthInfo,
      }}
    >
      {children}
    </AppCtx.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
