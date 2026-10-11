import { useMemo, useState } from 'react';
import { FlaskConical, Pencil, Plus, Target, Trash2 } from 'lucide-react';

import PageHeader from '../components/layout/PageHeader';
import { Button, LinkButton } from '../components/ui/Button';
import { Field, Input, Textarea } from '../components/ui/Field';
import { ConfirmDialog, Modal } from '../components/ui/Modal';
import { Badge, EmptyState, Progress, ProgressMeta } from '../components/ui/Indicators';
import { useLedger } from '../context/LedgerContext';
import { useToast } from '../context/ToastContext';
import type { SavingsGoal } from '../types';
import { goalStatus, toMajor } from '../utils/finance';
import { formatDate, formatCurrency, formatPercent } from '../utils/format';
import { ValidationError, type GoalInput } from '../utils/validate';

interface FormState {
  title: string;
  description: string;
  target: string;
  saved: string;
  deadline: string;
}

const emptyForm = (): FormState => ({ title: '', description: '', target: '', saved: '0', deadline: '' });

function toForm(goal: SavingsGoal): FormState {
  return {
    title: goal.title,
    description: goal.description ?? '',
    target: toMajor(goal.target).toFixed(2),
    saved: toMajor(goal.saved).toFixed(2),
    deadline: goal.deadline ?? '',
  };
}

const STATUS_TONE = {
  completed: 'success',
  active: 'neutral',
  dueSoon: 'warning',
  overdue: 'error',
} as const;

const STATUS_LABEL = {
  completed: 'Completed',
  active: 'On track',
  dueSoon: 'Due soon',
  overdue: 'Overdue',
} as const;

