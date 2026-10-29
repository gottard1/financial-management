import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFinanceData, saveFinanceData, exportFinanceData } from './localFinanceRepository.js';
function mockStorage(entries = {}) {
  const items = new Map(Object.entries(entries)),
    writes = [];
  return {
    items,
    writes,
    getItem(key) {
      return items.get(key) ?? null;
    },
    setItem(key, value) {
      writes.push([key, value]);
      items.set(key, value);
    },
  };
}
const legacy = () => ({
  version: 1,
  names: ['Ana', 'Bia'],
  months: { '2026-10': [300000, 200000] },
  expenses: [],
});
const currentKey = 'financial-management-v3';

test('loads a new one-person v3 state without writing storage', () => {
  const storage = mockStorage(),
    loaded = loadFinanceData(storage);
  assert.equal(loaded.data.version, 3);
  assert.equal(loaded.data.people.length, 1);
  assert.equal(loaded.data.groups.length, 0);
  assert.equal(loaded.blocked, false);
  assert.equal(loaded.error, '');
  assert.equal(loaded.raw, null);
  assert.equal(storage.writes.length, 0);
});

test('migrates v1 and v2 on save to v3 while retaining byte-exact legacy originals', () => {
  for (const version of [1, 2]) {
    const original = JSON.stringify({ ...legacy(), version }),
      oldKey = 'contas-a-dois-v' + version,
      storage = mockStorage({ [oldKey]: original }),
      loaded = loadFinanceData(storage);
    assert.equal(loaded.data.version, 3);
    assert.deepEqual(loaded.data.months, { '2026-10': { 'person-0': 300000, 'person-1': 200000 } });
    assert.equal(storage.writes.length, 0);
    saveFinanceData(loaded.data, storage);
    assert.equal(storage.getItem(oldKey), original);
    assert.equal(JSON.parse(storage.getItem(currentKey)).version, 3);
  }
});

test('prefers v3 over v2/v1 and then v2 over v1 without merging records', () => {
  const v3 = loadFinanceData(mockStorage()).data;
  v3.people[0].name = 'Cris';
  const storage = mockStorage({
    'contas-a-dois-v1': JSON.stringify(legacy()),
    'contas-a-dois-v2': JSON.stringify({ ...legacy(), version: 2, names: ['Dani', 'Eva'] }),
    [currentKey]: JSON.stringify(v3),
  });
  assert.deepEqual(loadFinanceData(storage).data.people, [{ id: 'person-0', name: 'Cris' }]);
  storage.items.delete(currentKey);
  assert.equal(loadFinanceData(storage).data.people[0].name, 'Dani');
  assert.equal(storage.writes.length, 0);
});

test('invalid highest-priority JSON/schema remains protected and byte-exact exportable', () => {
  for (const raw of ['', '{bad json', JSON.stringify({ version: 3 })]) {
    const storage = mockStorage({
        [currentKey]: raw,
        'contas-a-dois-v2': JSON.stringify({ ...legacy(), version: 2 }),
        'contas-a-dois-v1': JSON.stringify(legacy()),
      }),
      loaded = loadFinanceData(storage);
    assert.equal(loaded.blocked, true);
    assert.match(loaded.error, /original/);
    assert.equal(loaded.raw, raw);
    assert.equal(exportFinanceData(loaded.raw), raw);
    assert.throws(() => saveFinanceData(loaded.data, storage), /protegidos/);
    assert.equal(storage.getItem(currentKey), raw);
    assert.equal(storage.writes.length, 0);
  }
});

test('invalid v2/v1 is protected instead of silently skipping to a lower-priority backup', () => {
  for (const key of ['contas-a-dois-v1', 'contas-a-dois-v2']) {
    const storage = mockStorage({ [key]: 'original inválido' }),
      loaded = loadFinanceData(storage);
    assert.equal(loaded.blocked, true);
    assert.equal(loaded.raw, 'original inválido');
    assert.throws(() => saveFinanceData(loaded.data, storage));
    assert.equal(storage.getItem(currentKey), null);
  }
});

test('storage access and quota errors surface without overwriting', () => {
  assert.equal(
    loadFinanceData({
      getItem() {
        throw new Error('denied');
      },
    }).blocked,
    true,
  );
  assert.equal(loadFinanceData(null).blocked, true);
  const storage = mockStorage();
  storage.setItem = () => {
    throw new Error('quota');
  };
  assert.throws(() => saveFinanceData(loadFinanceData(mockStorage()).data, storage), /quota/);
  assert.equal(storage.items.size, 0);
});

test('exports formatted valid v3 JSON and rejects invalid save state', () => {
  const loaded = loadFinanceData(mockStorage()),
    exported = exportFinanceData(loaded.data);
  assert.equal(JSON.parse(exported).version, 3);
  assert.match(exported, /\n  /);
  const storage = mockStorage();
  assert.throws(() => saveFinanceData({ version: 3 }, storage));
  assert.equal(storage.writes.length, 0);
});
