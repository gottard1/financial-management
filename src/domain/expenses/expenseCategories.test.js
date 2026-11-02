import test from 'node:test';
import assert from 'node:assert/strict';
import { addExpenseCategory, categoryOptions } from './expenseCategories.js';
import { migrateData } from '../budget/workspaceCalculations.js';
import { encodeFinance, decodeFinance, financeJson } from '../budget/financeCloudCodec.js';
import { projectSharedGroup } from '../groups/groupSharing.js';
import { sharedGroupData, applySharedGroupChanges } from '../groups/sharedGroupEditing.js';
import { CATEGORIES } from '../../shared/constants/categories.js';

function fixture() {
  return {
    ...migrateData(null),
    people: [
      { id: 'person-0', name: 'Maria' },
      { id: 'joao', name: 'João' },
    ],
    groups: [
      { id: 'home', name: 'Casa', adminPersonId: 'person-0', memberIds: ['person-0', 'joao'] },
      { id: 'trip', name: 'Viagem', adminPersonId: 'person-0', memberIds: ['person-0'] },
    ],
  };
}

test('categories are scoped, immutable additions that leave financial history unchanged', () => {
  const data = fixture();
  const before = financeJson(data);
  const personal = addExpenseCategory(data, 'person:person-0', '  Cuidados   pessoais  ');
  const next = addExpenseCategory(personal, 'group:home', 'Animais de estimação');
  assert.ok(categoryOptions(next, 'person:person-0').includes('Cuidados pessoais'));
  assert.ok(!categoryOptions(next, 'person:joao').includes('Cuidados pessoais'));
  assert.ok(!categoryOptions(next, 'group:home').includes('Cuidados pessoais'));
  assert.ok(categoryOptions(next, 'group:home').includes('Animais de estimação'));
  assert.ok(!categoryOptions(next, 'group:trip').includes('Animais de estimação'));
  assert.equal(next.groups[1], data.groups[1]);
  for (const key of ['expenses', 'settlements', 'months', 'incomeConfigs', 'plans'])
    assert.equal(next[key], data[key]);
  assert.equal(financeJson(data), before);
});

test('duplicate category names are rejected regardless of case, spacing and Unicode width', () => {
  const data = addExpenseCategory(fixture(), 'group:home', 'Meus animais');
  for (const name of ['moradia', 'Ｍoradia', 'MEUS ANIMAIS', '  meus   animais  '])
    assert.throws(() => addExpenseCategory(data, 'group:home', name), /Já existe uma categoria/);
  assert.doesNotThrow(() => addExpenseCategory(data, 'group:trip', 'Meus animais'));
});

test('invalid names and inactive or nonexistent scopes cannot receive categories', () => {
  const data = fixture();
  for (const name of ['', ' ', null, {}, 'a'.repeat(61), 'Animal\u0000'])
    assert.throws(() => addExpenseCategory(data, 'person:person-0', name), /nome de até 60/);
  for (const scope of ['group:missing', 'person:missing', 'invalid'])
    assert.throws(() => addExpenseCategory(data, scope, 'Nova'), /espaço financeiro ativo/);
  data.groups[0].deleted = true;
  data.people[1].removed = true;
  assert.throws(() => addExpenseCategory(data, 'group:home', 'Nova'), /espaço financeiro ativo/);
  assert.throws(() => addExpenseCategory(data, 'person:joao', 'Nova'), /espaço financeiro ativo/);
});

test('historical expenses and budgets keep categories available across months without leaking scopes', () => {
  const data = fixture();
  data.expenses = [
    { workspace: 'group:home', category: 'Condomínio antigo' },
    { workspace: 'person:person-0', category: 'Privada' },
  ];
  data.plans = {
    'group:home|2026-01': { categories: { 'Reparos antigos': 15000 } },
    'group:trip|2026-02': { categories: { Hospedagem: 30000 } },
  };
  const choices = categoryOptions(data, 'group:home', ['Categoria em edição']);
  for (const name of [...CATEGORIES, 'Condomínio antigo', 'Reparos antigos', 'Categoria em edição'])
    assert.ok(choices.includes(name));
  for (const name of ['Privada', 'Hospedagem']) assert.ok(!choices.includes(name));
  assert.throws(() => addExpenseCategory(data, 'group:home', 'reparos antigos'), /Já existe/);
});

test('custom categories survive cloud serialization and only group categories reach participants', () => {
  let data = addExpenseCategory(fixture(), 'person:person-0', 'Tratamento particular');
  data = addExpenseCategory(data, 'group:home', 'Animais');
  const encoded = encodeFinance(data);
  const decoded = decodeFinance([
    {
      id: 'state',
      schemaVersion: 2,
      revision: 1,
      recordCount: encoded.records.length,
      orders: encoded.orders,
    },
    ...encoded.records.map((record) => ({ ...record, revision: 1 })),
  ]).data;
  assert.deepEqual(decoded, migrateData(data));
  const snapshot = projectSharedGroup(decoded, 'home');
  assert.deepEqual(snapshot.categories, ['Animais']);
  assert.ok(!JSON.stringify(snapshot).includes('Tratamento particular'));
  assert.ok(categoryOptions(sharedGroupData(snapshot), 'group:home').includes('Animais'));
  assert.deepEqual(
    categoryOptions(sharedGroupData({ ...snapshot, categories: undefined }), 'group:home'),
    CATEGORIES,
  );
  assert.throws(
    () =>
      applySharedGroupChanges(data, 'home', [
        { kind: 'groups', id: 'home', value: { categories: ['Outra'] } },
      ]),
    /Alteração não permitida/,
  );
});

test('backup validation protects category catalogs while older backups remain compatible', () => {
  assert.doesNotThrow(() => migrateData(fixture()));
  for (const categories of [null, {}, [''], ['a'.repeat(61)], ['Pets', 'pets'], ['Moradia']]) {
    const data = fixture();
    data.people[0].categories = categories;
    assert.throws(() => migrateData(data));
    delete data.people[0].categories;
    data.groups[0].categories = categories;
    assert.throws(() => migrateData(data));
  }
});
