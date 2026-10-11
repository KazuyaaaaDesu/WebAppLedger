// ============================================
// Typed API client for the Sakura Ledger backend.
// Sends credentials (cookies) and echoes the CSRF token on mutations.
// ============================================

const BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000').replace(/\/+$/, '');

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(`${BASE}/api/v1${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.method && opts.method !== 'GET' && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  const res = await fetch(url.toString(), {
    method: opts.method ?? 'GET',
    headers,
    credentials: 'include',
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const detail =
      data && typeof data === 'object' && 'detail' in data
        ? String((data as { detail: unknown }).detail)
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, detail);
  }

  return data as T;
}

// ---- Auth ----

export interface ApiUser {
  id: string;
  email: string;
  name: string;
  is_verified: boolean;
  created_at: string;
}

export interface AuthResponse {
  user: ApiUser;
  csrf_token: string;
}

export const authApi = {
  async register(name: string, email: string, password: string): Promise<AuthResponse> {
    const res = await request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: { name, email, password },
    });
    setCsrfToken(res.csrf_token);
    return res;
  },
  async login(email: string, password: string): Promise<AuthResponse> {
    const res = await request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setCsrfToken(res.csrf_token);
    return res;
  },
  async logout(): Promise<void> {
    await request('/auth/logout', { method: 'POST' });
    setCsrfToken(null);
  },
  async me(): Promise<ApiUser> {
    return request<ApiUser>('/auth/me');
  },
  async verifyEmail(token: string): Promise<{ message: string }> {
    return request('/auth/verify-email', { method: 'POST', body: { token } });
  },
  async resendVerification(email: string): Promise<{ message: string }> {
    return request('/auth/resend-verification', { method: 'POST', body: { email } });
  },
  async forgotPassword(email: string): Promise<{ message: string }> {
    return request('/auth/forgot-password', { method: 'POST', body: { email } });
  },
  async resetPassword(token: string, password: string): Promise<{ message: string }> {
    return request('/auth/reset-password', { method: 'POST', body: { token, password } });
  },
  async updateProfile(name: string): Promise<ApiUser> {
    return request('/auth/profile', { method: 'PATCH', body: { name } });
  },
};

// ---- Financial resources ----

export interface ApiAccount {
  id: string;
  name: string;
  group: 'held' | 'stashed';
  opening_balance: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
  balance?: number | null;
}

export interface ApiAccountWithBalance {
  account: ApiAccount;
  balance: number;
  income: number;
  expense: number;
  count: number;
}

export interface ApiTransaction {
  id: string;
  date: string;
  description: string;
  type: 'income' | 'expense';
  category_id: string;
  amount: number;
  payment_method_id: string;
  account_id: string;
  reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  balance?: number | null;
}

export interface ApiTransactionList {
  items: ApiTransaction[];
  total: number;
  page: number;
  page_size: number;
}

export interface ApiTransfer {
  id: string;
  date: string;
  from_account_id: string;
  to_account_id: string;
  amount: number;
  fee: number;
  description: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiCategory {
  id: string;
  name: string;
  type: 'income' | 'expense';
  color: string;
  builtin: boolean;
}

export interface ApiPaymentMethod {
  id: string;
  name: string;
  builtin: boolean;
}

export interface ApiBudget {
  id: string;
  category_id: string;
  period: 'monthly' | 'yearly';
  period_key: string;
  limit: number;
  notes: string | null;
}

export interface ApiBudgetStatus {
  budget: ApiBudget;
  category_name: string;
  color: string;
  spent: number;
  remaining: number;
  ratio: number;
  exceeded: boolean;
}

export interface ApiGoal {
  id: string;
  title: string;
  description: string | null;
  target: number;
  saved: number;
  deadline: string | null;
  created_at: string;
}

export interface ApiDebtPayment {
  id: string;
  date: string;
  amount: number;
  notes: string | null;
  linked_transaction_id: string | null;
}

export interface ApiDebt {
  id: string;
  direction: 'iOwe' | 'owedToMe';
  party: string;
  original_amount: number;
  due_date: string | null;
  notes: string | null;
  created_at: string;
  payments: ApiDebtPayment[];
}

export interface ApiSettings {
  theme: string;
  currency: string;
  date_format: string;
  compact_sidebar: boolean;
}

export const financeApi = {
  // Accounts
  listAccounts: () => request<ApiAccountWithBalance[]>('/accounts'),
  createAccount: (body: { name: string; group: string; openingBalance: string }) =>
    request<ApiAccount>('/accounts', { method: 'POST', body }),
  getAccount: (id: string) => request<ApiAccountWithBalance>(`/accounts/${id}`),
  updateAccount: (id: string, body: { name: string; group: string }) =>
    request<ApiAccount>(`/accounts/${id}`, { method: 'PATCH', body }),
  archiveAccount: (id: string) => request<ApiAccount>(`/accounts/${id}/archive`, { method: 'POST' }),
  unarchiveAccount: (id: string) =>
    request<ApiAccount>(`/accounts/${id}/unarchive`, { method: 'POST' }),
  deleteAccount: (id: string) => request(`/accounts/${id}`, { method: 'DELETE' }),

  // Transactions
  listTransactions: (query: Record<string, string | number | undefined> = {}) =>
    request<ApiTransactionList>('/transactions', { query }),
  createTransaction: (body: Record<string, unknown>) =>
    request<ApiTransaction>('/transactions', { method: 'POST', body }),
  getTransaction: (id: string) => request<ApiTransaction>(`/transactions/${id}`),
  updateTransaction: (id: string, body: Record<string, unknown>) =>
    request<ApiTransaction>(`/transactions/${id}`, { method: 'PUT', body }),
  deleteTransaction: (id: string) => request(`/transactions/${id}`, { method: 'DELETE' }),

  // Transfers
  listTransfers: () => request<ApiTransfer[]>('/transfers'),
  createTransfer: (body: Record<string, unknown>) =>
    request<ApiTransfer>('/transfers', { method: 'POST', body }),
  deleteTransfer: (id: string) => request(`/transfers/${id}`, { method: 'DELETE' }),

  // Categories
  listCategories: () => request<ApiCategory[]>('/categories'),
  createCategory: (body: { name: string; type: string; color: string }) =>
    request<ApiCategory>('/categories', { method: 'POST', body }),
  updateCategory: (id: string, body: { name: string; color: string }) =>
    request<ApiCategory>(`/categories/${id}`, { method: 'PATCH', body }),
  deleteCategory: (id: string) => request(`/categories/${id}`, { method: 'DELETE' }),

  // Payment methods
  listPaymentMethods: () => request<ApiPaymentMethod[]>('/payment-methods'),
  createPaymentMethod: (body: { name: string }) =>
    request<ApiPaymentMethod>('/payment-methods', { method: 'POST', body }),
  deletePaymentMethod: (id: string) => request(`/payment-methods/${id}`, { method: 'DELETE' }),

  // Budgets
  listBudgets: () => request<ApiBudgetStatus[]>('/budgets'),
  createBudget: (body: Record<string, unknown>) =>
    request<ApiBudgetStatus>('/budgets', { method: 'POST', body }),
  updateBudget: (id: string, body: Record<string, unknown>) =>
    request<ApiBudgetStatus>(`/budgets/${id}`, { method: 'PUT', body }),
  deleteBudget: (id: string) => request(`/budgets/${id}`, { method: 'DELETE' }),

  // Goals
  listGoals: () => request<ApiGoal[]>('/goals'),
  createGoal: (body: Record<string, unknown>) => request<ApiGoal>('/goals', { method: 'POST', body }),
  updateGoal: (id: string, body: Record<string, unknown>) =>
    request<ApiGoal>(`/goals/${id}`, { method: 'PUT', body }),
  deleteGoal: (id: string) => request(`/goals/${id}`, { method: 'DELETE' }),

  // Debts
  listDebts: () => request<ApiDebt[]>('/debts'),
  createDebt: (body: Record<string, unknown>) => request<ApiDebt>('/debts', { method: 'POST', body }),
  updateDebt: (id: string, body: Record<string, unknown>) =>
    request<ApiDebt>(`/debts/${id}`, { method: 'PUT', body }),
  deleteDebt: (id: string) => request(`/debts/${id}`, { method: 'DELETE' }),
  addDebtPayment: (debtId: string, body: Record<string, unknown>) =>
    request<ApiDebtPayment>(`/debts/${debtId}/payments`, { method: 'POST', body }),
  deleteDebtPayment: (debtId: string, paymentId: string) =>
    request(`/debts/${debtId}/payments/${paymentId}`, { method: 'DELETE' }),

  // Settings
  getSettings: () => request<ApiSettings>('/settings'),
  updateSettings: (body: Partial<ApiSettings>) =>
    request<ApiSettings>('/settings', { method: 'PUT', body }),

  // Data
  importData: (body: Record<string, unknown>) =>
    request<Record<string, unknown>>('/data/import', { method: 'POST', body }),
  exportData: () => request<Record<string, unknown>>('/data/export'),
};
