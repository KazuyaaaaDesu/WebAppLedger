// ============================================
// Sakura Financial Simulator — pure scenario calculations.
// Every function is side-effect free, works in integer centavos, and never
// mutates ledger data. Projections assume constant monthly contributions
// with no interest — the UI must disclose this.
// ============================================

import type { Transaction } from '../types';
import {
  computeTotals,
  currentMonthKey,
  monthKey,
  toISODate,
} from './finance';

// ---------- Input parsing ----------

const MAX_MAJOR = 1_000_000_000;

export type ParseResult = { ok: true; cents: number } | { ok: false; reason: string };

/**
 * Parses a raw simulator amount field (major units) into centavos.
 * Empty input is a valid zero. Rejects negatives, non-numeric text,
 * more than 2 decimals, and amounts above the app-wide cap.
 */
export function parseScenarioAmount(raw: string): ParseResult {
  const s = raw.trim();
  if (!s) return { ok: true, cents: 0 };
  if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    return { ok: false, reason: 'Enter a positive amount with at most 2 decimals.' };
  }
  const n = Number(s);
  if (n > MAX_MAJOR) return { ok: false, reason: 'Amount is too large.' };
  return { ok: true, cents: Math.round(n * 100) };
}

/** Parses a 0–100 percentage field. Empty input is a valid zero. */
export function parseScenarioPercent(raw: string): ParseResult {
  const s = raw.trim();
  if (!s) return { ok: true, cents: 0 };
  if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    return { ok: false, reason: 'Enter a percentage between 0 and 100.' };
  }
  const n = Number(s);
  if (n > 100) return { ok: false, reason: 'Percentage must be between 0 and 100.' };
  return { ok: true, cents: Math.round(n * 100) };
}

// ---------- Month math ----------

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Adds whole calendar months to a YYYY-MM-DD date, clamping the day (Jan 31 + 1 → Feb 28/29). */
export function addMonthsISO(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const lastDay = new Date(ny, nm, 0).getDate();
  const nd = Math.min(d, lastDay);
  return `${ny}-${pad2(nm)}-${pad2(nd)}`;
}

/**
 * Whole calendar months between two YYYY-MM-DD dates.
 * A partial month does not count (conservative). Negative or reversed ranges → 0.
 */
export function fullMonthsBetween(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split('-').map(Number);
  const [ty, tm, td] = toISO.split('-').map(Number);
  if (!fy || !fm || !fd || !ty || !tm || !td) return 0;
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  return Math.max(months, 0);
}

// ---------- Reference month activity ----------

export interface MonthActivity {
  key: string;
  income: number;
  expense: number;
  net: number;
  count: number;
}

/**
 * Activity of the month used as the "current monthly" baseline:
 * the current calendar month when it has transactions, otherwise the
 * most recent month that does. Returns null when no transactions exist —
 * callers must not substitute zero for missing data silently.
 */
export function referenceMonthActivity(
  txns: Transaction[],
  now: Date = new Date(),
): MonthActivity | null {
  if (txns.length === 0) return null;
  const byMonth = new Map<string, Transaction[]>();
  for (const t of txns) {
    const k = monthKey(t.date);
    const list = byMonth.get(k);
    if (list) list.push(t);
    else byMonth.set(k, [t]);
  }
  const curKey = currentMonthKey(now);
  const key = byMonth.has(curKey) ? curKey : [...byMonth.keys()].sort().pop()!;
  const totals = computeTotals(byMonth.get(key)!);
  return { key, income: totals.income, expense: totals.expense, net: totals.net, count: totals.count };
}

/** Expense total for one category inside one calendar month (YYYY-MM). */
export function categoryMonthExpense(
  txns: Transaction[],
  categoryId: string,
  monthKeyValue: string,
): number {
  let sum = 0;
  for (const t of txns) {
    if (t.type !== 'expense' || t.category !== categoryId) continue;
    if (monthKey(t.date) !== monthKeyValue) continue;
    sum += t.amount;
  }
  return sum;
}

