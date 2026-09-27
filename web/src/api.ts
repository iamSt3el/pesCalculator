export class ApiError extends Error {
  status: number;
  /** The server's machine-readable reason, when it gives one: 'limit', 'read_only', 'subscribed'. */
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * A 402 means the account's plan no longer covers what was just attempted —
 * typically a plan that ran out while the page was open. Whoever holds the
 * entitlement listens here and refetches, so the page turns read-only instead
 * of showing a save error forever.
 */
const staleListeners = new Set<() => void>();
export function onEntitlementStale(fn: () => void): () => void {
  staleListeners.add(fn);
  return () => { staleListeners.delete(fn); };
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 402) staleListeners.forEach((fn) => fn());
    const { error, code } = body as { error?: unknown; code?: unknown };
    throw new ApiError(
      res.status,
      typeof error === 'string' ? error : res.statusText,
      typeof code === 'string' ? code : undefined,
    );
  }
  return body as T;
}

const send = <T>(path: string, method: string, body: unknown) =>
  call<T>(path, { method, body: JSON.stringify(body) });

export const api = {
  me: () => call<SessionUser>('/api/auth/me'),
  login: (email: string, password: string) => send<SessionUser>('/api/auth/login', 'POST', { email, password }),
  logout: () => call<void>('/api/auth/logout', { method: 'POST' }),
  createUser: (email: string, password: string) => send<SessionUser>('/api/users', 'POST', { email, password }),
  profile: () => call<Profile>('/api/users/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    send<void>('/api/users/me/password', 'POST', { currentPassword, newPassword }),

  listRates: () => call<RateRow[]>('/api/rates'),
  putRates: (rows: RateRow[]) => send<{ written: number; rates: RateRow[] }>('/api/rates', 'PUT', rows),
  deleteRate: (month: string) => call<{ rates: RateRow[] }>(`/api/rates/${month}`, { method: 'DELETE' }),
  pasteRates: (text: string) =>
    send<{ written: number; errors: string[]; rates: RateRow[] }>('/api/rates/paste', 'POST', { text }),

  listContracts: () => call<ContractSummary[]>('/api/contracts'),
  createContract: (agreementNo: string) => send<{ id: number }>('/api/contracts', 'POST', { agreementNo }),
  getContract: (id: number) => call<ContractBundle>(`/api/contracts/${id}`),
  deleteContract: (id: number) => call<void>(`/api/contracts/${id}`, { method: 'DELETE' }),
  putContract: (id: number, patch: Partial<Contract>) => send<ContractBundle>(`/api/contracts/${id}`, 'PUT', patch),
  putComponents: (id: number, rows: ComponentConfig[]) => send<ContractBundle>(`/api/contracts/${id}/components`, 'PUT', rows),
  putProgress: (id: number, rows: ProgressRow[]) => send<ContractBundle>(`/api/contracts/${id}/progress`, 'PUT', rows),
  putPayments: (id: number, rows: AdjustmentRow[]) => send<ContractBundle>(`/api/contracts/${id}/payments`, 'PUT', rows),
  putExpenditure: (id: number, rows: ExpenditureRow[]) => send<ContractBundle>(`/api/contracts/${id}/expenditure`, 'PUT', rows),
  getCalculation: (id: number) => call<Calculation>(`/api/contracts/${id}/calculation`),

  billing: () => call<BillingView>('/api/billing'),
  plans: () => call<PlanPrice[]>('/api/billing/plans'),
  subscribe: (period: Period) => send<StartedCheckout>('/api/billing/subscriptions', 'POST', { period }),
  verifySubscription: (result: CheckoutResult) =>
    send<BillingView>('/api/billing/subscriptions/verify', 'POST', result),
  cancelSubscription: () => call<BillingView>('/api/billing/subscription/cancel', { method: 'POST' }),

  subscribers: () => call<Subscriber[]>('/api/admin/subscribers'),
  grant: (userId: number, until: string, note: string) =>
    send<{ id: number }>(`/api/admin/users/${userId}/grants`, 'POST', { until, note }),
  revokeGrant: (id: number) => call<void>(`/api/admin/grants/${id}`, { method: 'DELETE' }),
};

/* ---- wire types ---------------------------------------------------------- */

export interface SessionUser { id: number; email: string; role: 'admin' | 'user' }

export interface Profile extends SessionUser { createdAt: string; contractCount: number }

export type ComponentKey = 'labour' | 'material' | 'cement' | 'steel' | 'pol' | 'bitumen';
export type BaseRule = 'quarter_average' | 'bid_month' | 'offset_month';

export const COMPONENT_KEYS: ComponentKey[] =
  ['labour', 'material', 'cement', 'steel', 'pol', 'bitumen'];

export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  labour: 'Labour', material: 'Material (All Commodities)', cement: 'Cement',
  steel: 'Steel', pol: 'POL', bitumen: 'Bitumen',
};

