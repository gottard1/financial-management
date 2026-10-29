import test from 'node:test';
import assert from 'node:assert/strict';
import { createNamespacedStorage } from './namespacedStorage.js';
import { loadFinanceData, saveFinanceData } from './localFinanceRepository.js';
function memory() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}
test('authenticated datasets never adopt local mode or another account records', () => {
  const storage = memory(),
    local = createNamespacedStorage('local', storage),
    alice = createNamespacedStorage('alice', storage),
    bob = createNamespacedStorage('bob', storage);
  const data = loadFinanceData(local).data;
  data.people[0].name = 'Local';
  saveFinanceData(data, local);
  assert.equal(loadFinanceData(alice).data.people[0].name, 'Você');
  const account = loadFinanceData(alice).data;
  account.people[0].name = 'Alice';
  saveFinanceData(account, alice);
  assert.equal(loadFinanceData(local).data.people[0].name, 'Local');
  assert.equal(loadFinanceData(bob).data.people[0].name, 'Você');
  assert.equal(loadFinanceData(alice).data.people[0].name, 'Alice');
});
test('namespace encoding separates IDs and surfaces unavailable storage', () => {
  const storage = memory();
  createNamespacedStorage('user:a', storage).setItem('data', 'one');
  assert.equal(createNamespacedStorage('user%3Aa', storage).getItem('data'), null);
  assert.throws(() => createNamespacedStorage(''));
  assert.throws(() => createNamespacedStorage('uid', null).getItem('data'));
});
