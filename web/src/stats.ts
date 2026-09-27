import type { ContractSummary } from './api.ts';

/** The strip above the contracts table: how many, how many ready, and what they come to. */
export function contractStats(rows: readonly ContractSummary[]) {
  return {
    count: rows.length,
    ready: rows.filter((r) => r.status === 'ready').length,
    payable: rows.reduce((sum, r) => sum + (r.payable ?? 0), 0),
  };
}
