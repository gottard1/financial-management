import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateData, defaultIncomeConfig, calculateWorkspace } from './workspaceCalculations.js';
const p0 = 'person-0',
  p1 = 'person-1',
  p2 = 'person-2';
const incomes = { [p0]: 300000, [p1]: 200000, [p2]: 100000 };
const expense = (overrides = {}) => ({
  id: 'expense1',
  description: 'Conta',
  amount: 100000,
  date: '2026-10-10',
  category: 'Moradia',
  split: 'proportional',
  participants: [p0, p1],
  percentages: {},
  payer: p0,
  status: 'paid',
  workspace: 'group:group-a',
  ...overrides,
});
const data = (overrides = {}) => ({
  ...migrateData(null),
  people: [
    { id: p0, name: 'Ana' },
    { id: p1, name: 'Bia' },
    { id: p2, name: 'Cris' },
  ],
  groups: [{ id: 'group-a', name: 'Casa', memberIds: [p0, p1] }],
  ...overrides,
});
const legacyExpense = (overrides = {}) => ({
  id: 'legacy1',
  description: 'Aluguel',
  amount: 100000,
  date: '2026-10-10',
  category: 'Moradia',
  split: 'proportional',
  payer: 0,
  status: 'paid',
  workspace: 'couple',
  ...overrides,
});
const legacy = (overrides = {}) => ({
  version: 2,
  names: ['Ana', 'Bia'],
  months: { '2026-10': [300000, 200000] },
  expenses: [legacyExpense()],
  ...overrides,
});

test('starts v3 with one real individual and no artificial group', () => {
  const result = migrateData(null);
  assert.equal(result.version, 3);
  assert.deepEqual(result.people, [{ id: p0, name: 'Você' }]);
  assert.deepEqual(result.groups, []);
  assert.deepEqual(result.months, {});
  assert.deepEqual(defaultIncomeConfig(125000), {
    type: 'net',
    gross: 125000,
    dependents: 0,
    otherDeductions: 0,
    meiActivity: 'services',
    pjTaxPercent: 6,
    pjFixedCosts: 0,
    cashBonus: 0,
    otherCashIncome: 0,
    foodAllowance: 0,
    mealAllowance: 0,
  });
});

test('migrates v1/v2 names and historical amounts to stable person/group IDs without mutation', () => {
  for (const version of [1, 2]) {
    const original = legacy({ version, expenses: [legacyExpense({ workspace: undefined })] });
    const snapshot = structuredClone(original);
    const result = migrateData(original);
    assert.equal(result.version, 3);
    assert.deepEqual(result.people, [
      { id: p0, name: 'Ana' },
      { id: p1, name: 'Bia' },
    ]);
    assert.deepEqual(result.groups, [
      { id: 'group-legacy', name: 'Grupo compartilhado', memberIds: [p0, p1] },
    ]);
    assert.deepEqual(result.months, { '2026-10': { [p0]: 300000, [p1]: 200000 } });
    assert.equal(result.expenses[0].workspace, 'group:group-legacy');
    assert.equal(result.expenses[0].payer, p0);
    assert.deepEqual(result.expenses[0].participants, [p0, p1]);
    assert.deepEqual(original, snapshot);
    assert.deepEqual(migrateData(result), result);
  }
});

