import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';

/**
 * Email verification landing page. Reads `?token=` from the emailed link
 * and verifies the account, then routes to sign-in.
 */
export default function VerifyEmail() {
  const { verifyEmail } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [status, setStatus] = useState<'verifying' | 'done' | 'error'>('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('This verification link is missing its token.');
      return;
    }
    let cancelled = false;
    verifyEmail(token).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setStatus('done');
        setMessage('Your email is verified. You can now sign in.');
      } else {
        setStatus('error');
        setMessage(result.error ?? 'Verification failed. The link may have expired.');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token, verifyEmail]);

  return (
    <div className="auth-form">
      <h2>Verify email</h2>
      {status === 'verifying' && (
        <p className="auth-note" role="status">
          Verifying your email…
        </p>
      )}
      {status === 'done' && (
        <>
          <div className="form-alert" role="status">
            {message}
          </div>
          <Button block onClick={() => navigate('/login', { replace: true })}>
            Go to sign in
          </Button>
        </>
      )}
      {status === 'error' && (
        <>
          <div className="form-alert form-alert-error" role="alert">
            {message}
          </div>
          <Button block onClick={() => navigate('/login', { replace: true })}>
            Back to sign in
          </Button>
        </>
      )}
    </div>
  );
}
