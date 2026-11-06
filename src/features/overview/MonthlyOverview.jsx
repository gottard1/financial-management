import React from 'react';
import { MonthlySummary } from './MonthlySummary.jsx';
import { OverviewPanel } from './OverviewPanel.jsx';

/** The same overview composition serves owners and invited group participants. */
export function MonthlyOverview({ sharingLoading, sharingError, ...props }) {
  const individual = props.mode === 'individual';
  return (
    <>
      {individual && sharingLoading && (
        <p className="notice" role="status">
          Carregando despesas dos grupos compartilhados. Os totais ainda são parciais.
        </p>
      )}
      {individual && (sharingError || props.stats.sharedSharesIncomplete) && (
        <p className="notice error" role="alert">
          Resumo parcial. Algumas cotas dos grupos compartilhados estão indisponíveis.
        </p>
      )}
      <MonthlySummary {...props} />
      <OverviewPanel {...props} />
    </>
  );
}
