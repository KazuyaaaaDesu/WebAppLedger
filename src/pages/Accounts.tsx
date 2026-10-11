import { useMemo, useState } from 'react';
import { Archive, ArchiveRestore, Landmark, Pencil, Plus } from 'lucide-react';

import PageHeader from '../components/layout/PageHeader';
import { Button, LinkButton } from '../components/ui/Button';
import { Field, Input, SelectField } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { Badge, EmptyState } from '../components/ui/Indicators';
import { useLedger } from '../context/LedgerContext';
import { useToast } from '../context/ToastContext';
import type { Account, AccountGroup } from '../types';
import { accountBalances, sumOpeningBalances } from '../utils/finance';
import { formatCurrency } from '../utils/format';
import { SUGGESTED_ACCOUNT_NAMES, ValidationError } from '../utils/validate';

const GROUP_LABEL: Record<AccountGroup, string> = {
  held: 'Held',
  stashed: 'Stashed Away',
};

interface AccountFormState {
  name: string;
  group: AccountGroup;
  openingBalance: string;
}

const EMPTY_FORM: AccountFormState = { name: '', group: 'held', openingBalance: '0.00' };

/**
 * ACCOUNTS
 *
 * Every account's balance is DERIVED (opening balance + income − expenses),
 * never stored — so edits and deletions recalculate automatically. Archived
 * accounts keep their full history and still count toward the grand total,
 * but cannot be selected for new transactions.
 */
