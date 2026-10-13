// ============================================
// LedgerProvider — single source of truth for the (local) database.
// All mutations validate, apply deterministic state changes, and persist
// through the repository layer. Components never touch localStorage.
//
// The app is frontend-only: localStorage is the single source of truth and
// there is no server synchronization of any kind.
// ============================================

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { createSeedDatabase } from '../data/seed';
import { loadDatabase, parseBackup, saveDatabase } from '../services/repository';
import type {
  Account,
  Budget,
  Category,
  Database,
  Debt,
  DebtPayment,
  PaymentMethod,
  Profile,
  SavingsGoal,
  Settings,
  Transaction,
} from '../types';
import { toCents } from '../utils/finance';
import { uid } from '../utils/id';
import {
  ValidationError,
  validateAccountInput,
  validateBudgetInput,
  validateDebtInput,
  validateGoalInput,
  validatePaymentInput,
  validateTransactionInput,
  type AccountInput,
  type BudgetInput,
  type DebtInput,
  type GoalInput,
  type PaymentInput,
  type TransactionInput,
} from '../utils/validate';

interface LedgerContextValue {
  db: Database;
  /** Where the current dataset came from (shown in Settings). */
  dataSource: 'seed' | 'storage';
  /** False when the last persist attempt failed (storage quota/blocked). */
  persisted: boolean;

  addTransaction: (input: TransactionInput) => Transaction;
  updateTransaction: (id: string, input: TransactionInput) => Transaction;
  deleteTransaction: (id: string) => void;

  addAccount: (input: AccountInput) => Account;
  /** Renames / regroups an account. Starting balance is fixed at creation. */
  updateAccount: (id: string, input: Pick<AccountInput, 'name' | 'group'>) => Account;
  setAccountArchived: (id: string, archived: boolean) => void;

  addBudget: (input: BudgetInput) => Budget;
  updateBudget: (id: string, input: BudgetInput) => Budget;
  deleteBudget: (id: string) => void;

  addGoal: (input: GoalInput) => SavingsGoal;
  updateGoal: (id: string, input: GoalInput) => SavingsGoal;
  deleteGoal: (id: string) => void;

  addDebt: (input: DebtInput) => Debt;
  updateDebt: (id: string, input: DebtInput) => Debt;
  deleteDebt: (id: string) => void;
  addDebtPayment: (debtId: string, input: PaymentInput, options?: { recordInLedger?: boolean }) => DebtPayment;
  deleteDebtPayment: (debtId: string, paymentId: string) => void;

  addCategory: (input: { name: string; type: 'income' | 'expense'; color: string }) => Category;
  updateCategory: (id: string, input: { name: string; color: string }) => void;
  deleteCategory: (id: string) => void;
  addPaymentMethod: (input: { name: string }) => PaymentMethod;
  deletePaymentMethod: (id: string) => void;

  updateSettings: (patch: Partial<Settings>) => void;
  updateProfile: (patch: Partial<Profile>) => void;

  resetDemoData: () => void;
  importDatabase: (text: string) => { ok: boolean; errors: string[] };
  exportJson: () => string;
}

const LedgerContext = createContext<LedgerContextValue | null>(null);

function assertUniqueCategory(db: Database, name: string, exceptId?: string): void {
  const clash = db.categories.some(
    (c) => c.id !== exceptId && c.name.trim().toLowerCase() === name.trim().toLowerCase(),
  );
  if (clash) throw new ValidationError({ name: 'A category with that name already exists.' });
}

/** First account usable for new money: active accounts, in stored order. */
function defaultAccountId(accounts: Account[]): string {
  return accounts.find((a) => !a.archived)?.id ?? accounts[0]?.id ?? '';
}

