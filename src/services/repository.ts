// ============================================
// Data-access boundary. Every read/write of persisted state goes through
// this module so a real API can replace it later without touching the UI.
//
// Persistence: localStorage under a single versioned key.
// Limits (documented in README): ~5MB total, synchronous, per-browser only.
// Malformed or outdated stored data is discarded gracefully (seed fallback).
// ============================================

import { DB_VERSION, STORAGE_KEYS } from '../constants';
import { createSeedDatabase } from '../data/seed';
import { migrateDatabase } from '../data/migrate';
import type { Database } from '../types';
import { validateBackup } from '../utils/validate';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Structural check + light coercion of a parsed object into a Database.
 * Returns null when the payload cannot be trusted.
 * Expects a CURRENT-version payload — run migrateDatabase first.
 */
export function sanitizeDatabase(raw: unknown): Database | null {
  if (!isRecord(raw)) return null;
  if (raw.version !== DB_VERSION) return null;

  const requiredArrays = [
    'accounts',
    'transactions',
    'budgets',
    'goals',
    'debts',
    'categories',
    'paymentMethods',
  ] as const;
  for (const key of requiredArrays) {
    if (!Array.isArray(raw[key])) return null;
  }
  if (!isRecord(raw.settings) || !isRecord(raw.profile)) return null;

  const settings = raw.settings;
  if (typeof settings.openingBalance !== 'number' || !Number.isInteger(settings.openingBalance)) return null;
  if (settings.theme !== 'light' && settings.theme !== 'dark') return null;
  // Older saved databases/backups predate colorTheme; preserve them with the default palette.
  if (settings.colorTheme === undefined) settings.colorTheme = 'sakura';
  if (!['sakura', 'ocean', 'mint', 'sunset', 'lavender'].includes(settings.colorTheme as string)) {
    settings.colorTheme = 'sakura';
  }
  if (!['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY'].includes(settings.dateFormat as string)) return null;

  const db = raw as unknown as Database;

  db.accounts = db.accounts.filter(
    (a) =>
      isRecord(a) &&
      typeof a.id === 'string' &&
      a.id.length > 0 &&
      typeof a.name === 'string' &&
      a.name.trim().length > 0 &&
      (a.group === 'held' || a.group === 'stashed') &&
      Number.isInteger(a.openingBalance) &&
      typeof a.archived === 'boolean' &&
      typeof a.createdAt === 'string' &&
      typeof a.updatedAt === 'string',
  );
  // Duplicate ids would make balances ambiguous — keep the first of each.
  const seenAccounts = new Set<string>();
  db.accounts = db.accounts.filter((a) => {
    if (seenAccounts.has(a.id)) return false;
    seenAccounts.add(a.id);
    return true;
  });

  const accountIds = new Set(db.accounts.map((a) => a.id));
  const fallbackAccount = db.accounts[0]?.id;

  // Drop individual malformed transactions rather than failing wholesale —
  // one bad row must not cost the user the rest of their ledger. Transactions
  // referencing a missing account are re-pointed at the first account so the
  // record (and its money) is never silently lost.
  db.transactions = db.transactions
    .filter(
      (t) =>
        isRecord(t) &&
        typeof t.id === 'string' &&
        typeof t.date === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(t.date) &&
        (t.type === 'income' || t.type === 'expense') &&
        Number.isInteger(t.amount) &&
        t.amount > 0 &&
        typeof t.description === 'string' &&
        t.description.trim().length > 0 &&
        typeof t.category === 'string' &&
        typeof t.paymentMethod === 'string' &&
        typeof t.createdAt === 'string' &&
        typeof t.updatedAt === 'string',
    )
    .map((t) => {
      if (typeof t.account === 'string' && accountIds.has(t.account)) return t;
      if (!fallbackAccount) return null;
      return { ...t, account: fallbackAccount };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);

  db.budgets = db.budgets.filter(
    (b) => isRecord(b) && typeof b.id === 'string' && Number.isInteger(b.limit) && b.limit > 0,
  );
  db.goals = db.goals.filter(
    (g) => isRecord(g) && typeof g.id === 'string' && Number.isInteger(g.target) && g.target > 0 && Number.isInteger(g.saved) && g.saved >= 0,
  );
  db.debts = db.debts.filter(
    (d) =>
      isRecord(d) &&
      typeof d.id === 'string' &&
      Number.isInteger(d.originalAmount) &&
      d.originalAmount > 0 &&
      Array.isArray(d.payments),
  );

  return db;
}

export interface LoadResult {
  db: Database;
  /** 'seed' = first run or recovered from corrupt storage, 'storage' = loaded */
  source: 'seed' | 'storage';
}

export function loadDatabase(): LoadResult {
  if (typeof window === 'undefined') {
    return { db: createSeedDatabase(), source: 'seed' };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.database);
    if (!raw) return { db: createSeedDatabase(), source: 'seed' };
    const parsed: unknown = JSON.parse(raw);
    const db = sanitizeDatabase(migrateDatabase(parsed));
    if (!db) {
      console.warn('[sakura-ledger] Stored data was malformed or outdated; falling back to the demo dataset.');
      return { db: createSeedDatabase(), source: 'seed' };
    }
    return { db, source: 'storage' };
  } catch (err) {
    console.warn('[sakura-ledger] Could not read stored data; falling back to the demo dataset.', err);
    return { db: createSeedDatabase(), source: 'seed' };
  }
}

/** Persist the whole database. Returns false when storage is unavailable/full. */
export function saveDatabase(db: Database): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(STORAGE_KEYS.database, JSON.stringify(db));
    return true;
  } catch (err) {
    console.error('[sakura-ledger] Failed to persist data (storage full or blocked).', err);
    return false;
  }
}

export function clearDatabase(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEYS.database);
  } catch (err) {
    console.warn('[sakura-ledger] Could not clear stored data.', err);
  }
}

/** Parse + validate a backup file's text. Nothing is written unless ok. */
export function parseBackup(text: string): { ok: boolean; db?: Database; errors: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['File is not valid JSON.'] };
  }
  const check = validateBackup(parsed);
  if (!check.ok) return { ok: false, errors: check.errors };
  // v1 backups are upgraded in place by the same migration used on load.
  const db = sanitizeDatabase(migrateDatabase(parsed));
  if (!db) return { ok: false, errors: ['Backup did not match the expected data shape.'] };
  return { ok: true, db, errors: [] };
}
