import { beforeEach, describe, expect, it } from 'vitest';

import { BUILTIN_CATEGORIES, BUILTIN_PAYMENT_METHODS, DB_VERSION, STORAGE_KEYS } from '../constants';
import { createSeedDatabase } from '../data/seed';
import { migrateDatabase } from '../data/migrate';
import { loadDatabase, parseBackup, saveDatabase, sanitizeDatabase } from './repository';
import { sumOpeningBalances } from '../utils/finance';

beforeEach(() => {
  window.localStorage.clear();
});

describe('persistence', () => {
  it('saves and reloads the database across "reloads"', () => {
    const db = createSeedDatabase();
    db.transactions = db.transactions.slice(0, 3);
    db.profile.name = 'Persisted User';

    expect(saveDatabase(db)).toBe(true);

    // Simulates a fresh page load: only localStorage survives.
    const reloaded = loadDatabase();
    expect(reloaded.source).toBe('storage');
    expect(reloaded.db.profile.name).toBe('Persisted User');
    expect(reloaded.db.transactions).toHaveLength(3);
    expect(reloaded.db.transactions).toEqual(db.transactions);
    expect(reloaded.db.settings.openingBalance).toBe(db.settings.openingBalance);
  });

  it('falls back to the seed when storage is empty (first run)', () => {
    const result = loadDatabase();
    expect(result.source).toBe('seed');
    expect(result.db.transactions.length).toBeGreaterThan(0);
    expect(result.db.version).toBe(DB_VERSION);
    expect(result.db.accounts.length).toBeGreaterThan(0);
  });

  it('falls back gracefully when stored JSON is malformed', () => {
    window.localStorage.setItem(STORAGE_KEYS.database, '{not json at all');
    const result = loadDatabase();
    expect(result.source).toBe('seed');
    expect(result.db.transactions.length).toBeGreaterThan(0);
  });

  it('falls back gracefully when the stored shape is outdated', () => {
    window.localStorage.setItem(STORAGE_KEYS.database, JSON.stringify({ version: 999, hello: 'world' }));
    expect(loadDatabase().source).toBe('seed');
  });

  it('drops individual malformed transactions but keeps the rest', () => {
    const db = createSeedDatabase();
    const good = db.transactions[0];
    const broken = { ...db.transactions[1], amount: 'not-a-number' };
    const raw = { ...db, transactions: [good, broken, null] };
    const sanitized = sanitizeDatabase(raw);
    expect(sanitized).not.toBeNull();
    expect(sanitized?.transactions).toHaveLength(1);
    expect(sanitized?.transactions[0].id).toBe(good.id);
  });
});