export interface RateRow {
  month: string;
  labour: number | null; material: number | null; cement: number | null;
  steel: number | null; pol: number | null;
  bitumenG: number | null; bitumenH: number | null;
}

export interface ComponentConfig {
  key: ComponentKey; percent: number; factor: number;
  baseRule: BaseRule; baseOverride: number | null;
}

/** What the schedule of payment bills from: the spanwise days, or the expenditure typed per month. */
export type ScheduleBasis = 'spanwise' | 'execution';

export const SCHEDULE_BASIS_LABELS: Record<ScheduleBasis, string> = {
  spanwise: 'A · Expenditure span wise',
  execution: 'B · Expenditure execution wise',
};

export interface Contract {
  id: number;
  agreementNo: string; contractor: string; workName: string; woNoDate: string;
  woAmount: number; workDoneAmount: number;
  bidDate: string; commencement: string; stipulatedCompletion: string; actualCompletion: string;
  bitumenOffsetDays: number; alreadyPaid: number;
  scheduleBasis: ScheduleBasis;
}

export interface ProgressRow { month: string; spanDays: [number, number, number, number] }
export interface AdjustmentRow { month: string; adjustment: number }
export interface ExpenditureRow { month: string; amount: number }
export interface ContractSummary {
  id: number; agreementNo: string; contractor: string; workName: string;
  updatedAt: string;
  /** null until the contract has been given enough to compute anything. */
  payable: number | null;
  problemCount: number;
  status: 'ready' | 'provisional' | 'blank';
}

export interface ContractBundle {
  contract: Contract;
  components: ComponentConfig[];
  progress: ProgressRow[];
  adjustments: AdjustmentRow[];
  expenditure: ExpenditureRow[];
}

export interface EscalationLine {
  component: ComponentKey;
  period: string;
  periodKind: 'quarter' | 'month';
  factor: number; percent: number; value: number;
  currentIndex: number | null; baseIndex: number | null; amount: number;
}

export interface ResolvedBase {
  key: ComponentKey; rule: BaseRule; sourceMonths: string[];
  bitumenSeries: 'first' | 'second' | null;
  value: number | null; overridden: boolean;
}

export interface Problem {
  code: 'missing_rates' | 'percent_total' | 'zero_base' | 'invalid_period'
    | 'schedule_drift' | 'unbilled_days' | 'impossible_days' | 'expenditure_drift';
  message: string;
  months?: string[];
}

export interface ScheduleRow { month: string; computed: number; adjustment: number; payment: number }

export interface Calculation {
  spans: {
    totalDays: number;
    days: [number, number, number, number];
    values: [number, number, number, number];
    endDates: [string, string, string, string];
  };
  /** Days each month has inside the contract period, keyed 'YYYY-MM'. */
  monthDays: Record<string, number>;
  schedule: {
    basis: ScheduleBasis;
    rows: ScheduleRow[];
    /** What each month's days earn span wise, whichever basis the schedule bills from. */
    spanwise: Record<string, number>;
    total: number;
    byQuarter: Record<string, number>;
    workedDays: [number, number, number, number];
    perDay: [number, number, number, number];
  };
  baseQuarter: string;
  bases: Record<string, ResolvedBase>;
  quarters: string[];
  lines: EscalationLine[];
  componentTotals: Record<string, number>;
  grandTotal: number;
  alreadyPaid: number;
  payable: number;
  problems: Problem[];
}

export type Period = 'monthly' | 'half_yearly' | 'yearly';

export interface Entitlement {
  paid: boolean;
  source: 'admin' | 'subscription' | 'grant' | 'free';
  paidUntil: string | null;
  contractCount: number;
  limit: number | null;
  readOnly: boolean;
  canCreate: boolean;
}

export interface SubscriptionSummary {
  period: Period;
  status: string;
  currentEnd: string | null;
  cancelAtCycleEnd: boolean;
}

export interface BillingView {
  /** False until the Razorpay keys are set; then nobody is limited. */
  configured: boolean;
  keyId: string | null;
  entitlement: Entitlement;
  subscription: SubscriptionSummary | null;
  grant: { until: string } | null;
  charges: Array<{ paymentId: string; amountPaise: number; paidAt: string; period: Period }>;
}

export interface PlanPrice { period: Period; amountPaise: number; currency: string }
export interface StartedCheckout { subscriptionId: string; keyId: string; email: string }

/** Exactly what Razorpay Checkout hands its success handler. */
export interface CheckoutResult {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}

export interface Subscriber {
  id: number;
  email: string;
  role: 'admin' | 'user';
  createdAt: string;
  entitlement: Entitlement;
  subscription: (SubscriptionSummary & { razorpayId: string }) | null;
  grant: { id: number; until: string; note: string } | null;
}
