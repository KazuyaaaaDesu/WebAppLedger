// ============================================
// Seed database — the initial demo dataset used the first time the app
// runs (or after a data reset). It preserves the original mock-data records
// and extends them so every month in the reporting window has consistent
// data. All amounts are converted from pesos to integer centavos here, once.
//
// Nothing outside this file may import the raw JSON: the rest of the app
// only ever sees the validated Database shape from the repository layer.
// ============================================

import legacyTransactionsJson from '../mock-data/transactions.json';
import legacyGoalsJson from '../mock-data/goals.json';
import legacyUserJson from '../mock-data/user.json';

import { BUILTIN_CATEGORIES, BUILTIN_PAYMENT_METHODS, DB_VERSION } from '../constants';
import type { Account, Budget, Database, Debt, SavingsGoal, Transaction } from '../types';
import { toCents } from '../utils/finance';

interface LegacyTxn {
  id: number;
  date: string;
  type: string;
  category: string;
  description: string;
  paymentMethod: string;
  amount: number;
}

interface ExtTxn {
  date: string;
  type: 'income' | 'expense';
  category: string;
  description: string;
  paymentMethod: string;
  amount: number;
  reference?: string;
}

const catId = (name: string): string => {
  const found = BUILTIN_CATEGORIES.find((c) => c.name.toLowerCase() === name.toLowerCase());
  return found?.id ?? 'cat-other-expense';
};

/** Map legacy free-text payment labels onto the built-in method ids. */
const pmId = (name: string): string => {
  const key = name.trim().toLowerCase();
  if (key === 'bank transfer') return 'pm-bank-transfer';
  if (key === 'gcash' || key === 'paypal' || key === 'e-wallet' || key === 'maya') return 'pm-e-wallet';
  if (key === 'visa' || key === 'credit card') return 'pm-credit-card';
  if (key === 'debit card') return 'pm-debit-card';
  if (key === 'cash') return 'pm-cash';
  return 'pm-other';
};

