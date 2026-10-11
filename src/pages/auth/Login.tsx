import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { useAuth } from '../../context/AuthContext';

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in (e.g. opened /login directly) → go to the app.
  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [user, from, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await login(email, password);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Sign-in failed.');
      return;
    }
    navigate(from, { replace: true });
  }

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      <h2>Sign in</h2>

      {error && (
        <div className="form-alert form-alert-error" role="alert">
          {error}
        </div>
      )}

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

      <Field label="Password" required>
        {({ id, 'aria-invalid': invalid, 'aria-describedby': describedBy }) => (
          <Input
            id={id}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            type="password"
            autoComplete="current-password"
            placeholder="Your demo password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        )}
      </Field>

      <Button type="submit" block disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>

      <p className="auth-switch">
        <Link to="/forgot-password">Forgot password?</Link>
      </p>

      <p className="auth-switch">
        No account yet? <Link to="/register">Create one</Link>
      </p>
    </form>
  );
}
