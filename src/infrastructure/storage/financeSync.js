import { financeJson } from '../../domain/budget/financeCloudCodec.js';
import { migrateData } from '../../domain/budget/workspaceCalculations.js';

/** Serializes uploads, preserves offline changes, and refuses silent conflict replacement. */
export function createFinanceSync({
  initialData,
  marker,
  saveLocal,
  saveMarker,
  archiveLocal,
  saveRemote,
  onData,
  onStatus,
  onError,
}) {
  let data = initialData;
  let baseRevision = marker?.baseRevision ?? null;
  let dirty = marker?.dirty ?? financeJson(initialData) !== financeJson(migrateData(null));
  let ready = false,
    stopped = false,
    saving = false,
    sequence = 0,
    conflict = false;
  let latestRemote;
  let remoteSequence = 0;
  let timer;
  let retryDelay = 1000;
  let lastFailure;
  const idleWaiters = [];
  const persistMarker = () => saveMarker({ baseRevision, dirty });
  const status = (value) => {
    if (!stopped) onStatus(value, baseRevision);
  };
  function fail(error) {
    if (stopped) return;
    onError(error);
    status(conflict ? 'conflict' : 'offline');
  }
  function adopt(remote) {
    // Local first, then metadata: interruption can cause a conflict, never silent data loss.
    saveLocal(remote.data);
    data = remote.data;
    baseRevision = remote.revision;
    dirty = false;
    conflict = false;
    persistMarker();
    onData(data);
    onError(null);
    status('saved');
  }
  function receive(remote) {
    if (stopped) return;
    latestRemote = remote;
    remoteSequence += 1;
    if (saving) return;
    try {
      ready = true;
      if (remote && baseRevision !== null && remote.revision < baseRevision) return;
      if (!remote) {
        baseRevision = null;
        dirty = true;
        persistMarker();
        schedule();
      } else if (financeJson(remote.data) === financeJson(data)) {
        adopt(remote);
      } else if (dirty && baseRevision !== remote.revision) {
        conflict = true;
        persistMarker();
        status('conflict');
        onError(
          new Error(
            'Existem versões diferentes neste navegador e na nuvem. Exporte sua cópia local antes de carregar a versão da nuvem.',
          ),
        );
      } else if (dirty) schedule();
      else adopt(remote);
    } catch (error) {
      fail(error);
    }
  }
  async function flush() {
    clearTimeout(timer);
    if (stopped || saving || conflict || !ready || !dirty) return;
    saving = true;
    status('saving');
    const captured = sequence;
    const capturedRemote = remoteSequence;
    const snapshot = data;
    try {
      const revision = await saveRemote(snapshot, baseRevision);
      if (stopped) return;
      baseRevision = revision;
      dirty = captured !== sequence;
      persistMarker();
      onError(null);
      status(dirty ? 'pending' : 'saved');
      lastFailure = null;
      retryDelay = 1000;
    } catch (error) {
      lastFailure = error;
      if (error.code === 'finance/conflict') conflict = true;
      fail(error);
    } finally {
      saving = false;
      idleWaiters.splice(0).forEach((resolve) => resolve());
      if (
        !stopped &&
        remoteSequence > capturedRemote &&
        latestRemote !== undefined &&
        (!latestRemote || latestRemote.revision >= (baseRevision || 0))
      )
        receive(latestRemote);
      if (!stopped && dirty && !conflict && captured !== sequence) schedule();
      else if (
        !stopped &&
        dirty &&
        !conflict &&
        ['unavailable', 'deadline-exceeded', 'aborted', 'resource-exhausted'].includes(
          lastFailure?.code,
        )
      ) {
        clearTimeout(timer);
        timer = setTimeout(flush, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30000);
      }
    }
  }
  function schedule() {
    clearTimeout(timer);
    status('pending');
    timer = setTimeout(flush, 600);
  }
  const api = {
    getRevision: () => baseRevision,
    receive,
    fail,
    flush,
    update(next) {
      if (stopped) throw new Error('Esta sessão foi encerrada. Entre novamente para continuar.');
      if (conflict)
        throw new Error(
          'Resolva o conflito de sincronização antes de editar. Sua cópia local está preservada.',
        );
      const validated = migrateData(next);
      // Mark pending before changing the local snapshot so a crash cannot mark new edits clean.
      saveMarker({ baseRevision, dirty: true });
      saveLocal(validated);
      data = validated;
      dirty = true;
      sequence += 1;
      onData(data);
      onError(null);
      if (ready && !saving) schedule();
      else status('pending');
      return data;
    },
    async commit(update) {
      if (saving) await new Promise((resolve) => idleWaiters.push(resolve));
      if (stopped || conflict || !ready)
        throw new Error('Conecte-se e resolva a sincronização antes de apagar o histórico.');
      if (dirty) await flush();
      if (dirty || conflict || stopped)
        throw lastFailure || new Error('Ainda há alterações pendentes. Aguarde a sincronização.');
      api.update(typeof update === 'function' ? update(data) : update);
      await flush();
      if (dirty || conflict || stopped)
        throw (
          lastFailure || new Error('A exclusão ainda não foi confirmada na nuvem. Tente novamente.')
        );
      return data;
    },
    useCloud() {
      if (!conflict || !latestRemote)
        throw new Error('A versão da nuvem ainda não está disponível. Tente novamente.');
      archiveLocal(data);
      adopt(latestRemote);
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
  return api;
}
