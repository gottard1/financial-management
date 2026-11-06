import React from 'react';

const sections = [
  ['overview', 'Visão geral'],
  ['expenses', 'Despesas'],
  ['allExpenses', 'Todas as despesas', 'individual'],
  ['benefits', 'VA / VR', 'individual'],
  ['comparison', 'Análises'],
  ['budget', 'Orçamento'],
  ['categories', 'Categorias'],
  ['savings', 'Metas e reservas'],
  ['incomeEntries', 'Receitas', 'individual'],
  ['financeSetup', 'Faturas e eventos'],
  ['investments', 'Investimentos'],
  ['annual', 'Visão anual'],
  ['settlements', 'Acertos', 'group'],
  ['members', 'Participantes', 'group'],
  ['settings', 'Configurações', 'administrator'],
];

export function WorkspaceNavigation({ mode, tab, onNavigate, administrator }) {
  const canConfigure = mode === 'group' && administrator;
  const items = sections.filter(
    ([, , access]) => !access || access === mode || (access === 'administrator' && canConfigure),
  );
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
