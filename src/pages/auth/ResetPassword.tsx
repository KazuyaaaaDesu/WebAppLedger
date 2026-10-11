import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { useAuth } from '../../context/AuthContext';

/** Sets a new password from a reset link (`?token=`), then routes to sign-in. */
export default function ResetPassword() {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await resetPassword(token, password);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Reset failed. The link may have expired.');
      return;
    }
    setDone(true);
  }

  if (!token) {
    return (
      <div className="auth-form">
        <h2>Reset password</h2>
        <div className="form-alert form-alert-error" role="alert">
          This reset link is missing its token. Request a new one.
        </div>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      <h2>Reset password</h2>

      {error && (
        <div className="form-alert form-alert-error" role="alert">
          {error}
        </div>
      )}

      {done ? (
        <>
          <div className="form-alert" role="status">
            Your password has been reset. Sign in with the new password.
          </div>
          <Button block onClick={() => navigate('/login', { replace: true })}>
            Go to sign in
          </Button>
        </>
      ) : (
        <>
          <Field label="New password" required>
            {({ id, 'aria-invalid': invalid, 'aria-describedby': describedBy }) => (
              <Input
                id={id}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            )}
          </Field>

          <Field label="Confirm password" required>
            {({ id, 'aria-invalid': invalid, 'aria-describedby': describedBy }) => (
              <Input
                id={id}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                type="password"
                autoComplete="new-password"
                placeholder="Repeat the new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            )}
          </Field>

          <Button type="submit" block disabled={busy}>
            {busy ? 'Resetting…' : 'Reset password'}
          </Button>
        </>
      )}
    </form>
  );
}
