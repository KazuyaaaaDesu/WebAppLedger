// ============================================
// Routing + essential interaction tests.
// Mounts the real route table with the real providers inside a MemoryRouter.
// ============================================

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import AppRoutes from './router';
import { AuthProvider } from '../context/AuthContext';
import { LedgerProvider } from '../context/LedgerContext';
import { ToastProvider } from '../context/ToastContext';
import { STORAGE_KEYS } from '../constants';

function renderApp(initialPath: string) {
  return render(
    <ToastProvider>
      <AuthProvider>
        <LedgerProvider>
          <MemoryRouter initialEntries={[initialPath]}>
            <AppRoutes />
          </MemoryRouter>
        </LedgerProvider>
      </AuthProvider>
    </ToastProvider>,
  );
}

/** Seed a demo session directly so protected pages render. */
function signIn() {
  window.localStorage.setItem(
    STORAGE_KEYS.auth,
    JSON.stringify({ account: null, session: { name: 'Kazu', email: 'kazu@example.com' } }),
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('public routes', () => {
  it('redirects / to the dashboard (login screen when signed out)', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument();
  });

  it('renders the login form with a link to register', async () => {
    renderApp('/login');
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /create one/i })).toHaveAttribute('href', '/register');
  });

  it('renders the register form', async () => {
    renderApp('/register');
    expect(await screen.findByRole('heading', { name: /create your account/i })).toBeInTheDocument();
  });
});

