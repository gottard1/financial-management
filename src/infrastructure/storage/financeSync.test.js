import test from 'node:test';
import assert from 'node:assert/strict';
import { createFinanceSync } from './financeSync.js';
import { migrateData } from '../../domain/budget/workspaceCalculations.js';

const data = (name = 'Você') => ({ ...migrateData(null), people: [{ id: 'person-0', name }] });
function harness({ initialData = data(), marker, upload = async () => 1 } = {}) {
  const events = {
    writes: [],
    local: [],
    markers: [],
    archives: [],
    states: [],
    errors: [],
    published: [],
  };
  const engine = createFinanceSync({
    initialData,
    marker,
    saveLocal: (value) => events.local.push(value),
    saveMarker: (value) => events.markers.push(value),
    archiveLocal: (value) => events.archives.push(value),
    saveRemote: async (value, revision) => {
      events.writes.push({ value, revision });
      return upload(value, revision);
    },
    onData: (value) => events.published.push(value),
    onStatus: (value) => events.states.push(value),
    onError: (value) => events.errors.push(value),
  });
  return { engine, events };
}

test('migrates existing local data once when the server confirms a new account', async () => {
  const initialData = data('Ana');
  const { engine, events } = harness({ initialData });
  engine.receive(null);
  await engine.flush();
  assert.equal(events.writes.length, 1);
  assert.equal(events.writes[0].revision, null);
  assert.deepEqual(events.writes[0].value, initialData);
  assert.deepEqual(events.markers.at(-1), { baseRevision: 1, dirty: false });
  assert.equal(events.states.at(-1), 'saved');
  engine.stop();
});
test('a new device loads the cloud instead of uploading an empty local state', async () => {
  const { engine, events } = harness();
  engine.receive({ revision: 7, data: data('Na nuvem') });
  await engine.flush();
  assert.equal(events.published.at(-1).people[0].name, 'Na nuvem');
  assert.equal(events.writes.length, 0);
  assert.deepEqual(events.markers.at(-1), { baseRevision: 7, dirty: false });
  engine.stop();
});
test('conflicting pre-migration local data is preserved and archived before explicitly loading cloud', async () => {
  const initialData = data('Somente local');
  const { engine, events } = harness({ initialData });
  engine.receive({ revision: 2, data: data('Na nuvem') });
  await engine.flush();
  assert.equal(events.states.at(-1), 'conflict');
  assert.equal(events.writes.length, 0);
  assert.equal(events.local.length, 0);
  assert.throws(() => engine.update(data('Tentativa')));
  engine.useCloud();
  assert.deepEqual(events.archives, [initialData]);
  assert.equal(events.published.at(-1).people[0].name, 'Na nuvem');
  assert.equal(events.states.at(-1), 'saved');
  engine.stop();
});
test('offline changes stay durable and retry against the original revision', async () => {
  let offline = true;
  const { engine, events } = harness({
    marker: { baseRevision: 3, dirty: false },
    upload: async () => {
      if (offline) throw new Error('offline');
      return 4;
    },
  });
  engine.receive({ revision: 3, data: data() });
  engine.update(data('Alterado offline'));
  await engine.flush();
  assert.equal(events.states.at(-1), 'offline');
  assert.equal(events.local.at(-1).people[0].name, 'Alterado offline');
  assert.deepEqual(events.markers.at(-1), { baseRevision: 3, dirty: true });
  offline = false;
  await engine.flush();
  assert.deepEqual(
    events.writes.map((item) => item.revision),
    [3, 3],
  );
  assert.equal(events.states.at(-1), 'saved');
  engine.stop();
});
test('edits during an upload are queued and not replaced by the old upload echo', async () => {
  let finish;
  const { engine, events } = harness({
    marker: { baseRevision: 1, dirty: false },
    upload: async (_, revision) =>
      revision === 1
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : 3,
  });
  engine.receive({ revision: 1, data: data() });
  engine.update(data('Primeira'));
  const first = engine.flush();
  engine.update(data('Segunda'));
  engine.receive({ revision: 2, data: data('Primeira') });
  finish(2);
  await first;
  assert.equal(events.published.at(-1).people[0].name, 'Segunda');
  assert.deepEqual(events.markers.at(-1), { baseRevision: 2, dirty: true });
  await engine.flush();
  assert.equal(events.writes.length, 2);
  assert.equal(events.writes[1].revision, 2);
  assert.equal(events.writes[1].value.people[0].name, 'Segunda');
  assert.deepEqual(events.markers.at(-1), { baseRevision: 3, dirty: false });
  engine.stop();
});
test('a concurrent remote revision blocks overwrites of pending local edits', async () => {
  const { engine, events } = harness({ marker: { baseRevision: 1, dirty: false } });
  engine.receive({ revision: 1, data: data() });
  engine.update(data('Minha mudança'));
  engine.receive({ revision: 2, data: data('Outra sessão') });
  await engine.flush();
  assert.equal(events.states.at(-1), 'conflict');
  assert.equal(events.writes.length, 0);
  assert.equal(events.published.at(-1).people[0].name, 'Minha mudança');
  engine.stop();
});
test('reloading with pending metadata resumes the upload without losing the local version', async () => {
  const { engine, events } = harness({
    initialData: data('Pendente'),
    marker: { baseRevision: 4, dirty: true },
    upload: async () => 5,
  });
  engine.receive({ revision: 4, data: data('Antiga') });
  await engine.flush();
  assert.equal(events.writes[0].value.people[0].name, 'Pendente');
  assert.equal(events.writes[0].revision, 4);
  engine.stop();
});
test('stopped sessions never publish results into the next signed-in account', async () => {
  let finish;
  const { engine, events } = harness({
    upload: async () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  engine.receive(null);
  const saving = engine.flush();
  engine.stop();
  finish(1);
  await saving;
  assert.equal(events.published.length, 0);
  assert.ok(!events.states.includes('saved'));
});