export default function Accounts() {
  const { db, addAccount, updateAccount, setAccountArchived } = useLedger();
  const { toast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Account | undefined>();
  const [form, setForm] = useState<AccountFormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof AccountFormState, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const rows = useMemo(() => accountBalances(db.accounts, db.transactions), [db.accounts, db.transactions]);
  const activeRows = rows.filter((r) => !r.account.archived);
  const archivedRows = rows.filter((r) => r.account.archived);

  const heldTotal = useMemo(
    () => rows.filter((r) => r.account.group === 'held').reduce((s, r) => s + r.balance, 0),
    [rows],
  );
  const stashedTotal = useMemo(
    () => rows.filter((r) => r.account.group === 'stashed').reduce((s, r) => s + r.balance, 0),
    [rows],
  );
  const grandTotal = heldTotal + stashedTotal;

  function openCreate(suggestName?: string) {
    setEditing(undefined);
    setForm({ ...EMPTY_FORM, name: suggestName ?? '' });
    setErrors({});
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(account: Account) {
    setEditing(account);
    setForm({ name: account.name, group: account.group, openingBalance: '' });
    setErrors({});
    setFormError(null);
    setFormOpen(true);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      if (editing) {
        updateAccount(editing.id, { name: form.name, group: form.group });
        toast('Account updated.', 'success');
      } else {
        addAccount({ name: form.name, group: form.group, openingBalance: form.openingBalance });
        toast('Account added.', 'success');
      }
      setFormOpen(false);
    } catch (err) {
      if (err instanceof ValidationError) {
        setErrors(err.fields);
        setFormError('Please fix the highlighted fields.');
      } else {
        setFormError(err instanceof Error ? err.message : 'Something went wrong.');
      }
    }
  }

  function toggleArchive(account: Account) {
    try {
      setAccountArchived(account.id, !account.archived);
      toast(
        account.archived
          ? `“${account.name}” restored — selectable for new transactions again.`
          : `“${account.name}” archived. Its history and balance are kept.`,
        'success',
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not update the account.', 'error');
    }
  }

  function accountRow({ account, balance, income, expense, count }: (typeof rows)[number]) {
    return (
      <li
        key={account.id}
        className={`upcoming-item ${account.archived ? 'upcoming-item--debt' : 'upcoming-item--txn'}`}
      >
        <div>
          <strong>
            {account.name}
            {account.archived && <Badge tone="neutral">archived</Badge>}
          </strong>
          <span className="list-row-sub">
            {GROUP_LABEL[account.group]} · opening {formatCurrency(account.openingBalance, db.settings.currency)}{' '}
            · {count} transaction{count === 1 ? '' : 's'} (in {formatCurrency(income, db.settings.currency)} / out{' '}
            {formatCurrency(expense, db.settings.currency)})
          </span>
        </div>
        <div className="upcoming-date" style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
          <span className="mono-num">{formatCurrency(balance, db.settings.currency)}</span>
          <div className="row-actions">
            <button
              type="button"
              className="row-action"
              onClick={() => openEdit(account)}
              aria-label={`Edit account ${account.name}`}
              title="Rename / regroup"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              className="row-action"
              onClick={() => toggleArchive(account)}
              aria-label={`${account.archived ? 'Restore' : 'Archive'} account ${account.name}`}
              title={account.archived ? 'Restore' : 'Archive'}
            >
              {account.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <div className="page">
      <PageHeader
        jp="口座"
        title="Accounts"
        description="Where your money lives — cash wallets, e-wallets and banks. Balances are always derived from the ledger."
        actions={
          <>
            <LinkButton to="/transactions" variant="ghost" size="sm">
              Transactions
            </LinkButton>
            <Button onClick={() => openCreate()}>
              <Plus size={15} /> Add account
            </Button>
          </>
        }
      />

      {/* ---------- Totals ---------- */}
      <div className="grid grid-kpi">
        <div className="card" style={{ padding: 'var(--spacing-md)' }}>
          <div className="figure">
            <span className="figure-label">Held</span>
            <span className="figure-value">{formatCurrency(heldTotal, db.settings.currency)}</span>
          </div>
          <p className="muted text-sm" style={{ margin: '4px 0 0' }}>
            Cash, wallets and bank accounts in active use.
          </p>
        </div>
        <div className="card" style={{ padding: 'var(--spacing-md)' }}>
          <div className="figure">
            <span className="figure-label">Stashed Away</span>
            <span className="figure-value">{formatCurrency(stashedTotal, db.settings.currency)}</span>
          </div>
          <p className="muted text-sm" style={{ margin: '4px 0 0' }}>
            Savings and money set aside.
          </p>
        </div>
        <div className="card" style={{ padding: 'var(--spacing-md)' }}>
          <div className="figure">
            <span className="figure-label">Grand total</span>
            <span className="figure-value">{formatCurrency(grandTotal, db.settings.currency)}</span>
          </div>
          <p className="muted text-sm" style={{ margin: '4px 0 0' }}>
            Sum of opening balances ({formatCurrency(sumOpeningBalances(db.accounts), db.settings.currency)}) plus
            net of all transactions. Every peso counted exactly once.
          </p>
        </div>
      </div>

      {/* ---------- Held ---------- */}
      <section className="card" aria-labelledby="accounts-held">
        <div className="card-header">
          <div>
            <h2 id="accounts-held">
              <Landmark size={16} aria-hidden="true" /> Held
            </h2>
            <p>Money on hand — cash, e-wallets and bank accounts</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => openCreate()}>
            <Plus size={14} /> Add
          </Button>
        </div>
        {activeRows.filter((r) => r.account.group === 'held').length === 0 ? (
          <EmptyState
            title="No held accounts"
            description="Create a Cash, GCash or bank account to track money you can spend day to day."
            action={<Button size="sm" onClick={() => openCreate('Cash')}>Add Cash account</Button>}
          />
        ) : (
          <ul className="upcoming-list">
            {activeRows.filter((r) => r.account.group === 'held').map(accountRow)}
          </ul>
        )}
      </section>

      {/* ---------- Stashed Away ---------- */}
      <section className="card" aria-labelledby="accounts-stashed">
        <div className="card-header">
          <div>
            <h2 id="accounts-stashed">Stashed Away</h2>
            <p>Savings, passbooks and money set aside</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => openCreate()}>
            <Plus size={14} /> Add
          </Button>
        </div>
        {activeRows.filter((r) => r.account.group === 'stashed').length === 0 ? (
          <EmptyState
            title="Nothing stashed yet"
            description="Keep savings and long-term funds separate from daily spending by adding a Stashed Away account."
            action={<Button size="sm" onClick={() => openCreate()}>Add account</Button>}
          />
        ) : (
          <ul className="upcoming-list">
            {activeRows.filter((r) => r.account.group === 'stashed').map(accountRow)}
          </ul>
        )}
      </section>

      {/* ---------- Archived ---------- */}
      {archivedRows.length > 0 && (
        <section className="card" aria-labelledby="accounts-archived">
          <div className="card-header">
            <div>
              <h2 id="accounts-archived">Archived</h2>
              <p>Kept for history — still counted in the grand total, but not selectable for new transactions</p>
            </div>
            <Badge tone="neutral">{archivedRows.length}</Badge>
          </div>
          <ul className="upcoming-list">{archivedRows.map(accountRow)}</ul>
        </section>
      )}

      {/* ---------- Create / edit modal ---------- */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit account' : 'Add account'}
        description={
          editing
            ? 'Rename the account or move it between Held and Stashed Away. The starting balance is fixed at creation.'
            : 'Give the account a name, pick a group and set the money it starts with.'
        }
        footer={
          <>
            <Button variant="ghost" type="button" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="account-form">
              {editing ? 'Save changes' : 'Add account'}
            </Button>
          </>
        }
      >
        <form id="account-form" onSubmit={onSubmit} noValidate>
          {formError && (
            <div className="form-alert form-alert-error" role="alert">
              {formError}
            </div>
          )}
          <div className="form-grid">
            <Field label="Account name" required error={errors.name} className="field-full">
              {({ id, 'aria-invalid': invalid, 'aria-describedby': describedBy }) => (
                <Input
                  id={id}
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  value={form.name}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, name: e.target.value }));
                    setErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  placeholder="e.g. GCash"
                  maxLength={40}
                  required
                />
              )}
            </Field>

            <SelectField
              label="Group"
              required
              error={errors.group}
              value={form.group}
              onChange={(v) => setForm((f) => ({ ...f, group: v as AccountGroup }))}
              options={[
                { value: 'held', label: 'Held — money in active use' },
                { value: 'stashed', label: 'Stashed Away — savings set aside' },
              ]}
            />

            {!editing && (
              <Field
                label="Starting balance (PHP)"
                required
                error={errors.openingBalance}
                hint="The money already in this account before any transaction. You can change it later only by editing history — balances otherwise stay derived."
              >
                {({ id, 'aria-invalid': invalid, 'aria-describedby': describedBy }) => (
                  <Input
                    id={id}
                    aria-invalid={invalid}
                    aria-describedby={describedBy}
                    inputMode="decimal"
                    value={form.openingBalance}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, openingBalance: e.target.value }));
                      setErrors((prev) => ({ ...prev, openingBalance: undefined }));
                    }}
                    required
                  />
                )}
              </Field>
            )}

            {!editing && (
              <div className="field-full">
                <span className="field-label">Quick start (optional)</span>
                <ul className="chip-list">
                  {SUGGESTED_ACCOUNT_NAMES.map((n) => (
                    <li key={n}>
                      <button
                        type="button"
                        className="chip"
                        onClick={() => {
                          setForm((f) => ({ ...f, name: n }));
                          setErrors((prev) => ({ ...prev, name: undefined }));
                        }}
                      >
                        <Plus size={13} aria-hidden="true" /> {n}
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="muted text-sm" style={{ margin: '4px 0 0' }}>
                  Suggestions only — add just the accounts you actually use.
                </p>
              </div>
            )}
          </div>
        </form>
      </Modal>
    </div>
  );
}
