import test from 'node:test';
import assert from 'node:assert/strict';
import {
  migrateData,
  calculateWorkspace,
  defaultIncomeConfig,
} from '../budget/workspaceCalculations.js';
import { encodeFinance, decodeFinance } from '../budget/financeCloudCodec.js';
import { parseMoney } from '../expenses/expenseCalculations.js';
import { copyRecurringExpenses, recurringCandidates } from '../expenses/recurringExpenses.js';
import { projectSharedGroup } from '../groups/groupSharing.js';
import {
  sharedGroupData,
  applySharedGroupChanges,
  sharedGroupChanges,
} from '../groups/sharedGroupEditing.js';
import { purgeGroupHistoryBatch } from '../groups/groupMembers.js';
import { addExtraCategory, extraCategoryOptions } from '../expenses/expenseCategories.js';
import {
  invoiceDates,
  cardInvoicePeriod,
  installmentAmount,
  futureInstallments,
  prepareExpense,
  expenseMonth,
  monthlyIncomes,
  reserveBalances,
  investmentPosition,
  assetSummary,
  savingsSuggestions,
  suggestedDistribution,
  extensionArrays,
  installmentCommitments,
} from './extendedFinance.js';
import {
  exportFinanceData,
  loadFinanceData,
  saveFinanceData,
} from '../../infrastructure/storage/localFinanceRepository.js';

const scope = 'person:person-0';
function fixture() {
  const d = migrateData(null);
  d.months = { '2026-11': { 'person-0': 100000 } };
  d.goals = [{ id: 'travel', scope, title: 'Viagem', target: 100000 }];
  return d;
}
function expense(extra = {}) {
  return {
    id: 'e',
    workspace: scope,
    description: 'Compra',
    category: 'Outros',
    date: '2026-11-30',
    amount: 10000,
    status: 'pending',
    participants: ['person-0'],
    payer: 'person-0',
    split: 'equal',
    percentages: {},
    ...extra,
  };
}
function strategy() {
  return {
    targetType: 'percent',
    targetPercent: 53.8,
    targetAmount: 0,
    distribution: suggestedDistribution.map(([name, percent], index) => ({
      id: `d${index}`,
      name,
      percent,
      fixedAmount: 0,
    })),
  };
}
function roundTrip(d) {
  const e = encodeFinance(d);
  return decodeFinance([
    { id: 'state', schemaVersion: 2, revision: 1, recordCount: e.records.length, orders: e.orders },
    ...e.records.map((r) => ({ ...r, revision: 1 })),
  ]).data;
}

