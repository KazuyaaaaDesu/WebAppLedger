import { useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Layers,
  Lightbulb,
  PiggyBank,
  Percent,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

import PageHeader from '../components/layout/PageHeader';
import PeriodSelect from '../components/PeriodSelect';
import { KpiCard } from '../components/ui/Kpi';
import { LinkButton } from '../components/ui/Button';
import { Badge, EmptyState, Progress, ProgressMeta } from '../components/ui/Indicators';
import { CategoryStackedChart } from '../components/charts/Charts';
import { Link } from 'react-router-dom';
import { useLedger } from '../context/LedgerContext';
import type { PeriodSelection } from '../types';
import {
  budgetAlerts,
  categoryTimeSeries,
  emergencyFundCoverage,
  generateInsights,
  generateRecommendations,
  largestExpenseCategory,
  monthOverMonthExpense,
  periodHealth,
} from '../utils/insights';
import {
  computeTotals,
  filterTransactions,
  rangeForPeriod,
  sumOpeningBalances,
} from '../utils/finance';
import { formatCurrency, formatPercent } from '../utils/format';

const TONE_BADGE = {
  info: 'neutral',
  success: 'success',
  warning: 'warning',
  error: 'error',
} as const;

const TONE_ITEM = {
  info: 'goal',
  success: 'txn',
  warning: 'debt',
  error: 'debt',
} as const;

/** Surface the most urgent findings first: errors, then warnings, then the rest. */
const TONE_SEVERITY: Record<string, number> = { error: 0, warning: 1, success: 2, info: 3 };

/** Budget-related insights link straight to the page that can fix them. */
function insightAction(id: string): { to: string; label: string } | null {
  if (id.startsWith('budget-over-') || id.startsWith('budget-near-')) {
    return { to: '/budgets', label: 'Review budgets' };
  }
  return null;
}

/**
 * FINANCIAL HEALTH & SMART INSIGHTS
 *
 * Every metric, insight and recommendation on this page is calculated from
 * the persisted ledger via utils/insights. Missing data renders as an
 * explicit "—" or an insufficient-data empty state; nothing is predicted,
 * invented, or scored by an opaque formula.
 */
export default function Insights() {
  const { db } = useLedger();
  const [period, setPeriod] = useState<PeriodSelection>({ key: 'thisMonth' });

  // Fixed "now" for a stable render (recomputed on remount).
  const now = useMemo(() => new Date(), []);
  const cur = db.settings.currency;

  const range = useMemo(() => rangeForPeriod(period.key, period, now), [period, now]);
  const periodTxns = useMemo(
    () => filterTransactions(db.transactions, {}, range),
    [db.transactions, range],
  );
  const totals = useMemo(() => computeTotals(periodTxns), [periodTxns]);
  const health = useMemo(() => periodHealth(totals), [totals]);
  const mom = useMemo(() => monthOverMonthExpense(db.transactions, now), [db.transactions, now]);
  const largest = useMemo(
    () => largestExpenseCategory(db.transactions, db.categories, range),
    [db.transactions, db.categories, range],
  );
  const alerts = useMemo(
    () => budgetAlerts(db.budgets, db.transactions, db.categories),
    [db.budgets, db.transactions, db.categories],
  );
  const coverage = useMemo(
    () => emergencyFundCoverage(db.transactions, sumOpeningBalances(db.accounts), now),
    [db.transactions, db.accounts, now],
  );
  const insights = useMemo(
    () =>
      [...generateInsights(db, range, now)].sort(
        (a, b) => (TONE_SEVERITY[a.tone] ?? 3) - (TONE_SEVERITY[b.tone] ?? 3),
      ),
    [db, range, now],
  );
  const recommendations = useMemo(() => generateRecommendations(db, now), [db, now]);
  const chart = useMemo(
    () => categoryTimeSeries(db.transactions, db.categories, range),
    [db.transactions, db.categories, range],
  );

  const periodLabel = range
    ? `${range.from} → ${range.to}`
    : 'all recorded transactions';

  // ---------- Empty ledger: nothing to measure ----------
  if (db.transactions.length === 0) {
    return (
      <div className="page">
        <PageHeader
          jp="健康診断"
          title="Financial Health"
          description="Savings rate, spending comparisons and data-driven insights — all calculated from your ledger."
        />
        <EmptyState
          icon={<Activity size={28} aria-hidden="true" />}
          title="No data yet"
          description="Financial health metrics appear as soon as you record income or expenses. Every number here will be derived from your own transactions — nothing is estimated from outside data."
          action={<LinkButton to="/transactions">Add your first transaction</LinkButton>}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        jp="健康診断"
        title="Financial Health"
        description="Savings rate, spending comparisons and insights calculated from your persisted ledger."
        actions={<LinkButton to="/simulator" variant="ghost">Open Simulator</LinkButton>}
      />

      <div className="toolbar">
        <PeriodSelect value={period} onChange={setPeriod} label="Metrics period" />
        <div className="toolbar-actions">
          <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
            Metrics below marked “period” use {periodLabel}. Month-over-month, budgets and coverage
            always use calendar months and all recorded data.
          </span>
        </div>
      </div>

      {/* ---------- Health metrics ---------- */}
      <div className="grid grid-kpi">
        <KpiCard
          label="Savings rate (period)"
          value={health.savingsRate === null ? '—' : formatPercent(health.savingsRate, 1)}
          icon={<PiggyBank size={17} />}
          sub={
            health.savingsRate === null
              ? 'No income in this period — rate unavailable'
              : `(income − expenses) ÷ income · ${formatCurrency(totals.net, cur)} kept`
          }
          tone={
            health.savingsRate === null
              ? 'neutral'
              : health.savingsRate >= 0
                ? 'positive'
                : 'negative'
          }
        />
        <KpiCard
          label="Expense-to-income (period)"
          value={health.expenseToIncome === null ? '—' : formatPercent(health.expenseToIncome, 1)}
          icon={<Percent size={17} />}
          sub={
            health.expenseToIncome === null
              ? 'No income in this period — ratio unavailable'
              : `${formatCurrency(totals.expense, cur)} of ${formatCurrency(totals.income, cur)} income`
          }
          tone={
            health.expenseToIncome === null
              ? 'neutral'
              : health.expenseToIncome > 1
                ? 'negative'
                : 'neutral'
          }
        />
        <KpiCard
          label="Spending change"
          value={
            mom.percent === null
              ? '—'
              : `${mom.diff > 0 ? '+' : mom.diff < 0 ? '−' : '±'}${formatPercent(Math.abs(mom.percent), 0)}`
          }
          icon={mom.diff >= 0 ? <TrendingUp size={17} /> : <TrendingDown size={17} />}
          sub={
            mom.percent === null
              ? `No spending recorded in ${mom.previousKey} to compare against`
              : `${formatCurrency(mom.current, cur)} vs ${formatCurrency(mom.previous, cur)} · ${mom.currentKey} vs ${mom.previousKey}`
          }
          tone={
            mom.percent === null ? 'neutral' : mom.diff <= 0 ? 'positive' : 'negative'
          }
        />
        <KpiCard
          label="Largest category (period)"
          value={largest ? largest.name : '—'}
          icon={<Layers size={17} />}
          sub={
            largest
              ? `${formatCurrency(largest.amount, cur)} · ${formatPercent(largest.percent, 1)} of expenses`
              : 'No expenses in this period'
          }
        />
        <KpiCard
          label="Emergency fund coverage"
          value={coverage ? `≈ ${coverage.months.toFixed(1)} months` : '—'}
          icon={<Target size={17} />}
          sub={
            coverage
              ? `Estimate: balance ${formatCurrency(coverage.balance, cur)} ÷ ${formatCurrency(coverage.averageMonthlyExpense, cur)}/mo avg`
              : 'Not enough expense data to estimate'
          }
        />
      </div>

      {/* ---------- Insights + recommendations ---------- */}
      <div className="grid grid-2">
        <section className="card" aria-labelledby="insights-heading">
          <div className="card-header">
            <div>
              <h2 id="insights-heading">Actionable insights</h2>
              <p>Generated from your recorded transactions, budgets and balances</p>
            </div>
            <Badge tone="neutral">{insights.length}</Badge>
          </div>
          {insights.length === 0 ? (
            <EmptyState
              title="Not enough data yet"
              description="Insights appear once there is something to compare — for example a previous month with spending, a budget nearing its limit, or income to calculate a savings rate."
            />
          ) : (
            <ul className="upcoming-list">
              {insights.map((i) => {
                const action = insightAction(i.id);
                return (
                  <li key={i.id} className={`upcoming-item upcoming-item--${TONE_ITEM[i.tone]}`}>
                    <div>
                      <strong>{i.title}</strong>
                      <span className="list-row-sub">{i.detail}</span>
                      {action && (
                        <Link to={action.to} className="text-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                          {action.label} <ArrowRight size={13} aria-hidden="true" />
                        </Link>
                      )}
                    </div>
                    <div className="upcoming-date">
                      <Badge tone={TONE_BADGE[i.tone]}>
                        {i.tone === 'info' ? 'info' : i.tone === 'error' ? 'over' : i.tone}
                      </Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card" aria-labelledby="recommendations-heading">
          <div className="card-header">
            <div>
              <h2 id="recommendations-heading">
                <Lightbulb size={16} aria-hidden="true" /> Recommendations
              </h2>
              <p>Simple rules over your own data — every suggestion explains why it appeared</p>
            </div>
            <Badge tone="neutral">{recommendations.length}</Badge>
          </div>
          {recommendations.length === 0 ? (
            <EmptyState
              title="Nothing to flag"
              description="No budgets are near their limits, no category rose sharply versus last month, and your savings rate and coverage look unremarkable for the recorded data."
            />
          ) : (
            <ul className="upcoming-list">
              {recommendations.map((r) => (
                <li key={r.id} className="upcoming-item upcoming-item--goal">
                  <div>
                    <strong>{r.title}</strong>
                    <span className="list-row-sub">Why: {r.why}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="muted text-sm" style={{ marginTop: 'var(--spacing-md)' }}>
            These are transparent, pre-defined rules over your ledger — not AI, not a prediction of
            future balances, and not personalized financial advice.
          </p>
        </section>
      </div>

      {/* ---------- Budget health ---------- */}
      <section className="card" aria-labelledby="budget-health-heading">
        <div className="card-header">
          <div>
            <h2 id="budget-health-heading">Budget health</h2>
            <p>Budgets at or above 85% of their limit, across all periods</p>
          </div>
          <Badge tone={alerts.some((a) => a.level === 'over') ? 'error' : alerts.length > 0 ? 'warning' : 'success'}>
            {alerts.length} flagged
          </Badge>
        </div>
        {alerts.length === 0 ? (
          <EmptyState
            title="All budgets healthy"
            description="No budget is at or above 85% of its spending limit right now."
          />
        ) : (
          alerts.map(({ status, level }) => (
            <div key={status.budget.id} style={{ marginBottom: 'var(--spacing-md)' }}>
              <div className="list-row-title" style={{ marginBottom: 4, fontSize: 'var(--text-sm)' }}>
                <span className="legend-dot" style={{ backgroundColor: status.color }} aria-hidden="true" />
                {status.categoryName}
                <Badge tone="neutral">
                  {status.budget.period === 'monthly' ? status.budget.periodKey : `Year ${status.budget.periodKey}`}
                </Badge>
                <Badge tone={level === 'over' ? 'error' : 'warning'}>
                  {level === 'over' ? 'Exceeded' : 'Near limit'}
                </Badge>
              </div>
              <Progress
                ratio={status.ratio}
                label={`${status.categoryName} budget usage`}
                valueText={`${formatCurrency(status.spent, cur)} spent of ${formatCurrency(status.budget.limit, cur)}`}
              />
              <ProgressMeta
                left={`${formatCurrency(status.spent, cur)} spent`}
                right={`${formatPercent(status.ratio, 0)} used · ${formatCurrency(status.remaining, cur)} left`}
              />
            </div>
          ))
        )}
      </section>

      {/* ---------- Spending patterns ---------- */}
      <section className="card" aria-labelledby="spending-patterns-heading">
        <div className="card-header">
          <div>
            <h2 id="spending-patterns-heading">Spending patterns</h2>
            <p>Expenses by category over time, grouped by month ({periodLabel})</p>
          </div>
        </div>
        {chart.points.length === 0 ? (
          <EmptyState
            title="No expenses in this period"
            description="Pick a different reporting period — or add expense transactions — to see spending by category over time."
          />
        ) : (
          <>
            <CategoryStackedChart points={chart.points} series={chart.series} height={320} />
            <p className="chart-note">
              Expenses only (income excluded). The top{' '}
              {Math.max(
                chart.series.length - (chart.series.some((s) => s.id === '__other') ? 1 : 0),
                1,
              )}{' '}
              categories by total spending are shown; everything else is grouped as “Other”. Source:{' '}
              {periodTxns.filter((t) => t.type === 'expense').length} expense transaction(s) from your
              ledger.
            </p>
          </>
        )}
      </section>

      {/* ---------- Assumptions (disclosure, not a wall of text) ---------- */}
      <details className="card" style={{ padding: 'var(--spacing-md)' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
          <Target size={15} aria-hidden="true" /> How these numbers are calculated
        </summary>
        <p className="muted text-sm" style={{ marginTop: 'var(--spacing-sm)' }}>
          Savings rate = (income − expenses) ÷ income for the selected period; expense-to-income =
          expenses ÷ income; spending change compares the current calendar month with the previous one
          using recorded expense dates; budget health uses each budget's own period; emergency-fund
          coverage = aggregate balance (sum of all account opening balances + net of all transactions) ÷
          average monthly expenses across the last 3 months that contain recorded activity. Coverage is
          an estimate from historical data, not a forecast of future balances. All amounts are integer
          centavos; percentages are display-only.
        </p>
      </details>
    </div>
  );
}