test('legacy single-person/custom splits and every persisted scope retain their meaning', () => {
  const model = legacy({
    expenses: [
      legacyExpense({ id: 'custom', split: 'custom', percent: 33.33 }),
      legacyExpense({ id: 'single', split: 'personal1' }),
      legacyExpense({ id: 'own', workspace: 'personal0', split: 'personal0' }),
    ],
    plans: {
      'personal0|2026-10': { spendingLimit: 50000 },
      'couple|2026-10': { savingTarget: 30000 },
    },
    goals: [{ id: 'trip', scope: 'couple', title: 'Viagem', target: 100000 }],
    contributions: [
      { id: 'a1', scope: 'couple', amount: 10000, date: '2026-10-29', goalId: 'trip' },
    ],
  });
  const result = migrateData(model);
  assert.deepEqual(result.expenses[0].percentages, { [p0]: 33.33, [p1]: 66.67 });
  assert.deepEqual(result.expenses[1].participants, [p1]);
  assert.equal(result.expenses[1].split, 'equal');
  assert.equal(result.expenses[2].workspace, 'person:' + p0);
  assert.deepEqual(result.expenses[2].participants, [p0]);
  assert.equal(result.plans['person:' + p0 + '|2026-10'].spendingLimit, 50000);
  assert.equal(result.plans['group:group-legacy|2026-10'].savingTarget, 30000);
  assert.equal(result.goals[0].scope, 'group:group-legacy');
  assert.equal(result.contributions[0].scope, 'group:group-legacy');
});

test('individual overview includes its own costs plus its shares across all groups once', () => {
  const model = data({
    groups: [
      { id: 'group-a', name: 'Casa', memberIds: [p0, p1] },
      { id: 'group-b', name: 'Amigos', memberIds: [p0, p1, p2] },
    ],
    expenses: [
      expense(),
      expense({
        id: 'second',
        workspace: 'group:group-b',
        amount: 90000,
        split: 'equal',
        participants: [p0, p1, p2],
      }),
      expense({
        id: 'own',
        workspace: 'person:' + p0,
        participants: [p0],
        split: 'equal',
        amount: 25000,
        status: 'pending',
      }),
      expense({
        id: 'other',
        workspace: 'person:' + p1,
        participants: [p1],
        payer: p1,
        split: 'equal',
        amount: 99000,
      }),
    ],
  });
  const result = calculateWorkspace(model, '2026-10', 'person:' + p0, incomes);
  assert.equal(result.total, 115000);
  assert.equal(result.paid, 90000);
  assert.equal(result.pending, 25000);
  assert.equal(result.expensePersonalTotal, 25000);
  assert.equal(result.sharedShareTotal, 90000);
  assert.deepEqual(result.shares, { [p0]: 115000 });
  assert.deepEqual(result.balances, {});
  assert.deepEqual(result.transfers, []);
  assert.equal(result.income, 300000);
  assert.equal(result.available, 185000);
  assert.deepEqual(result.categories, { Moradia: 115000 });
  assert.deepEqual(result.paidBy, { [p0]: 0 });
});

test('group overview isolates its own expenses and incomes while retaining settlement', () => {
  const model = data({
    groups: [...data().groups, { id: 'other', name: 'Outro', memberIds: [p0, p2] }],
    expenses: [
      expense(),
      expense({
        id: 'own',
        workspace: 'person:' + p0,
        participants: [p0],
        split: 'equal',
        amount: 500000,
      }),
      expense({ id: 'other', workspace: 'group:other', participants: [p0, p2], amount: 10000 }),
    ],
  });
  const result = calculateWorkspace(model, '2026-10', 'group:group-a', incomes);
  assert.equal(result.total, 100000);
  assert.deepEqual(result.shares, { [p0]: 60000, [p1]: 40000 });
  assert.deepEqual(result.paidBy, { [p0]: 100000, [p1]: 0 });
  assert.deepEqual(result.balances, { [p0]: 40000, [p1]: -40000 });
  assert.deepEqual(result.transfers, [{ from: p1, to: p0, amount: 40000 }]);
  assert.equal(result.income, 500000);
});

test('nonparticipant incurs no share even when belonging to the same group', () => {
  const model = data({ expenses: [expense({ participants: [p1], split: 'equal' })] });
  assert.equal(calculateWorkspace(model, '2026-10', 'person:' + p0, {}).total, 0);
  assert.equal(calculateWorkspace(model, '2026-10', 'person:' + p1, {}).total, 100000);
});