// ---------- Purchase ----------

export interface PurchaseImpact {
  purchaseCents: number;
  remainingCash: number;
  affordable: boolean;
  /** max(purchase − available cash, 0) */
  shortfall: number;
}

export function purchaseImpact(balance: number, purchaseCents: number): PurchaseImpact {
  const purchase = Math.max(purchaseCents, 0);
  const remainingCash = balance - purchase;
  return {
    purchaseCents: purchase,
    remainingCash,
    affordable: purchase <= balance,
    shortfall: Math.max(purchase - balance, 0),
  };
}

// ---------- Spending reduction ----------

export interface ReductionImpact {
  /** Capped monthly savings actually applied */
  monthlySavings: number;
  yearlySavings: number;
  requestedMonthly: number;
  categoryMonthlySpend: number;
  /** True when the requested reduction exceeded the category's monthly spend */
  capped: boolean;
}

/**
 * Monthly savings from reducing one category's spending.
 * Amount mode: value is centavos. Percent mode: value is 0–100 ×100 centavos
 * (e.g. 25% → 2500). Reductions above the category's recorded monthly spend
 * are capped at that spend and flagged — you cannot cut more than exists.
 */
export function spendingReduction(
  categoryMonthlySpendCents: number,
  mode: 'amount' | 'percent',
  value: number,
): ReductionImpact {
  const spend = Math.max(categoryMonthlySpendCents, 0);
  const raw = Math.max(value, 0);
  const requested = mode === 'amount' ? raw : Math.round((spend * raw) / 10_000);
  const monthlySavings = Math.min(requested, spend);
  return {
    monthlySavings,
    yearlySavings: monthlySavings * 12,
    requestedMonthly: requested,
    categoryMonthlySpend: spend,
    capped: requested > spend,
  };
}

// ---------- Goal projection ----------

export interface GoalProjection {
  remaining: number;
  alreadyComplete: boolean;
  monthlyContribution: number;
  /** False when contribution ≤ 0 while money is still needed */
  reachable: boolean;
  /** Whole months to reach the goal under the assumptions; null when never */
  months: number | null;
  /** Approximate calendar date of completion; null when never */
  projectedDate: string | null;
  targetDate: string | null;
  /** Whole calendar months from now to the target; null when no valid target */
  monthsToTarget: number | null;
  reachableByTarget: boolean | null;
  /** Extra monthly saving needed to hit the target date; null when not computable */
  monthlyNeededByTarget: number | null;
}

/**
 * Months to reach a savings target assuming a constant monthly contribution
 * and no interest. Contributions are counted at the end of each month, so the
 * projected date is "now + months" (day clamped to month length).
 */
export function goalProjection(params: {
  remaining: number;
  monthlyContribution: number;
  now: Date;
  targetDate?: string | null;
}): GoalProjection {
  const remaining = Math.max(params.remaining, 0);
  const contribution = params.monthlyContribution;
  const nowISO = toISODate(params.now);
  const targetRaw = params.targetDate?.trim() || null;
  const targetDate = targetRaw && /^\d{4}-\d{2}-\d{2}$/.test(targetRaw) ? targetRaw : null;

  let monthsToTarget: number | null = null;
  if (targetDate) monthsToTarget = fullMonthsBetween(nowISO, targetDate);

  if (remaining <= 0) {
    return {
      remaining: 0,
      alreadyComplete: true,
      monthlyContribution: contribution,
      reachable: true,
      months: 0,
      projectedDate: nowISO,
      targetDate,
      monthsToTarget,
      reachableByTarget: true,
      monthlyNeededByTarget: 0,
    };
  }

  const monthlyNeededByTarget =
    monthsToTarget !== null && monthsToTarget > 0 ? Math.ceil(remaining / monthsToTarget) : null;

  if (contribution <= 0) {
    return {
      remaining,
      alreadyComplete: false,
      monthlyContribution: contribution,
      reachable: false,
      months: null,
      projectedDate: null,
      targetDate,
      monthsToTarget,
      reachableByTarget: monthsToTarget !== null ? false : null,
      monthlyNeededByTarget,
    };
  }

  const months = Math.ceil(remaining / contribution);
  const projectedDate = addMonthsISO(nowISO, months);
  const reachableByTarget = monthsToTarget !== null ? months <= monthsToTarget : null;

  return {
    remaining,
    alreadyComplete: false,
    monthlyContribution: contribution,
    reachable: true,
    months,
    projectedDate,
    targetDate,
    monthsToTarget,
    reachableByTarget,
    monthlyNeededByTarget,
  };
}

