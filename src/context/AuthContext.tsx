// ============================================
// Local demo authentication. Accounts and sessions are stored in this browser;
// this is not production authentication and does not require a backend.
// ============================================

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { STORAGE_KEYS } from '../constants';

export interface AuthUser {
  name: string;
  email: string;
}

interface StoredAuth {
  account: { name: string; email: string; salt: string; hash: string } | null;
  session: AuthUser | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  /** false until the stored session has been read */
  ready: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  register: (name: string, email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const EMPTY_AUTH: StoredAuth = { account: null, session: null };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readStored(): StoredAuth {
  if (typeof window === 'undefined') return EMPTY_AUTH;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.auth);
    if (!raw) return EMPTY_AUTH;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_AUTH;

    const value = parsed as Partial<StoredAuth>;
    const account =
      value.account &&
      typeof value.account.name === 'string' &&
      typeof value.account.email === 'string' &&
      typeof value.account.salt === 'string' &&
      typeof value.account.hash === 'string'
        ? value.account
        : null;
    const session =
      value.session && typeof value.session.name === 'string' && typeof value.session.email === 'string'
        ? { name: value.session.name, email: value.session.email }
        : null;

    return { account, session };
  } catch (err) {
    console.warn('[sakura-ledger] Could not read the local demo session.', err);
    return EMPTY_AUTH;
  }
}

function writeStored(value: StoredAuth): void {
  try {
    window.localStorage.setItem(STORAGE_KEYS.auth, JSON.stringify(value));
  } catch (err) {
    console.error('[sakura-ledger] Could not save the local demo session.', err);
    throw new Error('Could not save this demo account in your browser. Check that browser storage is available.');
  }
}

async function digest(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}::${password}`);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  let hash = 5381;
  const text = `${salt}::${password}`;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return `fallback-${(hash >>> 0).toString(16)}`;
}

function makeSalt(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(readStored().session);
    setReady(true);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) return { ok: false, error: 'Enter a valid email address.' };
    if (!password) return { ok: false, error: 'Password is required.' };

    const stored = readStored();
    if (!stored.account) return { ok: false, error: 'No demo account yet — register first.' };
    if (stored.account.email !== trimmed) return { ok: false, error: 'Incorrect email or password.' };

    const hash = await digest(password, stored.account.salt);
    if (hash !== stored.account.hash) return { ok: false, error: 'Incorrect email or password.' };

    const session: AuthUser = { name: stored.account.name, email: stored.account.email };
    try {
      writeStored({ ...stored, session });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Could not save the local demo session.' };
    }
    setUser(session);
    return { ok: true };
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const trimmedName = name.trim();
    const trimmed = email.trim().toLowerCase();
    if (trimmedName.length < 2) return { ok: false, error: 'Please enter your name.' };
    if (!EMAIL_RE.test(trimmed)) return { ok: false, error: 'Enter a valid email address.' };
    if (password.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' };

    const stored = readStored();
    if (stored.account?.email === trimmed) {
      return { ok: false, error: 'A demo account with that email already exists.' };
    }

    const salt = makeSalt();
    const hash = await digest(password, salt);
    const account = { name: trimmedName, email: trimmed, salt, hash };
    const session: AuthUser = { name: trimmedName, email: trimmed };
    try {
      writeStored({ account, session });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Could not save the local demo account.' };
    }
    setUser(session);
    return { ok: true };
  }, []);

  const logout = useCallback(async () => {
    const stored = readStored();
    writeStored({ ...stored, session: null });
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      ready,
      login,
      register,
      logout,
    }),
    [user, ready, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
