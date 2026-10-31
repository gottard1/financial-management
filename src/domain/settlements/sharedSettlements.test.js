import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nextSettlementLedger,
  sharedMonthOverview,
  ledgerRecords,
  mergeSharedSettlements,
} from './sharedSettlements.js';
import { recordQuickSettlement } from './quickSettlement.js';
import { migrateData } from '../budget/workspaceCalculations.js';
import { projectSharedGroup } from '../groups/groupSharing.js';

function fixture() {
  return {
    ...migrateData(null),
    people: [
      { id: 'a', name: 'Ana' },
      { id: 'b', name: 'Bia' },
    ],
    groups: [{ id: 'g', name: 'Casa', memberIds: ['a', 'b'], adminPersonId: 'a' }],
    months: { '2026-10': { a: 100000, b: 200000 } },
    expenses: [
      {
        id: 'bill',
        description: 'Luz',
        amount: 10000,
        workspace: 'group:g',
        date: '2026-10-01',
        payer: 'a',
        participants: ['a', 'b'],
        split: 'equal',
        status: 'paid',
      },
    ],
  };
}
const options = {
  month: '2026-10',
  transfer: { from: 'b', to: 'a', amount: 5000 },
  uid: 'ana',
  id: 'receipt',
  date: '2026-11-01',
};

test('partial receipts and undo conserve group totals and are applied exactly once', () => {
  const data = fixture();
  const snapshot = projectSharedGroup(data, 'g');
  const ledger = nextSettlementLedger(snapshot, null, {
    ...options,
    transfer: { ...options.transfer, amount: 2000 },
  });
  let overview = sharedMonthOverview(snapshot, '2026-10', ledger);
  assert.equal(overview.stats.total, 10000);
  assert.deepEqual(overview.stats.balances, { a: 3000, b: -3000 });
  const merged = mergeSharedSettlements(data, [{ localId: 'g', ledgers: [ledger] }]);
  const republished = projectSharedGroup(merged, 'g');
  assert.deepEqual(sharedMonthOverview(republished, '2026-10', ledger), overview);
  assert.throws(() => nextSettlementLedger(snapshot, ledger, options));
  assert.throws(() => nextSettlementLedger(snapshot, ledger, { ...options, id: 'overpayment' }));
  assert.throws(() =>
    nextSettlementLedger(snapshot, ledger, { ...options, uid: 'bia', voidId: 'receipt' }),
  );
  const undone = nextSettlementLedger(snapshot, ledger, { ...options, voidId: 'receipt' });
  assert.equal(ledgerRecords(undone).length, 1);
  assert.equal(ledgerRecords(undone)[0].status, 'void');
  assert.deepEqual(sharedMonthOverview(snapshot, '2026-10', undone).stats.balances, {
    a: 5000,
    b: -5000,
  });
  assert.throws(() => nextSettlementLedger(snapshot, undone, { ...options, voidId: 'receipt' }));
  assert.equal(sharedMonthOverview(snapshot, '2026-11', null).stats.total, 0);
});

test('full settlement clears debt; a second stale click cannot confirm again', () => {
  const snapshot = projectSharedGroup(fixture(), 'g');
  const ledger = nextSettlementLedger(snapshot, null, options);
  assert.deepEqual(sharedMonthOverview(snapshot, '2026-10', ledger).stats.transfers, []);
  assert.throws(() => nextSettlementLedger(snapshot, ledger, { ...options, id: 'second-click' }));
});

test('local quick receipt checks current balances, archived groups and duplicate IDs', () => {
  const data = fixture();
  const input = { ...options, scope: 'group:g' };
  const next = recordQuickSettlement(data, input);
  assert.equal(data.settlements.length, 0);
  assert.equal(next.settlements[0].referenceMonth, '2026-10');
  assert.equal(next.settlements[0].date, '2026-11-01');
  assert.throws(() => recordQuickSettlement(next, input));
  assert.throws(() => recordQuickSettlement(next, { ...input, id: 'stale' }));
  assert.throws(() =>
    recordQuickSettlement({ ...data, groups: [{ ...data.groups[0], deleted: true }] }, input),
  );
});
