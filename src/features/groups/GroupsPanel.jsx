import React, { useState } from 'react';
export function GroupsPanel({ data, setData, notify }) {
  const [personName, setPersonName] = useState('');
  const [groupName, setGroupName] = useState('');
  const [memberIds, setMemberIds] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [personError, setPersonError] = useState('');
  const [groupError, setGroupError] = useState('');
  const people = data.people || [];
  const groups = data.groups || [];
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
    const members = [...new Set([...(editing?.memberIds || []), ...memberIds])];
    if (members.length < 2) {
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
              ? { ...group, name, memberIds: [...new Set([...group.memberIds, ...members])] }
              : group,
          )
        : [...current.groups, { id, name, memberIds: members }],
    }));
    notify?.(
      editingId
        ? 'Grupo atualizado. Os participantes anteriores foram mantidos.'
        : 'Grupo criado. Selecione o espaço Grupo para registrar as contas.',
    );
    resetGroup();
  }
  function editGroup(group) {
    setEditingId(group.id);
    setGroupName(group.name);
    setMemberIds([...group.memberIds]);
    setGroupError('');
  }
  function toggleMember(id) {
    if (editing?.memberIds.includes(id)) return;
    setMemberIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
    setGroupError('');
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
              <legend>Participantes · selecione pelo menos 2</legend>
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
                        disabled={Boolean(editing?.memberIds.includes(person.id))}
                        onChange={() => toggleMember(person.id)}
                      />
                      <span>{person.name}</span>
                      {editing?.memberIds.includes(person.id) && <small>Já participa</small>}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="hint">Cadastre as pessoas antes de criar um grupo.</p>
              )}
            </fieldset>
            {editingId && (
              <p className="hint">
                Você pode mudar o nome e adicionar participantes. Os membros existentes são mantidos
                para preservar o histórico.
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
              <button className="button primary" disabled={people.length < 2}>
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
          Os nomes e rendas podem ser atualizados em Rendas e benefícios. Os dados são locais, sem
          convites ou acesso compartilhado nesta etapa.
        </p>
      </section>
      <section className="panel">
        <p className="eyebrow">UM ESPAÇO PARA CADA PLANO</p>
        <h2>
          Grupos cadastrados <span className="pill">{groups.length}</span>
        </h2>
        {groups.length ? (
          <div className="groups-grid">
            {groups.map((group) => (
              <article className="group-card" key={group.id}>
                <div className="section-heading">
                  <div>
                    <h3>{group.name}</h3>
                    <small>{group.memberIds.length} participantes</small>
                  </div>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => editGroup(group)}
                  >
                    Editar grupo
                  </button>
                </div>
                <ul className="group-member-chips">
                  {group.memberIds.map((id) => (
                    <li className="pill" key={id}>
                      {people.find((person) => person.id === id)?.name || 'Pessoa cadastrada'}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty">Crie um grupo para dividir contas entre duas ou mais pessoas.</div>
        )}
      </section>
    </>
  );
}
