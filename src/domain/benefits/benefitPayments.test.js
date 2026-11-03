import test from 'node:test';
import assert from 'node:assert/strict';
import { benefitUsage, paymentSource } from './benefitPayments.js';
import {
  migrateData,
  calculateWorkspace,
  defaultIncomeConfig,
} from '../budget/workspaceCalculations.js';
import { encodeFinance, decodeFinance } from '../budget/financeCloudCodec.js';
import { consolidatedExpenses, consolidatedTotals } from '../expenses/consolidatedExpenses.js';
import { projectSharedGroup } from '../groups/groupSharing.js';
import {
  sharedGroupData,
  sharedGroupChanges,
  applySharedGroupChanges,
} from '../groups/sharedGroupEditing.js';
import { recurringReviewEntries, copyRecurringExpenses } from '../expenses/recurringExpenses.js';

const month = '2026-11',
  owner = 'person-0',
  scope = `person:${owner}`;
function fixture() {
  const data = migrateData(null);
  data.people.push({ id: 'b', name: 'Bia' });
  data.groups = [{ id: 'g', name: 'Casa', memberIds: [owner, 'b'], adminPersonId: owner }];
  data.months = { [month]: { [owner]: 300000, b: 200000 } };
  data.incomeConfigs = {
    [month]: {
      [owner]: { ...defaultIncomeConfig(300000), foodAllowance: 60000, mealAllowance: 30000 },
    },
  };
  data.expenses = [
    {
      id: 'food',
      workspace: scope,
      description: 'Mercado',
      category: 'Alimentação',
      date: month + '-10',
      amount: 10001,
      payer: owner,
      participants: [owner],
      split: 'equal',
      status: 'paid',
      percentages: {},
    },
  ];
  return data;
}
const stats = (d, workspace = scope) => calculateWorkspace(d, month, workspace, d.months[month]);
const usage = (d, person = owner, m = month, remote = [], accountUid) =>
  benefitUsage(
    consolidatedExpenses(d, person, m, remote, accountUid),
    d.incomeConfigs[m]?.[person],
  );

test('absent source remains cash without rewriting history; benefit expenses preserve consumption but do not spend cash twice', () => {
  const d = fixture(),
    before = structuredClone(d),
    original = stats(d);
  assert.equal(paymentSource(d.expenses[0]), 'cash');
  assert.equal(original.available, 289999);
  const migrated = migrateData(d);
  assert.deepEqual(d, before);
  assert.equal(Object.hasOwn(migrated.expenses[0], 'paymentSource'), false);
  assert.deepEqual(stats(migrated), original);
  d.expenses[0].paymentSource = 'foodAllowance';
  const current = stats(d);
  assert.equal(current.total, original.total);
  assert.deepEqual(current.categories, original.categories);
  assert.equal(current.available, 300000);
  assert.equal(current.cashExpenses, 0);
  assert.equal(current.benefitExpenses, 10001);
  d.contributions = [{ id: 'save', scope, date: month + '-11', amount: 50000 }];
  assert.equal(stats(d).available, 250000);
  assert.equal(stats(d).balanceBeforeContributions, 300000);
  assert.equal(usage(d)[0].spent, 10001);
});

test('only paid expenses debit VA; pending reserves and VR stay separate; changes, removal, deficits and months recalculate from history', () => {
  const d = fixture();
  d.expenses[0].paymentSource = 'foodAllowance';
  d.expenses.push({ ...d.expenses[0], id: 'meal', paymentSource: 'mealAllowance', amount: 7000 });
  d.expenses.push({ ...d.expenses[0], id: 'future', amount: 60000, status: 'pending' });
  let [va, vr] = usage(d);
  assert.equal(va.spent, 10001);
  assert.equal(va.pending, 60000);
  assert.equal(va.remaining, 49999);
  assert.equal(va.forecast, -10001);
  assert.equal(vr.spent, 7000);
  assert.equal(vr.remaining, 23000);
  assert.equal(stats(d).available, 300000);
  d.expenses[2].status = 'paid';
  [va] = usage(d);
  assert.equal(va.spent, 70001);
  assert.equal(va.pending, 0);
  assert.equal(va.remaining, -10001);
  d.expenses[0].paymentSource = 'cash';
  assert.equal(usage(d)[0].spent, 60000);
  assert.equal(stats(d).available, 289999);
  d.expenses = d.expenses.filter((e) => e.id !== 'future');
  assert.equal(usage(d)[0].spent, 0);
  assert.equal(usage(d, owner, '2027-01')[0].credit, 0);
  assert.equal(usage(d, owner, '2027-01')[0].remaining, 0);
  assert.equal(usage(d, 'b')[0].spent, 0);
});

test('shared benefit payments debit the full payer vale while preserving splits, paid shares, settlements and other members cash', () => {
  const d = fixture();
  d.expenses[0].workspace = 'group:g';
  d.expenses[0].participants = [owner, 'b'];
  const previous = stats(d, 'group:g');
  d.expenses[0].paymentSource = 'mealAllowance';
  const group = stats(d, 'group:g');
  for (const key of ['total', 'paid', 'pending', 'shares', 'paidBy', 'balances', 'transfers'])
    assert.deepEqual(group[key], previous[key]);
  assert.equal(group.shares[owner], 5001);
  assert.equal(group.shares.b, 5000);
  assert.equal(usage(d)[1].spent, 10001);
  assert.equal(usage(d, 'b')[1].spent, 0);
  assert.equal(stats(d).cashExpenses, 0);
  assert.equal(stats(d, 'person:b').cashExpenses, 5000);
  assert.equal(stats(d, 'person:b').available, 195000);
  d.expenses[0].participants = ['b'];
  assert.equal(stats(d).total, 0);
  assert.equal(usage(d)[1].spent, 10001);
  assert.equal(stats(d, 'person:b').cashExpenses, 10001);
  d.expenses[0].payer = 'b';
  assert.equal(usage(d)[1].spent, 0);
  assert.equal(usage(d, 'b')[1].spent, 10001);
});

