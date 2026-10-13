import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Database as DbIcon, Download, Landmark, Palette, Plus, Trash2, Upload, UserCog } from 'lucide-react';

import PageHeader from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Field, Input, SelectField } from '../components/ui/Field';
import { ConfirmDialog, Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Indicators';
import { useLedger } from '../context/LedgerContext';
import { useToast } from '../context/ToastContext';
import type { Category, ColorTheme, DateFormat, ThemeMode, TransactionType } from '../types';
import { downloadJson, todayFileStamp } from '../utils/csv';

const FALLBACK_COLORS = ['#F7A8B8', '#B9A7F5', '#7EC8E3', '#F59E0B', '#10B981', '#E879A0', '#818CF8', '#60A5FA'];

export default function Settings() {
  const {
    db,
    dataSource,
    persisted,
    updateProfile,
    updateSettings,
    addCategory,
    updateCategory,
    deleteCategory,
    addPaymentMethod,
    deletePaymentMethod,
    resetDemoData,
    importDatabase,
    exportJson,
  } = useLedger();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  // Profile
  const [name, setName] = useState(db.profile.name);
  const [email, setEmail] = useState(db.profile.email);

  // Category modal
  const [catOpen, setCatOpen] = useState(false);
  const [catEditing, setCatEditing] = useState<Category | undefined>();
  const [catForm, setCatForm] = useState({ name: '', type: 'expense' as TransactionType, color: FALLBACK_COLORS[0] });
  const [catError, setCatError] = useState<string | null>(null);

  // Payment method modal
  const [pmOpen, setPmOpen] = useState(false);
  const [pmName, setPmName] = useState('');
  const [pmError, setPmError] = useState<string | null>(null);

  // Destructive confirmations
  const [confirm, setConfirm] = useState<null | { title: string; message: string; action: () => void }>(null);
  const [importResult, setImportResult] = useState<string | null>(null);

  function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      toast('Name and email are required.', 'error');
      return;
    }
    updateProfile({ name: name.trim(), email: email.trim() });
    toast('Profile saved.', 'success');
  }

  function openCreateCategory() {
    setCatEditing(undefined);
    setCatForm({ name: '', type: 'expense', color: FALLBACK_COLORS[0] });
    setCatError(null);
    setCatOpen(true);
  }

  function openEditCategory(category: Category) {
    setCatEditing(category);
    setCatForm({ name: category.name, type: category.type, color: category.color });
    setCatError(null);
    setCatOpen(true);
  }

  function saveCategory(e: React.FormEvent) {
    e.preventDefault();
    setCatError(null);
    try {
      if (catEditing) updateCategory(catEditing.id, { name: catForm.name, color: catForm.color });
      else addCategory({ name: catForm.name, type: catForm.type, color: catForm.color });
      toast(catEditing ? 'Category updated.' : 'Category added.', 'success');
      setCatOpen(false);
    } catch (err) {
      setCatError(err instanceof Error ? err.message : 'Could not save the category.');
    }
  }

  function savePaymentMethod(e: React.FormEvent) {
    e.preventDefault();
    setPmError(null);
    try {
      addPaymentMethod({ name: pmName });
      toast('Payment method added.', 'success');
      setPmOpen(false);
    } catch (err) {
      setPmError(err instanceof Error ? err.message : 'Could not add the payment method.');
    }
  }

  function onExport() {
    downloadJson(`sakura-ledger-backup-${todayFileStamp()}`, JSON.parse(exportJson()));
    toast('Backup downloaded as JSON.', 'success');
  }

  async function onImportFile(file: File) {
    setImportResult(null);
    try {
      const text = await file.text();
      const result = importDatabase(text);
      if (!result.ok) {
        setImportResult(`Import rejected: ${result.errors.join(' ')}`);
        toast('Backup file rejected — existing data untouched.', 'error');
        return;
      }
      setImportResult('Backup imported successfully.');
      toast('Backup imported. All views now show the restored data.', 'success');
    } catch {
      setImportResult('Import failed: could not read the file.');
      toast('Could not read that file.', 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const storageBytes = new Blob([exportJson()]).size;

  return (
    <div className="page">
      <PageHeader
        jp="設定"
        title="Settings"
        description="Appearance, profile, categories, payment methods and data management."
      />

      <div className="grid grid-2">
        {/* ---------- Appearance ---------- */}
        <section className="card" aria-labelledby="settings-appearance">
          <div className="card-header">
            <div>
              <h2 id="settings-appearance">
                <Palette size={16} aria-hidden="true" /> Appearance
              </h2>
              <p>Theme and date formatting persist in this browser.</p>
            </div>
          </div>

          <div className="settings-row">
            <span className="field-label">Color mode</span>
            <div className="segmented" role="group" aria-label="Color mode" style={{ maxWidth: 260 }}>
              {(['light', 'dark'] as ThemeMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`segmented-btn ${db.settings.theme === mode ? 'is-active is-income' : ''}`}
                  aria-pressed={db.settings.theme === mode}
                  onClick={() => updateSettings({ theme: mode })}
                >
                  {mode === 'light' ? '☀ Light' : '☾ Dark'}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row settings-palette-row">
            <div>
              <span className="field-label">Accent palette</span>
              <p className="muted text-sm" style={{ margin: '4px 0 0' }}>Pick the vibe. Your choice is saved with your settings.</p>
            </div>
            <div className="theme-palette-grid" role="group" aria-label="Accent color palette">
              {([
                { id: 'sakura', name: 'Sakura', colors: ['#F7A8B8', '#B9A7F5', '#3F4E8C'] },
                { id: 'ocean', name: 'Ocean', colors: ['#67C7D4', '#7EA7FF', '#245B83'] },
                { id: 'mint', name: 'Mint', colors: ['#6DD6B0', '#A3E6D4', '#246B5A'] },
                { id: 'sunset', name: 'Sunset', colors: ['#FFAB76', '#FF7D9C', '#9A456C'] },
                { id: 'lavender', name: 'Lavender', colors: ['#C4B5FD', '#E4B8E8', '#6554A4'] },
              ] as { id: ColorTheme; name: string; colors: string[] }[]).map((palette) => (
                <button
                  key={palette.id}
                  type="button"
                  className={`theme-palette ${db.settings.colorTheme === palette.id ? 'is-selected' : ''}`}
                  onClick={() => updateSettings({ colorTheme: palette.id })}
                  aria-pressed={db.settings.colorTheme === palette.id}
                  aria-label={`${palette.name} palette${db.settings.colorTheme === palette.id ? ', selected' : ''}`}
                >
                  <span className="theme-swatches" aria-hidden="true">
                    {palette.colors.map((color) => <span key={color} style={{ backgroundColor: color }} />)}
                  </span>
                  <span className="theme-palette-name">{palette.name}</span>
                  {db.settings.colorTheme === palette.id && <span className="theme-selected-mark" aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <SelectField
              label="Date format"
              value={db.settings.dateFormat}
              onChange={(v) => updateSettings({ dateFormat: v as DateFormat })}
              options={[
                { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
                { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
                { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
              ]}
            />
          </div>

          <div className="settings-row">
            <SelectField
              label="Currency"
              value={db.settings.currency}
              onChange={() => undefined}
              options={[{ value: 'PHP', label: 'PHP — Philippine Peso (₱)' }]}
              hint="Only PHP is supported in this build; the data model already keeps amounts in integer centavos so more currencies can be added later."
            />
          </div>
        </section>

        {/* ---------- Profile ---------- */}
        <section className="card" aria-labelledby="settings-profile">
          <div className="card-header">
            <div>
              <h2 id="settings-profile">
                <UserCog size={16} aria-hidden="true" /> Profile
              </h2>
              <p>Shown in the sidebar and account menu.</p>
            </div>
          </div>
          <form onSubmit={saveProfile} className="form-grid">
            <Field label="Name" required>
              {({ id }) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />}
            </Field>
            <Field label="Email" required>
              {({ id }) => (
                <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={100} />
              )}
            </Field>
            <div className="form-actions field-full">
              <Button type="submit">Save profile</Button>
            </div>
          </form>

          <hr className="divider" />

          <div className="settings-row">
            <span className="field-label">Opening balances</span>
            <p className="muted text-sm" style={{ margin: 0 }}>
              Starting balances are managed per account.{' '}
              <Link to="/accounts">
                <Landmark size={14} aria-hidden="true" style={{ verticalAlign: -2 }} /> Open the Accounts page
              </Link>{' '}
              to create, rename, regroup or archive accounts.
            </p>
          </div>
        </section>
      </div>

      {/* ---------- Categories ---------- */}
      <section className="card" aria-labelledby="settings-categories">
        <div className="card-header">
          <div>
            <h2 id="settings-categories">Categories</h2>
            <p>Built-ins cannot be deleted; custom ones can (when unused).</p>
          </div>
          <Button size="sm" onClick={openCreateCategory}>
            <Plus size={14} /> Add category
          </Button>
        </div>

        <div className="settings-grid">
          {(['income', 'expense'] as TransactionType[]).map((type) => (
            <div key={type}>
              <h3 className="text-sm" style={{ marginBottom: 'var(--spacing-sm)' }}>
                {type === 'income' ? 'Income categories' : 'Expense categories'}
              </h3>
              <ul className="chip-list">
                {db.categories
                  .filter((c) => c.type === type)
                  .map((c) => (
                    <li key={c.id} className="chip">
                      <span className="legend-dot" style={{ backgroundColor: c.color }} aria-hidden="true" />
                      {c.name}
                      {c.builtin && <Badge tone="neutral">built-in</Badge>}
                      <button
                        type="button"
                        className="row-action"
                        onClick={() => openEditCategory(c)}
                        aria-label={`Edit category ${c.name}`}
                      >
                        <span aria-hidden="true">✎</span>
                      </button>
                      {!c.builtin && (
                        <button
                          type="button"
                          className="row-action is-danger"
                          aria-label={`Delete category ${c.name}`}
                          onClick={() =>
                            setConfirm({
                              title: 'Delete category?',
                              message: `“${c.name}” will be removed. Categories used by transactions cannot be deleted.`,
                              action: () => {
                                try {
                                  deleteCategory(c.id);
                                  toast('Category deleted.', 'success');
                                } catch (err) {
                                  toast(err instanceof Error ? err.message : 'Could not delete.', 'error');
                                }
                              },
                            })
                          }
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Payment methods ---------- */}
      <section className="card" aria-labelledby="settings-payment-methods">
        <div className="card-header">
          <div>
            <h2 id="settings-payment-methods">Payment methods</h2>
            <p>Labels for how you pay — not separate accounts with their own balances.</p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setPmName('');
              setPmError(null);
              setPmOpen(true);
            }}
          >
            <Plus size={14} /> Add method
          </Button>
        </div>
        <ul className="chip-list">
          {db.paymentMethods.map((p) => (
            <li key={p.id} className="chip">
              {p.name}
              {p.builtin && <Badge tone="neutral">built-in</Badge>}
              {!p.builtin && (
                <button
                  type="button"
                  className="row-action is-danger"
                  aria-label={`Delete payment method ${p.name}`}
                  onClick={() =>
                    setConfirm({
                      title: 'Delete payment method?',
                      message: `“${p.name}” will be removed. Methods used by transactions cannot be deleted.`,
                      action: () => {
                        try {
                          deletePaymentMethod(p.id);
                          toast('Payment method deleted.', 'success');
                        } catch (err) {
                          toast(err instanceof Error ? err.message : 'Could not delete.', 'error');
                        }
                      },
                    })
                  }
                >
                  <Trash2 size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- Data ---------- */}
      <section className="card" aria-labelledby="settings-data">
        <div className="card-header">
          <div>
            <h2 id="settings-data">
              <DbIcon size={16} aria-hidden="true" /> Data & backup
            </h2>
            <p>
              Stored in this browser’s localStorage ({(storageBytes / 1024).toFixed(1)} KB used · source:{' '}
              {dataSource === 'seed' ? 'demo dataset' : 'saved data'}
              {persisted ? '' : ' · last save failed'}).
            </p>
          </div>
        </div>

        <div className="page-actions">
          <Button variant="ghost" onClick={onExport}>
            <Download size={15} /> Export backup (JSON)
          </Button>
          <Button variant="ghost" onClick={() => fileRef.current?.click()}>
            <Upload size={15} /> Import backup
          </Button>
          <Button
            variant="danger"
            onClick={() =>
              setConfirm({
                title: 'Reset all data?',
                message: 'Every transaction, budget, goal and debt will be replaced by the original demo dataset. Export a backup first if you want to keep your data.',
                action: () => {
                  resetDemoData();
                  toast('Data reset to the demo dataset.', 'success');
                },
              })
            }
          >
            <Trash2 size={15} /> Reset demo data
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Choose a backup file to import"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onImportFile(file);
            }}
          />
        </div>

        {importResult && (
          <div
            className={`form-alert ${importResult.startsWith('Backup imported') ? 'form-alert-success' : 'form-alert-error'}`}
            role="status"
            style={{ marginTop: 'var(--spacing-md)' }}
          >
            {importResult}
          </div>
        )}
      </section>

      {/* ---------- Category modal ---------- */}
      <Modal
        open={catOpen}
        onClose={() => setCatOpen(false)}
        title={catEditing ? 'Edit category' : 'Add category'}
        footer={
          <>
            <Button variant="ghost" type="button" onClick={() => setCatOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="category-form">
              Save
            </Button>
          </>
        }
      >
        <form id="category-form" onSubmit={saveCategory} noValidate>
          {catError && (
            <div className="form-alert form-alert-error" role="alert">
              {catError}
            </div>
          )}
          <div className="form-grid">
            <Field label="Name" required className="field-full">
              {({ id }) => (
                <Input
                  id={id}
                  value={catForm.name}
                  onChange={(e) => setCatForm((f) => ({ ...f, name: e.target.value }))}
                  maxLength={40}
                  required
                />
              )}
            </Field>
            {!catEditing && (
              <SelectField
                label="Type"
                required
                value={catForm.type}
                onChange={(v) => setCatForm((f) => ({ ...f, type: v as TransactionType }))}
                options={[
                  { value: 'expense', label: 'Expense' },
                  { value: 'income', label: 'Income' },
                ]}
              />
            )}
            <Field label="Color">
              {({ id }) => (
                <input
                  id={id}
                  className="field-control"
                  type="color"
                  value={catForm.color}
                  onChange={(e) => setCatForm((f) => ({ ...f, color: e.target.value }))}
                  style={{ height: 42, padding: 4 }}
                />
              )}
            </Field>
          </div>
        </form>
      </Modal>

      {/* ---------- Payment method modal ---------- */}
      <Modal
        open={pmOpen}
        onClose={() => setPmOpen(false)}
        title="Add payment method"
        footer={
          <>
            <Button variant="ghost" type="button" onClick={() => setPmOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="pm-form">
              Add
            </Button>
          </>
        }
      >
        <form id="pm-form" onSubmit={savePaymentMethod} noValidate>
          {pmError && (
            <div className="form-alert form-alert-error" role="alert">
              {pmError}
            </div>
          )}
          <Field label="Name" required>
            {({ id }) => (
              <Input
                id={id}
                value={pmName}
                onChange={(e) => setPmName(e.target.value)}
                placeholder="e.g. GCash"
                maxLength={40}
                required
              />
            )}
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmLabel="Delete"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          confirm?.action();
          setConfirm(null);
        }}
      />
    </div>
  );
}
