import React from 'react';

export function WorkspaceNavigation({ mode, tab, onNavigate, administrator }) {
  const items =
    mode === 'group'
      ? [
          ['settlements', 'Acertos'],
          ['expenses', 'Despesas'],
          ['comparison', 'Análises'],
          ['budget', 'Orçamento'],
          ['categories', 'Categorias'],
          ['savings', 'Metas'],
          ['financeSetup', 'Faturas e eventos'],
          ['investments', 'Investimentos'],
          ['annual', 'Visão anual'],
          ['members', 'Participantes'],
          ...(administrator ? [['settings', 'Configurações']] : []),
          ['overview', 'Visão geral'],
        ]
      : [
          ['overview', 'Visão geral'],
          ['expenses', 'Despesas'],
          ['allExpenses', 'Todas as despesas'],
          ['benefits', 'VA / VR'],
          ['comparison', 'Análises'],
          ['budget', 'Orçamento'],
          ['categories', 'Categorias'],
          ['savings', 'Metas e reservas'],
          ['incomeEntries', 'Receitas'],
          ['financeSetup', 'Faturas e eventos'],
          ['investments', 'Investimentos'],
          ['annual', 'Visão anual'],
        ];
  return (
    <div className="workspace-navigation">
      <label className="mobile-section-picker">
        {mode === 'group' ? 'Área do grupo' : 'Meu financeiro'}
        <select value={tab} onChange={(event) => onNavigate(event.target.value)}>
          {items.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <nav
        className="workspace-section-tabs"
        aria-label={mode === 'group' ? 'Navegação do grupo' : 'Navegação individual'}
      >
        {items.map(([id, label]) => (
          <button
            type="button"
            key={id}
            aria-current={tab === id ? 'page' : undefined}
            className={tab === id ? 'active' : ''}
            onClick={() => onNavigate(id)}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