describe('protected routes', () => {
  it('sends unauthenticated visitors to /login', async () => {
    renderApp('/transactions');
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    // The protected page itself never rendered.
    expect(screen.queryByRole('heading', { name: /transactions/i, level: 1 })).not.toBeInTheDocument();
  });

  const routes: [string, RegExp][] = [
    ['/dashboard', /welcome back/i],
    ['/accounts', /accounts/i],
    ['/transactions', /transactions/i],
    ['/budgets', /budgets/i],
    ['/goals', /savings goals/i],
    ['/debts', /debts & loans/i],
    ['/analytics', /analytics/i],
    ['/insights', /financial health/i],
    ['/simulator', /financial simulator/i],
    ['/reports', /reports/i],
    ['/calendar', /calendar/i],
    ['/settings', /settings/i],
  ];

  for (const [path, heading] of routes) {
    it(`renders ${path} when signed in`, async () => {
      signIn();
      renderApp(path);
      expect(await screen.findByRole('heading', { name: heading, level: 1 })).toBeInTheDocument();
    });
  }

  it('keeps sidebar navigation on the same layout (no duplicate shell)', async () => {
    signIn();
    renderApp('/budgets');
    await screen.findByRole('heading', { name: /budgets/i, level: 1 });
    // Exactly one primary sidebar and one navbar header.
    expect(screen.getAllByRole('complementary', { name: 'Primary' })).toHaveLength(1);
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('shows a 404 page for unknown routes', async () => {
    signIn();
    renderApp('/definitely-not-a-page');
    expect(await screen.findByRole('heading', { name: /page not found/i })).toBeInTheDocument();
  });

  it('redirects legacy paths to their new locations', async () => {
    signIn();
    renderApp('/budget');
    expect(await screen.findByRole('heading', { name: /budgets/i, level: 1 })).toBeInTheDocument();
  });

  it('redirects the old /ledger path to the merged /transactions page', async () => {
    signIn();
    renderApp('/ledger');
    expect(await screen.findByRole('heading', { name: /transactions/i, level: 1 })).toBeInTheDocument();
  });
});

describe('demo authentication flow', () => {
  it('registers an account and lands on the dashboard', async () => {
    const user = userEvent.setup();
    renderApp('/register');

    await user.type(await screen.findByLabelText(/name/i), 'Sakura Tester');
    await user.type(screen.getByLabelText(/email/i), 'sakura@example.com');
    await user.type(screen.getByLabelText(/password/i), 'supersecret1');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('heading', { name: /welcome back, sakura tester/i })).toBeInTheDocument();
  });

  it('signs in with a registered demo account without a server', async () => {
    const user = userEvent.setup();
    renderApp('/register');

    await user.type(await screen.findByLabelText(/name/i), 'Sakura Tester');
    await user.type(screen.getByLabelText(/email/i), 'sakura@example.com');
    await user.type(screen.getByLabelText(/password/i), 'supersecret1');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    await screen.findByRole('heading', { name: /welcome back, sakura tester/i });

    await user.click(screen.getByLabelText(/account menu/i));
    await user.click(screen.getByRole('button', { name: /sign out/i }));
    await screen.findByRole('heading', { name: /sign in/i });

    await user.type(screen.getByLabelText(/email/i), 'sakura@example.com');
    await user.type(screen.getByLabelText(/password/i), 'supersecret1');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    // Signed in again — the name shows in the navbar and in the local profile.
    expect(await screen.findByRole('heading', { name: /welcome back, sakura tester/i })).toBeInTheDocument();
    expect(screen.getAllByText('Sakura Tester').length).toBeGreaterThan(0);
  });

  it('keeps local ledger data after signing out and back in', async () => {
    const user = userEvent.setup();
    renderApp('/register');

    await user.type(await screen.findByLabelText(/name/i), 'Sakura Tester');
    await user.type(screen.getByLabelText(/email/i), 'sakura@example.com');
    await user.type(screen.getByLabelText(/password/i), 'supersecret1');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    await screen.findByRole('heading', { name: /welcome back, sakura tester/i });

    // Record a transaction while signed in.
    const sidebar = screen.getByRole('complementary', { name: 'Primary' });
    await user.click(within(sidebar).getByRole('link', { name: /transactions/i }));
    await screen.findByRole('heading', { name: /transactions/i, level: 1 });
    await user.click(screen.getByRole('button', { name: /add transaction/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/description/i), 'Persisted ramen');
    await user.type(within(dialog).getByLabelText(/amount/i), '99.50');
    await user.click(within(dialog).getByRole('button', { name: /^add transaction$/i }));
    await waitFor(() => {
      expect(screen.getByText('Persisted ramen')).toBeInTheDocument();
    });

    // Sign out and back in — the record must survive (localStorage only).
    await user.click(screen.getByLabelText(/account menu/i));
    await user.click(screen.getByRole('button', { name: /sign out/i }));
    await screen.findByRole('heading', { name: /sign in/i });

    await user.type(screen.getByLabelText(/email/i), 'sakura@example.com');
    await user.type(screen.getByLabelText(/password/i), 'supersecret1');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    // Signed back in — the persisted row is still listed on the ledger page.
    expect(await screen.findByRole('heading', { name: /transactions/i, level: 1 })).toBeInTheDocument();
    expect(await screen.findByText('Persisted ramen')).toBeInTheDocument();
  });

  it('rejects weak passwords on registration', async () => {
    const user = userEvent.setup();
    renderApp('/register');

    await user.type(await screen.findByLabelText(/name/i), 'Sa');
    await user.type(screen.getByLabelText(/email/i), 'x@example.com');
    await user.type(screen.getByLabelText(/password/i), 'short');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 8 characters/i);
  });
});

describe('essential user interaction: adding a transaction', () => {
  it('creates a transaction through the form and lists it', async () => {
    signIn();
    const user = userEvent.setup();
    renderApp('/transactions');

    await screen.findByRole('heading', { name: /transactions/i, level: 1 });
    const before = screen.getAllByRole('row').length;

    await user.click(screen.getByRole('button', { name: /add transaction/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/description/i), 'Test ramen purchase');
    await user.type(within(dialog).getByLabelText(/amount/i), '250.50');
    await user.click(within(dialog).getByRole('button', { name: /^add transaction$/i }));

    await waitFor(() => {
      expect(screen.getByText('Test ramen purchase')).toBeInTheDocument();
    });

    // The page keeps showing a full first page (paginated) and the new row.
    expect(screen.getAllByRole('row').length).toBeGreaterThanOrEqual(before);

    // Success feedback is shown.
    expect(await screen.findByText(/transaction added/i)).toBeInTheDocument();
  });

  it('shows validation errors for invalid input', async () => {
    signIn();
    const user = userEvent.setup();
    renderApp('/transactions');

    await screen.findByRole('heading', { name: /transactions/i, level: 1 });
    await user.click(screen.getByRole('button', { name: /add transaction/i }));

    const dialog = await screen.findByRole('dialog');
    const amount = within(dialog).getByLabelText(/amount/i);
    await user.clear(amount);
    await user.type(within(dialog).getByLabelText(/description/i), 'No amount');
    await user.type(amount, '0');
    await user.click(within(dialog).getByRole('button', { name: /^add transaction$/i }));

    expect(await within(dialog).findByText(/greater than zero/i)).toBeInTheDocument();
  });
});
