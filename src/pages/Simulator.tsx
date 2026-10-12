import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  FlaskConical,
  HandCoins,
  Lightbulb,
  Percent,
  PiggyBank,
  RotateCcw,
  ShoppingCart,
  Target,
  X,
} from 'lucide-react';

import PageHeader from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge, EmptyState } from '../components/ui/Indicators';
import { Field, Input, SelectField } from '../components/ui/Field';
import { useLedger } from '../context/LedgerContext';
import { debtStatus, goalStatus, totalBalance } from '../utils/finance';
import { formatCurrency, formatDate, formatMonthLabel } from '../utils/format';
import {
  categoryMonthExpense,
  parseScenarioAmount,
  parseScenarioPercent,
  referenceMonthActivity,
  simulateScenario,
  spendingReduction,
} from '../utils/simulator';

interface PinnedScenario {
  id: string;
  label: string;
  cashAfter: number;
  monthlyContribution: number | null;
  monthsToGoal: number | null;
}

let pinSeq = 0;

type ScenarioKind = 'buy' | 'reduce' | 'save' | 'debt';

const SCENARIOS: { kind: ScenarioKind; label: string; blurb: string; icon: ReactElement }[] = [
  { kind: 'buy', label: 'Make a purchase', blurb: 'Can I afford this one-time buy?', icon: <ShoppingCart size={20} /> },
  { kind: 'reduce', label: 'Cut monthly spending', blurb: 'What if one category costs less each month?', icon: <Percent size={20} /> },
  { kind: 'save', label: 'Save more each month', blurb: 'How much sooner could I hit a goal?', icon: <PiggyBank size={20} /> },
  { kind: 'debt', label: 'Pay down debt faster', blurb: 'What if I paid extra toward a balance?', icon: <HandCoins size={20} /> },
];

/** A single baseline → simulated comparison bar (proportional, two-tone). */
function FlowBar({
  label,
  before,
  after,
  cur,
  showSign,
}: {
  label: string;
  before: number;
  after: number;
  cur: string;
  showSign?: boolean;
}) {
  const max = Math.max(Math.abs(before), Math.abs(after), 1);
  const pct = (v: number) => `${Math.min((Math.abs(v) / max) * 100, 100)}%`;
  return (
    <div style={{ marginBottom: 'var(--spacing-md)' }}>
      <div className="figure" style={{ marginBottom: 4 }}>
        <span className="figure-label">{label}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12, alignItems: 'center' }}>
        <span className="mono-num text-sm muted">Before {formatCurrency(before, cur, { showSign })}</span>
        <div className="progress-track" style={{ height: 10 }} aria-hidden="true">
          <div className="progress-fill is-good" style={{ width: pct(before) }} />
        </div>
        <span className="mono-num text-sm" style={{ fontWeight: 600 }}>
          After&nbsp;&nbsp;{formatCurrency(after, cur, { showSign })}
        </span>
        <div className="progress-track" style={{ height: 10 }} aria-hidden="true">
          <div className="progress-fill" style={{ width: pct(after), background: 'var(--accent)' }} />
        </div>
      </div>
    </div>
  );
}

/**
 * SAKURA FINANCIAL SIMULATOR
 *
 * A what-if playground over the user's real ledger, framed as a decision tool:
 * pick one scenario, see a Before → After flow, and pin snapshots to compare.
 * Every calculation is a pure function from utils/simulator; this page only
 * reads persisted data and keeps hypothetical inputs in local state. Nothing
 * here mutates transactions, balances, budgets, debts or goals.
 */
