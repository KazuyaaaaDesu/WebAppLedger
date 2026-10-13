// ============================================
// Domain types for Sakura Ledger
// All monetary amounts are integer centavos (1 PHP = 100 centavos).
// All dates are ISO strings: 'YYYY-MM-DD' for day granularity,
// ISO timestamps for createdAt/updatedAt.
// ============================================

export type TransactionType = 'income' | 'expense';

/**
 * Account grouping:
 *  - 'held'   = money on hand / in active wallets & banks
 *  - 'stashed' = money set aside (savings, deposits, rainy-day funds)
 */
export type AccountGroup = 'held' | 'stashed';

export interface Account {
  id: string;
  name: string;
  group: AccountGroup;
  /** Starting balance in centavos (can be negative). Current balance is derived. */
  openingBalance: number;
  /** Archived accounts keep history but cannot receive new transactions. */
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  /** ISO calendar date the transaction occurred: YYYY-MM-DD */
  date: string;
  description: string;
  type: TransactionType;
  /** Category id from Database.categories */
  category: string;
  /** Always a positive integer amount in centavos. Sign is implied by `type`. */
  amount: number;
  /** Payment method id from Database.paymentMethods */
  paymentMethod: string;
  /** Account id from Database.accounts — required on every transaction. */
  account: string;
  /** Optional reference / receipt number */
  reference?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type BudgetPeriod = 'monthly' | 'yearly';

export interface Budget {
  id: string;
  categoryId: string;
  /** 'monthly' budgets bound to a month, 'yearly' budgets bound to a year */
  period: BudgetPeriod;
  /** Month key 'YYYY-MM' when period === 'monthly', year key 'YYYY' when 'yearly' */
  periodKey: string;
  /** Spending limit in centavos; must be > 0 */
  limit: number;
  notes?: string;
}

export interface SavingsGoal {
  id: string;
  title: string;
  description?: string;
  /** Target amount in centavos, must be > 0 */
  target: number;
  /** Manually maintained current savings in centavos, >= 0 */
  saved: number;
  /** Optional deadline YYYY-MM-DD */
  deadline?: string;
  createdAt: string;
}

export type DebtDirection = 'iOwe' | 'owedToMe';

export interface DebtPayment {
  id: string;
  date: string;
  /** Positive centavos */
  amount: number;
  notes?: string;
}

export interface Debt {
  id: string;
  direction: DebtDirection;
  /** Person or institution */
  party: string;
  /** Original principal in centavos, > 0 */
  originalAmount: number;
  dueDate?: string;
  notes?: string;
  createdAt: string;
  payments: DebtPayment[];
}

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  /** Hex color used by charts */
  color: string;
  builtin: boolean;
}

export interface PaymentMethod {
  id: string;
  name: string;
  builtin: boolean;
}

export type ThemeMode = 'light' | 'dark';
export type ColorTheme = 'sakura' | 'ocean' | 'mint' | 'sunset' | 'lavender';
export type DateFormat = 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY';

export interface Settings {
  theme: ThemeMode;
  /** Accent palette preference, independent from light/dark mode. */
  colorTheme: ColorTheme;
  currency: 'PHP';
  dateFormat: DateFormat;
  /**
   * LEGACY (pre-multi-account). Kept only so v1 backups keep their shape;
   * v2 databases store per-account opening balances on Account.openingBalance
   * and this field is always 0 after migration.
   */
  openingBalance: number;
  /** Show the sidebar compact (persisted UI preference) */
  compactSidebar: boolean;
}

export interface Profile {
  name: string;
  email: string;
}

export interface Database {
  /** Schema version — bumped when the stored shape changes */
  version: number;
  profile: Profile;
  settings: Settings;
  accounts: Account[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  transactions: Transaction[];
  budgets: Budget[];
  goals: SavingsGoal[];
  debts: Debt[];
}

// ---------- Query / filter types ----------

export interface TransactionFilters {
  search?: string;
  /** Inclusive YYYY-MM-DD bounds */
  from?: string;
  to?: string;
  type?: TransactionType | 'all';
  category?: string;
  paymentMethod?: string;
  /** Account id, or 'all' */
  account?: string;
  sortKey?: 'date' | 'amount';
  sortDir?: 'asc' | 'desc';
}

export type PeriodKey = 'thisMonth' | 'lastMonth' | 'thisYear' | 'all' | 'custom';

export interface PeriodSelection {
  key: PeriodKey;
  /** Present only when key === 'custom' */
  from?: string;
  to?: string;
}

export interface DateRange {
  /** inclusive */
  from: string;
  /** inclusive */
  to: string;
}

// ---------- Derived / report types ----------

export interface Totals {
  income: number;
  expense: number;
  net: number;
  count: number;
}

/** Derived (never stored) position of one account. */
export interface AccountBalance {
  account: Account;
  /** openingBalance + income − expenses (+ future transfer effects) */
  balance: number;
  income: number;
  expense: number;
  count: number;
}

export interface RunningBalanceRow {
  transaction: Transaction;
  balance: number;
}

export interface MonthPoint {
  /** 'YYYY-MM' */
  key: string;
  label: string;
  income: number;
  expense: number;
  net: number;
}

export interface CategorySlice {
  categoryId: string;
  name: string;
  color: string;
  amount: number;
  percent: number;
}

export interface BudgetStatus {
  budget: Budget;
  categoryName: string;
  color: string;
  spent: number;
  remaining: number;
  /** 0..N (can exceed 1 when overspent) */
  ratio: number;
  exceeded: boolean;
}

export interface GoalStatus {
  goal: SavingsGoal;
  remaining: number;
  ratio: number;
  /** 'completed' | 'active' | 'dueSoon' | 'overdue' */
  status: 'completed' | 'active' | 'dueSoon' | 'overdue';
}

export interface DebtStatus {
  debt: Debt;
  paid: number;
  remaining: number;
  status: 'settled' | 'overdue' | 'dueSoon' | 'open';
}
