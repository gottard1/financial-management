import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCompensation, sumRestrictedBenefits } from './calculateCompensation.js';
import {
  calculateWorkspace,
  defaultIncomeConfig,
  migrateData,
} from '../budget/workspaceCalculations.js';

function household() {
  const data = migrateData(null);
  data.people = [
    { id: 'person-0', name: 'Ana' },
    { id: 'person-1', name: 'Bruno' },
    { id: 'person-2', name: 'Carla' },
  ];
  data.groups = [{ id: 'home', name: 'Casa', memberIds: data.people.map((p) => p.id) }];
  const profiles = {
    'person-0': { ...defaultIncomeConfig(200000), cashBonus: 50000, foodAllowance: 70000 },
    'person-1': { ...defaultIncomeConfig(150000), mealAllowance: 90000 },
    'person-2': defaultIncomeConfig(100000),
  };
  data.incomeConfigs['2026-10'] = profiles;
  data.months['2026-10'] = Object.fromEntries(
    Object.entries(profiles).map(([id, profile]) => [id, calculateCompensation(profile).net]),
  );
  data.expenses.push({
    id: 'shared-rent',
    description: 'Aluguel',
    category: 'Moradia',
    workspace: 'group:home',
    date: '2026-10-05',
    amount: 100000,
    split: 'proportional',
    participants: data.people.map((p) => p.id),
    percentages: {},
    status: 'paid',
    payer: 'person-0',
  });
  return data;
}

test('cash additions affect three-person shares while VA/VR never inflate cash availability', () => {
  const data = household();
  const group = calculateWorkspace(data, '2026-10', 'group:home', data.months['2026-10']);
  const personal = calculateWorkspace(data, '2026-10', 'person:person-0', data.months['2026-10']);
  assert.equal(group.income, 500000);
  assert.deepEqual(group.shares, { 'person-0': 50000, 'person-1': 30000, 'person-2': 20000 });
  assert.equal(group.balances['person-0'], 50000);
  assert.equal(
    group.transfers.reduce((sum, item) => sum + item.amount, 0),
    50000,
  );
  assert.equal(personal.income, 250000);
  assert.equal(personal.available, 200000);
  assert.equal(sumRestrictedBenefits(Object.values(data.incomeConfigs['2026-10'])).total, 160000);
});

test('saving and reloading group income preserves additions without adding them twice', () => {
  const restored = migrateData(JSON.parse(JSON.stringify(household())));
  assert.deepEqual(restored.months['2026-10'], {
    'person-0': 250000,
    'person-1': 150000,
    'person-2': 100000,
  });
  for (const [id, profile] of Object.entries(restored.incomeConfigs['2026-10']))
    assert.equal(calculateCompensation(profile).net, restored.months['2026-10'][id]);
  assert.equal(
    calculateWorkspace(restored, '2026-10', 'person:person-0', restored.months['2026-10'])
      .available,
    200000,
  );
  assert.equal(restored.incomeConfigs['2026-10']['person-0'].cashBonus, 50000);
});

test('monthly benefits and group money responsibilities remain isolated after reloading', () => {
  const data = household();
  data.incomeConfigs['2026-11'] = {
    'person-0': { ...defaultIncomeConfig(200000), foodAllowance: 120000 },
  };
  data.months['2026-11'] = { 'person-0': 200000 };
  const restored = migrateData(data);
  assert.equal(sumRestrictedBenefits([restored.incomeConfigs['2026-10']['person-0']]).total, 70000);
  assert.equal(
    sumRestrictedBenefits(Object.values(restored.incomeConfigs['2026-11'])).total,
    120000,
  );
  assert.equal(
    calculateWorkspace(restored, '2026-10', 'group:home', restored.months['2026-10']).income,
    500000,
  );
  assert.equal(
    calculateWorkspace(restored, '2026-11', 'person:person-0', restored.months['2026-11']).income,
    200000,
  );
});
