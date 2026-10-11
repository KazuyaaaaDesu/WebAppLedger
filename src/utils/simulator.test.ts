// ============================================
// Simulator pure-function tests.
// All amounts are centavos unless stated otherwise.
// ============================================

import { describe, expect, it } from 'vitest';

import {
  addMonthsISO,
  categoryMonthExpense,
  extraDebtPayment,
  fullMonthsBetween,
  goalProjection,
  parseScenarioAmount,
  parseScenarioPercent,
  purchaseImpact,
  referenceMonthActivity,
  simulateScenario,
  spendingReduction,
} from './simulator';
import type { Transaction } from '../types';
import { toCents } from './finance';

const NOW = new Date(2026, 9, 15); // 2026-10-15

function txn(partial: Partial<Transaction> & Pick<Transaction, 'date' | 'type' | 'amount'>): Transaction {
  return {
    id: `t-${partial.date}-${partial.amount}`,
    description: 'fixture',
    category: partial.type === 'income' ? 'cat-salary' : 'cat-food',
    paymentMethod: 'pm-cash',
    account: 'acct-cash',
    createdAt: `${partial.date}T12:00:00.000Z`,
    updatedAt: `${partial.date}T12:00:00.000Z`,
    ...partial,
  } as Transaction;
}

describe('parseScenarioAmount', () => {
  it('parses major units into centavos', () => {
    expect(parseScenarioAmount('1250.50')).toEqual({ ok: true, cents: toCents(1250.5) });
  });

  it('treats empty input as zero', () => {
    expect(parseScenarioAmount('')).toEqual({ ok: true, cents: 0 });
    expect(parseScenarioAmount('   ')).toEqual({ ok: true, cents: 0 });
  });

  it('rejects invalid, negative, and oversized input', () => {
    expect(parseScenarioAmount('abc').ok).toBe(false);
    expect(parseScenarioAmount('-5').ok).toBe(false);
    expect(parseScenarioAmount('1.234').ok).toBe(false);
    expect(parseScenarioAmount('1e999').ok).toBe(false);
    expect(parseScenarioAmount('2000000000').ok).toBe(false);
  });
});

describe('parseScenarioPercent', () => {
  it('accepts 0–100 and rejects above 100 or non-numeric', () => {
    expect(parseScenarioPercent('25.5')).toEqual({ ok: true, cents: 2550 });
    expect(parseScenarioPercent('')).toEqual({ ok: true, cents: 0 });
    expect(parseScenarioPercent('100')).toEqual({ ok: true, cents: 10_000 });
    expect(parseScenarioPercent('100.01').ok).toBe(false);
    expect(parseScenarioPercent('nope').ok).toBe(false);
  });
});

describe('month math', () => {
  it('clamps the day when adding months across month lengths', () => {
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsISO('2024-01-31', 1)).toBe('2024-02-29'); // leap year
    expect(addMonthsISO('2026-10-15', 3)).toBe('2027-01-15');
    expect(addMonthsISO('2026-12-15', 2)).toBe('2027-02-15');
  });

  it('counts whole calendar months only and clamps negatives to zero', () => {
    expect(fullMonthsBetween('2026-10-15', '2026-11-15')).toBe(1);
    expect(fullMonthsBetween('2026-10-15', '2026-11-14')).toBe(0);
    expect(fullMonthsBetween('2026-10-15', '2027-10-15')).toBe(12);
    expect(fullMonthsBetween('2026-10-15', '2026-10-01')).toBe(0);
  });
});

describe('purchaseImpact', () => {
  it('computes remaining cash and flags shortfalls', () => {
    const ok = purchaseImpact(toCents(10_000), toCents(2_500));
    expect(ok.remainingCash).toBe(toCents(7_500));
    expect(ok.affordable).toBe(true);
    expect(ok.shortfall).toBe(0);

    const over = purchaseImpact(toCents(100), toCents(250));
    expect(over.remainingCash).toBe(-toCents(150));
    expect(over.affordable).toBe(false);
    expect(over.shortfall).toBe(toCents(150));

    expect(purchaseImpact(toCents(500), 0).remainingCash).toBe(toCents(500));
    // Negative purchase input is treated as zero, never as income.
    expect(purchaseImpact(toCents(500), -toCents(100)).purchaseCents).toBe(0);
  });
});