export default function Goals() {
  const { db, addGoal, updateGoal, deleteGoal } = useLedger();
  const { toast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SavingsGoal | undefined>();
  const [confirming, setConfirming] = useState<SavingsGoal | undefined>();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const statuses = useMemo(() => db.goals.map((g) => goalStatus(g)), [db.goals]);
  const totalTarget = db.goals.reduce((s, g) => s + g.target, 0);
  const totalSaved = db.goals.reduce((s, g) => s + g.saved, 0);

  function openCreate() {
    setEditing(undefined);
    setForm(emptyForm());
    setErrors({});
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(goal: SavingsGoal) {
    setEditing(goal);
    setForm(toForm(goal));
    setErrors({});
    setFormError(null);
    setFormOpen(true);
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const input: GoalInput = {
      title: form.title,
      description: form.description,
      target: form.target,
      saved: form.saved,
      deadline: form.deadline,
    };
    try {
      if (editing) updateGoal(editing.id, input);
      else addGoal(input);
      toast(editing ? 'Goal updated.' : 'Goal created.', 'success');
      setFormOpen(false);
    } catch (err) {
      if (err instanceof ValidationError) {
        setErrors(err.fields as Partial<Record<keyof FormState, string>>);
        setFormError('Please fix the highlighted fields.');
      } else {
        setFormError(err instanceof Error ? err.message : 'Something went wrong.');
      }
    }
  }

  return (
    <div className="page">
      <PageHeader
        jp="貯金目標"
        title="Savings Goals"
        description="Track progress toward the things you are saving for."
        actions={
          <Button onClick={openCreate}>
            <Plus size={15} /> New goal
          </Button>
        }
      />

      <div className="grid grid-kpi">
        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-label">Total saved</span>
            <span className="kpi-icon">
              <Target size={17} />
            </span>
          </div>
          <div className="kpi-value">{formatCurrency(totalSaved, db.settings.currency)}</div>
          <div className="kpi-sub">Manually maintained deposits</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-label">Combined targets</span>
            <span className="kpi-icon">
              <Target size={17} />
            </span>
          </div>
          <div className="kpi-value">{formatCurrency(totalTarget, db.settings.currency)}</div>
          <div className="kpi-sub">{db.goals.length} goal(s)</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-label">Overall progress</span>
            <span className="kpi-icon">
              <Target size={17} />
            </span>
          </div>
          <div className="kpi-value">
            {formatPercent(totalTarget > 0 ? totalSaved / totalTarget : 0)}
          </div>
          <div className="kpi-sub">
            {formatCurrency(Math.max(totalTarget - totalSaved, 0), db.settings.currency)} to go
          </div>
        </div>
      </div>

      <p className="muted text-sm">
        Saved amounts on this page are entered manually — deposits are not deducted from your ledger balance
        automatically, so the same money is never counted twice.
      </p>

      {db.goals.length === 0 ? (
        <EmptyState
          title="No savings goals yet"
          description="Set a target, add a deadline and watch the progress bar fill up."
          action={
            <Button onClick={openCreate}>
              <Plus size={15} /> New goal
            </Button>
          }
        />
      ) : (
        <div className="grid grid-2">
          {statuses.map(({ goal, remaining, ratio, status }) => (
            <article className="card" key={goal.id}>
              <div className="card-header">
                <div>
                  <h2>{goal.title}</h2>
                  {goal.description && <p>{goal.description}</p>}
                </div>
                <div className="row-actions">
                  <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
                  <LinkButton
                    to={`/simulator?goal=${goal.id}`}
                    variant="ghost"
                    size="sm"
                    title={`Simulate extra saving for ${goal.title}`}
                  >
                    <FlaskConical size={14} aria-hidden="true" /> Simulate
                  </LinkButton>
                  <button
                    type="button"
                    className="row-action"
                    onClick={() => openEdit(goal)}
                    aria-label={`Edit goal ${goal.title}`}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className="row-action is-danger"
                    onClick={() => setConfirming(goal)}
                    aria-label={`Delete goal ${goal.title}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <Progress
                ratio={ratio}
                label={`Progress toward ${goal.title}`}
                valueText={`${formatCurrency(goal.saved, db.settings.currency)} of ${formatCurrency(goal.target, db.settings.currency)}`}
              />
              <ProgressMeta
                left={`${formatCurrency(goal.saved, db.settings.currency)} saved`}
                right={`${formatPercent(ratio)} of ${formatCurrency(goal.target, db.settings.currency)}`}
              />

              <div className="list-row-figures" style={{ marginTop: 'var(--spacing-md)' }}>
                <div className="figure">
                  <span className="figure-label">Remaining</span>
                  <span className="figure-value">{formatCurrency(remaining, db.settings.currency)}</span>
                </div>
                <div className="figure">
                  <span className="figure-label">Deadline</span>
                  <span className="figure-value">{goal.deadline ? formatDate(goal.deadline, db.settings.dateFormat) : 'None'}</span>
                </div>
                <div className="figure">
                  <span className="figure-label">Target</span>
                  <span className="figure-value">{formatCurrency(goal.target, db.settings.currency)}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit goal' : 'New savings goal'}
        description="Saved amounts are maintained by hand (see note above)."
        footer={
          <>
            <Button variant="ghost" type="button" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="goal-form">
              {editing ? 'Save changes' : 'Create goal'}
            </Button>
          </>
        }
      >
        <form id="goal-form" onSubmit={onSubmit} noValidate>
          {formError && (
            <div className="form-alert form-alert-error" role="alert">
              {formError}
            </div>
          )}
          <div className="form-grid">
            <Field label="Goal name" required error={errors.title} className="field-full">
              {({ id, 'aria-invalid': invalid, 'aria-describedby': describedBy }) => (
                <Input
                  id={id}
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  placeholder="e.g. Japan trip"
                  maxLength={80}
                  required
                />
              )}
            </Field>
            <Field label="Target amount (PHP)" required error={errors.target}>
              {({ id, 'aria-invalid': invalid, 'aria-describedby': describedBy }) => (
                <Input
                  id={id}
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  inputMode="decimal"
                  value={form.target}
                  onChange={(e) => set('target', e.target.value)}
                  placeholder="120000.00"
                  required
                />
              )}
            </Field>
            <Field label="Saved so far (PHP)" required error={errors.saved} hint="Enter 0 if you are just starting.">
              {({ id, 'aria-invalid': invalid, 'aria-describedby': describedBy }) => (
                <Input
                  id={id}
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  inputMode="decimal"
                  value={form.saved}
                  onChange={(e) => set('saved', e.target.value)}
                  required
                />
              )}
            </Field>
            <Field label="Deadline (optional)" error={errors.deadline}>
              {({ id, 'aria-invalid': invalid, 'aria-describedby': describedBy }) => (
                <Input
                  id={id}
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  type="date"
                  value={form.deadline}
                  onChange={(e) => set('deadline', e.target.value)}
                />
              )}
            </Field>
            <Field label="Description (optional)" error={errors.description} className="field-full">
              {({ id, 'aria-invalid': invalid, 'aria-describedby': describedBy }) => (
                <Textarea
                  id={id}
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  maxLength={300}
                  placeholder="What is this goal for?"
                />
              )}
            </Field>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirming)}
        title="Delete goal?"
        message={`“${confirming?.title ?? ''}” and its progress will be permanently removed.`}
        onCancel={() => setConfirming(undefined)}
        onConfirm={() => {
          if (!confirming) return;
          deleteGoal(confirming.id);
          setConfirming(undefined);
          toast('Goal deleted.', 'success');
        }}
      />
    </div>
  );
}
