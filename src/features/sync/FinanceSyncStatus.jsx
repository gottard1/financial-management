import React from 'react';

const labels = {
  local: 'Dados apenas neste navegador',
  loading: 'Carregando dados da nuvem…',
  pending: 'Alterações salvas neste navegador · envio pendente',
  saving: 'Salvando na nuvem…',
  saved: 'Dados financeiros salvos na nuvem',
  offline: 'Sem confirmação da nuvem · cópia local preservada',
  conflict: 'Conflito entre a cópia local e a nuvem',
};
export function FinanceSyncStatus({ status, error, retry, useCloud, exportLocal }) {
  return (
    <section className={'finance-sync-status ' + status} aria-label="Sincronização dos dados">
      <div>
        <strong role="status">{labels[status]}</strong>
        {error && <p role="alert">{error}</p>}
        <small>Arquivos de comprovantes continuam neste navegador.</small>
      </div>
      {(status === 'offline' || status === 'pending') && (
        <button className="button secondary" onClick={retry}>
          Tentar sincronizar
        </button>
      )}
      {status === 'conflict' && (
        <div className="actions">
          <button className="button secondary" onClick={exportLocal}>
            Exportar minha cópia local
          </button>
          <button className="button primary" onClick={useCloud}>
            Exportar cópia local e carregar nuvem
          </button>
        </div>
      )}
    </section>
  );
}
