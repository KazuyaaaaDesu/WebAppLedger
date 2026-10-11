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
import VerifyEmail from '../pages/auth/VerifyEmail';
import ForgotPassword from '../pages/auth/ForgotPassword';
import ResetPassword from '../pages/auth/ResetPassword';
import NotFound from '../pages/NotFound';

// Route-level code splitting keeps the initial bundle small (Recharts pages
// are the heaviest).
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

function RouteFallback() {
  return (
    <div className="loading-state" role="status">
      Loading…
    </div>
  );
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
      {/* Public: demo auth */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
      </Route>

      {/* Protected: single shared shell (sidebar + navbar + outlet) */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/budgets" element={<Budgets />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/debts" element={<Debts />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/simulator" element={<Simulator />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Route>

      {/* Legacy paths kept working (old sidebar links) */}
      <Route path="/budget" element={<Navigate to="/budgets" replace />} />
      <Route path="/debt-loans" element={<Navigate to="/debts" replace />} />
      <Route path="/protected" element={<Navigate to="/dashboard" replace />} />
      {/* /ledger was merged into /transactions (same data, richer experience). */}
      <Route path="/ledger" element={<Navigate to="/transactions" replace />} />

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
