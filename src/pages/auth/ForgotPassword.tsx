import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { useAuth } from '../../context/AuthContext';

/** Requests a password-reset email. Always reports success to avoid leaking accounts. */
export default function ForgotPassword() {
  const { forgotPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await forgotPassword(email);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Could not send the reset link.');
      return;
    }
    setSent(true);
  }

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      <h2>Forgot password</h2>

      {error && (
        <div className="form-alert form-alert-error" role="alert">
          {error}
        </div>
      )}

      {sent ? (
        <div className="form-alert" role="status">
          If an account exists for that email, a reset link has been sent. Check your inbox.
        </div>
      ) : (
        <>
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

          <Button type="submit" block disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
          </Button>
        </>
      )}

      <p className="auth-switch">
        Remembered it? <Link to="/login">Back to sign in</Link>
      </p>
    </form>
  );
}