export function LedgerProvider({ children }: { children: React.ReactNode }) {
  const initial = useMemo(() => loadDatabase(), []);
  const [db, setDb] = useState<Database>(initial.db);
  const [dataSource, setDataSource] = useState<'seed' | 'storage'>(initial.source);
  const [persisted, setPersisted] = useState(true);

  // Persist on every change (skip the very first render — it is already stored).
  useEffect(() => {
    setPersisted(saveDatabase(db));
  }, [db]);

  // Reflect the theme on <html> so CSS tokens can switch modes.
  useEffect(() => {
    document.documentElement.dataset.theme = db.settings.theme;
    document.documentElement.dataset.colorTheme = db.settings.colorTheme ?? 'sakura';
    document.documentElement.style.colorScheme = db.settings.theme;
  }, [db.settings.theme, db.settings.colorTheme]);

  const update = useCallback((updater: (prev: Database) => Database) => {
    setDb((prev) => updater(prev));
  }, []);

  // ---------- Transactions ----------

  const addTransaction = useCallback(
    (input: TransactionInput): Transaction => {
      const errors = validateTransactionInput(input, db);
      if (Object.keys(errors).length > 0) throw new ValidationError(errors);
      const now = new Date().toISOString();
      const txn: Transaction = {
        id: uid('txn'),
        date: input.date,
        description: input.description.trim(),
        type: input.type,
        category: input.category,
        amount: Math.round(Number(input.amount) * 100),
        paymentMethod: input.paymentMethod,
        account: input.account,
        reference: input.reference?.trim() || undefined,
        notes: input.notes?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      };
      update((prev) => ({ ...prev, transactions: [...prev.transactions, txn] }));
      return txn;
    },
    [db, update],
  );

  const updateTransaction = useCallback(
    (id: string, input: TransactionInput): Transaction => {
      const existing = db.transactions.find((t) => t.id === id);
      if (!existing) throw new Error(`Transaction ${id} not found`);
      const errors = validateTransactionInput(input, db, { previousAccountId: existing.account });
      if (Object.keys(errors).length > 0) throw new ValidationError(errors);
      let updated: Transaction | null = null;
      update((prev) => ({
        ...prev,
        transactions: prev.transactions.map((t) => {
          if (t.id !== id) return t;
          updated = {
            ...t,
            date: input.date,
            description: input.description.trim(),
            type: input.type,
            category: input.category,
            amount: Math.round(Number(input.amount) * 100),
            paymentMethod: input.paymentMethod,
            account: input.account,
            reference: input.reference?.trim() || undefined,
            notes: input.notes?.trim() || undefined,
            updatedAt: new Date().toISOString(),
          };
          return updated;
        }),
      }));
      if (!updated) throw new Error(`Transaction ${id} not found`);
      return updated;
    },
    [db, update],
  );

  const deleteTransaction = useCallback(
    (id: string) => {
      update((prev) => ({ ...prev, transactions: prev.transactions.filter((t) => t.id !== id) }));
    },
    [update],
  );

  // ---------- Accounts ----------

  const addAccount = useCallback(
    (input: AccountInput): Account => {
      const errors = validateAccountInput(input, db.accounts);
      if (Object.keys(errors).length > 0) throw new ValidationError(errors);
      const now = new Date().toISOString();
      const account: Account = {
        id: uid('acct'),
        name: input.name.trim(),
        group: input.group,
        openingBalance: toCents(Number(input.openingBalance.trim() || '0')),
        archived: false,
        createdAt: now,
        updatedAt: now,
      };
      update((prev) => ({ ...prev, accounts: [...prev.accounts, account] }));
      return account;
    },
    [db, update],
  );

  const updateAccount = useCallback(
    (id: string, input: Pick<AccountInput, 'name' | 'group'>): Account => {
      const target = db.accounts.find((a) => a.id === id);
      if (!target) throw new Error(`Account ${id} not found`);
      const errors = validateAccountInput(
        { ...input, openingBalance: (target.openingBalance / 100).toFixed(2) },
        db.accounts,
        id,
      );
      if (Object.keys(errors).length > 0) throw new ValidationError(errors);
      let updated: Account | null = null;
      update((prev) => ({
        ...prev,
        accounts: prev.accounts.map((a) => {
          if (a.id !== id) return a;
          updated = {
            ...a,
            name: input.name.trim(),
            group: input.group,
            updatedAt: new Date().toISOString(),
          };
          return updated;
        }),
      }));
      if (!updated) throw new Error(`Account ${id} not found`);
      return updated;
    },
    [db, update],
  );

  const setAccountArchived = useCallback(
    (id: string, archived: boolean) => {
      const target = db.accounts.find((a) => a.id === id);
      if (!target) throw new Error(`Account ${id} not found`);
      update((prev) => ({
        ...prev,
        accounts: prev.accounts.map((a) =>
          a.id === id ? { ...a, archived, updatedAt: new Date().toISOString() } : a,
        ),
      }));
    },
    [db, update],
  );

  // ---------- Budgets ----------

  const addBudget = useCallback(
    (input: BudgetInput): Budget => {
      const errors = validateBudgetInput(input, db);
      if (Object.keys(errors).length > 0) throw new ValidationError(errors);
      const dup = db.budgets.some(
        (b) => b.categoryId === input.categoryId && b.period === input.period && b.periodKey === input.periodKey,
      );
      if (dup) throw new ValidationError({ periodKey: 'A budget for this category already exists in that period.' });
      const budget: Budget = {
        id: uid('budget'),
        categoryId: input.categoryId,
        period: input.period,
        periodKey: input.periodKey,
        limit: toCents(Number(input.limit)),
        notes: input.notes?.trim() || undefined,
      };
      update((prev) => ({ ...prev, budgets: [...prev.budgets, budget] }));
      return budget;
    },
    [db, update],
  );

  const updateBudget = useCallback(
    (id: string, input: BudgetInput): Budget => {
      const errors = validateBudgetInput(input, db);
      if (Object.keys(errors).length > 0) throw new ValidationError(errors);
      const dup = db.budgets.some(
        (b) => b.id !== id && b.categoryId === input.categoryId && b.period === input.period && b.periodKey === input.periodKey,
      );
      if (dup) throw new ValidationError({ periodKey: 'A budget for this category already exists in that period.' });
      let updated: Budget | null = null;
      update((prev) => ({
        ...prev,
        budgets: prev.budgets.map((b) => {
          if (b.id !== id) return b;
          updated = {
            ...b,
            categoryId: input.categoryId,
            period: input.period,
            periodKey: input.periodKey,
            limit: toCents(Number(input.limit)),
            notes: input.notes?.trim() || undefined,
          };
          return updated;
        }),
      }));
      if (!updated) throw new Error(`Budget ${id} not found`);
      return updated;
    },
    [db, update],
  );

  const deleteBudget = useCallback(
    (id: string) => {
      update((prev) => ({ ...prev, budgets: prev.budgets.filter((b) => b.id !== id) }));
    },
    [update],
  );

  // ---------- Goals ----------

  const addGoal = useCallback(
    (input: GoalInput): SavingsGoal => {
      const errors = validateGoalInput(input);
      if (Object.keys(errors).length > 0) throw new ValidationError(errors);
      const goal: SavingsGoal = {
        id: uid('goal'),
        title: input.title.trim(),
        description: input.description?.trim() || undefined,
        target: toCents(Number(input.target)),
        saved: toCents(Number(input.saved)),
        deadline: input.deadline || undefined,
        createdAt: new Date().toISOString(),
      };
      update((prev) => ({ ...prev, goals: [...prev.goals, goal] }));
      return goal;
    },
    [update],
  );

  const updateGoal = useCallback(
    (id: string, input: GoalInput): SavingsGoal => {
      const errors = validateGoalInput(input);
      if (Object.keys(errors).length > 0) throw new ValidationError(errors);
      let updated: SavingsGoal | null = null;
      update((prev) => ({
        ...prev,
        goals: prev.goals.map((g) => {
          if (g.id !== id) return g;
          updated = {
            ...g,
            title: input.title.trim(),
            description: input.description?.trim() || undefined,
            target: toCents(Number(input.target)),
            saved: toCents(Number(input.saved)),
            deadline: input.deadline || undefined,
          };
          return updated;
        }),
      }));
      if (!updated) throw new Error(`Goal ${id} not found`);
      return updated;
    },
    [update],
  );

  const deleteGoal = useCallback(
    (id: string) => {
      update((prev) => ({ ...prev, goals: prev.goals.filter((g) => g.id !== id) }));
    },
    [update],
  );

  // ---------- Debts ----------

  const addDebt = useCallback(
    (input: DebtInput): Debt => {
      const errors = validateDebtInput(input);
      if (Object.keys(errors).length > 0) throw new ValidationError(errors);
      const debt: Debt = {
        id: uid('debt'),
        direction: input.direction,
        party: input.party.trim(),
        originalAmount: toCents(Number(input.originalAmount)),
        dueDate: input.dueDate || undefined,
        notes: input.notes?.trim() || undefined,
        createdAt: new Date().toISOString(),
        payments: [],
      };
      update((prev) => ({ ...prev, debts: [...prev.debts, debt] }));
      return debt;
    },
    [update],
  );

  const updateDebt = useCallback(
    (id: string, input: DebtInput): Debt => {
      const errors = validateDebtInput(input);
      if (Object.keys(errors).length > 0) throw new ValidationError(errors);
      const target = db.debts.find((d) => d.id === id);
      if (!target) throw new Error(`Debt ${id} not found`);
      const paid = target.payments.reduce((s, p) => s + p.amount, 0);
      const nextOriginal = toCents(Number(input.originalAmount));
      if (nextOriginal < paid) {
        throw new ValidationError({ originalAmount: 'Original amount cannot be lower than payments already recorded.' });
      }
      let updated: Debt | null = null;
      update((prev) => ({
        ...prev,
        debts: prev.debts.map((d) => {
          if (d.id !== id) return d;
          updated = {
            ...d,
            direction: input.direction,
            party: input.party.trim(),
            originalAmount: nextOriginal,
            dueDate: input.dueDate || undefined,
            notes: input.notes?.trim() || undefined,
          };
          return updated;
        }),
      }));
      if (!updated) throw new Error(`Debt ${id} not found`);
      return updated;
    },
    [db, update],
  );

  const deleteDebt = useCallback(
    (id: string) => {
      update((prev) => ({ ...prev, debts: prev.debts.filter((d) => d.id !== id) }));
    },
    [update],
  );

  const addDebtPayment = useCallback(
    (debtId: string, input: PaymentInput, options?: { recordInLedger?: boolean }): DebtPayment => {
      const debt = db.debts.find((d) => d.id === debtId);
      if (!debt) throw new Error(`Debt ${debtId} not found`);
      const paid = debt.payments.reduce((s, p) => s + p.amount, 0);
      const remaining = Math.max(debt.originalAmount - paid, 0);
      const errors = validatePaymentInput(input, remaining);
      if (Object.keys(errors).length > 0) throw new ValidationError(errors);

      const payment: DebtPayment = {
        id: uid('pay'),
        date: input.date,
        amount: toCents(Number(input.amount)),
        notes: input.notes?.trim() || undefined,
      };
      const now = new Date().toISOString();

      update((prev) => ({
        ...prev,
        debts: prev.debts.map((d) => (d.id === debtId ? { ...d, payments: [...d.payments, payment] } : d)),
        // Optional, explicitly chosen link to the cash ledger. Unchecked by
        // default so debt tracking can never silently inflate expenses.
        transactions:
          options?.recordInLedger
            ? [
                ...prev.transactions,
                {
                  id: uid('txn'),
                  date: payment.date,
                  description: `Debt payment — ${debt.party}`,
                  type: 'expense' as const,
                  category: 'cat-debt-payment',
                  amount: payment.amount,
                  paymentMethod: prev.paymentMethods[0]?.id ?? 'pm-cash',
                  account: defaultAccountId(prev.accounts),
                  notes: 'Linked to a recorded debt payment.',
                  createdAt: now,
                  updatedAt: now,
                },
              ]
            : prev.transactions,
      }));
      return payment;
    },
    [db, update],
  );

  const deleteDebtPayment = useCallback(
    (debtId: string, paymentId: string) => {
      update((prev) => ({
        ...prev,
        debts: prev.debts.map((d) =>
          d.id === debtId ? { ...d, payments: d.payments.filter((p) => p.id !== paymentId) } : d,
        ),
      }));
    },
    [update],
  );

  // ---------- Categories & payment methods ----------

  const addCategory = useCallback(
    (input: { name: string; type: 'income' | 'expense'; color: string }): Category => {
      const name = input.name.trim();
      if (!name) throw new ValidationError({ name: 'Category name is required.' });
      if (name.length > 40) throw new ValidationError({ name: 'Category name must be 40 characters or fewer.' });
      assertUniqueCategory(db, name);
      const category: Category = { id: uid('cat'), name, type: input.type, color: input.color, builtin: false };
      update((prev) => ({ ...prev, categories: [...prev.categories, category] }));
      return category;
    },
    [db, update],
  );

  const updateCategory = useCallback(
    (id: string, input: { name: string; color: string }) => {
      const name = input.name.trim();
      if (!name) throw new ValidationError({ name: 'Category name is required.' });
      assertUniqueCategory(db, name, id);
      update((prev) => ({
        ...prev,
        categories: prev.categories.map((c) => (c.id === id ? { ...c, name, color: input.color } : c)),
      }));
    },
    [db, update],
  );

  const deleteCategory = useCallback(
    (id: string) => {
      const category = db.categories.find((c) => c.id === id);
      if (!category) return;
      if (category.builtin) throw new ValidationError({ name: 'Built-in categories cannot be deleted.' });
      if (db.transactions.some((t) => t.category === id) || db.budgets.some((b) => b.categoryId === id)) {
        throw new ValidationError({ name: 'Category is used by existing transactions or budgets.' });
      }
      update((prev) => ({ ...prev, categories: prev.categories.filter((c) => c.id !== id) }));
    },
    [db, update],
  );

  const addPaymentMethod = useCallback(
    (input: { name: string }): PaymentMethod => {
      const name = input.name.trim();
      if (!name) throw new ValidationError({ name: 'Payment method name is required.' });
      if (db.paymentMethods.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        throw new ValidationError({ name: 'That payment method already exists.' });
      }
      const method: PaymentMethod = { id: uid('pm'), name, builtin: false };
      update((prev) => ({ ...prev, paymentMethods: [...prev.paymentMethods, method] }));
      return method;
    },
    [db, update],
  );

  const deletePaymentMethod = useCallback(
    (id: string) => {
      const method = db.paymentMethods.find((p) => p.id === id);
      if (!method) return;
      if (method.builtin) throw new ValidationError({ name: 'Built-in payment methods cannot be deleted.' });
      if (db.transactions.some((t) => t.paymentMethod === id)) {
        throw new ValidationError({ name: 'Payment method is used by existing transactions.' });
      }
      update((prev) => ({ ...prev, paymentMethods: prev.paymentMethods.filter((p) => p.id !== id) }));
    },
    [db, update],
  );

  // ---------- Settings & profile ----------

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      update((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
    },
    [update],
  );

  const updateProfile = useCallback(
    (patch: Partial<Profile>) => {
      update((prev) => ({ ...prev, profile: { ...prev.profile, ...patch } }));
    },
    [update],
  );

  const resetDemoData = useCallback(() => {
    setDb(createSeedDatabase());
    setDataSource('seed');
  }, []);

  const importDatabase = useCallback((text: string) => {
    const result = parseBackup(text);
    if (!result.ok || !result.db) return { ok: false, errors: result.errors };
    setDb(result.db);
    setDataSource('storage');
    return { ok: true, errors: [] };
  }, []);

  const exportJson = useCallback(() => JSON.stringify(db, null, 2), [db]);

  const value = useMemo<LedgerContextValue>(
    () => ({
      db,
      dataSource,
      persisted,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      addAccount,
      updateAccount,
      setAccountArchived,
      addBudget,
      updateBudget,
      deleteBudget,
      addGoal,
      updateGoal,
      deleteGoal,
      addDebt,
      updateDebt,
      deleteDebt,
      addDebtPayment,
      deleteDebtPayment,
      addCategory,
      updateCategory,
      deleteCategory,
      addPaymentMethod,
      deletePaymentMethod,
      updateSettings,
      updateProfile,
      resetDemoData,
      importDatabase,
      exportJson,
    }),
    [
      db,
      dataSource,
      persisted,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      addAccount,
      updateAccount,
      setAccountArchived,
      addBudget,
      updateBudget,
      deleteBudget,
      addGoal,
      updateGoal,
      deleteGoal,
      addDebt,
      updateDebt,
      deleteDebt,
      addDebtPayment,
      deleteDebtPayment,
      addCategory,
      updateCategory,
      deleteCategory,
      addPaymentMethod,
      deletePaymentMethod,
      updateSettings,
      updateProfile,
      resetDemoData,
      importDatabase,
      exportJson,
    ],
  );

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}

export function useLedger(): LedgerContextValue {
  const ctx = useContext(LedgerContext);
  if (!ctx) throw new Error('useLedger must be used inside <LedgerProvider>');
  return ctx;
}
