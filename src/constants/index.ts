// ============================================
// Static reference data: categories, payment methods, navigation.
// Category / payment method instances live in the Database so users
// can add their own; these arrays seed the defaults.
// ============================================

import type { Category, PaymentMethod } from '../types';

export const APP_NAME = 'Sakura Ledger';

export const DEFAULT_CURRENCY = 'PHP';

export const BUILTIN_CATEGORIES: Category[] = [
  // Income
  { id: 'cat-salary', name: 'Salary', type: 'income', color: '#10B981', builtin: true },
  { id: 'cat-allowance', name: 'Allowance', type: 'income', color: '#34D399', builtin: true },
  { id: 'cat-freelance', name: 'Freelance', type: 'income', color: '#2DD4BF', builtin: true },
  { id: 'cat-business', name: 'Business Income', type: 'income', color: '#4ADE80', builtin: true },
  { id: 'cat-interest', name: 'Interest', type: 'income', color: '#A3E635', builtin: true },
  { id: 'cat-other-income', name: 'Other Income', type: 'income', color: '#86EFAC', builtin: true },
  // Expenses
  { id: 'cat-food', name: 'Food', type: 'expense', color: '#F7A8B8', builtin: true },
  { id: 'cat-transportation', name: 'Transportation', type: 'expense', color: '#7EC8E3', builtin: true },
  { id: 'cat-bills', name: 'Bills', type: 'expense', color: '#B9A7F5', builtin: true },
  { id: 'cat-education', name: 'Education', type: 'expense', color: '#F59E0B', builtin: true },
  { id: 'cat-shopping', name: 'Shopping', type: 'expense', color: '#E879A0', builtin: true },
  { id: 'cat-entertainment', name: 'Entertainment', type: 'expense', color: '#FBBF24', builtin: true },
  { id: 'cat-gaming', name: 'Gaming', type: 'expense', color: '#818CF8', builtin: true },
  { id: 'cat-healthcare', name: 'Healthcare', type: 'expense', color: '#F87171', builtin: true },
  { id: 'cat-subscriptions', name: 'Subscriptions', type: 'expense', color: '#60A5FA', builtin: true },
  { id: 'cat-savings', name: 'Savings', type: 'expense', color: '#10B981', builtin: true },
  { id: 'cat-debt-payment', name: 'Debt Payment', type: 'expense', color: '#6366F1', builtin: true },
  { id: 'cat-other-expense', name: 'Other Expenses', type: 'expense', color: '#94A3B8', builtin: true },
];

export const BUILTIN_PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'pm-cash', name: 'Cash', builtin: true },
  { id: 'pm-bank-transfer', name: 'Bank Transfer', builtin: true },
  { id: 'pm-debit-card', name: 'Debit Card', builtin: true },
  { id: 'pm-credit-card', name: 'Credit Card', builtin: true },
  { id: 'pm-e-wallet', name: 'E-Wallet', builtin: true },
  { id: 'pm-other', name: 'Other', builtin: true },
];

export interface NavItem {
  label: string;
  link: string;
  /** lucide icon name resolved in the Sidebar */
  icon: string;
}

/** Single source of truth for primary navigation. */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', link: '/dashboard', icon: 'LayoutDashboard' },
  { label: 'Accounts', link: '/accounts', icon: 'Landmark' },
  { label: 'Transactions', link: '/transactions', icon: 'ArrowLeftRight' },
  { label: 'Budgets', link: '/budgets', icon: 'Wallet' },
  { label: 'Goals', link: '/goals', icon: 'Target' },
  { label: 'Debts', link: '/debts', icon: 'HandCoins' },
  { label: 'Analytics', link: '/analytics', icon: 'ChartLine' },
  { label: 'Insights', link: '/insights', icon: 'Activity' },
  { label: 'Simulator', link: '/simulator', icon: 'FlaskConical' },
  { label: 'Reports', link: '/reports', icon: 'FileBarChart' },
  { label: 'Calendar', link: '/calendar', icon: 'CalendarDays' },
  { label: 'Settings', link: '/settings', icon: 'Settings' },
];

export const CHART_PALETTE = [
  '#F7A8B8',
  '#B9A7F5',
  '#7EC8E3',
  '#F59E0B',
  '#10B981',
  '#E879A0',
  '#818CF8',
  '#FBBF24',
  '#60A5FA',
  '#94A3B8',
];

export const STORAGE_KEYS = {
  database: 'sakura-ledger:db:v1',
  auth: 'sakura-ledger:auth:v1',
} as const;

/**
 * Schema versions:
 *  v1 — single aggregate ledger, opening balance in settings.openingBalance.
 *  v2 — multi-account: Database.accounts, every transaction has an account,
 *       per-account opening balances; settings.openingBalance is legacy (0).
 * Stored data stays under the same localStorage key; older shapes are
 * migrated in-memory on load (see data/migrate.ts).
 */
export const DB_VERSION = 2;

/** Days ahead a deadline counts as "due soon" on dashboards/calendars. */
export const DUE_SOON_DAYS = 7;
