import { describe, expect, it } from 'vitest';

import { BUILTIN_CATEGORIES, BUILTIN_PAYMENT_METHODS } from '../constants';
import type { Account } from '../types';
import { SUGGESTED_ACCOUNT_NAMES, validateAccountInput, validateBudgetInput, validateDebtInput, validateGoalInput, validatePaymentInput, validateTransactionInput, validateBackup, ValidationError, type TransactionInput } from './validate';

const accounts: Account[] = [
  {
    id: 'acct-cash',
    name: 'Cash',
    group: 'held',
    openingBalance: 0,
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'acct-old',
    name: 'Old Wallet',
    group: 'held',
    openingBalance: 0,
    archived: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const db = { categories: BUILTIN_CATEGORIES, paymentMethods: BUILTIN_PAYMENT_METHODS, accounts };

const valid: TransactionInput = {
  date: '2026-10-01',
  description: 'Lunch',
  type: 'expense',
  category: 'cat-food',
  amount: '450.00',
  paymentMethod: 'pm-cash',
  account: 'acct-cash',
};

describe('validateTransactionInput', () => {
  it('accepts a valid transaction', () => {
    expect(validateTransactionInput(valid, db)).toEqual({});
  });

  it('rejects missing description', () => {
    expect(validateTransactionInput({ ...valid, description: '   ' }, db).description).toBeTruthy();
  });

  it('rejects missing or malformed dates', () => {
    expect(validateTransactionInput({ ...valid, date: '' }, db).date).toBeTruthy();
    expect(validateTransactionInput({ ...valid, date: 'not-a-date' }, db).date).toBeTruthy();
    expect(validateTransactionInput({ ...valid, date: '2026-13-45' }, db).date).toBeTruthy();
  });

  it('rejects zero, negative and malformed amounts', () => {
    expect(validateTransactionInput({ ...valid, amount: '0' }, db).amount).toBeTruthy();
    expect(validateTransactionInput({ ...valid, amount: '-50' }, db).amount).toBeTruthy();
    expect(validateTransactionInput({ ...valid, amount: '12.345' }, db).amount).toBeTruthy();
    expect(validateTransactionInput({ ...valid, amount: 'abc' }, db).amount).toBeTruthy();
    expect(validateTransactionInput({ ...valid, amount: '' }, db).amount).toBeTruthy();
  });

  it('rejects invalid categories and category/type mismatches', () => {
    expect(validateTransactionInput({ ...valid, category: 'cat-missing' }, db).category).toBeTruthy();
    expect(validateTransactionInput({ ...valid, type: 'income', category: 'cat-food' }, db).category).toBeTruthy();
  });

  it('rejects unknown payment methods', () => {
    expect(validateTransactionInput({ ...valid, paymentMethod: 'pm-nope' }, db).paymentMethod).toBeTruthy();
  });

  it('requires an existing account', () => {
    expect(validateTransactionInput({ ...valid, account: '' }, db).account).toBeTruthy();
    expect(validateTransactionInput({ ...valid, account: 'acct-missing' }, db).account).toBeTruthy();
  });

  it('rejects archived accounts for new transactions but allows them on their own historical edits', () => {
    // New transaction onto an archived account → rejected.
    expect(validateTransactionInput({ ...valid, account: 'acct-old' }, db).account).toBeTruthy();
    // Editing the historical transaction that already lives there → allowed.
    expect(
      validateTransactionInput({ ...valid, account: 'acct-old' }, db, { previousAccountId: 'acct-old' }),
    ).toEqual({});
    // Moving a transaction FROM an archived account to an active one → allowed.
    expect(
      validateTransactionInput({ ...valid, account: 'acct-cash' }, db, { previousAccountId: 'acct-old' }),
    ).toEqual({});
  });
});

describe('validateAccountInput', () => {
  const base = { name: 'GCash', group: 'held' as const, openingBalance: '1500.00' };

  it('accepts a valid account', () => {
    expect(validateAccountInput(base, accounts)).toEqual({});
  });

  it('accepts an empty starting balance as zero', () => {
    expect(validateAccountInput({ ...base, openingBalance: '' }, accounts)).toEqual({});
  });

  it('rejects empty and duplicate names (case-insensitive)', () => {
    expect(validateAccountInput({ ...base, name: '  ' }, accounts).name).toBeTruthy();
    expect(validateAccountInput({ ...base, name: 'cash' }, accounts).name).toBeTruthy();
    // Editing an account may keep its own name.
    expect(validateAccountInput({ ...base, name: 'Cash', group: 'held' }, accounts, 'acct-cash')).toEqual({});
  });

  it('rejects malformed starting balances and invalid groups', () => {
    expect(validateAccountInput({ ...base, openingBalance: 'abc' }, accounts).openingBalance).toBeTruthy();
    expect(validateAccountInput({ ...base, openingBalance: '10.123' }, accounts).openingBalance).toBeTruthy();
    expect(validateAccountInput({ ...base, openingBalance: '1000000001' }, accounts).openingBalance).toBeTruthy();
    expect(
      validateAccountInput({ ...base, group: 'elsewhere' as unknown as 'held' }, accounts).group,
    ).toBeTruthy();
  });

  it('exposes starter-name suggestions', () => {
    expect(SUGGESTED_ACCOUNT_NAMES).toContain('Cash');
    expect(SUGGESTED_ACCOUNT_NAMES).toContain('GCash');
  });
});

describe('validateBudgetInput', () => {
  const base = { categoryId: 'cat-food', period: 'monthly' as const, periodKey: '2026-10', limit: '5000' };

  it('accepts a valid budget', () => {
    expect(validateBudgetInput(base, db)).toEqual({});
  });

  it('rejects income categories and bad limits', () => {
    expect(validateBudgetInput({ ...base, categoryId: 'cat-salary' }, db).categoryId).toBeTruthy();
    expect(validateBudgetInput({ ...base, limit: '0' }, db).limit).toBeTruthy();
    expect(validateBudgetInput({ ...base, periodKey: '2026-13' }, db).periodKey).toBeTruthy();
    expect(validateBudgetInput({ ...base, period: 'yearly', periodKey: '2026-10' }, db).periodKey).toBeTruthy();
  });
});

describe('validateGoalInput', () => {
  it('rejects empty titles and non-positive targets', () => {
    expect(validateGoalInput({ title: '', target: '100', saved: '0' }).title).toBeTruthy();
    expect(validateGoalInput({ title: 'Trip', target: '0', saved: '0' }).target).toBeTruthy();
    expect(validateGoalInput({ title: 'Trip', target: '-5', saved: '0' }).target).toBeTruthy();
    expect(validateGoalInput({ title: 'Trip', target: '100', saved: '-1' }).saved).toBeTruthy();
    expect(validateGoalInput({ title: 'Trip', target: '100', saved: '10', deadline: 'nope' }).deadline).toBeTruthy();
  });

  it('accepts a valid goal', () => {
    expect(validateGoalInput({ title: 'Trip', target: '120000', saved: '35000', deadline: '2027-06-01' })).toEqual({});
  });
});

describe('validateDebtInput / validatePaymentInput', () => {
  it('validates debt fields', () => {
    expect(validateDebtInput({ direction: 'iOwe', party: '', originalAmount: '100' }).party).toBeTruthy();
    expect(validateDebtInput({ direction: 'iOwe', party: 'Bank', originalAmount: '0' }).originalAmount).toBeTruthy();
    expect(validateDebtInput({ direction: 'iOwe', party: 'Bank', originalAmount: '100', dueDate: 'bad' }).dueDate).toBeTruthy();
  });

  it('caps payments at the remaining balance (prevents overpayment)', () => {
    const remaining = 50000; // ₱500.00
    expect(validatePaymentInput({ date: '2026-10-01', amount: '500.00' }, remaining)).toEqual({});
    expect(validatePaymentInput({ date: '2026-10-01', amount: '500.01' }, remaining).amount).toBeTruthy();
    expect(validatePaymentInput({ date: '2026-10-01', amount: '0' }, remaining).amount).toBeTruthy();
    expect(validatePaymentInput({ date: 'bad', amount: '10.00' }, remaining).date).toBeTruthy();
  });
});

describe('ValidationError', () => {
  it('carries field-level errors', () => {
    const err = new ValidationError({ amount: 'Required' });
    expect(err).toBeInstanceOf(Error);
    expect(err.fields).toEqual({ amount: 'Required' });
    expect(err.message).toContain('Required');
  });
});

describe('validateBackup', () => {
  const good = {
    version: 1,
    settings: { theme: 'light', colorTheme: 'sakura', currency: 'PHP', dateFormat: 'YYYY-MM-DD', openingBalance: 0, compactSidebar: false },
    profile: { name: 'A', email: 'a@b.c' },
    categories: BUILTIN_CATEGORIES,
    paymentMethods: BUILTIN_PAYMENT_METHODS,
    transactions: [
      {
        id: 'txn-1',
        date: '2026-10-01',
        description: 'ok',
        type: 'expense',
        category: 'cat-food',
        paymentMethod: 'pm-cash',
        amount: 10000,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    ],
    budgets: [],
    goals: [],
    debts: [],
  };

  it('accepts a well-formed backup', () => {
    expect(validateBackup(good)).toEqual({ ok: true, errors: [] });
  });

  it('accepts v2 multi-account backups and requires their accounts array', () => {
    const v2 = {
      ...good,
      version: 2,
      accounts: [
        {
          id: 'acct-cash',
          name: 'Cash',
          group: 'held',
          openingBalance: 0,
          archived: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };
    expect(validateBackup(v2)).toEqual({ ok: true, errors: [] });
    expect(validateBackup({ ...v2, accounts: undefined }).ok).toBe(false);
  });

  it('rejects wrong versions, missing arrays and malformed rows', () => {
    expect(validateBackup({ ...good, version: 99 }).ok).toBe(false);
    expect(validateBackup({ ...good, transactions: undefined }).ok).toBe(false);
    expect(validateBackup({ ...good, transactions: [{ id: 1, date: 'x' }] }).ok).toBe(false);
    expect(validateBackup(null).ok).toBe(false);
    expect(validateBackup('string').ok).toBe(false);
    // Negative amount must not pass.
    expect(
      validateBackup({
        ...good,
        transactions: [{ ...good.transactions[0], amount: -100 }],
      }).ok,
    ).toBe(false);
  });
});
