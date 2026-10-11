import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Download,
  Eye,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';

import PageHeader from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Field, Input, SelectField } from '../components/ui/Field';
import { ConfirmDialog, Modal } from '../components/ui/Modal';
import { Badge, EmptyState } from '../components/ui/Indicators';
import TransactionForm from '../features/transactions/TransactionForm';
import { useLedger } from '../context/LedgerContext';
import { useToast } from '../context/ToastContext';
import type { Transaction, TransactionFilters } from '../types';
import {
  computeRunningBalances,
  computeTotals,
  filterTransactions,
  sortTransactions,
  sumOpeningBalances,
  toMajor,
  totalBalance,
} from '../utils/finance';
import { formatDate, formatCurrency } from '../utils/format';
import { downloadCsv, todayFileStamp, transactionsToCsv } from '../utils/csv';

const PAGE_SIZE = 12;

const EMPTY_FILTERS: TransactionFilters = {
  search: '',
  from: '',
  to: '',
  type: 'all',
  category: 'all',
  paymentMethod: 'all',
  account: 'all',
  sortKey: 'date',
  sortDir: 'desc',
};

export default function Transactions() {
  const { db, deleteTransaction } = useLedger();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [filters, setFilters] = useState<TransactionFilters>(() => ({
    ...EMPTY_FILTERS,
    search: searchParams.get('search') ?? '',
  }));
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | undefined>();
  const [viewing, setViewing] = useState<Transaction | undefined>();
  const [confirming, setConfirming] = useState<Transaction | undefined>();

  // External search (navbar) syncs into the local filter.
  useEffect(() => {
    const q = searchParams.get('search');
    if (q !== null) setFilters((prev) => ({ ...prev, search: q }));
  }, [searchParams]);

  const filtered = useMemo(() => {
    const range =
      filters.from && filters.to && filters.from <= filters.to
        ? { from: filters.from, to: filters.to }
        : null;
    const result = filterTransactions(db.transactions, filters, range);
    return sortTransactions(result, filters.sortKey ?? 'date', filters.sortDir ?? 'desc');
  }, [db.transactions, filters]);

  // Running balances come from each account's own chronological stream, then
  // rows are looked up by id — so filters never distort the accounting
  // position, and every row shows the balance of the account it belongs to.
  const balanceById = useMemo(() => {
    const map = new Map<string, number>();
    for (const account of db.accounts) {
      const own = db.transactions.filter((t) => t.account === account.id);
      for (const row of computeRunningBalances(own, account.openingBalance, false)) {
        map.set(row.transaction.id, row.balance);
      }
    }
    return map;
  }, [db.transactions, db.accounts]);

  const totals = useMemo(() => computeTotals(filtered), [filtered]);

  // Scope-aware opening balance: the selected account's opening balance, or
  // the sum of every account when showing all. Paired with the current
  // balance this frames the filtered rows inside a real accounting position.
  const openingBalance = useMemo(() => {
    if (filters.account && filters.account !== 'all') {
      return db.accounts.find((a) => a.id === filters.account)?.openingBalance ?? 0;
    }
    return sumOpeningBalances(db.accounts);
  }, [db.accounts, filters.account]);

  // Current balance of the selected scope (opening + every transaction on it).
  const currentBalance = useMemo(() => {
    if (filters.account && filters.account !== 'all') {
      const acc = db.accounts.find((a) => a.id === filters.account);
      if (!acc) return 0;
      return (
        acc.openingBalance +
        db.transactions
          .filter((t) => t.account === acc.id)
          .reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0)
      );
    }
    return totalBalance(db.accounts, db.transactions);
  }, [db.accounts, db.transactions, filters.account]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const categoryById = useMemo(() => new Map(db.categories.map((c) => [c.id, c])), [db.categories]);
  const pmById = useMemo(() => new Map(db.paymentMethods.map((p) => [p.id, p])), [db.paymentMethods]);
  const accountById = useMemo(() => new Map(db.accounts.map((a) => [a.id, a])), [db.accounts]);

  const activeFilterCount = [
    filters.search,
    filters.from,
    filters.to,
    filters.type && filters.type !== 'all' ? filters.type : '',
    filters.category && filters.category !== 'all' ? filters.category : '',
    filters.paymentMethod && filters.paymentMethod !== 'all' ? filters.paymentMethod : '',
    filters.account && filters.account !== 'all' ? filters.account : '',
  ].filter(Boolean).length;

  function updateFilter(patch: Partial<TransactionFilters>) {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  }

  function resetFilters() {
    setFilters({ ...EMPTY_FILTERS });
    setSearchParams({});
    setPage(1);
  }

  function toggleSort(key: 'date' | 'amount') {
    if (filters.sortKey === key) {
      updateFilter({ sortDir: filters.sortDir === 'asc' ? 'desc' : 'asc' });
    } else {
      updateFilter({ sortKey: key, sortDir: key === 'date' ? 'desc' : 'desc' });
    }
  }

  function onExport() {
    const csv = transactionsToCsv(filtered, {
      categories: db.categories,
      paymentMethods: db.paymentMethods,
      accounts: db.accounts,
      currency: db.settings.currency,
      mode: 'ledger',
    });
    downloadCsv(`sakura-transactions-${todayFileStamp()}`, csv);
    toast(`Exported ${filtered.length} transaction(s) to CSV.`, 'success');
  }

  const sortIcon = (key: 'date' | 'amount') =>
    filters.sortKey === key ? (filters.sortDir === 'asc' ? '▲' : '▼') : '↕';

  return (
    <div className="page">
      <PageHeader
        jp="取引"
        title="Transactions"
        description="Search, filter, edit and export every income and expense entry."
        actions={
          <>
            <Button variant="ghost" onClick={onExport} disabled={filtered.length === 0}>
              <Download size={15} /> Export CSV
            </Button>
            <Button
              onClick={() => {
                setEditing(undefined);
                setFormOpen(true);
              }}
            >
              <Plus size={15} /> Add transaction
            </Button>
          </>
        }
      />

      {/* ---------- Filters ---------- */}
      <div className="toolbar" role="search" aria-label="Transaction filters">
        <Field label="Search" className="grow">
          {({ id }) => (
            <div className="input-icon">
              <Search size={15} aria-hidden="true" />
              <Input
                id={id}
                type="search"
                placeholder="Description or reference…"
                value={filters.search ?? ''}
                onChange={(e) => updateFilter({ search: e.target.value })}
              />
            </div>
          )}
        </Field>

        <Field label="From">
          {({ id }) => (
            <Input
              id={id}
              type="date"
              value={filters.from ?? ''}
              onChange={(e) => updateFilter({ from: e.target.value })}
            />
          )}
        </Field>

        <Field label="To">
          {({ id }) => (
            <Input
              id={id}
              type="date"
              value={filters.to ?? ''}
              onChange={(e) => updateFilter({ to: e.target.value })}
            />
          )}
        </Field>

        <SelectField
          label="Type"
          value={filters.type ?? 'all'}
          onChange={(v) => updateFilter({ type: v as TransactionFilters['type'] })}
          options={[
            { value: 'all', label: 'All types' },
            { value: 'income', label: 'Income' },
            { value: 'expense', label: 'Expense' },
          ]}
        />

        <SelectField
          label="Category"
          value={filters.category ?? 'all'}
          onChange={(v) => updateFilter({ category: v })}
          options={[
            { value: 'all', label: 'All categories' },
            ...db.categories.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />

        <SelectField
          label="Payment method"
          value={filters.paymentMethod ?? 'all'}
          onChange={(v) => updateFilter({ paymentMethod: v })}
          options={[
            { value: 'all', label: 'All methods' },
            ...db.paymentMethods.map((p) => ({ value: p.id, label: p.name })),
          ]}
        />

        <SelectField
          label="Account"
          value={filters.account ?? 'all'}
          onChange={(v) => updateFilter({ account: v })}
          options={[
            { value: 'all', label: 'All accounts' },
            ...db.accounts.map((a) => ({
              value: a.id,
              label: a.archived ? `${a.name} (archived)` : a.name,
            })),
          ]}
        />

        <div className="toolbar-actions">
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            <RotateCcw size={14} /> Reset {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
          </Button>
        </div>
      </div>

      {/* ---------- Results summary ---------- */}
      <div className="summary-strip">
        <div className="summary-strip-note">
          <strong>Scope:</strong>{' '}
          {filters.account && filters.account !== 'all'
            ? accountById.get(filters.account)?.name ?? 'Account'
            : 'All accounts'}
          . Opening balance <span className="mono-num">{formatCurrency(openingBalance, db.settings.currency)}</span>
          {filters.account && filters.account !== 'all' ? '' : ' (sum of all accounts)'}; the current balance
          below is the live position, while the credit/debit totals reflect only the {filtered.length} filtered
          row(s).
        </div>
        <div className="list-row-figures">
          <div className="figure">
            <span className="figure-label">Showing</span>
            <span className="figure-value">
              {filtered.length}
              <span className="muted"> / {db.transactions.length}</span>
            </span>
          </div>
          <div className="figure">
            <span className="figure-label">Credits</span>
            <span className="figure-value amount-income">
              {formatCurrency(totals.income, db.settings.currency)}
            </span>
          </div>
          <div className="figure">
            <span className="figure-label">Debits</span>
            <span className="figure-value amount-expense">
              {formatCurrency(totals.expense, db.settings.currency)}
            </span>
          </div>
          <div className="figure">
            <span className="figure-label">Net (filtered)</span>
            <span className="figure-value">
              {formatCurrency(totals.net, db.settings.currency, { showSign: true })}
            </span>
          </div>
          <div className="figure">
            <span className="figure-label">Current balance</span>
            <span className="figure-value">{formatCurrency(currentBalance, db.settings.currency)}</span>
          </div>
        </div>
      </div>

      {/* ---------- Table ---------- */}
      {filtered.length === 0 ? (
        <EmptyState
          title={db.transactions.length === 0 ? 'No transactions yet' : 'No matches'}
          description={
            db.transactions.length === 0
              ? 'Add your first income or expense and it will show up here instantly.'
              : 'Try widening the date range or clearing the filters.'
          }
          action={
            db.transactions.length === 0 ? (
              <Button
                onClick={() => {
                  setEditing(undefined);
                  setFormOpen(true);
                }}
              >
                <Plus size={15} /> Add transaction
              </Button>
            ) : (
              <Button variant="ghost" onClick={resetFilters}>
                <RotateCcw size={14} /> Reset filters
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <caption className="sr-only">Transactions matching the current filters</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <button type="button" className="sort-btn" onClick={() => toggleSort('date')}>
                      Date <span aria-hidden="true">{sortIcon('date')}</span>
                    </button>
                  </th>
                  <th scope="col">Reference</th>
                  <th scope="col">Description</th>
                  <th scope="col">Category</th>
                  <th scope="col">Payment</th>
                  <th scope="col">Account</th>
                  <th scope="col" className="num">
                    <button type="button" className="sort-btn" onClick={() => toggleSort('amount')}>
                      Amount <span aria-hidden="true">{sortIcon('amount')}</span>
                    </button>
                  </th>
                  <th scope="col" className="num">
                    Balance
                  </th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((t) => {
                  const balance = balanceById.get(t.id);
                  return (
                    <tr key={t.id}>
                      <td className="mono-num">{formatDate(t.date, db.settings.dateFormat)}</td>
                      <td className="mono-num muted">{t.reference || '—'}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{t.description}</div>
                        <div className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                          <Badge tone={t.type === 'income' ? 'income' : 'expense'}>
                            {t.type === 'income' ? 'Credit' : 'Debit'}
                          </Badge>
                        </div>
                      </td>
                      <td>{categoryById.get(t.category)?.name ?? 'Uncategorized'}</td>
                      <td>{pmById.get(t.paymentMethod)?.name ?? '—'}</td>
                      <td>
                        {accountById.get(t.account)?.name ?? '—'}
                        {accountById.get(t.account)?.archived && <Badge tone="neutral">archived</Badge>}
                      </td>
                      <td className={`num ${t.type === 'income' ? 'amount-income' : 'amount-expense'}`}>
                        {t.type === 'income' ? '+' : '−'}
                        {formatCurrency(t.amount, db.settings.currency)}
                      </td>
                      <td className="num mono-num">{balance !== undefined ? formatCurrency(balance, db.settings.currency) : '—'}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="row-action"
                            onClick={() => setViewing(t)}
                            aria-label={`View ${t.description}`}
                            title="View details"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            type="button"
                            className="row-action"
                            onClick={() => {
                              setEditing(t);
                              setFormOpen(true);
                            }}
                            aria-label={`Edit ${t.description}`}
                            title="Edit"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            className="row-action is-danger"
                            onClick={() => setConfirming(t)}
                            aria-label={`Delete ${t.description}`}
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="table-scroll-hint">Scroll the table sideways to see all columns.</p>

          <div className="pagination">
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <div className="pagination-controls">
              <Button
                variant="ghost"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ---------- Create / edit ---------- */}
      <TransactionForm
        open={formOpen}
        initial={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => setPage(1)}
      />

      {/* ---------- Details ---------- */}
      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(undefined)}
        title="Transaction details"
        footer={
          <>
            <Button variant="ghost" onClick={() => setViewing(undefined)}>
              Close
            </Button>
            <Button
              onClick={() => {
                setEditing(viewing);
                setViewing(undefined);
                setFormOpen(true);
              }}
            >
              <Pencil size={14} /> Edit
            </Button>
          </>
        }
      >
        {viewing && (
          <dl className="detail-grid">
            <div className="detail-item">
              <dt>Date</dt>
              <dd>{formatDate(viewing.date, db.settings.dateFormat)}</dd>
            </div>
            <div className="detail-item">
              <dt>Type</dt>
              <dd>
                <Badge tone={viewing.type === 'income' ? 'income' : 'expense'}>
                  {viewing.type === 'income' ? 'Income (credit)' : 'Expense (debit)'}
                </Badge>
              </dd>
            </div>
            <div className="detail-item">
              <dt>Amount</dt>
              <dd className={viewing.type === 'income' ? 'amount-income' : 'amount-expense'}>
                {formatCurrency(viewing.amount, db.settings.currency)}
              </dd>
            </div>
            <div className="detail-item">
              <dt>Category</dt>
              <dd>{categoryById.get(viewing.category)?.name ?? 'Uncategorized'}</dd>
            </div>
            <div className="detail-item">
              <dt>Payment method</dt>
              <dd>{pmById.get(viewing.paymentMethod)?.name ?? '—'}</dd>
            </div>
            <div className="detail-item">
              <dt>Account</dt>
              <dd>
                {accountById.get(viewing.account)?.name ?? '—'}
                {accountById.get(viewing.account)?.archived && <Badge tone="neutral"> archived</Badge>}
              </dd>
            </div>
            <div className="detail-item">
              <dt>Reference</dt>
              <dd>{viewing.reference || '—'}</dd>
            </div>
            <div className="detail-item">
              <dt>Account balance after</dt>
              <dd className="mono-num">
                {formatCurrency(balanceById.get(viewing.id) ?? 0, db.settings.currency)}
              </dd>
            </div>
            <div className="detail-item">
              <dt>Created</dt>
              <dd>{new Date(viewing.createdAt).toLocaleString()}</dd>
            </div>
            <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
              <dt>Notes</dt>
              <dd>{viewing.notes || '—'}</dd>
            </div>
          </dl>
        )}
      </Modal>

      {/* ---------- Delete confirmation ---------- */}
      <ConfirmDialog
        open={Boolean(confirming)}
        title="Delete transaction?"
        message={`“${confirming?.description ?? ''}” (${formatCurrency(confirming?.amount ?? 0, db.settings.currency)}) will be removed and every balance recalculated. This cannot be undone.`}
        onCancel={() => setConfirming(undefined)}
        onConfirm={() => {
          if (!confirming) return;
          const amount = toMajor(confirming.amount);
          deleteTransaction(confirming.id);
          setConfirming(undefined);
          toast(`Deleted ${confirming.description} (₱${amount.toFixed(2)}).`, 'success');
        }}
      />
    </div>
  );
}
