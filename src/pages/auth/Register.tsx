import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { useAuth } from '../../context/AuthContext';
import { useLedger } from '../../context/LedgerContext';

export default function Register() {
  const { register, user } = useAuth();
  const { updateProfile } = useLedger();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await register(name, email, password);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Registration failed.');
      return;
    }
    // Mirror the account into the local ledger profile (sidebar / dashboard name).
    updateProfile({ name: name.trim(), email: email.trim().toLowerCase() });
  }

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      <h2>Create your account</h2>

      {error && (
        <div className="form-alert form-alert-error" role="alert">
          {error}
        </div>
      )}

      <Field label="Name" required>
        {({ id, 'aria-invalid': invalid, 'aria-describedby': describedBy }) => (
          <Input
            id={id}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            autoComplete="name"
            placeholder="Kazu"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        )}
      </Field>

      <Field label="Email" required>
        {({ id, 'aria-invalid': invalid, 'aria-describedby': describedBy }) => (
          <Input
            id={id}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        )}
      </Field>

      <Field label="Password" required hint="At least 8 characters.">
        {({ id, 'aria-invalid': invalid, 'aria-describedby': describedBy }) => (
          <Input
            id={id}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        )}
      </Field>

      <Button type="submit" variant="accent" block disabled={busy}>
        {busy ? 'Creating…' : 'Create account'}
      </Button>

      <p className="auth-switch">
        Already registered? <Link to="/login">Sign in</Link>
      </p>
    </form>
  );
}
