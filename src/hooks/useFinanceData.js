import { useEffect, useState, useRef } from 'react';
import { createNamespacedStorage } from '../infrastructure/storage/namespacedStorage.js';
import { createFinanceSync } from '../infrastructure/storage/financeSync.js';
import { auth } from '../infrastructure/firebase/client.js';
import {
  loadFinanceData,
  saveFinanceData,
  exportFinanceData,
} from '../infrastructure/storage/localFinanceRepository.js';

const SYNC_KEY = 'financial-management-cloud-sync-v1';

/** Local writes remain durable while private cloud revisions are synchronized. */
export function useFinanceData(namespace = 'local') {
  const [storage] = useState(() => createNamespacedStorage(namespace));
  const [loaded] = useState(() => loadFinanceData(storage));
  const [data, publishData] = useState(() => loaded.data);
  const currentData = useRef(loaded.data);
  const [saveError, setSaveError] = useState('');
  const cloudEnabled =
    namespace !== 'local' &&
    auth?.currentUser?.uid === namespace &&
    import.meta.env.VITE_FINANCE_CLOUD_ENABLED !== 'false';
  const [syncStatus, setSyncStatus] = useState(
    cloudEnabled && !loaded.blocked ? 'loading' : 'local',
  );
  const [syncError, setSyncError] = useState('');
  const sync = useRef(null);
  const reconnect = useRef(null);

  useEffect(() => {
    if (!cloudEnabled || loaded.blocked) return undefined;
    let stopped = false;
    let unsubscribe;
    let engine;
    const timer = setTimeout(() => {
      if (!stopped) setSyncStatus((current) => (current === 'loading' ? 'offline' : current));
    }, 8000);
    let marker = null;
    try {
      const raw = JSON.parse(storage.getItem(SYNC_KEY));
      if (
        raw &&
        typeof raw.dirty === 'boolean' &&
        (raw.baseRevision === null ||
          (Number.isSafeInteger(raw.baseRevision) && raw.baseRevision > 0))
      )
        marker = raw;
    } catch {
      /* Unrecognized sync metadata never permits overwriting a cloud revision. */
    }
    import('../infrastructure/firebase/financeCloudRepository.js')
      .then((repository) => {
        if (stopped) return;
        const account = repository.createAccountFinanceStore(namespace);
        engine = createFinanceSync({
          initialData: currentData.current,
          marker,
          saveLocal: (next) => saveFinanceData(next, storage),
          saveMarker: (next) => storage.setItem(SYNC_KEY, JSON.stringify(next)),
          archiveLocal: (next) =>
            storage.setItem(`financial-management-conflict-${Date.now()}`, exportFinanceData(next)),
          saveRemote: (next, revision) => account.save(next, revision),
          onData: (next) => {
            currentData.current = next;
            publishData(next);
          },
          onStatus: setSyncStatus,
          onError: (error) =>
            setSyncError(
              error
                ? error.code && error.code !== 'finance/conflict'
                  ? 'Não foi possível salvar na nuvem. Seus dados continuam neste navegador. Confira a conexão e as regras do Firestore.'
                  : error.message
                : '',
            ),
        });
        sync.current = engine;
        reconnect.current = () => {
          unsubscribe?.();
          unsubscribe = account.watch(engine.receive, engine.fail);
        };
        reconnect.current();
      })
      .catch((error) => {
        if (!stopped) {
          setSyncError(error.message);
          setSyncStatus('offline');
        }
      });
    return () => {
      stopped = true;
      clearTimeout(timer);
      unsubscribe?.();
      engine?.stop();
      sync.current = null;
      reconnect.current = null;
    };
  }, [cloudEnabled, namespace, storage, loaded]);

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
      if (cloudEnabled) {
        if (!sync.current)
          throw new Error('A sincronização ainda está iniciando. Aguarde e tente novamente.');
        sync.current.update(next);
        setSaveError('');
        return;
      }
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

  return {
    data,
    setData,
    error: loaded.error || saveError,
    blocked: loaded.blocked || syncStatus === 'conflict',
    exportJson,
    cloudEnabled,
    syncStatus,
    syncError,
    retrySync: () => {
      if (!reconnect.current) {
        window.location.reload();
        return;
      }
      reconnect.current?.();
      sync.current?.flush();
    },
    useCloudVersion: () => sync.current?.useCloud(),
    commitData: async (update) => {
      if (loaded.blocked)
        throw new Error(
          'Os dados originais estão protegidos. Exporte o backup antes de continuar.',
        );
      if (cloudEnabled) {
        if (!sync.current) throw new Error('Aguarde a conexão com a nuvem antes de apagar dados.');
        return sync.current.commit(update);
      }
      setData(update);
      return currentData.current;
    },
  };
}
