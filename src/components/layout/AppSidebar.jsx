import React from 'react';
import { Icon } from '../ui/Icon.jsx';
import { Avatar } from '../ui/Avatar.jsx';

export function AppSidebar({
  tab,
  onNavigate,
  mode,
  groupId,
  groups = [],
  onSelectSpace,
  userName,
  notificationCount = 0,
  photoURL,
}) {
  return (
    <aside className="sidebar redesign-sidebar">
      <div className="brand">
        <span className="brand-mark">
          <Icon name="sprout" />
        </span>
        Contas &amp; Planos
      </div>
      <nav className="space-navigation" aria-label="Espaços financeiros">
        <section>
          <p className="eyebrow">Individual</p>
          <button
            type="button"
            className={
              'space-link ' +
              (mode === 'individual' &&
              !['people', 'groups', 'account', 'notifications'].includes(tab)
                ? 'active'
                : '')
            }
            onClick={() => onSelectSpace('individual')}
          >
            <span className="space-icon">
              <Icon name="user" />
            </span>
            <span>
              <strong>Meu financeiro</strong>
              <small>Privado · só você</small>
            </span>
          </button>
        </section>
        <section>
          <p className="eyebrow">Meus grupos</p>
          <div className="sidebar-groups">
            {groups
              .filter((group) => !group.deleted)
              .map((group) => (
                <button
                  type="button"
                  key={group.id}
                  className={
                    'space-link ' +
                    (mode === 'group' &&
                    groupId === group.id &&
                    !['people', 'groups', 'account', 'notifications'].includes(tab)
                      ? 'active'
                      : '')
                  }
                  onClick={() => onSelectSpace('group', group.id)}
                >
                  <span className="space-icon">
                    <Icon name="users" />
                  </span>
                  <span>
                    <strong>{group.name}</strong>
                    <small>
                      {group.memberIds
                        ? `${group.memberIds.length - (group.removedMemberIds?.length || 0)} participante(s)`
                        : 'Grupo compartilhado'}
                    </small>
                  </span>
                </button>
              ))}
          </div>
          <button
            type="button"
            className="text-button sidebar-create"
            onClick={() => onNavigate('groups')}
          >
            <Icon name="plus" /> Criar ou gerenciar grupos
          </button>
        </section>
      </nav>
      <nav className="account-navigation" aria-label="Minha conta">
        <button
          type="button"
          className={tab === 'notifications' ? 'active' : ''}
          onClick={() => onNavigate('notifications')}
        >
          <Icon name="bell" />
          Notificações
          {notificationCount > 0 && <span className="notification-count">{notificationCount}</span>}
        </button>
        <button
          type="button"
          className={tab === 'people' ? 'active' : ''}
          onClick={() => onNavigate('people')}
        >
          <Icon name="user" />
          Perfil e renda
        </button>
        <button
          type="button"
          className={tab === 'account' ? 'active' : ''}
          onClick={() => onNavigate('account')}
        >
          <Icon name="settings" />
          Conta e dados
        </button>
      </nav>
      <div className="sidebar-identity">
        <Avatar name={userName || 'Você'} photoURL={photoURL} />
        <div>
          <strong>{userName || 'Você'}</strong>
          <small>Seu espaço financeiro</small>
        </div>
      </div>
    </aside>
  );
}