describe('spendingReduction', () => {
  it('computes monthly and yearly savings in amount mode', () => {
    const r = spendingReduction(toCents(5_000), 'amount', toCents(1_000));
    expect(r.monthlySavings).toBe(toCents(1_000));
    expect(r.yearlySavings).toBe(toCents(12_000));
    expect(r.capped).toBe(false);
  });

  it('caps reductions that exceed the category spend', () => {
    const r = spendingReduction(toCents(500), 'amount', toCents(800));
    expect(r.monthlySavings).toBe(toCents(500));
    expect(r.capped).toBe(true);
    expect(r.requestedMonthly).toBe(toCents(800));
  });

  it('supports percent mode against the category spend', () => {
    const r = spendingReduction(toCents(4_000), 'percent', 2500); // 25%
    expect(r.monthlySavings).toBe(toCents(1_000));
    expect(r.yearlySavings).toBe(toCents(12_000));
    expect(r.capped).toBe(false);
  });

  it('yields zero savings when the category has no recorded spend', () => {
    const r = spendingReduction(0, 'amount', toCents(100));
    expect(r.monthlySavings).toBe(0);
    expect(r.yearlySavings).toBe(0);
  });
});

describe('goalProjection', () => {
  it('computes months and projected date for a reachable goal', () => {
    const g = goalProjection({
      remaining: toCents(12_000),
      monthlyContribution: toCents(3_000),
      now: NOW,
    });
    expect(g.months).toBe(4);
    expect(g.projectedDate).toBe('2027-02-15');
    expect(g.reachable).toBe(true);
    expect(g.alreadyComplete).toBe(false);
  });

  it('marks already-complete goals without projecting', () => {
    const g = goalProjection({ remaining: 0, monthlyContribution: toCents(1_000), now: NOW });
    expect(g.alreadyComplete).toBe(true);
    expect(g.months).toBe(0);
    expect(g.reachable).toBe(true);
  });

  it('treats zero and negative monthly savings as unreachable', () => {
    const zero = goalProjection({ remaining: toCents(5_000), monthlyContribution: 0, now: NOW });
    expect(zero.reachable).toBe(false);
    expect(zero.months).toBeNull();
    expect(zero.projectedDate).toBeNull();

    const neg = goalProjection({
      remaining: toCents(5_000),
      monthlyContribution: -toCents(500),
      now: NOW,
    });
    expect(neg.reachable).toBe(false);
    expect(neg.months).toBeNull();
  });

  it('evaluates reachability and monthly need against a target date', () => {
    const base = { remaining: toCents(12_000), now: NOW };
    // 6 whole months to 2027-04-15 → needs ₱2,000/mo to hit it.
    const feasible = goalProjection({ ...base, monthlyContribution: toCents(3_000), targetDate: '2027-04-15' });
    expect(feasible.monthsToTarget).toBe(6);
    expect(feasible.monthlyNeededByTarget).toBe(toCents(2_000));
    expect(feasible.months).toBe(4);
    expect(feasible.reachableByTarget).toBe(true);

    const infeasible = goalProjection({ ...base, monthlyContribution: toCents(1_000), targetDate: '2027-04-15' });
    expect(infeasible.reachableByTarget).toBe(false);
    expect(infeasible.monthlyNeededByTarget).toBe(toCents(2_000));

    const noTarget = goalProjection({ ...base, monthlyContribution: toCents(1_000) });
    expect(noTarget.monthsToTarget).toBeNull();
    expect(noTarget.reachableByTarget).toBeNull();
    expect(noTarget.monthlyNeededByTarget).toBeNull();
  });

  it('ignores malformed target dates instead of fabricating a timeline', () => {
    const g = goalProjection({
      remaining: toCents(1_000),
      monthlyContribution: toCents(500),
      now: NOW,
      targetDate: 'not-a-date',
    });
    expect(g.targetDate).toBeNull();
    expect(g.monthsToTarget).toBeNull();
  });
});

describe('extraDebtPayment', () => {
  it('applies a payment within cash and remaining balance', () => {
    const r = extraDebtPayment({
      remainingBefore: toCents(10_000),
      paymentCents: toCents(2_000),
      balance: toCents(5_000),
    });
    expect(r.paymentCents).toBe(toCents(2_000));
    expect(r.remainingAfter).toBe(toCents(8_000));
    expect(r.cashAfter).toBe(toCents(3_000));
    expect(r.affordable).toBe(true);
    expect(r.overpayCapped).toBe(false);
  });

  it('caps overpayment at the debt remaining', () => {
    const r = extraDebtPayment({
      remainingBefore: toCents(1_000),
      paymentCents: toCents(5_000),
      balance: toCents(10_000),
    });
    expect(r.paymentCents).toBe(toCents(1_000));
    expect(r.remainingAfter).toBe(0);
    expect(r.overpayCapped).toBe(true);
  });

  it('flags payments that exceed available cash', () => {
    const r = extraDebtPayment({
      remainingBefore: toCents(10_000),
      paymentCents: toCents(3_000),
      balance: toCents(1_000),
    });
    expect(r.affordable).toBe(false);
    expect(r.shortfall).toBe(toCents(2_000));
    expect(r.cashAfter).toBe(-toCents(2_000));
  });

  it('treats zero and negative payments as no-ops', () => {
    const r = extraDebtPayment({
      remainingBefore: toCents(4_000),
      paymentCents: -toCents(100),
      balance: toCents(1_000),
    });
    expect(r.paymentCents).toBe(0);
    expect(r.remainingAfter).toBe(toCents(4_000));
    expect(r.affordable).toBe(true);
  });
});

