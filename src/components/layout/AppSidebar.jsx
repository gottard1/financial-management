import React from 'react';
const NAVIGATION = [
  ['overview', '◫', 'Visão geral', 'Início'],
  ['expenses', '↔', 'Despesas', 'Gastos'],
  ['budget', '▦', 'Orçamento', 'Plano'],
  ['savings', '◎', 'Metas e reservas', 'Metas'],
  ['people', '♧', 'Rendas e benefícios', 'Rendas'],
  ['groups', '♙', 'Pessoas e grupos', 'Grupos'],
];
export function AppSidebar({ tab, onNavigate, onExport }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          ↗
        </span>
        contas &amp; planos<span className="pill">LOCAL</span>
      </div>
      <button
        type="button"
        className="sidebar-mobile-export"
        onClick={onExport}
        aria-label="Exportar backup"
        title="Exportar backup"
      >
        ↓
      </button>
      <p className="eyebrow">SEU ESPAÇO FINANCEIRO</p>
      <nav className="app-navigation" aria-label="Navegação principal">
        {NAVIGATION.map(([id, icon, title, mobile]) => (
          <button
            type="button"
            className={'nav-item ' + (tab === id ? 'active' : '')}
            aria-current={tab === id ? 'page' : undefined}
            aria-label={title}
            key={id}
            onClick={() => onNavigate(id)}
          >
            <span className="nav-icon" aria-hidden="true">
              {icon}
            </span>
            <span className="nav-label">{title}</span>
            <span className="nav-label-mobile" aria-hidden="true">
              {mobile}
            </span>
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <p>
          Seus números.
          <br />
          <strong>Seus próximos passos.</strong>
        </p>
        <small>
          Dados apenas neste navegador.
          <br />
          Sem sincronização entre dispositivos.
        </small>
        <button type="button" className="button secondary" onClick={onExport}>
          ↓ Exportar backup
        </button>
      </div>
    </aside>
  );
}
