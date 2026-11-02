import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPaymentReport, resolvePaymentReport } from './paymentReports.js';

const stats = { balances: { joao: -1200, maria: 1200, lucas: 0 } };
const members = ['joao', 'maria', 'lucas'];
const input = {
  id: 'report-1',
  scope: 'group:plans',
  month: '2026-11',
  transfer: { from: 'joao', to: 'maria', amount: 1200 },
  date: '2026-11-02',
};
test('a payer report leaves balances unchanged until the receiver confirms', () => {
  const before = structuredClone(stats);
  const report = createPaymentReport(input, 'joao', stats, members, []);
  assert.equal(report.status, 'pending');
  assert.deepEqual(stats, before);
  assert.equal(
    resolvePaymentReport(report, 'maria', 'confirm', stats, members).status,
    'confirmed',
  );
});
test('third parties cannot report and the payer cannot approve or reject their own report', () => {
  assert.throws(() => createPaymentReport(input, 'lucas', stats, members, []));
  const report = createPaymentReport(input, 'joao', stats, members, []);
  for (const actor of ['joao', 'lucas'])
    for (const action of ['confirm', 'reject'])
      assert.throws(() => resolvePaymentReport(report, actor, action, stats, members));
});
test('duplicate pending reports are rejected and refusing keeps the debt unchanged', () => {
  const report = createPaymentReport(input, 'joao', stats, members, []);
  assert.throws(() =>
    createPaymentReport({ ...input, id: 'another' }, 'joao', stats, members, [report]),
  );
  assert.equal(resolvePaymentReport(report, 'maria', 'reject', stats, members).status, 'rejected');
  assert.equal(stats.balances.joao, -1200);
});
test('confirmation revalidates the current balance and supports partial amounts', () => {
  const report = createPaymentReport(
    { ...input, transfer: { ...input.transfer, amount: 600 } },
    'joao',
    stats,
    members,
    [],
  );
  assert.equal(resolvePaymentReport(report, 'maria', 'confirm', stats, members).amount, 600);
  assert.throws(() =>
    resolvePaymentReport(
      report,
      'maria',
      'confirm',
      { balances: { joao: -500, maria: 500 } },
      members,
    ),
  );
  assert.throws(() =>
    resolvePaymentReport({ ...report, status: 'confirmed' }, 'maria', 'confirm', stats, members),
  );
});
