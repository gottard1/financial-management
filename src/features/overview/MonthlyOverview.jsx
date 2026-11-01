import React from 'react';
import { MonthlySummary } from './MonthlySummary.jsx';
import { OverviewPanel } from './OverviewPanel.jsx';

/** The same overview composition serves owners and invited group participants. */
export function MonthlyOverview(props) {
  return (
    <>
      <MonthlySummary {...props} />
      <OverviewPanel {...props} />
    </>
  );
}