describe('referenceMonthActivity & categoryMonthExpense', () => {
  it('returns null with no transactions', () => {
    expect(referenceMonthActivity([], NOW)).toBeNull();
  });

  it('prefers the current calendar month when it has activity', () => {
    const txns = [
      txn({ date: '2026-09-10', type: 'expense', amount: toCents(900) }),
      txn({ date: '2026-10-05', type: 'expense', amount: toCents(100) }),
      txn({ date: '2026-10-06', type: 'income', amount: toCents(400) }),
    ];
    const ref = referenceMonthActivity(txns, NOW)!;
    expect(ref.key).toBe('2026-10');
    expect(ref.income).toBe(toCents(400));
    expect(ref.expense).toBe(toCents(100));
    expect(ref.net).toBe(toCents(300));
  });

  it('falls back to the most recent active month when the current month is empty', () => {
    const txns = [
      txn({ date: '2026-08-01', type: 'income', amount: toCents(500) }),
      txn({ date: '2026-08-10', type: 'expense', amount: toCents(100) }),
    ];
    const ref = referenceMonthActivity(txns, NOW)!;
    expect(ref.key).toBe('2026-08');
    expect(ref.net).toBe(toCents(400));
  });

  it('sums only matching category expenses in the given month', () => {
    const txns = [
      txn({ date: '2026-10-05', type: 'expense', amount: toCents(600), category: 'cat-food' }),
      txn({ date: '2026-10-06', type: 'expense', amount: toCents(300), category: 'cat-bills' }),
      txn({ date: '2026-11-05', type: 'expense', amount: toCents(900), category: 'cat-food' }),
      txn({ date: '2026-10-07', type: 'income', amount: toCents(500), category: 'cat-food' }),
    ];
    expect(categoryMonthExpense(txns, 'cat-food', '2026-10')).toBe(toCents(600));
  });
});

describe('simulateScenario', () => {
  it('combines one-time outflows and monthly contributions', () => {
    const r = simulateScenario({
      balance: toCents(20_000),
      baselineMonthlyNet: toCents(5_000),
      purchaseCents: toCents(3_000),
      reductionMonthlyCents: toCents(500),
      extraMonthlySavingsCents: toCents(1_000),
      debtPaymentCents: toCents(2_000),
      debtRemainingBefore: toCents(9_000),
      goalRemaining: toCents(24_000),
      now: NOW,
    });
    expect(r.cashAfter).toBe(toCents(15_000));
    expect(r.monthlyContribution).toBe(toCents(6_500));
    expect(r.debt.remainingAfter).toBe(toCents(7_000));
    expect(r.goal!.months).toBe(Math.ceil(24_000 / 6_500)); // 4
  });

  it('does not mutate its parameters', () => {
    const params = {
      balance: toCents(10_000),
      baselineMonthlyNet: toCents(1_000),
      purchaseCents: toCents(500),
      reductionMonthlyCents: toCents(100),
      extraMonthlySavingsCents: toCents(200),
      debtPaymentCents: toCents(300),
      debtRemainingBefore: toCents(2_000),
      goalRemaining: toCents(5_000),
      now: NOW,
    };
    const snapshot = JSON.stringify(params);
    simulateScenario(params);
    expect(JSON.stringify(params)).toBe(snapshot);
  });

  it('handles zero everything and no goal', () => {
    const r = simulateScenario({
      balance: toCents(1_000),
      baselineMonthlyNet: 0,
      purchaseCents: 0,
      reductionMonthlyCents: 0,
      extraMonthlySavingsCents: 0,
      debtPaymentCents: 0,
      debtRemainingBefore: 0,
      goalRemaining: null,
      now: NOW,
    });
    expect(r.cashAfter).toBe(toCents(1_000));
    expect(r.monthlyContribution).toBe(0);
    expect(r.goal).toBeNull();
  });
});
