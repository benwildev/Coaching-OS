'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { PortalType } from '@/lib/auth/portal-session';

type Toast = { id: number; msg: string } | null;

export interface PortalUser {
  portalType: PortalType;
  name: string;
  studentId?: string | null;
  guardianId?: string | null;
}

type Ctx = {
  lang: 'en' | 'bn';
  setLang: (v: 'en' | 'bn') => void;
  toast: Toast;
  showToast: (msg: string) => void;
  portalUser: PortalUser | null;
  loadingUser: boolean;
  refreshPortalUser: () => Promise<void>;
};

const PortalCtx = createContext<Ctx | null>(null);

// Same key/shape as the staff AppProvider (lib/store.tsx) so a language
// choice made on either surface stays consistent — deliberately the only
// state shared between the two, everything else is independent.
const LS_KEY = 'alokito.coachingos.nextjs.prefs.v2';

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<'en' | 'bn'>('bn');
  const [toast, setToast] = useState<Toast>(null);
  const [portalUser, setPortalUser] = useState<PortalUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const tt = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [hydrated, setHydrated] = useState(false);

  const refreshPortalUser = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/auth/me');
      const data = await res.json();
      setPortalUser(data.success ? data.user : null);
    } catch {
      setPortalUser(null);
    } finally {
      setLoadingUser(false);
    }
  }, []);

  useEffect(() => {
    refreshPortalUser();
  }, [refreshPortalUser]);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(LS_KEY) || '{}');
      if (saved.lang === 'en' || saved.lang === 'bn') setLang(saved.lang);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const saved = JSON.parse(window.localStorage.getItem(LS_KEY) || '{}');
      window.localStorage.setItem(LS_KEY, JSON.stringify({ ...saved, lang }));
    } catch {
      /* ignore */
    }
  }, [lang, hydrated]);

  const showToast = useCallback((msg: string) => {
    setToast({ id: Date.now(), msg });
    clearTimeout(tt.current);
    tt.current = setTimeout(() => setToast(null), 2800);
  }, []);

  return (
    <PortalCtx.Provider value={{ lang, setLang, toast, showToast, portalUser, loadingUser, refreshPortalUser }}>
      {children}
      {toast && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-[#00296b] text-white text-[13.5px] font-semibold px-4 py-2.5 rounded-full shadow-2xl fade-in">
          {toast.msg}
        </div>
      )}
    </PortalCtx.Provider>
  );
}

export function usePortal() {
  const ctx = useContext(PortalCtx);
  if (!ctx) throw new Error('usePortal must be used within PortalProvider');
  return ctx;
}
