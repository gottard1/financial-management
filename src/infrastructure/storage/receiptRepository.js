import {
  MAX_RECEIPT_BYTES,
  RECEIPT_TYPES,
} from '../../domain/settlements/settlementCalculations.js';

const STORE = 'receipts';
const FILE_EXTENSIONS = {
  'image/jpeg': /\.(?:jpg|jpeg)$/i,
  'image/png': /\.png$/i,
  'image/webp': /\.webp$/i,
  'application/pdf': /\.pdf$/i,
};

/** Metadata validation is pure; saving additionally requires a real Blob/File. */
export function validateReceiptFile(file) {
  if (!file || typeof file !== 'object' || typeof file.name !== 'string' || !file.name.trim())
    throw new Error('Selecione um comprovante válido.');
  if (!RECEIPT_TYPES.includes(file.type) || !FILE_EXTENSIONS[file.type].test(file.name))
    throw new Error(
      'O comprovante deve ser JPG, PNG, WEBP ou PDF, com extensão e tipo correspondentes.',
    );
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_RECEIPT_BYTES)
    throw new Error('O comprovante deve ter até 5 MB e não pode estar vazio.');
  return { name: file.name, type: file.type, size: file.size };
}

function namespaceName(namespace) {
  if (
    typeof namespace !== 'string' ||
    !namespace.trim() ||
    namespace.length > 200 ||
    namespace.includes('\0')
  )
    throw new Error('Identificação do armazenamento de comprovantes inválida.');
  return `financial-management-receipts:${namespace}`;
}

function storageError(error) {
  const detail = typeof error?.message === 'string' ? ` ${error.message}` : '';
  return new Error(`Não foi possível acessar os comprovantes neste navegador.${detail}`);
}

/** One isolated IndexedDB database per local/account namespace. No cloud operations. */
export function createReceiptRepository(indexedDBFactory = globalThis.indexedDB) {
  function open(namespace) {
    const name = namespaceName(namespace);
    if (!indexedDBFactory || typeof indexedDBFactory.open !== 'function')
      return Promise.reject(
        new Error('Este navegador não disponibiliza armazenamento de comprovantes.'),
      );
    return new Promise((resolve, reject) => {
      let request;
      let abandoned = false;
      try {
        request = indexedDBFactory.open(name, 1);
      } catch (error) {
        reject(storageError(error));
        return;
      }
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE))
          database.createObjectStore(STORE, { keyPath: 'id' });
      };
      request.onerror = () => reject(storageError(request.error));
      request.onblocked = () => {
        abandoned = true;
        reject(
          new Error(
            'O armazenamento dos comprovantes está bloqueado por outra aba. Feche-a e tente novamente.',
          ),
        );
      };
      request.onsuccess = () => {
        const database = request.result;
        if (abandoned) {
          database.close();
          return;
        }
        database.onversionchange = () => database.close();
        resolve(database);
      };
    });
  }

  async function transaction(namespace, mode, operation) {
    const database = await open(namespace);
    try {
      return await new Promise((resolve, reject) => {
        let value;
        let tx;
        try {
          tx = database.transaction(STORE, mode);
          const request = operation(tx.objectStore(STORE));
          request.onsuccess = () => {
            value = request.result;
          };
          request.onerror = () => reject(storageError(request.error));
          tx.oncomplete = () => resolve(value);
          tx.onerror = () => reject(storageError(tx.error));
          tx.onabort = () =>
            reject(storageError(tx.error || new Error('A gravação foi cancelada.')));
        } catch (error) {
          reject(storageError(error));
        }
      });
    } finally {
      database.close();
    }
  }

  return {
    async saveReceipt(file, namespace = 'local') {
      const metadata = validateReceiptFile(file);
      if (typeof Blob === 'undefined' || !(file instanceof Blob))
        throw new Error('O arquivo selecionado não contém dados válidos para armazenamento.');
      const id = globalThis.crypto.randomUUID();
      await transaction(namespace, 'readwrite', (store) => store.add({ id, blob: file }));
      return { id, ...metadata };
    },
    async getReceipt(id, namespace = 'local') {
      if (typeof id !== 'string' || !id.trim())
        throw new Error('Identificador do comprovante inválido.');
      const record = await transaction(namespace, 'readonly', (store) => store.get(id));
      if (!record?.blob || typeof Blob === 'undefined' || !(record.blob instanceof Blob))
        throw new Error(
          'Comprovante indisponível neste navegador. Backups JSON não contêm os arquivos.',
        );
      return record.blob;
    },
    /** Use only to roll back an attachment when its settlement record failed to save. */
    async removeReceipt(id, namespace = 'local') {
      if (typeof id !== 'string' || !id.trim())
        throw new Error('Identificador do comprovante inválido.');
      await transaction(namespace, 'readwrite', (store) => store.delete(id));
    },
  };
}

export const saveReceipt = (file, namespace = 'local') =>
  createReceiptRepository().saveReceipt(file, namespace);
export const getReceipt = (id, namespace = 'local') =>
  createReceiptRepository().getReceipt(id, namespace);
export const removeReceipt = (id, namespace = 'local') =>
  createReceiptRepository().removeReceipt(id, namespace);