/** Added records so Jun–Oct 2026 all carry realistic activity. */
const EXTRA_TRANSACTIONS: ExtTxn[] = [
  // ---- June 2026 ----
  { date: '2026-06-01', type: 'expense', category: 'Bills', description: 'Electric bill', paymentMethod: 'pm-e-wallet', amount: 3200 },
  { date: '2026-06-02', type: 'expense', category: 'Food', description: 'Grocery market run', paymentMethod: 'pm-cash', amount: 2450 },
  { date: '2026-06-05', type: 'expense', category: 'Transportation', description: 'Commute fare', paymentMethod: 'pm-cash', amount: 900 },
  { date: '2026-06-10', type: 'income', category: 'Salary', description: 'Monthly salary', paymentMethod: 'pm-bank-transfer', amount: 30000, reference: 'SAL-2026-06' },
  { date: '2026-06-12', type: 'expense', category: 'Entertainment', description: 'Movie night', paymentMethod: 'pm-credit-card', amount: 600 },
  { date: '2026-06-15', type: 'expense', category: 'Food', description: 'Family dinner', paymentMethod: 'pm-credit-card', amount: 1750 },
  { date: '2026-06-18', type: 'expense', category: 'Subscriptions', description: 'Netflix subscription', paymentMethod: 'pm-credit-card', amount: 549 },
  { date: '2026-06-22', type: 'expense', category: 'Shopping', description: 'Running shoes', paymentMethod: 'pm-debit-card', amount: 2900 },
  { date: '2026-06-25', type: 'expense', category: 'Education', description: 'Review center payment', paymentMethod: 'pm-cash', amount: 1200 },
  { date: '2026-06-28', type: 'expense', category: 'Food', description: 'Convenience store snacks', paymentMethod: 'pm-cash', amount: 380 },

  // ---- July 2026 (original mock records live alongside these) ----
  { date: '2026-07-01', type: 'expense', category: 'Bills', description: 'Internet bill', paymentMethod: 'pm-bank-transfer', amount: 1899, reference: 'ISP-0701' },
  { date: '2026-07-03', type: 'expense', category: 'Food', description: 'Grocery restock', paymentMethod: 'pm-cash', amount: 2100 },
  { date: '2026-07-05', type: 'expense', category: 'Transportation', description: 'Grab rides to campus', paymentMethod: 'pm-e-wallet', amount: 620 },
  { date: '2026-07-06', type: 'income', category: 'Freelance', description: 'Blog article writing', paymentMethod: 'pm-e-wallet', amount: 4500 },
  { date: '2026-07-12', type: 'expense', category: 'Entertainment', description: 'Concert tickets', paymentMethod: 'pm-credit-card', amount: 1500 },
  { date: '2026-07-15', type: 'expense', category: 'Food', description: 'Ramen with friends', paymentMethod: 'pm-cash', amount: 880 },
  { date: '2026-07-18', type: 'expense', category: 'Healthcare', description: 'Pharmacy — allergy meds', paymentMethod: 'pm-cash', amount: 750 },
  { date: '2026-07-20', type: 'expense', category: 'Shopping', description: 'Hoodie', paymentMethod: 'pm-credit-card', amount: 1450 },
  { date: '2026-07-25', type: 'expense', category: 'Subscriptions', description: 'Spotify subscription', paymentMethod: 'pm-credit-card', amount: 199 },
  { date: '2026-07-28', type: 'expense', category: 'Gaming', description: 'Nintendo eShop credit', paymentMethod: 'pm-debit-card', amount: 1120 },

  // ---- August 2026 ----
  { date: '2026-08-01', type: 'expense', category: 'Bills', description: 'Electric bill', paymentMethod: 'pm-e-wallet', amount: 3410 },
  { date: '2026-08-02', type: 'expense', category: 'Food', description: 'Grocery run', paymentMethod: 'pm-cash', amount: 2380 },
  { date: '2026-08-05', type: 'expense', category: 'Transportation', description: 'Weekly commute', paymentMethod: 'pm-cash', amount: 950 },
  { date: '2026-08-08', type: 'income', category: 'Freelance', description: 'Poster design project', paymentMethod: 'pm-e-wallet', amount: 3500 },
  { date: '2026-08-10', type: 'income', category: 'Salary', description: 'Monthly salary', paymentMethod: 'pm-bank-transfer', amount: 30000, reference: 'SAL-2026-08' },
  { date: '2026-08-11', type: 'expense', category: 'Food', description: 'Café study sessions', paymentMethod: 'pm-credit-card', amount: 1250 },
  { date: '2026-08-14', type: 'expense', category: 'Education', description: 'Online course', paymentMethod: 'pm-credit-card', amount: 2499 },
  { date: '2026-08-16', type: 'expense', category: 'Entertainment', description: 'Bowling night', paymentMethod: 'pm-cash', amount: 900 },
  { date: '2026-08-19', type: 'expense', category: 'Subscriptions', description: 'Netflix subscription', paymentMethod: 'pm-credit-card', amount: 549 },
  { date: '2026-08-22', type: 'expense', category: 'Shopping', description: 'Backpack', paymentMethod: 'pm-debit-card', amount: 1800 },
  { date: '2026-08-26', type: 'expense', category: 'Healthcare', description: 'Clinic checkup', paymentMethod: 'pm-cash', amount: 1200 },
  { date: '2026-08-30', type: 'expense', category: 'Food', description: 'Sari-sari store', paymentMethod: 'pm-cash', amount: 260 },

  // ---- September 2026 ----
  { date: '2026-09-01', type: 'expense', category: 'Bills', description: 'Water bill', paymentMethod: 'pm-e-wallet', amount: 620 },
  { date: '2026-09-02', type: 'expense', category: 'Food', description: 'Grocery run', paymentMethod: 'pm-cash', amount: 2650 },
  { date: '2026-09-06', type: 'expense', category: 'Transportation', description: 'Grab to the office', paymentMethod: 'pm-e-wallet', amount: 840 },
  { date: '2026-09-09', type: 'income', category: 'Allowance', description: 'Allowance top-up', paymentMethod: 'pm-bank-transfer', amount: 5000 },
  { date: '2026-09-10', type: 'income', category: 'Salary', description: 'Monthly salary', paymentMethod: 'pm-bank-transfer', amount: 30000, reference: 'SAL-2026-09' },
  { date: '2026-09-12', type: 'expense', category: 'Gaming', description: 'Steam autumn sale', paymentMethod: 'pm-credit-card', amount: 1650 },
  { date: '2026-09-15', type: 'expense', category: 'Food', description: 'Pizza night', paymentMethod: 'pm-credit-card', amount: 990 },
  { date: '2026-09-18', type: 'expense', category: 'Subscriptions', description: 'Spotify subscription', paymentMethod: 'pm-credit-card', amount: 199 },
  { date: '2026-09-20', type: 'expense', category: 'Entertainment', description: 'Manga volumes', paymentMethod: 'pm-cash', amount: 720 },
  { date: '2026-09-23', type: 'expense', category: 'Shopping', description: 'Light jacket', paymentMethod: 'pm-debit-card', amount: 2200 },
  { date: '2026-09-26', type: 'expense', category: 'Healthcare', description: 'Vitamins', paymentMethod: 'pm-cash', amount: 480 },
  { date: '2026-09-29', type: 'expense', category: 'Food', description: 'Coffee beans', paymentMethod: 'pm-cash', amount: 640 },

  // ---- October 2026 (current month) ----
  { date: '2026-10-01', type: 'expense', category: 'Bills', description: 'Internet bill', paymentMethod: 'pm-bank-transfer', amount: 1899, reference: 'ISP-1001' },
  { date: '2026-10-01', type: 'income', category: 'Salary', description: 'Monthly salary', paymentMethod: 'pm-bank-transfer', amount: 30000, reference: 'SAL-2026-10' },
  { date: '2026-10-02', type: 'expense', category: 'Food', description: 'Grocery run', paymentMethod: 'pm-cash', amount: 1980 },
  { date: '2026-10-03', type: 'income', category: 'Allowance', description: 'Weekly allowance', paymentMethod: 'pm-e-wallet', amount: 3000 },
  { date: '2026-10-05', type: 'expense', category: 'Transportation', description: 'Commute fare', paymentMethod: 'pm-cash', amount: 720 },
  { date: '2026-10-07', type: 'expense', category: 'Entertainment', description: 'Arcade hangout', paymentMethod: 'pm-cash', amount: 500 },
  { date: '2026-10-08', type: 'income', category: 'Freelance', description: 'Thumbnail design', paymentMethod: 'pm-e-wallet', amount: 2000 },
  { date: '2026-10-09', type: 'expense', category: 'Food', description: 'Lunch at the cafeteria', paymentMethod: 'pm-cash', amount: 450 },
];