test('savings stay outside expenses and only current-month own contributions reduce available', () => {
  const model = data({
    expenses: [
      expense({ amount: 10000, workspace: 'person:' + p0, participants: [p0], split: 'equal' }),
    ],
    contributions: [
      { amount: 25000, date: '2026-10-12', scope: 'person:' + p0 },
      { amount: 40000, date: '2026-09-12', scope: 'person:' + p0 },
      { amount: 90000, date: '2026-10-12', scope: 'group:group-a' },
      { amount: 11000, date: '2026-10-12', scope: 'person:' + p1 },
    ],
  });
  const result = calculateWorkspace(model, '2026-10', 'person:' + p0, {
    [p0]: 100000,
    [p1]: 100000,
  });
  assert.equal(result.total, 10000);
  assert.equal(result.savingsThisMonth, 25000);
  assert.equal(result.savingsAll, 65000);
  assert.equal(result.available, 65000);
});

test('month and scope isolation preserves rounding, obligations and deficits', () => {
  const model = data({
    expenses: [
      expense({ date: '2026-09-01' }),
      expense({ id: 'odd', amount: 101, split: 'equal', status: 'pending' }),
    ],
  });
  const first = calculateWorkspace(model, '2026-10', 'person:' + p0, {}),
    second = calculateWorkspace(model, '2026-10', 'person:' + p1, {});
  assert.equal(first.total + second.total, 101);
  assert.ok([50, 51].includes(first.total));
  assert.equal(first.paid, 0);
  assert.equal(first.pending, first.total);
  assert.equal(first.available, -first.total);
  assert.equal(calculateWorkspace(model, '2026-11', 'group:group-a', {}).total, 0);
});

test('validates cents, dates, scope and aggregate overflow', () => {
  for (const contribution of [
    { amount: -1, date: '2026-10-01', scope: 'person:' + p0 },
    { amount: 0.1, date: '2026-10-01', scope: 'person:' + p0 },
    { amount: 1, date: '2026-10-01', scope: 'unknown' },
    { amount: 1, date: '2026-02-30', scope: 'person:' + p0 },
  ])
    assert.throws(() =>
      calculateWorkspace(data({ contributions: [contribution] }), '2026-10', 'person:' + p0, {}),
    );
  assert.throws(() => calculateWorkspace(data(), '2026-13', 'group:group-a', {}));
  assert.throws(() => calculateWorkspace(data(), '2026-10', 'unknown', {}));
  assert.throws(
    () =>
      calculateWorkspace(
        data({
          contributions: [
            { amount: Number.MAX_SAFE_INTEGER, date: '2026-10-01', scope: 'group:group-a' },
            { amount: 1, date: '2026-10-01', scope: 'group:group-a' },
          ],
        }),
        '2026-10',
        'group:group-a',
        {},
      ),
    /limite/,
  );
  assert.throws(() => migrateData({ version: 1 }), /Backup/);
});

test('validates goals, identifiers, deadlines and positive targets', () => {
  const goal = {
    id: 'trip',
    scope: 'person:' + p0,
    title: 'Viagem',
    target: 100000,
    targetDate: '2026-12-31',
  };
  assert.deepEqual(migrateData(data({ goals: [goal] })).goals, [goal]);
  for (const broken of [
    null,
    { ...goal, id: '' },
    { ...goal, scope: 'person:missing' },
    { ...goal, title: ' ' },
    { ...goal, target: 0 },
    { ...goal, target: -0.1 },
    { ...goal, targetDate: '2026-02-30' },
    { ...goal, targetDate: '2026-12' },
  ])
    assert.throws(() => migrateData(data({ goals: [broken] })));
  assert.throws(() => migrateData(data({ goals: [goal, goal] })), /duplicado/);
});

