import { useEffect, useState, useRef } from 'react';
import { createNamespacedStorage } from '../infrastructure/storage/namespacedStorage.js';
import {
  loadFinanceData,
  saveFinanceData,
  exportFinanceData,
} from '../infrastructure/storage/localFinanceRepository.js';

/** React owns state; the repository owns local persistence and serialization. */
export function useFinanceData(namespace = 'local') {
  const [storage] = useState(() => createNamespacedStorage(namespace));
  const [loaded] = useState(() => loadFinanceData(storage));
  const [data, publishData] = useState(() => loaded.data);
  const currentData = useRef(loaded.data);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (loaded.blocked) return;
    try {
      saveFinanceData(loaded.data, storage);
      setSaveError('');
    } catch {
      setSaveError('Não foi possível salvar neste navegador. Exporte um backup antes de sair.');
    }
  }, [loaded, storage]);

  function setData(update) {
    try {
      if (loaded.blocked)
        throw new Error(
          'Os dados originais estão protegidos. Exporte o backup antes de continuar.',
        );
      const next = typeof update === 'function' ? update(currentData.current) : update;
      saveFinanceData(next, storage);
      currentData.current = next;
      publishData(next);
      setSaveError('');
    } catch (error) {
      setSaveError('Não foi possível salvar a alteração. ' + error.message);
      throw error;
    }
  }

  function exportJson() {
    if (loaded.blocked && loaded.raw !== null) return exportFinanceData(loaded.raw);
    return exportFinanceData(data);
  }

  return { data, setData, error: loaded.error || saveError, blocked: loaded.blocked, exportJson };
}