export default function Simulator() {
  const { db } = useLedger();
  const [searchParams] = useSearchParams();
  const now = useMemo(() => new Date(), []);
  const cur = db.settings.currency;
  /** formatDate takes `string | undefined`; projections may yield null. */
  const fmtDate = (iso: string | null | undefined) => formatDate(iso ?? undefined);

  const balance = useMemo(
    () => totalBalance(db.accounts, db.transactions),
    [db.accounts, db.transactions],
  );
  const refMonth = useMemo(
    () => referenceMonthActivity(db.transactions, now),
    [db.transactions, now],
  );

  // ---------- Active scenario (progressive disclosure) ----------
  // A ?goal=<id> deep link (e.g. from the Goals page) opens straight on the
  // "save more" scenario with that goal preselected.
  const linkedGoalId = searchParams.get('goal');
  const [activeKind, setActiveKind] = useState<ScenarioKind>(linkedGoalId ? 'save' : 'buy');

  // ---------- Hypothetical inputs (local state only) ----------
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [purchaseNote, setPurchaseNote] = useState('');
  const [reductionCategoryId, setReductionCategoryId] = useState('');
  const [reductionMode, setReductionMode] = useState<'amount' | 'percent'>('amount');
  const [reductionValue, setReductionValue] = useState('');
  const [extraSavings, setExtraSavings] = useState('');
  const [goalId, setGoalId] = useState(
    () =>
      linkedGoalId ??
      db.goals.find((g) => goalStatus(g, new Date()).remaining > 0)?.id ??
      db.goals[0]?.id ??
      '',
  );
  const [targetDate, setTargetDate] = useState('');
  const [debtId, setDebtId] = useState('');
  const [debtPaymentAmount, setDebtPaymentAmount] = useState('');
  const [pinned, setPinned] = useState<PinnedScenario[]>([]);

  // ---------- Parsing ----------
  const parsedPurchase = parseScenarioAmount(purchaseAmount);
  const parsedReduction =
    reductionMode === 'amount'
      ? parseScenarioAmount(reductionValue)
      : parseScenarioPercent(reductionValue);
  const parsedSavings = parseScenarioAmount(extraSavings);
  const parsedDebtPayment = parseScenarioAmount(debtPaymentAmount);

  const purchaseCents = activeKind === 'buy' && parsedPurchase.ok ? parsedPurchase.cents : 0;
  const reductionInputCents = activeKind === 'reduce' && parsedReduction.ok ? parsedReduction.cents : 0;
  const savingsCents = activeKind === 'save' && parsedSavings.ok ? parsedSavings.cents : 0;
  const debtPaymentCents = activeKind === 'debt' && parsedDebtPayment.ok ? parsedDebtPayment.cents : 0;

  // ---------- Derived selections ----------
  const selectedGoal = db.goals.find((g) => g.id === goalId) ?? null;
  const goalRemaining = selectedGoal ? goalStatus(selectedGoal, now).remaining : null;
  const effectiveTarget = targetDate.trim() || selectedGoal?.deadline || null;

  const openDebts = useMemo(
    () =>
      db.debts
        .filter((d) => d.direction === 'iOwe' && debtStatus(d, now).remaining > 0)
        .map((d) => ({ debt: d, remaining: debtStatus(d, now).remaining })),
    [db.debts, now],
  );
  const selectedDebt = openDebts.find((o) => o.debt.id === debtId) ?? null;

  const expenseCategories = useMemo(
    () => db.categories.filter((c) => c.type === 'expense'),
    [db.categories],
  );
  const categorySpend =
    reductionCategoryId && refMonth
      ? categoryMonthExpense(db.transactions, reductionCategoryId, refMonth.key)
      : 0;
  const reduction =
    reductionCategoryId && reductionValue && parsedReduction.ok
      ? spendingReduction(categorySpend, reductionMode, reductionInputCents)
      : null;

  // ---------- Baseline & simulated projections ----------
  const baselineMonthlyNet = refMonth?.net ?? null;

  const baselineGoal = useMemo(() => {
    if (!selectedGoal || baselineMonthlyNet === null) return null;
    const remaining = goalStatus(selectedGoal, now).remaining;
    return simulateScenario({
      balance,
      baselineMonthlyNet,
      purchaseCents: 0,
      reductionMonthlyCents: 0,
      extraMonthlySavingsCents: 0,
      debtPaymentCents: 0,
      debtRemainingBefore: selectedDebt?.remaining ?? 0,
      goalRemaining: remaining,
      now,
      targetDate: effectiveTarget,
    }).goal;
  }, [selectedGoal, baselineMonthlyNet, now, effectiveTarget, balance, selectedDebt]);

  const scenario = useMemo(
    () =>
      simulateScenario({
        balance,
        baselineMonthlyNet: baselineMonthlyNet ?? 0,
        purchaseCents,
        reductionMonthlyCents: reduction?.monthlySavings ?? 0,
        extraMonthlySavingsCents: savingsCents,
        debtPaymentCents,
        debtRemainingBefore: selectedDebt?.remaining ?? 0,
        goalRemaining,
        now,
        targetDate: effectiveTarget,
      }),
    [
      balance,
      baselineMonthlyNet,
      purchaseCents,
      reduction,
      savingsCents,
      debtPaymentCents,
      selectedDebt,
      goalRemaining,
      now,
      effectiveTarget,
    ],
  );

  const purchaseSim = scenario.purchase;
  const debtSim = scenario.debt;

  // ---------- Warnings & recommendations (derived, never invented) ----------
  const warnings: string[] = [];
  if (activeKind === 'buy' && parsedPurchase.ok === false) warnings.push(`Purchase: ${parsedPurchase.reason}`);
  if (activeKind === 'reduce' && parsedReduction.ok === false)
    warnings.push(`Spending reduction: ${parsedReduction.reason}`);
  if (activeKind === 'save' && parsedSavings.ok === false)
    warnings.push(`Extra monthly savings: ${parsedSavings.reason}`);
  if (activeKind === 'debt' && parsedDebtPayment.ok === false)
    warnings.push(`Extra debt payment: ${parsedDebtPayment.reason}`);
  if (purchaseCents > 0 && !purchaseSim.affordable) {
    warnings.push(
      `This purchase exceeds your available cash by ${formatCurrency(purchaseSim.shortfall, cur)} — simulated cash goes negative.`,
    );
  }
  if (debtPaymentCents > 0 && !debtSim.affordable) {
    warnings.push(
      `This extra payment exceeds the cash left after the purchase by ${formatCurrency(debtSim.shortfall, cur)}.`,
    );
  }
  if (debtSim.overpayCapped) {
    warnings.push(
      `Extra payment is capped at the debt's remaining ${formatCurrency(debtSim.remainingBefore, cur)} — overpaying is not modelled.`,
    );
  }
  if (reduction?.capped && categorySpend === 0) {
    const name = expenseCategories.find((c) => c.id === reductionCategoryId)?.name ?? 'this category';
    warnings.push(
      `No ${name} spending is recorded in ${refMonth ? formatMonthLabel(refMonth.key) : 'the reference month'} — the reduction has no effect.`,
    );
  } else if (reduction?.capped) {
    warnings.push(
      `Reduction capped at the category's recorded ${formatCurrency(categorySpend, cur)} monthly spending.`,
    );
  }
  if (refMonth === null) {
    warnings.push(
      'No recorded transactions — monthly cash flow is unknown, so goal projections use only the amounts you enter here.',
    );
  } else if (refMonth.net < 0 && (reduction?.monthlySavings ?? 0) + savingsCents === 0) {
    warnings.push(
      `Recorded cash flow in ${formatMonthLabel(refMonth.key)} is negative (${formatCurrency(refMonth.net, cur)}) — goals are never reached at this rate without changes.`,
    );
  }

  const recommendations: string[] = [];
  const goal = scenario.goal;
  if (selectedGoal && goal) {
    if (goal.alreadyComplete) {
      recommendations.push(
        `“${selectedGoal.title}” is already fully saved — this scenario keeps it achieved.`,
      );
    } else if (!goal.reachable) {
      recommendations.push(
        `Under these assumptions “${selectedGoal.title}” is never reached (monthly contribution is ${formatCurrency(goal.monthlyContribution, cur)}). Add extra monthly savings or reduce spending to make progress.`,
      );
    } else {
      const baseMonths = baselineGoal?.months ?? null;
      if (baseMonths !== null && goal.months !== null) {
        const diff = baseMonths - goal.months;
        if (diff > 0) {
          recommendations.push(
            `This scenario reaches “${selectedGoal.title}” about ${diff} month${diff === 1 ? '' : 's'} sooner than your current recorded cash flow alone (≈ ${goal.months} months, around ${fmtDate(goal.projectedDate)}).`,
          );
        } else if (diff < 0) {
          recommendations.push(
            `This scenario is ${Math.abs(diff)} month${diff === -1 ? '' : 's'} slower than your current recorded cash flow alone for “${selectedGoal.title}”.`,
          );
        } else {
          recommendations.push(
            `Timeline for “${selectedGoal.title}” is unchanged: ≈ ${goal.months} months (around ${fmtDate(goal.projectedDate)}).`,
          );
        }
      } else {
        recommendations.push(
          `“${selectedGoal.title}” is reachable in ≈ ${goal.months} months (around ${fmtDate(goal.projectedDate)}) under these assumptions.`,
        );
      }
      if (goal.reachableByTarget === false && goal.monthlyNeededByTarget !== null) {
        recommendations.push(
          `To hit the target date ${fmtDate(goal.targetDate)} you would need about ${formatCurrency(goal.monthlyNeededByTarget, cur)} saved every month — ${formatCurrency(Math.max(goal.monthlyNeededByTarget - goal.monthlyContribution, 0), cur)} more than this scenario.`,
        );
      } else if (goal.reachableByTarget === true) {
        recommendations.push(
          `The goal stays achievable by your target date ${fmtDate(goal.targetDate)} (≈ ${goal.monthsToTarget} whole month${goal.monthsToTarget === 1 ? '' : 's'} available).`,
        );
      }
    }
  }

  // ---------- Scenario helpers ----------
  const activeHasInput =
    (activeKind === 'buy' && purchaseCents > 0) ||
    (activeKind === 'reduce' && reduction !== null) ||
    (activeKind === 'save' && savingsCents > 0) ||
    (activeKind === 'debt' && debtPaymentCents > 0);

  function resetScenario() {
    setPurchaseAmount('');
    setPurchaseNote('');
    setReductionCategoryId('');
    setReductionValue('');
    setExtraSavings('');
    setDebtPaymentAmount('');
    setDebtId('');
    setTargetDate('');
  }

  function pinCurrent() {
    if (pinned.length >= 4) return;
    const parts: string[] = [];
    if (purchaseCents > 0) parts.push(`Buy ${formatCurrency(purchaseCents, cur)}`);
    if (reduction && reduction.monthlySavings > 0) {
      parts.push(`Cut ${formatCurrency(reduction.monthlySavings, cur)}/mo`);
    }
    if (savingsCents > 0) parts.push(`+${formatCurrency(savingsCents, cur)}/mo`);
    if (debtSim.paymentCents > 0) {
      parts.push(`Debt +${formatCurrency(debtSim.paymentCents, cur)}`);
    }
    if (parts.length === 0) parts.push('No changes');
    pinSeq += 1;
    setPinned((prev) => [
      ...prev,
      {
        id: `pin-${pinSeq}`,
        label: parts.join(' · '),
        cashAfter: scenario.cashAfter,
        monthlyContribution: refMonth === null && savingsCents === 0 ? null : scenario.monthlyContribution,
        monthsToGoal: goal?.months ?? null,
      },
    ]);
  }

  const goalOptions = db.goals.map((g) => {
    const status = goalStatus(g, now);
    const suffix = status.remaining <= 0 ? ' (achieved)' : '';
    return { value: g.id, label: `${g.title}${suffix}` };
  });
  const debtOptions = openDebts.map((o) => ({
    value: o.debt.id,
    label: `${o.debt.party} — ${formatCurrency(o.remaining, cur)} left`,
  }));
  const categoryOptions = expenseCategories.map((c) => ({ value: c.id, label: c.name }));

  const baselineCash = balance;
  const simulatedCash = scenario.cashAfter;
  const monthlyDelta = scenario.monthlyContribution - (baselineMonthlyNet ?? 0);
  const hasAnyInput =
    purchaseCents > 0 ||
    reduction !== null ||
    savingsCents > 0 ||
    debtPaymentCents > 0 ||
    Boolean(purchaseNote.trim());

  const activeScenarioMeta = SCENARIOS.find((s) => s.kind === activeKind)!;

  return (
    <div className="page">
      <PageHeader
        jp="シミュレーター"
        title="Financial Simulator"
        description="Pick one decision, see the Before → After flow, and pin snapshots to compare. Nothing here is saved."
        actions={
          <Button variant="ghost" onClick={resetScenario} disabled={!hasAnyInput}>
            <RotateCcw size={16} aria-hidden="true" /> Reset scenario
          </Button>
        }
      />

      <div className="summary-strip" role="note">
        <Badge tone="accent">Simulated</Badge>
        <span className="summary-strip-note">
          Estimates from your recorded data under the stated assumptions — not guaranteed outcomes.
          No transactions, balances, budgets, debts or goals are changed by using this page.
        </span>
      </div>

      {/* ---------- Compact baseline ---------- */}
      <div className="summary-strip">
        <div className="summary-strip-note">
          <strong>Your baseline now:</strong> cash on hand, this month's cash flow, and what's left on
          the selected goal.
        </div>
        <div className="list-row-figures">
          <div className="figure">
            <span className="figure-label">Available cash</span>
            <span className="figure-value">{formatCurrency(balance, cur)}</span>
          </div>
          <div className="figure">
            <span className="figure-label">Monthly cash flow</span>
            <span className="figure-value">
              {refMonth ? formatCurrency(refMonth.net, cur, { showSign: true }) : '—'}
            </span>
          </div>
          <div className="figure">
            <span className="figure-label">Monthly spending</span>
            <span className="figure-value">{refMonth ? formatCurrency(refMonth.expense, cur) : '—'}</span>
          </div>
          <div className="figure">
            <span className="figure-label">Goal remaining</span>
            <span className="figure-value">
              {selectedGoal && goalRemaining !== null ? formatCurrency(goalRemaining, cur) : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* ---------- Scenario picker ---------- */}
      <section aria-labelledby="scenario-heading">
        <div className="card-header" style={{ padding: 0, marginBottom: 'var(--spacing-sm)' }}>
          <div>
            <h2 id="scenario-heading">What are you deciding?</h2>
            <p>Pick one — only its controls appear below.</p>
          </div>
        </div>
        <div
          role="radiogroup"
          aria-label="Scenario type"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 'var(--spacing-sm)',
          }}
        >
          {SCENARIOS.map((s) => {
            const selected = s.kind === activeKind;
            return (
              <button
                key={s.kind}
                type="button"
                role="radio"
                aria-checked={selected}
                className="card"
                onClick={() => setActiveKind(s.kind)}
                style={{
                  textAlign: 'left',
                  cursor: 'pointer',
                  padding: 'var(--spacing-md)',
                  borderColor: selected ? 'var(--accent)' : undefined,
                  borderWidth: selected ? 2 : undefined,
                  outline: selected ? 'none' : undefined,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ color: selected ? 'var(--accent)' : 'var(--muted)' }}>{s.icon}</span>
                  <span style={{ fontWeight: 700 }}>{s.label}</span>
                </div>
                <span className="muted text-sm">{s.blurb}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ---------- Controls (active scenario only) + results ---------- */}
      <div className="grid grid-2">
        <section className="card" aria-labelledby="controls-heading">
          <div className="card-header">
            <div>
              <h2 id="controls-heading">{activeScenarioMeta.label}</h2>
              <p>Adjust the hypothetical — results update instantly</p>
            </div>
            <FlaskConical size={18} aria-hidden="true" />
          </div>

          <div className="form-grid">
            {activeKind === 'buy' && (
              <>
                <Field
                  label="Purchase amount"
                  error={parsedPurchase.ok === true ? undefined : parsedPurchase.reason}
                  hint={
                    purchaseCents > 0 && !purchaseSim.affordable
                      ? `Exceeds available cash by ${formatCurrency(purchaseSim.shortfall, cur)}`
                      : 'One-time spend from your cash'
                  }
                >
                  {({ id, 'aria-invalid': invalid, 'aria-describedby': describedBy }) => (
                    <Input
                      id={id}
                      aria-invalid={invalid}
                      aria-describedby={describedBy}
                      inputMode="decimal"
                      placeholder="0.00"
                      value={purchaseAmount}
                      onChange={(e) => setPurchaseAmount(e.target.value)}
                    />
                  )}
                </Field>
                <Field label="What for? (optional)">
                  {({ id }) => (
                    <Input
                      id={id}
                      placeholder="e.g. New phone"
                      value={purchaseNote}
                      onChange={(e) => setPurchaseNote(e.target.value)}
                    />
                  )}
                </Field>
              </>
            )}

            {activeKind === 'reduce' && (
              <>
                <SelectField
                  label="Category"
                  value={reductionCategoryId}
                  onChange={setReductionCategoryId}
                  options={categoryOptions}
                  placeholder={categoryOptions.length === 0 ? 'No expense categories yet' : 'Select a category'}
                  className="field-full"
                  hint={
                    reductionCategoryId && refMonth
                      ? `Recorded ${formatMonthLabel(refMonth.key)} spending: ${formatCurrency(categorySpend, cur)}`
                      : reductionCategoryId
                        ? 'No reference month — recorded spending unavailable'
                        : undefined
                  }
                />
                <Field label="Reduction">
                  {({ id }) => (
                    <div className="segmented" id={id} role="radiogroup" aria-label="Reduction mode">
                      <button
                        type="button"
                        className={`segmented-btn ${reductionMode === 'amount' ? 'is-active is-income' : ''}`}
                        aria-pressed={reductionMode === 'amount'}
                        onClick={() => {
                          setReductionMode('amount');
                          setReductionValue('');
                        }}
                      >
                        Amount
                      </button>
                      <button
                        type="button"
                        className={`segmented-btn ${reductionMode === 'percent' ? 'is-active is-income' : ''}`}
                        aria-pressed={reductionMode === 'percent'}
                        onClick={() => {
                          setReductionMode('percent');
                          setReductionValue('');
                        }}
                      >
                        Percent
                      </button>
                    </div>
                  )}
                </Field>
                <Field
                  label={reductionMode === 'amount' ? 'Cut per month' : 'Cut by %'}
                  error={parsedReduction.ok === true ? undefined : parsedReduction.reason}
                >
                  {({ id, 'aria-invalid': invalid, 'aria-describedby': describedBy }) => (
                    <Input
                      id={id}
                      aria-invalid={invalid}
                      aria-describedby={describedBy}
                      inputMode="decimal"
                      placeholder={reductionMode === 'amount' ? '0.00' : '0'}
                      value={reductionValue}
                      onChange={(e) => setReductionValue(e.target.value)}
                    />
                  )}
                </Field>
              </>
            )}

            {activeKind === 'save' && (
              <>
                <Field
                  label="Save extra per month"
                  error={parsedSavings.ok === true ? undefined : parsedSavings.reason}
                  hint="Added on top of your recorded monthly cash flow"
                >
                  {({ id, 'aria-invalid': invalid, 'aria-describedby': describedBy }) => (
                    <Input
                      id={id}
                      aria-invalid={invalid}
                      aria-describedby={describedBy}
                      inputMode="decimal"
                      placeholder="0.00"
                      value={extraSavings}
                      onChange={(e) => setExtraSavings(e.target.value)}
                    />
                  )}
                </Field>
                {goalOptions.length > 0 ? (
                  <SelectField
                    label="Savings goal"
                    value={goalId}
                    onChange={setGoalId}
                    options={goalOptions}
                    placeholder="No goal"
                  />
                ) : (
                  <p className="muted text-sm field-full">
                    No savings goals yet — create one on the Goals page to see timelines here.
                  </p>
                )}
                {selectedGoal && (
                  <Field
                    label="Target date (override)"
                    className="field-full"
                    hint={
                      targetDate
                        ? 'Custom target for this simulation'
                        : selectedGoal.deadline
                          ? `Using the goal's deadline: ${formatDate(selectedGoal.deadline)}`
                          : 'The goal has no deadline — projections show months only'
                    }
                  >
                    {({ id, 'aria-describedby': describedBy }) => (
                      <Input
                        id={id}
                        aria-describedby={describedBy}
                        type="date"
                        value={targetDate}
                        onChange={(e) => setTargetDate(e.target.value)}
                      />
                    )}
                  </Field>
                )}
              </>
            )}

            {activeKind === 'debt' &&
              (debtOptions.length > 0 ? (
                <>
                  <SelectField
                    label="Debt"
                    value={debtId}
                    onChange={setDebtId}
                    options={debtOptions}
                    placeholder="Select a debt"
                    className="field-full"
                  />
                  <Field
                    label="Extra payment"
                    error={parsedDebtPayment.ok === true ? undefined : parsedDebtPayment.reason}
                    hint="Immediate cash outflow; reduces the remaining balance"
                  >
                    {({ id, 'aria-invalid': invalid, 'aria-describedby': describedBy }) => (
                      <Input
                        id={id}
                        aria-invalid={invalid}
                        aria-describedby={describedBy}
                        inputMode="decimal"
                        placeholder="0.00"
                        value={debtPaymentAmount}
                        onChange={(e) => setDebtPaymentAmount(e.target.value)}
                      />
                    )}
                  </Field>
                </>
              ) : (
                <p className="muted text-sm field-full">
                  No open debts you owe — nothing to simulate here. (Interest, minimum payments and
                  pay-off dates are not modelled; the ledger does not store rates.)
                </p>
              ))}
          </div>
        </section>

        <div style={{ display: 'grid', gap: 'var(--spacing-lg)', alignContent: 'start' }}>
          <section className="card" aria-labelledby="results-heading">
            <div className="card-header">
              <div>
                <h2 id="results-heading">
                  <ArrowRight size={16} aria-hidden="true" /> Before → After
                </h2>
                <p>Baseline (your ledger) vs this what-if scenario</p>
              </div>
              <Badge tone="accent">What-if</Badge>
            </div>

            {!activeHasInput ? (
              <EmptyState
                title="Enter a value to compare"
                description={`Set an amount for “${activeScenarioMeta.label.toLowerCase()}” and the Before → After flow appears here instantly.`}
              />
            ) : (
              <>
                <FlowBar label="Available cash" before={baselineCash} after={simulatedCash} cur={cur} />
                {goal && !goal.alreadyComplete && goal.months !== null && (
                  <p className="muted text-sm" style={{ marginBottom: 'var(--spacing-sm)' }}>
                    “{selectedGoal?.title}” reaches its target in ≈ {goal.months} month
                    {goal.months === 1 ? '' : 's'} (around {fmtDate(goal.projectedDate)})
                    {baselineGoal && baselineGoal.months !== null && baselineGoal.months !== goal.months
                      ? `, ${
                          baselineGoal.months - goal.months > 0 ? 'sooner' : 'slower'
                        } than your current cash flow alone.`
                      : '.'}
                  </p>
                )}
                {debtSim.paymentCents > 0 && selectedDebt && (
                  <FlowBar
                    label={`Debt remaining — ${selectedDebt.debt.party}`}
                    before={debtSim.remainingBefore}
                    after={debtSim.remainingAfter}
                    cur={cur}
                  />
                )}
                {purchaseNote.trim() && purchaseCents > 0 && (
                  <p className="muted text-sm">
                    Simulated purchase: “{purchaseNote.trim()}” — {formatCurrency(purchaseCents, cur)} from
                    cash.
                  </p>
                )}
              </>
            )}

            {/* Precise figures */}
            <div className="table-wrap" style={{ marginTop: 'var(--spacing-md)' }}>
              <table className="data-table">
                <caption className="sr-only">Baseline versus simulated financial results</caption>
                <thead>
                  <tr>
                    <th scope="col">Metric</th>
                    <th scope="col" className="num">
                      Baseline
                    </th>
                    <th scope="col" className="num">
                      Simulated
                    </th>
                    <th scope="col" className="num">
                      Difference
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Available cash (one-time)</th>
                    <td className="num">{formatCurrency(baselineCash, cur)}</td>
                    <td className="num">{formatCurrency(simulatedCash, cur)}</td>
                    <td className="num">{formatCurrency(simulatedCash - baselineCash, cur, { showSign: true })}</td>
                  </tr>
                  <tr>
                    <th scope="row">Monthly contribution</th>
                    <td className="num">
                      {baselineMonthlyNet === null ? '—' : formatCurrency(baselineMonthlyNet, cur, { showSign: true })}
                    </td>
                    <td className="num">
                      {refMonth === null && savingsCents === 0 && (reduction?.monthlySavings ?? 0) === 0
                        ? '—'
                        : formatCurrency(scenario.monthlyContribution, cur, { showSign: true })}
                    </td>
                    <td className="num">
                      {refMonth === null ? '—' : formatCurrency(monthlyDelta, cur, { showSign: true })}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Months to goal</th>
                    <td className="num">{baselineGoal?.months ?? '—'}</td>
                    <td className="num">
                      {goal === null
                        ? '—'
                        : goal.alreadyComplete
                          ? 'Achieved'
                          : goal.months === null
                            ? 'Never'
                            : `≈ ${goal.months}`}
                    </td>
                    <td className="num">
                      {goal && baselineGoal && goal.months !== null && baselineGoal.months !== null
                        ? `${baselineGoal.months - goal.months > 0 ? '−' : '+'}${Math.abs(baselineGoal.months - goal.months)}`
                        : '—'}
                    </td>
                  </tr>
                  {goal && !goal.alreadyComplete && goal.months !== null && (
                    <tr>
                      <th scope="row">Estimated target date</th>
                      <td className="num">{baselineGoal?.projectedDate ? fmtDate(baselineGoal.projectedDate) : '—'}</td>
                      <td className="num">{fmtDate(goal.projectedDate)}</td>
                      <td className="num">Estimated</td>
                    </tr>
                  )}
                  {debtSim.paymentCents > 0 && selectedDebt && (
                    <tr>
                      <th scope="row">Debt remaining after payment</th>
                      <td className="num">{formatCurrency(debtSim.remainingBefore, cur)}</td>
                      <td className="num">{formatCurrency(debtSim.remainingAfter, cur)}</td>
                      <td className="num">{formatCurrency(-debtSim.paymentCents, cur)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {warnings.length > 0 && (
              <ul className="upcoming-list" style={{ marginTop: 'var(--spacing-md)' }}>
                {warnings.map((w) => (
                  <li key={w} className="upcoming-item upcoming-item--debt">
                    <div>
                      <span className="list-row-sub">{w}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card" aria-labelledby="recommendations-heading">
            <div className="card-header">
              <div>
                <h2 id="recommendations-heading">
                  <Lightbulb size={16} aria-hidden="true" /> Goal-based recommendations
                </h2>
                <p>Derived from the calculations above — plain arithmetic, not advice</p>
              </div>
            </div>
            {!selectedGoal ? (
              <EmptyState
                title="Select a savings goal"
                description="Choose “Save more each month”, then pick a goal to compare timelines and check target-date feasibility."
              />
            ) : recommendations.length === 0 ? (
              <p className="muted text-sm">
                Adjust the controls — recommendations appear once the scenario produces a timeline for “
                {selectedGoal.title}”.
              </p>
            ) : (
              <ul className="upcoming-list">
                {recommendations.map((r) => (
                  <li key={r} className="upcoming-item upcoming-item--goal">
                    <div>
                      <span className="list-row-sub">{r}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* ---------- Comparison ---------- */}
      <section className="card" aria-labelledby="compare-heading">
        <div className="card-header">
          <div>
            <h2 id="compare-heading">Compare scenarios</h2>
            <p>Pin up to four scenarios — e.g. buy now vs wait and save — then switch inputs freely</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button size="sm" onClick={pinCurrent} disabled={pinned.length >= 4}>
              Pin current
            </Button>
            {pinned.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setPinned([])}>
                <X size={14} aria-hidden="true" /> Clear
              </Button>
            )}
          </div>
        </div>

        {pinned.length === 0 ? (
          <EmptyState
            title="No pinned scenarios yet"
            description="Configure a what-if above, then click “Pin current”. Change the scenario and pin again — the table keeps every snapshot so you can compare buying now against waiting and saving."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <caption className="sr-only">Comparison of baseline and pinned simulated scenarios</caption>
              <thead>
                <tr>
                  <th scope="col">Scenario</th>
                  <th scope="col" className="num">
                    Cash after
                  </th>
                  <th scope="col" className="num">
                    Monthly contribution
                  </th>
                  <th scope="col" className="num">
                    Months to goal
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Baseline (do nothing)</th>
                  <td className="num">{formatCurrency(balance, cur)}</td>
                  <td className="num">
                    {baselineMonthlyNet === null ? '—' : formatCurrency(baselineMonthlyNet, cur, { showSign: true })}
                  </td>
                  <td className="num">{baselineGoal?.months ?? '—'}</td>
                </tr>
                {pinned.map((p) => (
                  <tr key={p.id}>
                    <th scope="row">
                      {p.label} <Badge tone="accent">Simulated</Badge>
                    </th>
                    <td className="num">{formatCurrency(p.cashAfter, cur)}</td>
                    <td className="num">
                      {p.monthlyContribution === null ? '—' : formatCurrency(p.monthlyContribution, cur, { showSign: true })}
                    </td>
                    <td className="num">
                      {p.monthsToGoal === null ? 'Never' : p.monthsToGoal === 0 ? 'Achieved' : `≈ ${p.monthsToGoal}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---------- Assumptions (disclosure, not a wall of text) ---------- */}
      <details className="card" style={{ padding: 'var(--spacing-md)' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
          <Target size={15} aria-hidden="true" /> How does this work? (assumptions & limits)
        </summary>
        <p className="muted text-sm" style={{ marginTop: 'var(--spacing-sm)' }}>
          Monthly cash flow baseline = income − expenses of{' '}
          {refMonth ? formatMonthLabel(refMonth.key) : '— (no recorded transactions)'}; savings
          projections assume a constant monthly contribution with <strong>no interest or investment
          returns</strong>, counted at the end of each month; month counts are whole calendar months
          (partial months are ignored, conservative); debt payments reduce the remaining balance only
          — <strong>interest rates, minimum payments and pay-off dates are not modelled</strong>
          because the ledger does not store them; spending reductions cannot exceed the category's
          recorded monthly spending and are capped when they do; purchases and payments larger than
          available cash are shown with negative simulated cash and a warning rather than blocked. All
          amounts are integer centavos. Nothing on this page is written to your ledger.
        </p>
      </details>
    </div>
  );
}