test('validates contributions and same-scope references to existing goals', () => {
  const goal = { id: 'trip', scope: 'person:' + p0, title: 'Viagem', target: 100000 },
    contribution = {
      id: 'a1',
      scope: 'person:' + p0,
      amount: 10000,
      date: '2026-10-29',
      goalId: 'trip',
    };
  assert.deepEqual(
    migrateData(data({ goals: [goal], contributions: [contribution] })).contributions,
    [contribution],
  );
  assert.doesNotThrow(() =>
    migrateData(data({ contributions: [{ ...contribution, goalId: '' }] })),
  );
  for (const broken of [
    null,
    { ...contribution, id: '' },
    { ...contribution, amount: 0 },
    { ...contribution, amount: 10.1 },
    { ...contribution, date: '2026-02-29' },
    { ...contribution, goalId: 'missing' },
    { ...contribution, scope: 'group:group-a' },
  ])
    assert.throws(() => migrateData(data({ goals: [goal], contributions: [broken] })));
  assert.throws(
    () => migrateData(data({ goals: [goal], contributions: [contribution, contribution] })),
    /duplicado/,
  );
});

test('validates per-person income/config maps and all numerical fields', () => {
  const configs = { [p0]: defaultIncomeConfig(300000), [p1]: defaultIncomeConfig(200000) };
  assert.doesNotThrow(() => migrateData(data({ incomeConfigs: { '2026-10': configs } })));
  for (const incomeConfigs of [
    [],
    'wrong',
    { '2026-13': configs },
    { '2026-10': [configs[p0], configs[p1]] },
    { '2026-10': { missing: configs[p0] } },
    { '2026-10': { [p0]: null } },
  ])
    assert.throws(() => migrateData(data({ incomeConfigs })));
  for (const bad of [
    { type: 'unknown' },
    { gross: -0.1 },
    { gross: null },
    { dependents: 1.1 },
    { dependents: 101 },
    { otherDeductions: -1 },
    { pjFixedCosts: '100' },
    { meiActivity: 'trucker' },
    { pjTaxPercent: 101 },
    { pjTaxPercent: NaN },
  ])
    assert.throws(() =>
      migrateData(data({ incomeConfigs: { '2026-10': { [p0]: { ...configs[p0], ...bad } } } })),
    );
  assert.throws(() => migrateData(data({ months: { '2026-10': { missing: 100 } } })));
  assert.throws(() => migrateData(data({ months: { '2026-10': { [p0]: 0.1 } } })));
});

test('validates monthly budget scope/month keys and category limits without altering them', () => {
  const plan = { spendingLimit: 300000, savingTarget: 50000, categories: { Mercado: 100000 } },
    key = 'person:' + p0 + '|2026-10';
  assert.deepEqual(migrateData(data({ plans: { [key]: plan } })).plans[key], plan);
  for (const plans of [
    [],
    'wrong',
    { [key]: null },
    { [key]: { ...plan, spendingLimit: -1 } },
    { [key]: { ...plan, savingTarget: 1.2 } },
    { [key]: { ...plan, categories: [] } },
    { [key]: { ...plan, categories: { Mercado: '100' } } },
    { 'person:missing|2026-10': plan },
    { ['person:' + p0 + '|2026-13']: plan },
  ])
    assert.throws(() => migrateData(data({ plans })));
});

test('fills optional income fields without mutating partial source configs', () => {
  const partial = { type: 'net', gross: 100000 },
    model = data({ incomeConfigs: { '2026-10': { [p0]: partial } } }),
    migrated = migrateData(model);
  assert.deepEqual(migrated.incomeConfigs['2026-10'][p0], defaultIncomeConfig(100000));
  assert.deepEqual(partial, { type: 'net', gross: 100000 });
  assert.deepEqual(migrateData(migrated), migrated);
  const old = migrateData(legacy({ incomeConfigs: { '2026-10': [partial, null] } }));
  assert.deepEqual(old.incomeConfigs['2026-10'], { [p0]: defaultIncomeConfig(100000) });
});