test('invoice cutoff is strictly after closing, handles short months, leap years and year rollover', () => {
  const card = { closingDay: 10, dueDay: 20 };
  assert.deepEqual(invoiceDates('2026-12-10', card), {
    invoiceMonth: '2026-12',
    date: '2026-12-20',
  });
  assert.deepEqual(invoiceDates('2026-12-11', card), {
    invoiceMonth: '2027-01',
    date: '2027-01-20',
  });
  assert.deepEqual(invoiceDates('2027-01-31', { closingDay: 30, dueDay: 31 }), {
    invoiceMonth: '2027-02',
    date: '2027-02-28',
  });
  assert.deepEqual(invoiceDates('2028-02-29', { closingDay: 31, dueDay: 5 }), {
    invoiceMonth: '2028-02',
    date: '2028-03-05',
  });
  assert.throws(() => invoiceDates('2026-02-29', card));
  assert.throws(() => invoiceDates('2026-11-01', { closingDay: 0, dueDay: 32 }));
});
test('legacy month by due date and snapshots survive card changes and editing generated installments', () => {
  const d = fixture();
  d.cards = [{ id: 'card', scope, name: 'Cartão', closingDay: 10, dueDay: 5 }];
  const old = expense();
  d.expenses = [old];
  const card = prepareExpense(
    {
      ...expense({
        id: 'card-e',
        cardId: 'card',
        purchaseDate: '2026-12-11',
        fixed: true,
        installments: { total: 3, current: 1 },
      }),
      amount: '100,00',
    },
    d,
    parseMoney,
  );
  assert.equal(card.invoiceMonth, '2027-01');
  assert.equal(card.date, '2027-02-05');
  const copies = futureInstallments(card, [card], () => `p${Math.random()}`);
  d.cards[0].closingDay = 20;
  d.cards[0].dueDay = 25;
  const edited = prepareExpense({ ...copies[0], amount: '100,00' }, d, parseMoney);
  assert.equal(edited.invoiceMonth, '2027-02');
  assert.equal(edited.date, '2027-03-05');
  assert.equal(expenseMonth(old), '2026-11');
  const noCard = calculateWorkspace(d, '2026-11', scope, d.months['2026-11']);
  assert.equal(noCard.total, 10000);
  assert.equal(noCard.available, 90000);
});
test('card closing day 31 clamps to month end and day 6 can fall in the next month or next year', () => {
  const card = { closingDay: 31, dueDay: 6, dueMonthMode: 'next' };
  assert.deepEqual(cardInvoicePeriod('2026-11', card), {
    invoiceMonth: '2026-11',
    closingDate: '2026-11-30',
    date: '2026-12-06',
  });
  assert.deepEqual(invoiceDates('2026-11-30', card), {
    invoiceMonth: '2026-11',
    date: '2026-12-06',
  });
  assert.deepEqual(invoiceDates('2026-12-01', card), {
    invoiceMonth: '2026-12',
    date: '2027-01-06',
  });
  assert.deepEqual(cardInvoicePeriod('2028-02', card), {
    invoiceMonth: '2028-02',
    closingDate: '2028-02-29',
    date: '2028-03-06',
  });
  assert.equal(cardInvoicePeriod('2027-02', card).closingDate, '2027-02-28');
});
test('explicit due-month options are optional, round-trip and never recalculate historical card terms', () => {
  const legacy = { closingDay: 5, dueDay: 20 };
  assert.equal(invoiceDates('2026-11-01', legacy).date, '2026-11-20');
  assert.equal(invoiceDates('2026-11-01', { ...legacy, dueMonthMode: 'auto' }).date, '2026-11-20');
  assert.equal(invoiceDates('2026-11-01', { ...legacy, dueMonthMode: 'next' }).date, '2026-12-20');
  assert.equal(
    cardInvoicePeriod('2026-11', { closingDay: 6, dueDay: 6, dueMonthMode: 'same' }).date,
    '2026-11-06',
  );
  assert.equal(cardInvoicePeriod('2026-11', { closingDay: 6, dueDay: 6 }).date, '2026-12-06');
  const d = fixture();
  d.cards = [{ ...legacy, id: 'card', scope, name: 'Cartão' }];
  const old = prepareExpense(
    { ...expense({ cardId: 'card', purchaseDate: '2026-11-01' }), amount: '100,00' },
    d,
    parseMoney,
  );
  d.cards[0].dueMonthMode = 'next';
  const recent = prepareExpense(
    { ...expense({ id: 'new', cardId: 'card', purchaseDate: '2026-11-01' }), amount: '100,00' },
    d,
    parseMoney,
  );
  d.expenses = [old, recent];
  const restored = roundTrip(d);
  assert.equal(restored.cards[0].dueMonthMode, 'next');
  assert.equal(restored.expenses[0].date, '2026-11-20');
  assert.equal(restored.expenses[0].cardTerms.dueMonthMode, undefined);
  assert.equal(restored.expenses[1].date, '2026-12-20');
  assert.equal(restored.expenses[1].cardTerms.dueMonthMode, 'next');
  assert.equal(prepareExpense({ ...old, amount: '100,00' }, d, parseMoney).date, '2026-11-20');
  assert.throws(
    () => migrateData({ ...d, cards: [{ ...d.cards[0], dueMonthMode: 'invalid' }] }),
    /vencimento/,
  );
  assert.throws(
    () => cardInvoicePeriod('2026-11', { closingDay: 31, dueDay: 6, dueMonthMode: 'same' }),
    /anterior ao fechamento/,
  );
});
test('participants can configure a due-month rule and snapshots preserve only authorized card terms', () => {
  const d = fixture();
  d.groups = [{ id: 'g', name: 'Grupo', memberIds: ['person-0'] }];
  const next = applySharedGroupChanges(d, 'g', [
    {
      kind: 'cards',
      id: 'card',
      value: { name: 'Cartão compartilhado', closingDay: 31, dueDay: 6, dueMonthMode: 'next' },
    },
  ]);
  const gs = 'group:g';
  next.expenses = [
    prepareExpense(
      {
        ...expense({ workspace: gs, cardId: 'card', purchaseDate: '2026-11-30' }),
        amount: '100,00',
      },
      next,
      parseMoney,
    ),
  ];
  const snapshot = projectSharedGroup(next, 'g'),
    restored = sharedGroupData(snapshot);
  assert.equal(snapshot.cards[0].dueMonthMode, 'next');
  assert.equal(snapshot.expenses[0].cardTerms.dueMonthMode, 'next');
  assert.equal(snapshot.expenses[0].date, '2026-12-06');
  const changes = sharedGroupChanges(restored, {
    ...restored,
    cards: restored.cards.map((c) => ({ ...c, dueMonthMode: 'auto' })),
  });
  const updated = applySharedGroupChanges(next, 'g', changes);
  assert.equal(updated.cards[0].dueMonthMode, 'auto');
  assert.equal(updated.expenses[0].date, '2026-12-06');
});
test('total-price installments conserve every cent, generation and reviewed copying cannot duplicate an origin', () => {
  for (const [value, count] of [
    [10000, 3],
    [101, 100],
    [1, 1],
    [9007199254740000, 421],
  ])
    assert.equal(
      Array.from({ length: count }, (_, i) => installmentAmount(value, count, i + 1)).reduce(
        (s, n) => s + BigInt(n),
        0n,
      ),
      BigInt(value),
    );
  const d = fixture(),
    e = prepareExpense(
      {
        ...expense({ fixed: true, installments: { total: '3', current: '1' } }),
        amount: '100,00',
        amountMode: 'total',
      },
      d,
      parseMoney,
    );
  assert.equal(e.amount, 3334);
  let sequence = 0;
  const copies = futureInstallments(e, [e], () => `copy${sequence++}`);
  assert.deepEqual(
    copies.map((c) => [c.date, c.amount, c.installments.current]),
    [
      ['2026-12-30', 3333, 2],
      ['2027-01-30', 3333, 3],
    ],
  );
  assert.deepEqual(recurringCandidates([e, ...copies], scope, '2026-12'), []);
  assert.deepEqual(futureInstallments(e, [e, ...copies]), []);
  const copied = copyRecurringExpenses(
    [e],
    scope,
    '2026-12',
    { e: { selected: true, amount: '999,99' } },
    () => 'reviewed',
  );
  assert.equal(copied[0].amount, 3333);
  assert.equal(e.amount, 3334);
  assert.throws(() => migrateData({ ...d, expenses: [{ ...e, amount: 3333 }] }));
});
test('legacy per-installment amounts and finite full-value variable recurrence preserve review and history across years', () => {
  const e = expense({
    date: '2026-12-31',
    fixed: true,
    installments: { total: 420, current: 2 },
    amount: 97800,
  });
  const copy = copyRecurringExpenses(
    [e],
    scope,
    '2027-01',
    { e: { selected: true, amount: '978,00' } },
    () => 'next',
  );
  assert.equal(copy[0].amount, 97800);
  assert.equal(copy[0].installments.current, 3);
  assert.equal(e.installments.current, 2);
  const r = expense({
    fixed: true,
    date: '2026-12-31',
    fixedAmountType: 'variable',
    recurrence: { total: 2, current: 1 },
  });
  assert.throws(() =>
    copyRecurringExpenses([r], scope, '2027-01', { e: { selected: true, amount: '' } }),
  );
  const reviewed = copyRecurringExpenses(
    [r],
    scope,
    '2027-01',
    { e: { selected: true, amount: '190,11' } },
    () => 'next',
  );
  assert.equal(reviewed[0].amount, 19011);
  assert.equal(reviewed[0].recurrence.current, 2);
  assert.deepEqual(recurringCandidates(reviewed, scope, '2027-02'), []);
});
test('individual receipts use explicit integration modes without changing historical months or counting profile twice', () => {
  const d = fixture();
  d.incomeEntries = [
    {
      id: 'salary',
      scope,
      date: '2026-11-02',
      description: 'Salário',
      category: 'Salário',
      amount: 100000,
      includedInProfile: true,
    },
    {
      id: 'extra',
      scope,
      date: '2026-11-03',
      description: 'Extra',
      category: 'Renda extra',
      amount: 20000,
      includedInProfile: false,
    },
  ];
  assert.equal(monthlyIncomes(d, '2026-11')['person-0'], 120000);
  assert.equal(calculateWorkspace(d, '2026-11', scope, d.months['2026-11']).income, 120000);
  d.incomeConfigs = {
    '2026-11': { 'person-0': { ...defaultIncomeConfig(100000), receiptMode: 'profile' } },
  };
  assert.equal(monthlyIncomes(d, '2026-11')['person-0'], 100000);
  d.incomeConfigs['2026-11']['person-0'].receiptMode = 'entries';
  assert.equal(monthlyIncomes(d, '2026-11')['person-0'], 120000);
  assert.equal(monthlyIncomes(d, '2026-12')['person-0'], 0);
  assert.equal(roundTrip(d).incomeConfigs['2026-11']['person-0'].receiptMode, 'entries');
});
test('reserve opening, contribution, withdrawal, transfer and investment funding reconcile flow and assets only once', () => {
  const d = fixture();
  d.reserveMovements = [
    { id: 'opening', scope, kind: 'opening', date: '2026-10-01', amount: 50000, goalId: 'travel' },
    {
      id: 'withdraw',
      scope,
      kind: 'withdrawal',
      date: '2026-11-02',
      amount: 10000,
      goalId: 'travel',
    },
    {
      id: 'transfer',
      scope,
      kind: 'transfer',
      date: '2026-11-03',
      amount: 5000,
      goalId: 'travel',
      toGoalId: '',
    },
  ];
  d.contributions = [{ id: 'c', scope, date: '2026-11-01', amount: 20000, goalId: 'travel' }];
  d.investments = [
    {
      id: 'asset',
      scope,
      name: 'CDB',
      type: 'Renda fixa',
      institution: 'Instituição',
      goalId: 'travel',
    },
  ];
  d.investmentMovements = [
    {
      id: 'app',
      scope,
      investmentId: 'asset',
      kind: 'application',
      funding: 'reserve',
      goalId: 'travel',
      date: '2026-11-03',
      amount: 30000,
    },
    {
      id: 'appCash',
      scope,
      investmentId: 'asset',
      kind: 'application',
      funding: 'cash',
      date: '2026-11-03',
      amount: 10000,
    },
  ];
  const validated = migrateData(d),
    stats = calculateWorkspace(validated, '2026-11', scope, d.months['2026-11']);
  assert.equal(stats.income, 100000);
  assert.equal(stats.total, 0);
  assert.equal(stats.balanceBeforeContributions, 100000);
  assert.equal(stats.savingsThisMonth, 20000);
  assert.equal(stats.redemptions, 10000);
  assert.equal(stats.investmentApplications, 10000);
  assert.equal(stats.available, 80000);
  assert.equal(stats.reserveBalance, 30000);
  assert.equal(stats.invested, 40000);
  assert.equal(stats.wealth, 70000);
  assert.equal(reserveBalances(d, scope, '2026-10-31').get('travel'), 50000);
  assert.equal(assetSummary(d, scope, '2026-10-31').invested, 0);
  assert.equal(roundTrip(d).reserveMovements.length, 3);
  const invalid = structuredClone(d);
  invalid.reserveMovements[1].amount = 999999;
  assert.throws(() => migrateData(invalid), /Saldo da reserva/);
  const backdated = structuredClone(d);
  backdated.reserveMovements[0].date = '2026-12-01';
  assert.throws(() => migrateData(backdated), /Saldo da reserva/);
});
test('manual valuations stay separate from principal and realized yield, and later cash/reserve redemptions reconcile', () => {
  const d = fixture();
  d.investments = [{ id: 'a', scope, name: 'Ação', type: 'Ações', institution: 'Banco' }];
  d.investmentMovements = [
    {
      id: 'a1',
      scope,
      investmentId: 'a',
      kind: 'application',
      funding: 'cash',
      date: '2026-11-01',
      amount: 10000,
    },
    {
      id: 'y',
      scope,
      investmentId: 'a',
      kind: 'yield',
      funding: 'asset',
      date: '2026-11-02',
      amount: 1000,
    },
    {
      id: 'f',
      scope,
      investmentId: 'a',
      kind: 'fee',
      funding: 'asset',
      date: '2026-11-02',
      amount: 100,
    },
    {
      id: 't',
      scope,
      investmentId: 'a',
      kind: 'tax',
      funding: 'asset',
      date: '2026-11-02',
      amount: 200,
    },
  ];
  d.investmentValuations = [
    { id: 'v', scope, investmentId: 'a', date: '2026-11-02', amount: 15000 },
  ];
  d.investmentMovements.push({
    id: 'r',
    scope,
    investmentId: 'a',
    kind: 'redemption',
    funding: 'reserve',
    goalId: 'travel',
    date: '2026-11-03',
    amount: 3000,
  });
  const p = investmentPosition(migrateData(d), d.investments[0], '2026-11-30');
  assert.deepEqual(
    [p.applied, p.withdrawn, p.yields, p.fees, p.taxes, p.book, p.current, p.unrealized],
    [10000, 3000, 1000, 100, 200, 7700, 12000, 4300],
  );
  assert.equal(reserveBalances(d, scope).get('travel'), 3000);
  assert.equal(calculateWorkspace(d, '2026-11', scope, d.months['2026-11']).redemptions, 0);
  const invalid = structuredClone(d);
  invalid.investmentMovements.at(-1).amount = 16000;
  assert.throws(() => migrateData(invalid), /Saldo do investimento/);
  const duplicate = structuredClone(d);
  duplicate.investmentValuations.push({ ...duplicate.investmentValuations[0], id: 'v2' });
  assert.throws(() => migrateData(duplicate), /avaliação/);
});
test('savings strategy conserves positive cents and caps fixed programs without creating contributions or using redemptions', () => {
  const s = strategy();
  s.distribution[0].fixedAmount = 50000;
  const tiny = savingsSuggestions(s, 100000, -1000);
  assert.equal(tiny.target, 53800);
  assert.equal(totalSuggestions(tiny), 0);
  const limited = savingsSuggestions(s, 100000, 123);
  assert.equal(totalSuggestions(limited), 123);
  assert.equal(limited.rows[0].suggested, 123);
  const result = savingsSuggestions(strategy(), 100000, 101, [{ amount: 12, destinationId: 'd0' }]);
  assert.equal(totalSuggestions(result), 101);
  assert.equal(result.rows[0].actual, 12);
  const invalid = strategy();
  invalid.distribution[0].percent = 64;
  assert.throws(() => savingsSuggestions(invalid, 100000, 50000), /100%/);
  const d = fixture();
  d.plans[scope + '|2026-11'] = { savingTarget: 10000, savingsStrategy: s };
  d.reserveMovements = [
    { id: 'o', scope, kind: 'opening', date: '2026-10-01', amount: 50000 },
    { id: 'w', scope, kind: 'withdrawal', date: '2026-11-01', amount: 50000 },
  ];
  const st = calculateWorkspace(migrateData(d), '2026-11', scope, d.months['2026-11']);
  assert.equal(st.savingTarget, 53800);
  assert.equal(st.income, 100000);
  assert.equal(st.available, 150000);
  assert.equal(d.contributions.length, 0);
});
const totalSuggestions = (r) => r.rows.reduce((s, v) => s + v.suggested, 0);
test('manual realized gain on full redemption clears the position without duplicating valuation or income', () => {
  const d = fixture();
  d.investments = [{ id: 'a', scope, name: 'Ativo', type: 'Ações', institution: 'Banco' }];
  d.investmentMovements = [
    {
      id: 'a1',
      scope,
      investmentId: 'a',
      kind: 'application',
      funding: 'cash',
      date: '2026-11-01',
      amount: 10000,
    },
    {
      id: 'r',
      scope,
      investmentId: 'a',
      kind: 'redemption',
      funding: 'cash',
      date: '2026-11-03',
      amount: 15000,
      realizedGain: 5000,
    },
  ];
  d.investmentValuations = [
    { id: 'v', scope, investmentId: 'a', date: '2026-11-02', amount: 15000 },
  ];
  const p = investmentPosition(migrateData(d), d.investments[0]);
  assert.equal(p.current, 0);
  assert.equal(p.book, 0);
  assert.equal(p.realizedGains, 5000);
  assert.equal(p.unrealized, 0);
  const stats = calculateWorkspace(d, '2026-11', scope, d.months['2026-11']);
  assert.equal(stats.income, 100000);
  assert.equal(stats.available, 105000);
});
test('personal future commitments include shared portions exactly once and flag unknown proportional income', () => {
  const d = fixture();
  d.people.push({ id: 'b', name: 'Bia' });
  d.groups = [{ id: 'g', name: 'Grupo', memberIds: ['person-0', 'b'] }];
  d.expenses = [
    expense({ fixed: true, installments: { total: 3, current: 1 } }),
    expense({
      id: 'g1',
      workspace: 'group:g',
      participants: ['person-0', 'b'],
      fixed: true,
      installments: { total: 2, current: 1 },
    }),
  ];
  const rows = installmentCommitments(d, scope, '2026-11');
  assert.equal(rows.length, 3);
  assert.equal(
    rows.reduce((s, e) => s + e.amount, 0),
    25000,
  );
  d.expenses[1].split = 'proportional';
  assert.ok(installmentCommitments(d, scope, '2026-11').some((e) => e.projectionError));
});
test('optional collections migrate old v3, retain backups and cloud order, and reject malformed new data without touching originals', () => {
  const original = fixture();
  for (const kind of extensionArrays) delete original[kind];
  const raw = JSON.stringify(original),
    migrated = migrateData(original);
  assert.equal(JSON.stringify(original), raw);
  for (const kind of extensionArrays) assert.deepEqual(migrated[kind], []);
  assert.equal(
    calculateWorkspace(migrated, '2026-11', scope, original.months['2026-11']).available,
    100000,
  );
  const memory = new Map(),
    storage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
  saveFinanceData(migrated, storage);
  assert.deepEqual(loadFinanceData(storage).data, migrated);
  assert.deepEqual(JSON.parse(exportFinanceData(migrated)), migrated);
  assert.deepEqual(roundTrip(migrated), migrated);
  const invalid = structuredClone(migrated);
  invalid.investments = [
    { id: 'bad', scope: 'person:foreign', name: 'Bad', type: 'Tipo', institution: 'X' },
  ];
  assert.throws(() => saveFinanceData(invalid, storage));
  assert.deepEqual(loadFinanceData(storage).data, migrated);
});
test('shared optional records remain scoped, hide private receipts and profile, and prohibit cross-scope edits/deletion', () => {
  const d = fixture(),
    gs = 'group:home';
  d.people.push({ id: 'b', name: 'Bia' });
  d.groups = [
    { id: 'home', name: 'Casa', memberIds: ['person-0', 'b'], adminPersonId: 'person-0' },
  ];
  d.cards = [
    { id: 'card', scope: gs, name: 'Grupo', closingDay: 10, dueDay: 20 },
    { id: 'private', scope, name: 'Privado', closingDay: 10, dueDay: 20 },
  ];
  d.events = [{ id: 'ev', scope: gs, name: 'Viagem' }];
  d.incomeEntries = [
    {
      id: 'private',
      scope,
      description: 'Confidencial',
      category: 'Salário',
      amount: 50000,
      date: '2026-11-01',
      includedInProfile: false,
    },
  ];
  d.expenses = [
    expense({
      workspace: gs,
      essential: true,
      companion: 'Amigos',
      eventId: 'ev',
      participants: ['person-0', 'b'],
    }),
  ];
  const projection = projectSharedGroup(migrateData(d), 'home');
  assert.equal(projection.cards.length, 1);
  assert.equal(projection.incomeEntries, undefined);
  assert.equal(projection.overview['2026-11'].stats.income, undefined);
  assert.equal(projection.expenses[0].companion, 'Amigos');
  const shared = sharedGroupData(projection),
    next = {
      ...shared,
      reserveMovements: [
        { id: 'new', scope: gs, kind: 'opening', amount: 1000, date: '2026-11-01' },
      ],
    };
  const saved = applySharedGroupChanges(d, 'home', sharedGroupChanges(shared, next));
  assert.equal(saved.reserveMovements[0].amount, 1000);
  assert.deepEqual(saved.incomeEntries, d.incomeEntries);
  assert.throws(
    () =>
      applySharedGroupChanges(d, 'home', [
        { kind: 'cards', id: 'private', value: { name: 'Roubo' } },
      ]),
    /outro espaço/,
  );
  assert.throws(() =>
    applySharedGroupChanges(d, 'home', [
      { kind: 'incomeEntries', id: 'private', value: { amount: 1 } },
    ]),
  );
  assert.throws(() => sharedGroupChanges(next, shared), /administrador/);
});
test('custom receipt and investment category catalogs persist and stay isolated by workspace', () => {
  let d = fixture();
  d = addExtraCategory(d, scope, 'incomeCategories', 'Freelas');
  d = addExtraCategory(d, scope, 'investmentTypes', 'Tesouro');
  assert.ok(extraCategoryOptions(roundTrip(d), scope, 'incomeCategories').includes('Freelas'));
  assert.ok(extraCategoryOptions(d, scope, 'investmentTypes').includes('Tesouro'));
  assert.throws(() => addExtraCategory(d, scope, 'incomeCategories', ' freelas '));
  assert.throws(() => addExtraCategory(d, scope, 'investmentTypes', ' '));
});