const SEED_BUDGETS: Omit<Budget, 'id'>[] = [
  { categoryId: 'cat-food', period: 'monthly', periodKey: '2026-10', limit: toCents(12000) },
  { categoryId: 'cat-transportation', period: 'monthly', periodKey: '2026-10', limit: toCents(4000) },
  { categoryId: 'cat-bills', period: 'monthly', periodKey: '2026-10', limit: toCents(8000) },
  { categoryId: 'cat-entertainment', period: 'monthly', periodKey: '2026-10', limit: toCents(3000) },
  { categoryId: 'cat-shopping', period: 'monthly', periodKey: '2026-10', limit: toCents(5000) },
  { categoryId: 'cat-subscriptions', period: 'monthly', periodKey: '2026-10', limit: toCents(1000) },
  { categoryId: 'cat-gaming', period: 'monthly', periodKey: '2026-10', limit: toCents(2500) },
  { categoryId: 'cat-food', period: 'monthly', periodKey: '2026-09', limit: toCents(12000) },
  { categoryId: 'cat-bills', period: 'monthly', periodKey: '2026-09', limit: toCents(8000) },
  { categoryId: 'cat-transportation', period: 'monthly', periodKey: '2026-09', limit: toCents(4000) },
  { categoryId: 'cat-education', period: 'yearly', periodKey: '2026', limit: toCents(24000) },
];

/** ISO timestamp helper so identical dates still order deterministically. */
const stamp = (date: string, seq: number): string => `${date}T08:00:${String(seq % 60).padStart(2, '0')}.000Z`;

