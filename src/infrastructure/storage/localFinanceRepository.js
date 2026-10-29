import { migrateData } from '../../domain/budget/workspaceCalculations.js';

const CURRENT_KEY = 'financial-management-v3';
const LEGACY_KEYS = ['contas-a-dois-v2', 'contas-a-dois-v1'];
const LOAD_ERROR =
  'Não foi possível ler os dados salvos. O arquivo original foi mantido no navegador. Exporte os dados originais antes de continuar.';

/** Read without writing: an invalid original must always remain recoverable. */
export function loadFinanceData(storage) {
  let raw = null;
  try {
    storage = storage === undefined ? globalThis.localStorage : storage;
    if (!storage || typeof storage.getItem !== 'function')
      throw new Error('Armazenamento local indisponível.');
    raw = storage.getItem(CURRENT_KEY);
    for (const key of LEGACY_KEYS) {
      if (raw !== null) break;
      raw = storage.getItem(key);
    }
    const data = migrateData(raw === null ? null : JSON.parse(raw));
    return { data, error: '', blocked: false, raw };
  } catch {
    return { data: migrateData(null), error: LOAD_ERROR, blocked: true, raw };
  }
}

/** Validate before writing, and never replace an unreadable existing backup. */
export function saveFinanceData(data, storage = globalThis.localStorage) {
  const validated = migrateData(data);
  if (loadFinanceData(storage).blocked)
    throw new Error(
      'Os dados originais estão protegidos porque não puderam ser lidos. Exporte o original antes de continuar.',
    );
  if (!storage || typeof storage.setItem !== 'function')
    throw new Error('Armazenamento local indisponível.');
  storage.setItem(CURRENT_KEY, JSON.stringify(validated));
}

/** Accept a validated state or the unmodified raw original of a blocked load. */
export function exportFinanceData(data) {
  if (typeof data === 'string') return data;
  return JSON.stringify(migrateData(data), null, 2);
}
