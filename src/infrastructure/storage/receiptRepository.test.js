import test from 'node:test';
import assert from 'node:assert/strict';
import { createReceiptRepository, validateReceiptFile } from './receiptRepository.js';
import { MAX_RECEIPT_BYTES } from '../../domain/settlements/settlementCalculations.js';

function memoryIndexedDB() {
  const databases = new Map();
  const names = [];
  return {
    names,
    open(name) {
      names.push(name);
      const request = {};
      queueMicrotask(() => {
        const fresh = !databases.has(name);
        if (fresh) databases.set(name, new Map());
        const records = databases.get(name);
        request.result = {
          objectStoreNames: { contains: () => !fresh },
          createObjectStore() {},
          close() {},
          transaction() {
            const tx = {};
            tx.objectStore = () => {
              const action = (operation) => {
                const req = {};
                queueMicrotask(() => {
                  req.result = operation();
                  req.onsuccess?.();
                  queueMicrotask(() => tx.oncomplete?.());
                });
                return req;
              };
              return {
                add: (record) => action(() => records.set(record.id, record)),
                get: (id) => action(() => records.get(id)),
                delete: (id) => action(() => records.delete(id)),
              };
            };
            return tx;
          },
        };
        if (fresh) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };
}

test('validates permitted receipt formats, matching extensions and the exact 5 MiB boundary', () => {
  for (const [name, type] of [
    ['receipt.JPG', 'image/jpeg'],
    ['receipt.jpeg', 'image/jpeg'],
    ['receipt.png', 'image/png'],
    ['receipt.webp', 'image/webp'],
    ['receipt.pdf', 'application/pdf'],
  ]) {
    assert.deepEqual(validateReceiptFile({ name, type, size: MAX_RECEIPT_BYTES }), {
      name,
      type,
      size: MAX_RECEIPT_BYTES,
    });
  }
  for (const size of [0, -1, 0.5, NaN, MAX_RECEIPT_BYTES + 1, '100'])
    assert.throws(() =>
      validateReceiptFile({ name: 'receipt.pdf', type: 'application/pdf', size }),
    );
  for (const file of [
    null,
    {},
    { name: ' ', type: 'image/png', size: 1 },
    { name: 'test.svg', type: 'image/svg+xml', size: 1 },
    { name: 'test.png', type: 'application/pdf', size: 1 },
  ])
    assert.throws(() => validateReceiptFile(file));
});

test('saves real file bytes and metadata, isolating namespaces without uploads', async () => {
  const factory = memoryIndexedDB();
  const repository = createReceiptRepository(factory);
  const file = new File(['receipt bytes'], 'receipt.pdf', { type: 'application/pdf' });
  const metadata = await repository.saveReceipt(file, 'user-one');
  assert.equal(metadata.name, file.name);
  assert.equal(metadata.type, file.type);
  assert.equal(metadata.size, file.size);
  assert.ok(metadata.id);
  const blob = await repository.getReceipt(metadata.id, 'user-one');
  assert.equal(await blob.text(), 'receipt bytes');
  await assert.rejects(repository.getReceipt(metadata.id, 'user-two'), /indisponível/);
  assert.ok(factory.names.includes('financial-management-receipts:user-one'));
  assert.ok(factory.names.includes('financial-management-receipts:user-two'));
});

test('rollback removes only the selected attachment and preserves other records and namespaces', async () => {
  const repository = createReceiptRepository(memoryIndexedDB());
  const file = new File(['x'], 'receipt.png', { type: 'image/png' });
  const first = await repository.saveReceipt(file, 'local');
  const second = await repository.saveReceipt(file, 'local');
  const user = await repository.saveReceipt(file, 'user');
  await repository.removeReceipt(first.id, 'local');
  await assert.rejects(repository.getReceipt(first.id, 'local'), /indisponível/);
  assert.equal((await repository.getReceipt(second.id, 'local')).size, 1);
  assert.equal((await repository.getReceipt(user.id, 'user')).size, 1);
});

test('missing IndexedDB, invalid identifiers and fake files produce actionable failures', async () => {
  const unavailable = createReceiptRepository(null);
  const file = new File(['x'], 'receipt.pdf', { type: 'application/pdf' });
  await assert.rejects(unavailable.saveReceipt(file), /não disponibiliza/);
  await assert.rejects(unavailable.getReceipt('id'), /não disponibiliza/);
  await assert.rejects(unavailable.getReceipt(''), /Identificador/);
  await assert.rejects(unavailable.removeReceipt(''), /Identificador/);
  await assert.rejects(
    unavailable.saveReceipt({ name: 'receipt.pdf', type: 'application/pdf', size: 1 }),
    /não contém dados/,
  );
  const repository = createReceiptRepository(memoryIndexedDB());
  await assert.rejects(repository.saveReceipt(file, ''), /Identificação/);
});

test('a closed database transaction fails explicitly and the database is closed after failure', async () => {
  let closed = false;
  const repository = createReceiptRepository({
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          transaction() {
            throw new Error('Connection closed.');
          },
          close() {
            closed = true;
          },
        };
        request.onsuccess();
      });
      return request;
    },
  });
  await assert.rejects(repository.getReceipt('id'), /Connection closed/);
  assert.equal(closed, true);
});

test('opening errors and blocked storage are not silently ignored', async () => {
  const broken = createReceiptRepository({
    open() {
      throw new Error('Storage disabled.');
    },
  });
  await assert.rejects(broken.getReceipt('id'), /Storage disabled/);
  const blocked = createReceiptRepository({
    open() {
      const request = {};
      queueMicrotask(() => request.onblocked());
      return request;
    },
  });
  await assert.rejects(blocked.getReceipt('id'), /bloqueado/);
});

test('transaction abort preserves the operation failure and closes the database', async () => {
  let closed = false;
  const repository = createReceiptRepository({
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          transaction() {
            const tx = { error: new Error('Quota exceeded.') };
            tx.objectStore = () => ({
              get() {
                queueMicrotask(() => tx.onabort());
                return {};
              },
            });
            return tx;
          },
          close() {
            closed = true;
          },
        };
        request.onsuccess();
      });
      return request;
    },
  });
  await assert.rejects(repository.getReceipt('id'), /Quota exceeded/);
  assert.equal(closed, true);
});
