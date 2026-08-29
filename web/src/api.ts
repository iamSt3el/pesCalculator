export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
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
    const err = (body as { error?: unknown }).error;
    throw new ApiError(res.status, typeof err === 'string' ? err : res.statusText);
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
  getCalculation: (id: number) => call<Calculation>(`/api/contracts/${id}/calculation`),
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
  steel: 'Steel', pol: 'POL', bitumen: 'Bitumen VG-10',
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

export interface Contract {
  id: number;
  agreementNo: string; contractor: string; workName: string; woNoDate: string;
  woAmount: number; workDoneAmount: number;
  bidDate: string; commencement: string; stipulatedCompletion: string; actualCompletion: string;
  bitumenOffsetDays: number; alreadyPaid: number;
}

export interface ProgressRow { month: string; spanDays: [number, number, number, number] }
export interface AdjustmentRow { month: string; adjustment: number }
export interface ContractSummary { id: number; agreementNo: string; contractor: string; workName: string }

export interface ContractBundle {
  contract: Contract;
  components: ComponentConfig[];
  progress: ProgressRow[];
  adjustments: AdjustmentRow[];
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
  value: number | null; overridden: boolean;
}

export interface Problem {
  code: 'missing_rates' | 'percent_total' | 'zero_base' | 'invalid_period' | 'schedule_drift';
  message: string;
  months?: string[];
}

export interface ScheduleRow { month: string; computed: number; adjustment: number; payment: number }

export interface Calculation {
  spans: {
    totalDays: number;
    days: [number, number, number, number];
    values: [number, number, number, number];
    perDay: [number, number, number, number];
    endDates: [string, string, string, string];
  };
  schedule: { rows: ScheduleRow[]; total: number; byQuarter: Record<string, number> };
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
