'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch } from './api';

export type PersonaKey = 'AUDITOR' | 'FACTORY_ADMIN' | 'BRAND_NW' | 'BRAND_ES' | 'PUBLIC';

export interface ActiveUser {
  id: string;
  email: string;
  name: string;
  role: 'PUBLIC' | 'BRAND_USER' | 'FACTORY_ADMIN' | 'AUDITOR';
  brandId: string | null;
  brandCode?: string | null;
}

interface AuthContextValue {
  persona: PersonaKey;
  user: ActiveUser;
  token: string | null;
  loading: boolean;
  switchPersona: (persona: PersonaKey) => Promise<void>;
}

const PUBLIC_USER: ActiveUser = {
  id: 'public-anonymous',
  email: 'public@threadtrace.local',
  name: 'Public Consumer',
  role: 'PUBLIC',
  brandId: null,
  brandCode: null,
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [persona, setPersona] = useState<PersonaKey>('AUDITOR');
  const [user, setUser] = useState<ActiveUser>(PUBLIC_USER);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const switchPersona = useCallback(async (nextPersona: PersonaKey) => {
    setLoading(true);
    try {
      if (nextPersona === 'PUBLIC') {
        setPersona('PUBLIC');
        setUser(PUBLIC_USER);
        setToken(null);
        if (typeof window !== 'undefined') {
          localStorage.setItem('tt_persona', 'PUBLIC');
          localStorage.removeItem('tt_token');
        }
        return;
      }

      const res = await apiFetch<{ token: string; user: ActiveUser }>('/auth/demo-switch', {
        method: 'POST',
        body: JSON.stringify({ persona: nextPersona }),
      });

      setPersona(nextPersona);
      setUser(res.user);
      setToken(res.token);
      if (typeof window !== 'undefined') {
        localStorage.setItem('tt_persona', nextPersona);
        localStorage.setItem('tt_token', res.token);
      }
    } catch {
      // If DB is stopped during QA4 demo, stay gracefully in current/public state
      setPersona('PUBLIC');
      setUser(PUBLIC_USER);
      setToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved =
      (typeof window !== 'undefined' ? (localStorage.getItem('tt_persona') as PersonaKey | null) : null) ??
      'AUDITOR';
    switchPersona(saved);
  }, [switchPersona]);

  return (
    <AuthContext.Provider value={{ persona, user, token, loading, switchPersona }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
