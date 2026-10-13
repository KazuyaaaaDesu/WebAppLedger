// ============================================
// Regression tests for the financial health metrics, insight generation
// and recommendation rules. Every case below uses explicit fixture data so
// a broken calculation can never hide behind the demo seed.
// ============================================

import { describe, expect, it } from 'vitest';

import { BUILTIN_CATEGORIES, BUILTIN_PAYMENT_METHODS, DB_VERSION } from '../constants';
import { createSeedDatabase } from '../data/seed';
import type { Account, Budget, Database, Transaction } from '../types';
import { monthRange, toCents } from './finance';
import {
  budgetAlerts,
  categoryMonthChanges,
  categoryTimeSeries,
  emergencyFundCoverage,
  generateInsights,
  generateRecommendations,
  largestExpenseCategory,
  monthOverMonthExpense,
  periodHealth,
} from './insights';

/** 15 October 2026 — mid-month so "days remaining in month" is meaningful. */
const NOW = new Date(2026, 9, 15);

let seq = 0;
function txn(p: {
  date: string;
  type: 'income' | 'expense';
  amount: number;
  category?: string;
}): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    date: p.date,
    description: 'Fixture entry',
    type: p.type,
    category: p.category ?? (p.type === 'income' ? 'cat-salary' : 'cat-food'),
    amount: toCents(p.amount),
    paymentMethod: 'pm-cash',
    account: 'acct-main',
    createdAt: `${p.date}T08:00:00.000Z`,
    updatedAt: `${p.date}T08:00:00.000Z`,
  };
}

