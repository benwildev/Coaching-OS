import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setAuthToken, setUnauthorizedHandler } from './api';
import { queryClient } from './query';
import type { MeResponse } from './types';

const TOKEN_KEY = 'coaching_os_portal_token';

interface AuthState {
  status: 'loading' | 'signedOut' | 'signedIn';
  me: MeResponse | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  replaceToken: (token: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [me, setMe] = useState<MeResponse | null>(null);

  const clear = useCallback(async () => {
    setAuthToken(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
    queryClient.clear();
    setMe(null);
    setStatus('signedOut');
  }, []);

  const loadMe = useCallback(async () => {
    const result = await api<MeResponse>('/api/portal/auth/me');
    if (!result.user) throw new Error('SIGNED_OUT');
    setMe(result);
    setStatus('signedIn');
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => void clear());
    (async () => {
      const token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
      if (!token) return setStatus('signedOut');
      setAuthToken(token);
      try {
        await loadMe();
      } catch {
        await clear();
      }
    })();
    return () => setUnauthorizedHandler(null);
  }, [clear, loadMe]);

  const replaceToken = useCallback(async (token: string) => {
    setAuthToken(token);
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = await api<{ token: string }>('/api/portal/auth/mobile-login', { body: { email, password } });
      await replaceToken(result.token);
      await loadMe();
    },
    [loadMe, replaceToken]
  );

  const signOut = useCallback(async () => {
    // Revokes the token server-side (bumps sessionVersion); sign out locally regardless.
    await api('/api/portal/auth/logout', { method: 'POST' }).catch(() => {});
    await clear();
  }, [clear]);

  const value = useMemo(() => ({ status, me, signIn, signOut, replaceToken }), [status, me, signIn, signOut, replaceToken]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