test('private codec/backup preserve source and monthly credits, old orders stay compatible and malformed sources fail before saving', () => {
  const d = fixture();
  d.expenses[0].paymentSource = 'foodAllowance';
  const encoded = encodeFinance(d);
  const restored = decodeFinance([
    {
      id: 'state',
      schemaVersion: 2,
      revision: 1,
      recordCount: encoded.records.length,
      orders: encoded.orders,
    },
    ...encoded.records.map((r) => ({ ...r, revision: 1 })),
  ]).data;
  assert.deepEqual(restored, migrateData(d));
  assert.deepEqual(usage(restored), usage(d));
  assert.deepEqual(migrateData(JSON.parse(JSON.stringify(d))), migrateData(d));
  for (const value of ['invalid', '', null, {}, '__proto__'])
    assert.throws(
      () => migrateData({ ...d, expenses: [{ ...d.expenses[0], paymentSource: value }] }),
      /fonte/,
    );
  assert.throws(
    () => migrateData({ ...d, expenses: [{ ...d.expenses[0], cardId: 'credit' }] }),
    /VA\/VR/,
  );
  assert.throws(() => benefitUsage([], { foodAllowance: 0.1 }), /inválido/);
  assert.throws(
    () =>
      benefitUsage([
        {
          payerIsMe: true,
          expense: { paymentSource: 'foodAllowance' },
          status: 'paid',
          totalAmount: Number.MAX_SAFE_INTEGER,
        },
        {
          payerIsMe: true,
          expense: { paymentSource: 'foodAllowance' },
          status: 'paid',
          totalAmount: 1,
        },
      ]),
    /limite/,
  );
});

test('remote group usage uses the membership payer identity, does not duplicate owned groups and never shares benefit credits', () => {
  const d = fixture();
  d.expenses[0] = {
    ...d.expenses[0],
    workspace: 'group:g',
    participants: [owner, 'b'],
    paymentSource: 'mealAllowance',
  };
  const snapshot = projectSharedGroup(d, 'g');
  assert.equal(snapshot.expenses[0].paymentSource, 'mealAllowance');
  assert.equal(snapshot.incomeConfigs, undefined);
  assert.equal(snapshot.overview[month].stats.income, undefined);
  const remote = {
    id: 'admin_g',
    adminUid: 'admin',
    membership: { groupId: 'admin_g', personId: owner },
    snapshot,
  };
  assert.equal(usage(d, owner, month, [remote, remote], 'admin')[1].spent, 10001);
  const local = fixture();
  local.expenses = [];
  local.groups = [];
  const rows = consolidatedExpenses(local, owner, month, [remote, remote], 'different');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ownAmount, 5001);
  assert.equal(rows[0].cashAmount, 0);
  assert.equal(benefitUsage(rows)[1].spent, 10001);
  assert.equal(consolidatedTotals(rows).benefits, 5001);
});

test('shared edits can change and clear the source while preserving private credits and validating optional fields', () => {
  const d = fixture();
  d.expenses[0] = { ...d.expenses[0], workspace: 'group:g', participants: [owner, 'b'] };
  const prev = sharedGroupData(projectSharedGroup(d, 'g'));
  const next = structuredClone(prev);
  next.expenses[0].paymentSource = 'foodAllowance';
  let applied = applySharedGroupChanges(d, 'g', sharedGroupChanges(prev, next));
  assert.equal(applied.expenses[0].paymentSource, 'foodAllowance');
  assert.deepEqual(applied.incomeConfigs, d.incomeConfigs);
  const cleared = structuredClone(next);
  delete cleared.expenses[0].paymentSource;
  applied = applySharedGroupChanges(applied, 'g', sharedGroupChanges(next, cleared));
  assert.equal(Object.hasOwn(applied.expenses[0], 'paymentSource'), false);
});

test('variable VA recurrence stays blank in the new year, retains source and never duplicates the benefit debit', () => {
  const d = fixture();
  d.expenses[0] = {
    ...d.expenses[0],
    date: '2026-12-31',
    fixed: true,
    fixedAmountType: 'variable',
    paymentSource: 'foodAllowance',
  };
  const entries = recurringReviewEntries(d.expenses);
  assert.equal(entries.food.amount, '');
  entries.food.amount = '75,43';
  const copies = copyRecurringExpenses(d.expenses, scope, '2027-01', entries, () => 'copy');
  assert.equal(copies.length, 1);
  assert.equal(copies[0].paymentSource, 'foodAllowance');
  assert.equal(copies[0].amount, 7543);
  assert.equal(copies[0].status, 'pending');
  d.expenses.push(...copies);
  assert.equal(usage(d, owner, '2026-12')[0].spent, 10001);
  assert.equal(usage(d, owner, '2027-01')[0].spent, 0);
  assert.equal(usage(d, owner, '2027-01')[0].pending, 7543);
  assert.throws(
    () => copyRecurringExpenses(d.expenses, scope, '2027-01', entries),
    /ainda não copiada/,
  );
});
