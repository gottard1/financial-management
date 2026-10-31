import React, { useState } from 'react';
import {
  activeGroupMembers,
  removeGroupMember,
  deleteGroup,
  purgeGroupHistoryBatch,
  groupHistoryCount,
} from '../../domain/groups/groupMembers.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { PurgeGroupDialog } from './PurgeGroupDialog.jsx';
import { removeReceipt } from '../../infrastructure/storage/receiptRepository.js';
export function GroupsPanel({ data, setData, commitData, notify, onViewGroup, onExport }) {
  const { user, localMode } = useAuth();
  const [removing, setRemoving] = useState('');
  const [removeError, setRemoveError] = useState('');
  const [purgeTarget, setPurgeTarget] = useState(null);
  const [purgeError, setPurgeError] = useState('');
  const [personName, setPersonName] = useState('');
  const [groupName, setGroupName] = useState('');
  const [memberIds, setMemberIds] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [personError, setPersonError] = useState('');
  const [groupError, setGroupError] = useState('');
  const people = data.people || [];
  const groups = (data.groups || []).filter((group) => !group.deleted);
  const archivedGroups = (data.groups || []).filter((group) => group.deleted);
  const editing = groups.find((group) => group.id === editingId);
  const normalize = (name) => name.trim().toLocaleLowerCase('pt-BR');
  function createPerson(event) {
    event.preventDefault();
    const name = personName.trim();
    if (!name || name.length > 60) {
      setPersonError('Informe um nome de até 60 caracteres.');
      return;
    }
    if (people.some((person) => normalize(person.name) === normalize(name))) {
      setPersonError('Já existe uma pessoa com este nome. Use um nome diferente.');
      return;
    }
    setData((current) => ({
      ...current,
      people: [...current.people, { id: crypto.randomUUID(), name }],
    }));
    setPersonName('');
    setPersonError('');
    notify?.('Pessoa cadastrada. Você já pode incluí-la em um grupo e definir sua renda.');
  }
  function resetGroup() {
    setGroupName('');
    setMemberIds([]);
    setEditingId(null);
    setGroupError('');
  }
  function saveGroup(event) {
    event.preventDefault();
    if (editingId && !editing) {
      setGroupError('Este grupo foi excluído e não pode ser alterado.');
      return;
    }
    const name = groupName.trim();
    if (!name || name.length > 80) {
      setGroupError('Informe um nome de até 80 caracteres para o grupo.');
      return;
    }
    if (
      groups.some((group) => group.id !== editingId && normalize(group.name) === normalize(name))
    ) {
      setGroupError('Já existe um grupo com este nome.');
      return;
    }
    const members = [...new Set([...activeGroupMembers(editing), ...memberIds])];
    if (members.length < (editingId ? 1 : 2)) {
      setGroupError('Selecione pelo menos duas pessoas para compartilhar as contas.');
      return;
    }
    if (members.some((id) => !people.some((person) => person.id === id))) {
      setGroupError('Selecione apenas pessoas cadastradas.');
      return;
    }
    const id = editingId || crypto.randomUUID();
    setData((current) => ({
      ...current,
      groups: editingId
        ? current.groups.map((group) =>
            group.id === editingId
              ? {
                  ...group,
                  name,
                  memberIds: [...new Set([...group.memberIds, ...members])],
                  removedMemberIds: (group.removedMemberIds || []).filter(
                    (id) => !members.includes(id),
                  ),
                }
              : group,
          )
        : [...current.groups, { id, name, memberIds: members }],
    }));
    notify?.(
      editingId
        ? 'Grupo atualizado. O histórico dos participantes foi preservado.'
        : 'Grupo criado. Selecione o espaço Grupo para registrar as contas.',
    );
    resetGroup();
  }
  function editGroup(group) {
    setEditingId(group.id);
    setGroupName(group.name);
    setMemberIds(activeGroupMembers(group));
    setGroupError('');
  }
  function toggleMember(id) {
    if (activeGroupMembers(editing).includes(id)) return;
    setMemberIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
    setGroupError('');
  }
  async function removeMember(group, personId) {
    const name = people.find((person) => person.id === personId)?.name || 'esta pessoa';
    if (
      !window.confirm(
        `Remover ${name} de ${group.name}? O acesso e os convites serão revogados. O histórico e os saldos serão mantidos.`,
      )
    )
      return;
    setRemoving(`${group.id}:${personId}`);
    setRemoveError('');
    try {
      removeGroupMember(data, group.id, personId);
      if (user && !localMode) {
        const repository = await import('../../infrastructure/firebase/groupSharingRepository.js');
        await repository.removeMemberAccess(group.id, personId);
      }
      setData((current) => removeGroupMember(current, group.id, personId));
      if (editingId === group.id) resetGroup();
      notify?.(`${name} foi removido do grupo. O histórico e os saldos anteriores foram mantidos.`);
    } catch (error) {
      setRemoveError(
        error.code
          ? 'Não foi possível revogar o acesso. Confira a conexão e publique as regras atualizadas do Firestore antes de tentar novamente.'
          : error.message,
      );
    } finally {
      setRemoving('');
    }
  }
  async function removeGroup(group, retry = false) {
    if (
      !retry &&
      !window.confirm(
        `Excluir o grupo ${group.name}? Todos os convites e acessos serão bloqueados. As despesas, os repasses e os saldos ficam preservados somente para consulta no histórico.`,
      )
    )
      return;
    setRemoving(`group:${group.id}`);
    setRemoveError('');
    try {
      let cleanupPending = false;
      if (user && !localMode) {
        const repository = await import('../../infrastructure/firebase/groupSharingRepository.js');
        ({ cleanupPending } = await repository.removeSharedGroup(group.id));
      }
      if (!retry) setData((current) => deleteGroup(current, group.id));
      if (editingId === group.id) resetGroup();
      notify?.(
        cleanupPending
          ? 'Grupo excluído e acesso bloqueado. A limpeza da lista de convites está pendente; use Atualizar revogação no histórico para tentar novamente.'
          : 'Grupo excluído. Histórico financeiro preservado e acessos revogados.',
      );
    } catch (error) {
      setRemoveError(
        error.code
          ? 'Não foi possível bloquear o acesso ao grupo. Confira a conexão e publique as regras atualizadas do Firestore.'
          : error.message,
      );
    } finally {
      setRemoving('');
    }
  }
  async function eraseHistory() {
    const group = purgeTarget;
    setRemoving(`purge:${group.id}`);
    setPurgeError('');
    const receipts = [
      ...new Set([
        ...(group.purgeReceiptIds || []),
        ...data.settlements
          .filter((item) => item.scope === `group:${group.id}` && item.receipt)
          .map((item) => item.receipt.id),
      ]),
    ];
    try {
      if (user && !localMode) {
        const repository = await import('../../infrastructure/firebase/groupSharingRepository.js');
        await repository.removeSharedGroup(group.id);
        await repository.eraseSharedGroupHistory(group.id);
      }
      let next;
      do {
        next = await commitData((current) => purgeGroupHistoryBatch(current, group.id));
      } while (next.groups.some((item) => item.id === group.id));
      const cleanup = await Promise.allSettled(
        receipts.map((id) => removeReceipt(id, user?.uid || 'local')),
      );
      setPurgeTarget(null);
      notify?.(
        cleanup.some((item) => item.status === 'rejected')
          ? 'Histórico apagado. Alguns arquivos locais de comprovantes não puderam ser removidos.'
          : 'Histórico do grupo apagado definitivamente. Pessoas, rendas e outros grupos foram mantidos.',
      );
    } catch (error) {
      setPurgeError(
        error.code
          ? 'A limpeza não foi concluída. Confira a conexão e publique as regras atualizadas do Firestore; depois tente novamente. Etapas já confirmadas não serão refeitas.'
          : `${error.message} Você pode tentar novamente para continuar a limpeza.`,
      );
    } finally {
      setRemoving('');
    }
  }
  return (
    <>
      <div className="two-col groups-forms">
        <section className="panel">
          <p className="eyebrow">QUEM PARTICIPA DOS PLANOS</p>
          <h2>Cadastrar uma pessoa</h2>
          <p className="muted">
            Cada pessoa tem seu espaço individual e pode participar de vários grupos.
          </p>
          <form onSubmit={createPerson}>
            <label className="field">
              Nome da pessoa
              <input
                required
                maxLength={60}
                value={personName}
                onChange={(event) => {
                  setPersonName(event.target.value);
                  setPersonError('');
                }}
                placeholder="Ex.: Ana"
              />
            </label>
            {personError && (
              <p className="notice error" role="alert">
                {personError}
              </p>
            )}
            <div className="form-actions">
              <button className="button primary">Adicionar pessoa</button>
            </div>
          </form>
        </section>
        <section className="panel">
          <p className="eyebrow">CONTAS COMPARTILHADAS</p>
          <h2>{editingId ? 'Editar grupo' : 'Criar um grupo'}</h2>
          <p className="muted">
            Organize contas de uma casa, família, viagem ou qualquer plano em conjunto.
          </p>
          <form onSubmit={saveGroup}>
            <label className="field">
              Nome do grupo
              <input
                required
                maxLength={80}
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="Ex.: Despesas da casa"
              />
            </label>
            <fieldset className="group-members-fieldset">
              <legend>
                {editingId
                  ? 'Participantes ativos · adicione ou reative pessoas'
                  : 'Participantes · selecione pelo menos 2'}
              </legend>
              {people.length ? (
                <div className="group-member-options">
                  {people.map((person) => (
                    <label
                      className={
                        'group-member-option ' + (memberIds.includes(person.id) ? 'selected' : '')
                      }
                      key={person.id}
                    >
                      <input
                        type="checkbox"
                        checked={memberIds.includes(person.id)}
                        disabled={
                          activeGroupMembers(editing).includes(person.id) || Boolean(removing)
                        }
                        onChange={() => toggleMember(person.id)}
                      />
                      <span>{person.name}</span>
                      {activeGroupMembers(editing).includes(person.id) && (
                        <small>Já participa</small>
                      )}
                      {editing?.removedMemberIds?.includes(person.id) && (
                        <small>Reativar participante</small>
                      )}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="hint">Cadastre as pessoas antes de criar um grupo.</p>
              )}
            </fieldset>
            {editingId && (
              <p className="hint">
                Você pode mudar o nome, adicionar ou reativar participantes. Para remover alguém,
                use Remover na lista do grupo abaixo. A reativação exige um novo convite para
                devolver o acesso.
              </p>
            )}
            {groupError && (
              <p className="notice error" role="alert">
                {groupError}
              </p>
            )}
            <div className="form-actions">
              {editingId && (
                <button type="button" className="button secondary" onClick={resetGroup}>
                  Cancelar edição
                </button>
              )}
              <button
                className="button primary"
                disabled={Boolean(removing) || (!editingId && people.length < 2)}
              >
                {editingId ? 'Salvar grupo' : 'Criar grupo'}
              </button>
            </div>
          </form>
        </section>
      </div>
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">TODAS AS PESSOAS</p>
            <h2>
              Pessoas cadastradas <span className="pill">{people.length}</span>
            </h2>
          </div>
        </div>
        {people.length ? (
          <ul className="people-chips">
            {people.map((person) => (
              <li key={person.id}>
                <span className="avatar" aria-hidden="true">
                  {person.name.slice(0, 1).toLocaleUpperCase('pt-BR')}
                </span>
                <strong>{person.name}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">Cadastre a primeira pessoa para começar.</div>
        )}
        <p className="hint">
          Os nomes e rendas podem ser atualizados em Rendas e benefícios. Para vincular uma conta,
          selecione o participante em Convites e acesso ao grupo e informe seu e-mail.
        </p>
      </section>
      <section className="panel">
        <p className="eyebrow">UM ESPAÇO PARA CADA PLANO</p>
        <h2>
          Grupos cadastrados <span className="pill">{groups.length}</span>
        </h2>
        {removeError && (
          <p className="notice error" role="alert">
            {removeError}
          </p>
        )}
        {groups.length ? (
          <div className="groups-grid">
            {groups.map((group) => (
              <article className="group-card" key={group.id}>
                <div className="section-heading">
                  <div>
                    <h3>{group.name}</h3>
                    <small>{activeGroupMembers(group).length} participante(s) ativo(s)</small>
                  </div>
                  <div className="actions">
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => editGroup(group)}
                      disabled={Boolean(removing)}
                    >
                      Editar grupo
                    </button>
                    <button
                      type="button"
                      className="button danger"
                      disabled={Boolean(removing)}
                      onClick={() => removeGroup(group)}
                    >
                      {removing === `group:${group.id}` ? 'Excluindo…' : 'Excluir grupo'}
                    </button>
                  </div>
                </div>
                <ul className="group-member-chips">
                  {group.memberIds.map((id) => (
                    <li
                      className={
                        'group-participant ' +
                        (group.removedMemberIds?.includes(id) ? 'removed' : '')
                      }
                      key={id}
                    >
                      {people.find((person) => person.id === id)?.name || 'Pessoa cadastrada'}
                      {group.removedMemberIds?.includes(id) ? (
                        <small>Removido · histórico mantido</small>
                      ) : (
                        <button
                          type="button"
                          className="text-button"
                          disabled={Boolean(removing) || activeGroupMembers(group).length <= 1}
                          aria-label={`Remover ${people.find((person) => person.id === id)?.name} de ${group.name}`}
                          onClick={() => removeMember(group, id)}
                        >
                          {removing === `${group.id}:${id}` ? 'Removendo…' : 'Remover'}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {activeGroupMembers(group).length === 1 && (
                  <p className="hint">
                    Mantenha pelo menos um participante ativo para continuar usando o grupo.
                  </p>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="empty">Crie um grupo para dividir contas entre duas ou mais pessoas.</div>
        )}
      </section>
      {archivedGroups.length > 0 && (
        <section className="panel">
          <p className="eyebrow">HISTÓRICO PRESERVADO</p>
          <h2>
            Grupos excluídos <span className="pill">{archivedGroups.length}</span>
          </h2>
          <p className="muted">
            Grupos excluídos ficam disponíveis somente para consulta. Pessoas, despesas e repasses
            anteriores não são apagados.
          </p>
          <ul className="sharing-record-list">
            {archivedGroups.map((group) => (
              <li key={group.id} className="sharing-record">
                <div className="sharing-record-info">
                  <strong>{group.name}</strong>
                  <span>
                    {group.purging
                      ? 'Exclusão definitiva em andamento · retome para concluir'
                      : 'Excluído · somente consulta'}
                  </span>
                </div>
                <div className="actions">
                  <button
                    className="button secondary"
                    disabled={Boolean(removing) || group.purging}
                    onClick={() => onViewGroup?.(group.id)}
                  >
                    Consultar histórico
                  </button>
                  {user && !localMode && (
                    <button
                      className="button secondary"
                      disabled={Boolean(removing)}
                      onClick={() => removeGroup(group, true)}
                    >
                      Atualizar revogação
                    </button>
                  )}
                  <button
                    className="button danger"
                    disabled={Boolean(removing)}
                    onClick={() => {
                      setPurgeTarget({
                        ...group,
                        purgeReceiptIds: [
                          ...new Set([
                            ...(group.purgeReceiptIds || []),
                            ...data.settlements
                              .filter((item) => item.scope === `group:${group.id}` && item.receipt)
                              .map((item) => item.receipt.id),
                          ]),
                        ],
                      });
                      setPurgeError('');
                    }}
                  >
                    {group.purging
                      ? 'Continuar apagando histórico'
                      : 'Apagar histórico definitivamente'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {purgeTarget && (
        <PurgeGroupDialog
          group={purgeTarget}
          count={groupHistoryCount(data, purgeTarget.id)}
          busy={Boolean(removing)}
          error={purgeError}
          onClose={() => setPurgeTarget(null)}
          onConfirm={eraseHistory}
          onExport={onExport}
        />
      )}
    </>
  );
}