export function createSeedDatabase(): Database {
  const legacy = (legacyTransactionsJson as { transactions: LegacyTxn[] }).transactions;
  const legacyGoals = (
    legacyGoalsJson as { goals: { id: number; title: string; target: number; saved: number; deadline: string }[] }
  ).goals;
  const legacyUser = legacyUserJson as { user: { name: string; email: string } };

  const transactions: Transaction[] = [];

  // Demo dataset models the classic single-account setup: one Cash wallet
  // carrying the pre-2026 opening balance. Users can add GCash, banks, etc.
  const accounts: Account[] = [
    {
      id: 'acct-cash',
      name: 'Cash',
      group: 'held',
      // Balance carried into 2026 before the earliest seeded transaction.
      openingBalance: toCents(120000),
      archived: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  // Original mock records first (they are the "older" July entries).
  legacy.forEach((t, i) => {
    transactions.push({
      id: `txn-legacy-${t.id}`,
      date: t.date,
      description: t.description,
      type: t.type === 'income' ? 'income' : 'expense',
      category: catId(t.category),
      amount: toCents(t.amount),
      paymentMethod: pmId(t.paymentMethod),
      account: 'acct-cash',
      createdAt: stamp(t.date, i),
      updatedAt: stamp(t.date, i),
    });
  });

  EXTRA_TRANSACTIONS.forEach((t, i) => {
    transactions.push({
      id: `txn-ext-${i + 1}`,
      date: t.date,
      description: t.description,
      type: t.type,
      category: catId(t.category),
      amount: toCents(t.amount),
      paymentMethod: t.paymentMethod,
      account: 'acct-cash',
      reference: t.reference,
      createdAt: stamp(t.date, i),
      updatedAt: stamp(t.date, i),
    });
  });

  const goals: SavingsGoal[] = legacyGoals.map((g, i) => ({
    id: `goal-legacy-${g.id}`,
    title: g.title,
    target: toCents(g.target),
    saved: toCents(g.saved),
    deadline: g.deadline,
    createdAt: `2026-01-0${(i % 9) + 1}T00:00:00.000Z`,
  }));
  goals.push({
    id: 'goal-emergency',
    title: 'Emergency Fund',
    description: 'Three months of basic expenses set aside for rainy days.',
    target: toCents(100000),
    saved: toCents(28000),
    deadline: '2027-03-31',
    createdAt: '2026-02-01T00:00:00.000Z',
  });

  // Legacy debts declared "remaining" amounts; we reconstruct the payment
  // history that produces exactly those remainings (remaining = original - paid).
  const debts: Debt[] = [
    {
      id: 'debt-metrobank',
      direction: 'iOwe',
      party: 'Metrobank Credit Card',
      originalAmount: toCents(15000),
      dueDate: '2026-10-30',
      notes: 'Outstanding card balance from summer expenses.',
      createdAt: '2026-04-01T00:00:00.000Z',
      payments: [
        { id: 'pay-mb-1', date: '2026-05-30', amount: toCents(4000) },
        { id: 'pay-mb-2', date: '2026-06-30', amount: toCents(3000) },
      ],
    },
    {
      id: 'debt-homecredit',
      direction: 'iOwe',
      party: 'Home Credit — Laptop',
      originalAmount: toCents(24000),
      dueDate: '2026-11-15',
      notes: '0% installment plan, ₱4,000 monthly.',
      createdAt: '2026-07-15T00:00:00.000Z',
      payments: [
        { id: 'pay-hc-1', date: '2026-08-15', amount: toCents(4000) },
        { id: 'pay-hc-2', date: '2026-09-15', amount: toCents(4000) },
      ],
    },
    {
      id: 'debt-johncruz',
      direction: 'owedToMe',
      party: 'John Cruz',
      originalAmount: toCents(5000),
      dueDate: '2026-10-25',
      notes: 'Money I lent for a medical expense.',
      createdAt: '2026-05-01T00:00:00.000Z',
      payments: [
        { id: 'pay-jc-1', date: '2026-06-15', amount: toCents(1500) },
        { id: 'pay-jc-2', date: '2026-07-15', amount: toCents(1500) },
      ],
    },
  ];

  return {
    version: DB_VERSION,
    profile: { name: legacyUser.user.name, email: legacyUser.user.email },
    settings: {
      theme: 'light',
      colorTheme: 'sakura',
      currency: 'PHP',
      dateFormat: 'YYYY-MM-DD',
      // Legacy field — the opening balance now lives on the account above.
      openingBalance: 0,
      compactSidebar: false,
    },
    accounts,
    categories: BUILTIN_CATEGORIES.map((c) => ({ ...c })),
    paymentMethods: BUILTIN_PAYMENT_METHODS.map((p) => ({ ...p })),
    transactions,
    budgets: SEED_BUDGETS.map((b, i) => ({ ...b, id: `budget-seed-${i + 1}` })),
    goals,
    debts,
  };
}