describe('backup import', () => {
  it('accepts a valid backup text and returns the database', () => {
    const db = createSeedDatabase();
    const result = parseBackup(JSON.stringify(db));
    expect(result.ok).toBe(true);
    expect(result.db?.transactions.length).toBe(db.transactions.length);
  });

  it('rejects invalid JSON without touching existing data', () => {
    const result = parseBackup('{"broken": ');
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('not valid JSON');
  });

  it('rejects structurally invalid payloads', () => {
    const result = parseBackup(JSON.stringify({ version: 1, settings: {}, transactions: 'nope' }));
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('seed dataset', () => {
  it('is internally consistent (balances, budgets, debts, goals)', () => {
    const db = createSeedDatabase();

    // Every transaction references known account, category and payment method ids.
    for (const t of db.transactions) {
      expect(db.accounts.some((a) => a.id === t.account)).toBe(true);
      expect(db.categories.some((c) => c.id === t.category)).toBe(true);
      expect(db.paymentMethods.some((p) => p.id === t.paymentMethod)).toBe(true);
      expect(t.amount).toBeGreaterThan(0);
      expect(Number.isInteger(t.amount)).toBe(true);
    }

    // All-time balance should be positive for the demo dataset.
    const income = db.transactions.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = db.transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    expect(sumOpeningBalances(db.accounts) + income - expense).toBeGreaterThan(0);

    // Debt remainings match the original mock data (original - payments).
    const metro = db.debts.find((d) => d.id === 'debt-metrobank');
    expect(metro).toBeDefined();
    const paid = metro!.payments.reduce((s, p) => s + p.amount, 0);
    expect(metro!.originalAmount - paid).toBe(800000); // ₱8,000.00

    const john = db.debts.find((d) => d.id === 'debt-johncruz');
    const johnPaid = john!.payments.reduce((s, p) => s + p.amount, 0);
    expect(john!.originalAmount - johnPaid).toBe(200000); // ₱2,000.00

    // Goals keep their original targets.
    const japan = db.goals.find((g) => g.title === 'Japan Trip');
    expect(japan?.target).toBe(12000000);
    expect(japan?.saved).toBe(3500000);
  });
});

// ---------- v1 → v2 multi-account migration ----------

/** Minimal but complete v1 database as it existed before multi-account. */
function v1Database() {
  return {
    version: 1,
    profile: { name: 'Kazu', email: 'kazu@example.com' },
    settings: {
      theme: 'light',
      colorTheme: 'sakura',
      currency: 'PHP',
      dateFormat: 'YYYY-MM-DD',
      openingBalance: 12000000, // ₱120,000.00
      compactSidebar: false,
    },
    categories: BUILTIN_CATEGORIES.map((c) => ({ ...c })),
    paymentMethods: BUILTIN_PAYMENT_METHODS.map((p) => ({ ...p })),
    transactions: [
      {
        id: 'txn-old-1',
        date: '2026-03-01',
        description: 'Old salary',
        type: 'income',
        category: 'cat-salary',
        amount: 3000000,
        paymentMethod: 'pm-bank-transfer',
        createdAt: '2026-03-01T08:00:00.000Z',
        updatedAt: '2026-03-01T08:00:00.000Z',
      },
      {
        id: 'txn-old-2',
        date: '2026-03-02',
        description: 'Groceries',
        type: 'expense',
        category: 'cat-food',
        amount: 250000,
        paymentMethod: 'pm-cash',
        createdAt: '2026-03-02T08:00:00.000Z',
        updatedAt: '2026-03-02T08:00:00.000Z',
      },
    ],
    budgets: [],
    goals: [{ id: 'goal-1', title: 'Trip', target: 100000, saved: 25000, createdAt: '2026-01-01T00:00:00.000Z' }],
    debts: [],
  };
}

describe('v1 → v2 multi-account migration', () => {
  it('moves the opening balance into one account and assigns every transaction', () => {
    const migrated = migrateDatabase(v1Database()) as {
      version: number;
      settings: { openingBalance: number };
      accounts: { id: string; name: string; group: string; openingBalance: number; archived: boolean }[];
      transactions: { id: string; description: string; amount: number; account?: string }[];
      goals: unknown[];
      profile: unknown;
    };
    expect(migrated.version).toBe(2);
    expect(migrated.accounts).toHaveLength(1);
    expect(migrated.accounts[0].openingBalance).toBe(12000000); // ₱120k preserved
    expect(migrated.settings.openingBalance).toBe(0); // no double counting
    for (const t of migrated.transactions) {
      expect(t.account).toBe(migrated.accounts[0].id);
    }
    // Everything else is untouched.
    expect(migrated.transactions).toHaveLength(2);
    expect(migrated.transactions[0].amount).toBe(3000000);
    expect(migrated.transactions[1].description).toBe('Groceries');
    expect(migrated.goals).toHaveLength(1);
    expect(migrated.profile).toEqual({ name: 'Kazu', email: 'kazu@example.com' });
  });

  it('is idempotent — migrating twice changes nothing further', () => {
    const once = migrateDatabase(v1Database());
    const twice = migrateDatabase(once);
    expect(twice).toEqual(once);
    // And a third pass (e.g. load → save → load) is still stable.
    expect(migrateDatabase(twice)).toEqual(once);
  });

  it('preserves the aggregate balance across the migration', () => {
    const v1 = v1Database();
    const before = v1.settings.openingBalance + 3000000 - 250000;
    const migrated = migrateDatabase(v1) as { accounts: { openingBalance: number }[]; transactions: { type: string; amount: number }[] };
    const after =
      sumOpeningBalances(migrated.accounts) +
      migrated.transactions.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
    expect(after).toBe(before);
  });

  it('upgrades stored v1 data through loadDatabase without losing records', () => {
    window.localStorage.setItem(STORAGE_KEYS.database, JSON.stringify(v1Database()));
    const result = loadDatabase();
    expect(result.source).toBe('storage');
    expect(result.db.version).toBe(2);
    expect(result.db.accounts).toHaveLength(1);
    expect(result.db.transactions).toHaveLength(2);
    expect(result.db.transactions.every((t) => t.account === result.db.accounts[0].id)).toBe(true);
    expect(result.db.accounts[0].openingBalance).toBe(12000000);
  });

  it('imports v1 backups through the same migration', () => {
    const result = parseBackup(JSON.stringify(v1Database()));
    expect(result.ok).toBe(true);
    expect(result.db?.version).toBe(2);
    expect(result.db?.accounts).toHaveLength(1);
    expect(result.db?.transactions).toHaveLength(2);
    expect(result.db?.transactions[0].account).toBe(result.db?.accounts[0].id);
  });

  it('sanitizes migrated data without dropping valid transactions', () => {
    const sanitized = sanitizeDatabase(migrateDatabase(v1Database()));
    expect(sanitized).not.toBeNull();
    expect(sanitized?.transactions).toHaveLength(2);
    expect(sanitized?.accounts).toHaveLength(1);
  });
});