const FIXTURE_ACCOUNTS: Account[] = [
  {
    id: 'acct-main',
    name: 'Cash',
    group: 'held',
    openingBalance: 0,
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

function dbWith(partial: Partial<Database>): Database {
  return {
    version: DB_VERSION,
    profile: { name: 'Test', email: 'test@example.com' },
    settings: {
      theme: 'light',
      colorTheme: 'sakura',
      currency: 'PHP',
      dateFormat: 'YYYY-MM-DD',
      openingBalance: 0,
      compactSidebar: false,
    },
    accounts: FIXTURE_ACCOUNTS.map((a) => ({ ...a })),
    categories: BUILTIN_CATEGORIES.map((c) => ({ ...c })),
    paymentMethods: BUILTIN_PAYMENT_METHODS.map((p) => ({ ...p })),
    transactions: [],
    budgets: [],
    goals: [],
    debts: [],
    ...partial,
  };
}

function budget(
  partial: Partial<Budget> & Pick<Budget, 'categoryId' | 'period' | 'periodKey' | 'limit'>,
): Budget {
  return { id: `budget-${partial.categoryId}-${partial.periodKey}`, ...partial };
}

// ---------------------------------------------------------------------------

describe('periodHealth', () => {
  it('computes savings rate and expense-to-income from totals', () => {
    const health = periodHealth({
      income: toCents(100000),
      expense: toCents(75000),
      net: toCents(25000),
      count: 4,
    });
    expect(health.savingsRate).toBeCloseTo(0.25, 10);
    expect(health.expenseToIncome).toBeCloseTo(0.75, 10);
  });

  it('returns nulls instead of dividing by zero when income is 0', () => {
    const health = periodHealth({
      income: 0,
      expense: toCents(50000),
      net: -toCents(50000),
      count: 2,
    });
    expect(health.savingsRate).toBeNull();
    expect(health.expenseToIncome).toBeNull();
  });

  it('returns nulls for an empty period', () => {
    const health = periodHealth({ income: 0, expense: 0, net: 0, count: 0 });
    expect(health.savingsRate).toBeNull();
    expect(health.expenseToIncome).toBeNull();
  });
});

describe('monthOverMonthExpense', () => {
  it('compares the current calendar month against the previous one', () => {
    const txns = [
      txn({ date: '2026-10-05', type: 'expense', amount: 500 }),
      txn({ date: '2026-09-05', type: 'expense', amount: 400 }),
      txn({ date: '2026-10-01', type: 'income', amount: 10000 }), // ignored
    ];
    const mom = monthOverMonthExpense(txns, NOW);
    expect(mom.currentKey).toBe('2026-10');
    expect(mom.previousKey).toBe('2026-09');
    expect(mom.current).toBe(toCents(500));
    expect(mom.previous).toBe(toCents(400));
    expect(mom.diff).toBe(toCents(100));
    expect(mom.percent).toBeCloseTo(0.25, 10);
  });

  it('gives a null percent when the previous month has no spending', () => {
    const mom = monthOverMonthExpense([txn({ date: '2026-10-05', type: 'expense', amount: 500 })], NOW);
    expect(mom.previous).toBe(0);
    expect(mom.percent).toBeNull();
    expect(mom.diff).toBe(toCents(500));
  });

  it('reports a zero diff for identical months', () => {
    const mom = monthOverMonthExpense(
      [
        txn({ date: '2026-10-05', type: 'expense', amount: 300 }),
        txn({ date: '2026-09-05', type: 'expense', amount: 300 }),
      ],
      NOW,
    );
    expect(mom.diff).toBe(0);
    expect(mom.percent).toBe(0);
  });
});

describe('categoryMonthChanges', () => {
  it('flags a significant month-over-month increase with real amounts', () => {
    const db = dbWith({
      transactions: [
        txn({ date: '2026-10-04', type: 'expense', amount: 1000, category: 'cat-food' }),
        txn({ date: '2026-09-04', type: 'expense', amount: 800, category: 'cat-food' }),
      ],
    });
    const changes = categoryMonthChanges(db, NOW);
    expect(changes).toHaveLength(1);
    expect(changes[0].categoryId).toBe('cat-food');
    expect(changes[0].current).toBe(toCents(1000));
    expect(changes[0].previous).toBe(toCents(800));
    expect(changes[0].percent).toBeCloseTo(0.25, 10);
  });

  it('ignores changes below the 10% / ₱50 thresholds', () => {
    const db = dbWith({
      transactions: [
        txn({ date: '2026-10-04', type: 'expense', amount: 810, category: 'cat-food' }),
        txn({ date: '2026-09-04', type: 'expense', amount: 800, category: 'cat-food' }),
      ],
    });
    expect(categoryMonthChanges(db, NOW)).toHaveLength(0);
  });

  it('ignores categories with no spending in the previous month', () => {
    const db = dbWith({
      transactions: [txn({ date: '2026-10-04', type: 'expense', amount: 1000, category: 'cat-food' })],
    });
    expect(categoryMonthChanges(db, NOW)).toHaveLength(0);
  });
});

describe('largestExpenseCategory', () => {
  it('returns the biggest expense category in range', () => {
    const txns = [
      txn({ date: '2026-10-04', type: 'expense', amount: 300, category: 'cat-food' }),
      txn({ date: '2026-10-06', type: 'expense', amount: 100, category: 'cat-transportation' }),
    ];
    const largest = largestExpenseCategory(txns, BUILTIN_CATEGORIES, null);
    expect(largest?.categoryId).toBe('cat-food');
    expect(largest?.amount).toBe(toCents(300));
  });

  it('returns null when the range contains no expenses', () => {
    const txns = [txn({ date: '2026-10-04', type: 'income', amount: 900 })];
    expect(largestExpenseCategory(txns, BUILTIN_CATEGORIES, null)).toBeNull();
  });
});

describe('budgetAlerts', () => {
  it('flags budgets at or over 85% and hides healthy ones', () => {
    const db = dbWith({
      transactions: [
        txn({ date: '2026-10-03', type: 'expense', amount: 8500, category: 'cat-food' }),
        txn({ date: '2026-10-07', type: 'expense', amount: 11000, category: 'cat-bills' }),
        txn({ date: '2026-10-08', type: 'expense', amount: 5000, category: 'cat-shopping' }),
      ],
      budgets: [
        budget({ categoryId: 'cat-food', period: 'monthly', periodKey: '2026-10', limit: toCents(10000) }),
        budget({ categoryId: 'cat-bills', period: 'monthly', periodKey: '2026-10', limit: toCents(10000) }),
        budget({ categoryId: 'cat-shopping', period: 'monthly', periodKey: '2026-10', limit: toCents(10000) }),
      ],
    });
    const alerts = budgetAlerts(db.budgets, db.transactions, db.categories);
    expect(alerts).toHaveLength(2);
    expect(alerts[0].level).toBe('over'); // sorted by ratio desc
    expect(alerts[0].status.budget.categoryId).toBe('cat-bills');
    expect(alerts[1].level).toBe('near');
    expect(alerts[1].status.ratio).toBeCloseTo(0.85, 10);
  });

  it('returns nothing for an empty ledger', () => {
    expect(budgetAlerts([], [], BUILTIN_CATEGORIES)).toHaveLength(0);
  });
});

describe('emergencyFundCoverage', () => {
  it('divides the current balance by average monthly expenses', () => {
    const txns = [
      txn({ date: '2026-10-02', type: 'income', amount: 20000 }),
      txn({ date: '2026-10-05', type: 'expense', amount: 10000 }),
    ];
    const est = emergencyFundCoverage(txns, toCents(50000), NOW);
    expect(est).not.toBeNull();
    expect(est!.balance).toBe(toCents(50000) + toCents(20000) - toCents(10000));
    expect(est!.averageMonthlyExpense).toBe(toCents(10000));
    expect(est!.monthsSampled).toBe(1);
    expect(est!.months).toBeCloseTo(6, 10);
  });

  it('averages only months that contain recorded activity', () => {
    const txns = [
      txn({ date: '2026-08-05', type: 'expense', amount: 2000 }),
      txn({ date: '2026-10-05', type: 'expense', amount: 1000 }),
    ];
    const est = emergencyFundCoverage(txns, 0, NOW);
    expect(est!.monthsSampled).toBe(2);
    expect(est!.averageMonthlyExpense).toBe(Math.round((toCents(2000) + toCents(1000)) / 2));
  });

  it('returns null for an empty ledger', () => {
    expect(emergencyFundCoverage([], 0, NOW)).toBeNull();
  });

  it('returns null when there are no expenses to average', () => {
    const est = emergencyFundCoverage([txn({ date: '2026-10-02', type: 'income', amount: 5000 })], 0, NOW);
    expect(est).toBeNull();
  });

  it('reports 0 months when the balance is not positive', () => {
    const est = emergencyFundCoverage([txn({ date: '2026-10-05', type: 'expense', amount: 5000 })], 0, NOW);
    expect(est!.balance).toBe(-toCents(5000));
    expect(est!.months).toBe(0);
  });

  it('returns null when recorded data is older than the sample window', () => {
    const est = emergencyFundCoverage([txn({ date: '2026-01-05', type: 'expense', amount: 5000 })], 0, NOW);
    expect(est).toBeNull();
  });
});

describe('generateInsights', () => {
  it('returns an empty list for an empty ledger', () => {
    expect(generateInsights(dbWith({}), null, NOW)).toHaveLength(0);
  });

  it('handles zero income without NaN and flags the missing savings rate', () => {
    const db = dbWith({
      transactions: [
        txn({ date: '2026-10-04', type: 'expense', amount: 1000 }),
        txn({ date: '2026-09-04', type: 'expense', amount: 800 }),
      ],
    });
    const list = generateInsights(db, null, NOW);
    expect(list.some((i) => i.id === 'period-no-income')).toBe(true);
    expect(list.some((i) => i.id.startsWith('period-savings'))).toBe(false);
    const text = JSON.stringify(list);
    expect(text).not.toContain('NaN');
    expect(text).not.toContain('Infinity');
  });

  it('reports a positive savings rate with the real percentage', () => {
    const db = dbWith({
      transactions: [
        txn({ date: '2026-10-02', type: 'income', amount: 10000 }),
        txn({ date: '2026-10-05', type: 'expense', amount: 7500 }),
      ],
    });
    const list = generateInsights(db, monthRange('2026-10'), NOW);
    const savings = list.find((i) => i.id === 'period-savings-good');
    expect(savings).toBeDefined();
    expect(savings!.detail).toContain('25');
  });

  it('surfaces a budget that reached its 85% threshold', () => {
    const db = dbWith({
      transactions: [txn({ date: '2026-10-03', type: 'expense', amount: 8500, category: 'cat-food' })],
      budgets: [
        budget({ categoryId: 'cat-food', period: 'monthly', periodKey: '2026-10', limit: toCents(10000) }),
      ],
    });
    const list = generateInsights(db, monthRange('2026-10'), NOW);
    const alert = list.find((i) => i.id.startsWith('budget-near-'));
    expect(alert).toBeDefined();
    expect(alert!.title).toContain('85%');
    expect(alert!.detail).toContain('10,000.00');
    expect(alert!.detail).toContain('1,500.00');
  });

  it('flags an exceeded budget as an error insight with the overage', () => {
    const db = dbWith({
      transactions: [txn({ date: '2026-10-03', type: 'expense', amount: 11000, category: 'cat-bills' })],
      budgets: [
        budget({ categoryId: 'cat-bills', period: 'monthly', periodKey: '2026-10', limit: toCents(10000) }),
      ],
    });
    const list = generateInsights(db, monthRange('2026-10'), NOW);
    const over = list.find((i) => i.id.startsWith('budget-over-'));
    expect(over).toBeDefined();
    expect(over!.tone).toBe('error');
    expect(over!.detail).toContain('over by');
  });

  it('omits month-over-month insights when there is no previous month of data', () => {
    const db = dbWith({
      transactions: [txn({ date: '2026-10-04', type: 'expense', amount: 1000 })],
    });
    const list = generateInsights(db, null, NOW);
    expect(list.some((i) => i.id === 'mom-up' || i.id === 'mom-down')).toBe(false);
  });

  it('includes both comparison amounts in a month-over-month insight', () => {
    const db = dbWith({
      transactions: [
        txn({ date: '2026-10-04', type: 'expense', amount: 1000 }),
        txn({ date: '2026-09-04', type: 'expense', amount: 800 }),
      ],
    });
    const mom = generateInsights(db, null, NOW).find((i) => i.id === 'mom-up');
    expect(mom).toBeDefined();
    expect(mom!.detail).toContain('1,000.00');
    expect(mom!.detail).toContain('800.00');
    expect(mom!.detail).toContain('25%');
  });

  it('produces sane output for the demo seed without NaN or Infinity', () => {
    const seed = createSeedDatabase();
    const list = generateInsights(seed, monthRange('2026-10'), NOW);
    expect(list.length).toBeGreaterThan(0);
    const text = JSON.stringify(list);
    expect(text).not.toContain('NaN');
    expect(text).not.toContain('Infinity');
    expect(text).not.toContain('undefined');
  });

  it('derives coverage from the sum of account opening balances (multi-account consistency)', () => {
    const db = dbWith({
      accounts: [
        { ...FIXTURE_ACCOUNTS[0], openingBalance: toCents(50000) },
        {
          id: 'acct-savings',
          name: 'Passbook',
          group: 'stashed',
          openingBalance: toCents(10000),
          archived: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      transactions: [txn({ date: '2026-10-05', type: 'expense', amount: 10000 })],
    });
    const coverage = generateInsights(db, null, NOW).find((i) => i.id === 'coverage');
    expect(coverage).toBeDefined();
    // balance = (₱50,000 + ₱10,000 openings) − ₱10,000 expense = ₱50,000
    expect(coverage!.detail).toContain('50,000.00');
  });
});

describe('generateRecommendations', () => {
  it('returns nothing for an empty ledger', () => {
    expect(generateRecommendations(dbWith({}), NOW)).toHaveLength(0);
  });

  it('explains a near-limit budget with the exact figures and days left', () => {
    const db = dbWith({
      transactions: [txn({ date: '2026-10-03', type: 'expense', amount: 8500, category: 'cat-food' })],
      budgets: [
        budget({ categoryId: 'cat-food', period: 'monthly', periodKey: '2026-10', limit: toCents(10000) }),
      ],
    });
    const rec = generateRecommendations(db, NOW).find((r) => r.id.startsWith('rec-budget-near-'));
    expect(rec).toBeDefined();
    expect(rec!.why).toContain('85%');
    expect(rec!.why).toContain('10,000.00');
    expect(rec!.why).toContain('remain in 2026-10');
  });

  it('flags a substantial category spike with both monthly amounts', () => {
    const db = dbWith({
      transactions: [
        txn({ date: '2026-10-06', type: 'expense', amount: 1900, category: 'cat-bills' }),
        txn({ date: '2026-09-06', type: 'expense', amount: 600, category: 'cat-bills' }),
      ],
    });
    const rec = generateRecommendations(db, NOW).find((r) => r.id === 'rec-spike-cat-bills');
    expect(rec).toBeDefined();
    expect(rec!.title).toContain('Bills');
    expect(rec!.why).toContain('600.00');
    expect(rec!.why).toContain('1,900.00');
  });

  it('explains a near-zero savings rate in the current month', () => {
    const db = dbWith({
      transactions: [
        txn({ date: '2026-10-02', type: 'income', amount: 10000 }),
        txn({ date: '2026-10-05', type: 'expense', amount: 9500 }),
      ],
    });
    const rec = generateRecommendations(db, NOW).find((r) => r.id === 'rec-savings');
    expect(rec).toBeDefined();
    expect(rec!.why).toContain('5');
    expect(rec!.why).toContain('10,000.00');
  });

  it('always includes a why-line and never claims AI or predictions', () => {
    const db = dbWith({
      transactions: [
        txn({ date: '2026-10-03', type: 'expense', amount: 8500, category: 'cat-food' }),
        txn({ date: '2026-09-03', type: 'expense', amount: 5000, category: 'cat-food' }),
      ],
      budgets: [
        budget({ categoryId: 'cat-food', period: 'monthly', periodKey: '2026-10', limit: toCents(10000) }),
      ],
    });
    const recs = generateRecommendations(db, NOW);
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) expect(r.why.length).toBeGreaterThan(10);
    const text = JSON.stringify(recs);
    expect(text).not.toMatch(/artificial intelligence|AI-powered|predicts/i);
  });
});

describe('categoryTimeSeries', () => {
  it('groups expenses by month with top categories plus Other', () => {
    const txns = [
      txn({ date: '2026-09-04', type: 'expense', amount: 100, category: 'cat-food' }),
      txn({ date: '2026-09-06', type: 'expense', amount: 50, category: 'cat-bills' }),
      txn({ date: '2026-10-04', type: 'expense', amount: 200, category: 'cat-food' }),
      txn({ date: '2026-10-05', type: 'expense', amount: 100, category: 'cat-shopping' }),
      txn({ date: '2026-10-06', type: 'expense', amount: 50, category: 'cat-transportation' }),
      txn({ date: '2026-10-07', type: 'expense', amount: 40, category: 'cat-entertainment' }),
      txn({ date: '2026-10-08', type: 'expense', amount: 30, category: 'cat-gaming' }),
      txn({ date: '2026-10-09', type: 'expense', amount: 20, category: 'cat-healthcare' }),
    ];
    const { points, series } = categoryTimeSeries(txns, BUILTIN_CATEGORIES, null, 5);
    expect(points).toHaveLength(2);
    expect(series[0].id).toBe('cat-food'); // largest total
    expect(series.some((s) => s.id === '__other')).toBe(true);

    const october = points.find((p) => p.key === '2026-10')!;
    const total = Object.values(october.values).reduce((s, v) => s + v, 0);
    expect(total).toBe(toCents(200 + 100 + 50 + 40 + 30 + 20));
    expect(october.values['cat-food']).toBe(toCents(200));
  });

  it('returns empty structures when the range has no expenses', () => {
    const txns = [txn({ date: '2026-10-04', type: 'income', amount: 900 })];
    const { points, series } = categoryTimeSeries(txns, BUILTIN_CATEGORIES, null);
    expect(points).toHaveLength(0);
    expect(series).toHaveLength(0);
  });

  it('respects the selected date range', () => {
    const txns = [
      txn({ date: '2026-09-04', type: 'expense', amount: 100, category: 'cat-food' }),
      txn({ date: '2026-10-04', type: 'expense', amount: 200, category: 'cat-food' }),
    ];
    const { points } = categoryTimeSeries(txns, BUILTIN_CATEGORIES, monthRange('2026-10'));
    expect(points).toHaveLength(1);
    expect(points[0].key).toBe('2026-10');
  });
});