test('shared nested strategy and invoice metadata expose only their explicit public fields', () => {
  const d = fixture(),
    gs = 'group:g';
  d.groups = [{ id: 'g', name: 'Grupo', memberIds: ['person-0'] }];
  const s = strategy();
  s.privateProfile = 'private-salary';
  s.distribution[0].privateProfile = 'private-salary';
  d.plans[gs + '|2026-11'] = { savingsStrategy: s, savingsStrategyHistory: [s] };
  d.cards = [{ id: 'card', scope: gs, name: 'Cartão', closingDay: 10, dueDay: 20 }];
  d.expenses = [
    expense({
      workspace: gs,
      cardId: 'card',
      purchaseDate: '2026-11-01',
      invoiceMonth: '2026-11',
      cardTerms: { id: 'card', closingDay: 10, dueDay: 20, privateProfile: 'private-salary' },
    }),
  ];
  const projection = projectSharedGroup(migrateData(d), 'g');
  assert.ok(!JSON.stringify(projection).includes('private-salary'));
  assert.equal(d.plans[gs + '|2026-11'].savingsStrategy.privateProfile, 'private-salary');
});
test('existing archived-group purge remains usable with new dependent records in bounded batches', () => {
  let d = fixture();
  const gs = 'group:g';
  d.groups = [{ id: 'g', name: 'Grupo', memberIds: ['person-0'], deleted: true }];
  d.goals.push({ id: 'gg', scope: gs, title: 'Grupo', target: 10000 });
  d.cards = [{ id: 'gc', scope: gs, name: 'Cartão', closingDay: 10, dueDay: 20 }];
  d.reserveMovements = [
    { id: 'o', scope: gs, kind: 'opening', amount: 10000, date: '2026-11-01', goalId: 'gg' },
  ];
  d.investments = [
    { id: 'ia', scope: gs, name: 'Ativo', type: 'Tipo', institution: 'Banco', goalId: 'gg' },
  ];
  d.investmentMovements = [
    {
      id: 'im',
      scope: gs,
      investmentId: 'ia',
      kind: 'application',
      funding: 'reserve',
      amount: 5000,
      date: '2026-11-01',
      goalId: 'gg',
    },
  ];
  while (d.groups.length) d = migrateData(purgeGroupHistoryBatch(d, 'g', 1));
  assert.equal(d.reserveMovements.length, 0);
  assert.equal(d.investments.length, 0);
  assert.equal(d.goals.length, 1);
  assert.equal(d.people.length, 1);
});