// ---------- Extra debt payment ----------

export interface DebtPaymentImpact {
  /** Payment actually applied (capped at the remaining balance) */
  paymentCents: number;
  remainingBefore: number;
  remainingAfter: number;
  cashAfter: number;
  affordable: boolean;
  /** max(payment − available cash, 0) */
  shortfall: number;
  overpayCapped: boolean;
}

/**
 * Simulates one extra payment against a debt. The payment is capped at the
 * debt's remaining balance (matching the real ledger's overpay rule) and is
 * checked against available cash. No interest is modelled — the data model
 * does not carry rates or minimum payments.
 */
export function extraDebtPayment(params: {
  remainingBefore: number;
  paymentCents: number;
  balance: number;
}): DebtPaymentImpact {
  const remainingBefore = Math.max(params.remainingBefore, 0);
  const requested = Math.max(params.paymentCents, 0);
  const balance = params.balance;
  if (requested <= 0) {
    return {
      paymentCents: 0,
      remainingBefore,
      remainingAfter: remainingBefore,
      cashAfter: balance,
      affordable: true,
      shortfall: 0,
      overpayCapped: false,
    };
  }
  const overpayCapped = requested > remainingBefore;
  const paymentCents = Math.min(requested, remainingBefore);
  const affordable = paymentCents <= balance;
  return {
    paymentCents,
    remainingBefore,
    remainingAfter: remainingBefore - paymentCents,
    cashAfter: balance - paymentCents,
    affordable,
    shortfall: Math.max(paymentCents - balance, 0),
    overpayCapped,
  };
}

// ---------- Combined scenario ----------

export interface ScenarioParams {
  balance: number;
  /** Reference-month net cash flow; may be negative */
  baselineMonthlyNet: number;
  purchaseCents: number;
  /** Already capped monthly reduction savings from spendingReduction() */
  reductionMonthlyCents: number;
  extraMonthlySavingsCents: number;
  debtPaymentCents: number;
  debtRemainingBefore: number;
  /** null when no savings goal is selected */
  goalRemaining: number | null;
  now: Date;
  targetDate?: string | null;
}

export interface ScenarioResult {
  purchase: PurchaseImpact;
  debt: DebtPaymentImpact;
  /** balance − purchase − applied debt payment */
  cashAfter: number;
  /** baseline net + reduction savings + extra monthly savings */
  monthlyContribution: number;
  goal: GoalProjection | null;
}

/**
 * Composes purchase, debt payment, spending reduction and extra savings into
 * one scenario result. The debt payment is checked against cash remaining
 * after the purchase (sequential one-time outflows). Pure — never mutates inputs.
 */
export function simulateScenario(p: ScenarioParams): ScenarioResult {
  const purchase = purchaseImpact(p.balance, p.purchaseCents);
  const debt = extraDebtPayment({
    remainingBefore: p.debtRemainingBefore,
    paymentCents: p.debtPaymentCents,
    balance: purchase.remainingCash,
  });
  const monthlyContribution =
    p.baselineMonthlyNet + p.reductionMonthlyCents + p.extraMonthlySavingsCents;
  const goal =
    p.goalRemaining === null
      ? null
      : goalProjection({
          remaining: p.goalRemaining,
          monthlyContribution,
          now: p.now,
          targetDate: p.targetDate ?? null,
        });
  return { purchase, debt, cashAfter: debt.cashAfter, monthlyContribution, goal };
}
