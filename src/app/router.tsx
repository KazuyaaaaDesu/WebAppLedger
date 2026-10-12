// ============================================
// Application routes. Exported separately from App.tsx so tests can mount
// the same route table inside a MemoryRouter.
// ============================================

import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import ProtectedRoute from '../routes/ProtectedRoute';
import AppLayout from '../layouts/AppLayout';
import AuthLayout from '../layouts/AuthLayout';
import Login from '../pages/auth/Login';
import Register from '../pages/auth/Register';
import NotFound from '../pages/NotFound';
import SectionHub from '../components/layout/SectionHub';

// Route-level code splitting keeps the initial bundle small (Recharts pages
// are the heaviest). Existing feature pages are reused inside grouped workspaces.
const Dashboard = lazy(() => import('../pages/Dashboard'));
const Accounts = lazy(() => import('../pages/Accounts'));
const Transactions = lazy(() => import('../pages/Transactions'));
const Budgets = lazy(() => import('../pages/Budgets'));
const Goals = lazy(() => import('../pages/Goals'));
const Debts = lazy(() => import('../pages/Debts'));
const Analytics = lazy(() => import('../pages/Analytics'));
const Insights = lazy(() => import('../pages/Insights'));
const Simulator = lazy(() => import('../pages/Simulator'));
const Reports = lazy(() => import('../pages/Reports'));
const CalendarPage = lazy(() => import('../pages/CalendarPage'));
const Settings = lazy(() => import('../pages/Settings'));

const moneyTabs = [
  { label: 'Transactions', to: 'transactions', description: 'Record & review' },
  { label: 'Accounts', to: 'accounts', description: 'Balances & wallets' },
];
const planningTabs = [
  { label: 'Budgets', to: 'budgets', description: 'Spending limits' },
  { label: 'Goals', to: 'goals', description: 'Savings targets' },
  { label: 'Debts', to: 'debts', description: 'Loans & repayments' },
];
const intelligenceTabs = [
  { label: 'Analytics', to: 'analytics', description: 'Trends & breakdowns' },
  { label: 'Insights', to: 'insights', description: 'Financial health' },
  { label: 'Simulator', to: 'simulator', description: 'Test scenarios' },
  { label: 'Reports', to: 'reports', description: 'Summaries & export' },
];

function RouteFallback() {
  return <div className="loading-state" role="status">Loading…</div>;
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* Public: demo auth (local only — no server) */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>

        {/* Protected: single shared shell (sidebar + navbar + outlet) */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />

            <Route path="/money" element={<SectionHub title="Money" description="Keep your accounts and transaction history together." tabs={moneyTabs} />}>
              <Route index element={<Navigate to="transactions" replace />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="accounts" element={<Accounts />} />
            </Route>

            <Route path="/planning" element={<SectionHub title="Planning" description="Build a plan for spending, saving, and paying down debt." tabs={planningTabs} />}>
              <Route index element={<Navigate to="budgets" replace />} />
              <Route path="budgets" element={<Budgets />} />
              <Route path="goals" element={<Goals />} />
              <Route path="debts" element={<Debts />} />
            </Route>

            <Route path="/intelligence" element={<SectionHub title="Financial Intelligence" description="Understand your money, discover patterns, and test what-if scenarios." tabs={intelligenceTabs} />}>
              <Route index element={<Navigate to="analytics" replace />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="insights" element={<Insights />} />
              <Route path="simulator" element={<Simulator />} />
              <Route path="reports" element={<Reports />} />
            </Route>

            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>

        {/* Backward-compatible URLs: old bookmarks and in-app links still work. */}
        <Route path="/accounts" element={<Navigate to="/money/accounts" replace />} />
        <Route path="/transactions" element={<Navigate to="/money/transactions" replace />} />
        <Route path="/ledger" element={<Navigate to="/money/transactions" replace />} />
        <Route path="/budget" element={<Navigate to="/planning/budgets" replace />} />
        <Route path="/budgets" element={<Navigate to="/planning/budgets" replace />} />
        <Route path="/goals" element={<Navigate to="/planning/goals" replace />} />
        <Route path="/debts" element={<Navigate to="/planning/debts" replace />} />
        <Route path="/debt-loans" element={<Navigate to="/planning/debts" replace />} />
        <Route path="/analytics" element={<Navigate to="/intelligence/analytics" replace />} />
        <Route path="/insights" element={<Navigate to="/intelligence/insights" replace />} />
        <Route path="/simulator" element={<Navigate to="/intelligence/simulator" replace />} />
        <Route path="/reports" element={<Navigate to="/intelligence/reports" replace />} />
        <Route path="/protected" element={<Navigate to="/dashboard" replace />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