test('income additions and restricted benefits retain month/person cash separation', () => {
  const october = {
      ...defaultIncomeConfig(100000),
      cashBonus: 20000,
      otherCashIncome: 5000,
      foodAllowance: 50000,
      mealAllowance: 10000,
    },
    november = { ...defaultIncomeConfig(200000), foodAllowance: 70000 };
  const model = data({
    months: { '2026-10': { [p0]: 125000 }, '2026-11': { [p0]: 200000 } },
    incomeConfigs: { '2026-10': { [p0]: october }, '2026-11': { [p0]: november } },
  });
  const migrated = migrateData(model);
  assert.deepEqual(migrated.months, model.months);
  assert.deepEqual(migrated.incomeConfigs, model.incomeConfigs);
  assert.deepEqual(migrateData(migrated), migrated);
  for (const field of ['cashBonus', 'otherCashIncome', 'foodAllowance', 'mealAllowance'])
    for (const value of [-1, 0.1, '100', null, Number.MAX_SAFE_INTEGER + 1])
      assert.throws(() =>
        migrateData(
          data({ incomeConfigs: { '2026-10': { [p0]: { ...october, [field]: value } } } }),
        ),
      );
});

test('validates renderable expense fields, unique IDs, membership, participants and percentages', () => {
  const valid = expense();
  for (const broken of [
    { ...valid, description: {} },
    { ...valid, description: '' },
    { ...valid, description: ' ' },
    { ...valid, description: null },
    { ...valid, category: {} },
    { ...valid, category: null },
    { ...valid, category: '' },
    { ...valid, id: '' },
    { ...valid, id: 123 },
    { ...valid, id: undefined },
    { ...valid, payer: p2 },
    { ...valid, workspace: 'group:missing' },
    { ...valid, participants: [] },
    { ...valid, participants: [p0, p0] },
    { ...valid, participants: [p0, p2] },
    { ...valid, split: 'custom', percentages: { [p0]: 33.333, [p1]: 66.667 } },
    { ...valid, split: 'custom', percentages: { [p0]: 20, [p1]: 70 } },
    { ...valid, split: 'custom', percentages: { [p0]: 50, [p1]: 50, [p2]: 0 } },
  ])
    assert.throws(() => migrateData(data({ expenses: [broken] })));
  assert.throws(() => migrateData(data({ expenses: [valid, valid] })), /duplicado/);
  assert.equal(migrateData(data({ expenses: [valid] })).expenses[0].id, valid.id);
  assert.doesNotThrow(() =>
    migrateData(data({ expenses: [expense({ participants: [p1], payer: p0, split: 'equal' })] })),
  );
});

test('validates people/group identity and duplicate or missing group members', () => {
  for (const changes of [
    { people: [] },
    { people: [{ id: p0, name: ' ' }] },
    {
      people: [
        { id: p0, name: 'Ana' },
        { id: p0, name: 'Bia' },
      ],
    },
    { groups: [{ id: 'g', name: 'Grupo', memberIds: [] }] },
    { groups: [{ id: 'g', name: 'Grupo', memberIds: [p0, p0] }] },
    { groups: [{ id: 'g', name: 'Grupo', memberIds: ['missing'] }] },
    {
      groups: [
        { id: 'g', name: 'Grupo', memberIds: [p0] },
        { id: 'g', name: 'Outro', memberIds: [p1] },
      ],
    },
  ])
    assert.throws(() => migrateData(data(changes)));
});

test('supplies Outros only for absent legacy category and preserves expense ID', () => {
  const original = legacy({
    expenses: [legacyExpense({ category: undefined, workspace: undefined })],
  });
  const migrated = migrateData(original);
  assert.equal(migrated.expenses[0].category, 'Outros');
  assert.equal(migrated.expenses[0].workspace, 'group:group-legacy');
  assert.equal(migrated.expenses[0].id, original.expenses[0].id);
  assert.equal(original.expenses[0].category, undefined);
});

