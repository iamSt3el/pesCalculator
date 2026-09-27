import test from 'node:test';
import assert from 'node:assert/strict';
import type { ContractSummary } from '../src/api.ts';
import { contractStats } from '../src/stats.ts';

const row = (status: ContractSummary['status'], payable: number | null): ContractSummary => ({
  id: 1, agreementNo: 'x', contractor: '', workName: '', updatedAt: '', payable, problemCount: 0, status,
});

test('contractStats counts contracts, the ones ready to print, and the payable across them', () => {
  assert.deepEqual(contractStats([]), { count: 0, ready: 0, payable: 0 });
  assert.deepEqual(
    contractStats([row('ready', 172_604), row('provisional', -1_200.5), row('blank', null)]),
    { count: 3, ready: 1, payable: 171_403.5 },
  );
});
