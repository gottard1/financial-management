import React from 'react';
import { money } from '../../domain/expenses/expenseCalculations.js';

export function Progress({ amount, target, label }) {
  const percent = target > 0 ? Math.min(100, Math.max(0, (amount / target) * 100)) : 0;
  return (
    <div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
      >
        <div className="progress-value" style={{ width: percent + '%' }} />
      </div>
      <small>
        {target > 0
          ? `${((amount / target) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% de ${money(target)}`
          : 'Defina uma meta para acompanhar'}
      </small>
    </div>
  );
}