test('person ID maps preserve own prototype-shaped keys and default absent incomes to zero', () => {
  const people = [
    { id: '__proto__', name: 'Ana' },
    { id: 'constructor', name: 'Bia' },
  ];
  const ownIncomes = JSON.parse('{"__proto__":100000}');
  const ownConfigs = JSON.parse('{"__proto__":{"type":"net","gross":100000}}');
  const model = data({
    people,
    groups: [{ id: 'g', name: 'Grupo', memberIds: people.map((person) => person.id) }],
    months: { '2026-10': ownIncomes },
    incomeConfigs: { '2026-10': ownConfigs },
  });
  const migrated = migrateData(model);
  assert.equal(Object.hasOwn(migrated.months['2026-10'], '__proto__'), true);
  assert.equal(migrated.months['2026-10']['__proto__'], 100000);
  assert.equal(Object.hasOwn(migrated.incomeConfigs['2026-10'], '__proto__'), true);
  assert.equal(calculateWorkspace(migrated, '2026-10', 'group:g', ownIncomes).income, 100000);
  assert.equal(calculateWorkspace(migrated, '2026-10', 'person:constructor', ownIncomes).income, 0);
});

test('existing v3 and legacy records receive an empty settlements history without version change', () => {
  assert.deepEqual(migrateData(null).settlements, []);
  const existing = data();
  delete existing.settlements;
  assert.deepEqual(migrateData(existing).settlements, []);
  assert.equal(migrateData(existing).version, 3);
  assert.deepEqual(migrateData(legacy()).settlements, []);
});

test('group settlement totals isolate scope and competence, including payments made later', () => {
  const record = {
    id: 'settlement1',
    scope: 'group:group-a',
    from: p1,
    to: p0,
    amount: 15000,
    date: '2026-11-03',
    referenceMonth: '2026-10',
    note: '',
    status: 'confirmed',
  };
  const model = data({
    groups: [...data().groups, { id: 'other', name: 'Outro grupo', memberIds: [p0, p1] }],
    expenses: [expense()],
    settlements: [
      record,
      { ...record, id: 'other', scope: 'group:other', amount: 10000 },
      { ...record, id: 'previous', referenceMonth: '2026-09', amount: 10000 },
      { ...record, id: 'void', status: 'void', amount: 10000 },
    ],
  });
  const baseline = calculateWorkspace(
    data({ expenses: [expense()] }),
    '2026-10',
    'group:group-a',
    incomes,
  );
  const stats = calculateWorkspace(model, '2026-10', 'group:group-a', incomes);
  assert.deepEqual(stats.balances, { [p0]: 25000, [p1]: -25000 });
  assert.deepEqual(stats.transfers, [{ from: p1, to: p0, amount: 25000 }]);
  for (const field of ['income', 'total', 'paid', 'pending', 'shares', 'paidBy', 'available'])
    assert.deepEqual(stats[field], baseline[field]);
  assert.equal(calculateWorkspace(model, '2026-10', 'person:' + p1, incomes).available, 160000);
});

test('migration validates confirmed and void settlement history without invalidating past overpayment', () => {
  const record = {
    id: 's1',
    scope: 'group:group-a',
    from: p1,
    to: p0,
    amount: 90000,
    date: '2026-10-29',
    referenceMonth: '2026-10',
    note: 'Histórico após edição das contas',
    status: 'confirmed',
    receipt: { id: 'r1', name: 'Comprovante.png', type: 'image/png', size: 1000 },
  };
  const migrated = migrateData(data({ settlements: [record] }));
  assert.deepEqual(migrated.settlements, [record]);
  assert.notEqual(migrated.settlements[0], record);
  assert.notEqual(migrated.settlements[0].receipt, record.receipt);
  assert.doesNotThrow(() => migrateData(data({ settlements: [{ ...record, status: 'void' }] })));
  for (const broken of [
    null,
    { ...record, id: '' },
    { ...record, scope: 'person:' + p0 },
    { ...record, scope: 'group:missing' },
    { ...record, from: p2 },
    { ...record, to: p1 },
    { ...record, referenceMonth: '2026-13' },
    { ...record, date: '2026-02-30' },
    { ...record, amount: 0 },
    { ...record, receipt: { ...record.receipt, size: 5242881 } },
    { ...record, receipt: { ...record.receipt, type: 'text/html' } },
  ])
    assert.throws(() => migrateData(data({ settlements: [broken] })));
  assert.throws(() => migrateData(data({ settlements: [record, record] })), /duplicado/);
  assert.throws(() => migrateData(data({ settlements: {} })));
});
