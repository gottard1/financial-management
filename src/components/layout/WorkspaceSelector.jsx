import React from 'react';
export function WorkspaceSelector({
  mode,
  setMode,
  person,
  setPerson,
  groupId,
  setGroupId,
  people = [],
  groups = [],
  tab,
  onClearError,
}) {
  function changeMode(next) {
    setMode(next);
    onClearError?.();
  }
  const personName = people.find((item) => item.id === person)?.name || 'Selecione uma pessoa';
  const group = groups.find((item) => item.id === groupId);
  const selectPerson = tab === 'people' || mode === 'individual';
  return (
    <section className="workspace-tabs" aria-label="Escolher espaço financeiro">
      <div className="workspace-mode">
        <span>Espaço financeiro</span>
        <div className="mode-switch" role="group" aria-label="Espaço financeiro">
          <button
            type="button"
            className={mode === 'individual' ? 'active' : ''}
            aria-pressed={mode === 'individual'}
            onClick={() => changeMode('individual')}
          >
            Individual
          </button>
          <button
            type="button"
            className={mode === 'group' ? 'active' : ''}
            aria-pressed={mode === 'group'}
            onClick={() => changeMode('group')}
          >
            Grupo
          </button>
        </div>
      </div>
      {selectPerson ? (
        <label className="field workspace-person">
          {tab === 'people' ? 'Editar renda de' : 'Pessoa selecionada'}
          <select
            value={person || ''}
            disabled={!people.length}
            onChange={(event) => {
              setPerson(event.target.value);
              onClearError?.();
            }}
          >
            {!people.length && <option value="">Cadastre uma pessoa</option>}
            {people.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      ) : groups.length ? (
        <label className="field workspace-person">
          Grupo selecionado
          <select
            value={groupId || ''}
            onChange={(event) => {
              setGroupId(event.target.value);
              onClearError?.();
            }}
          >
            {!groupId && (
              <option value="" disabled>
                Selecione um grupo
              </option>
            )}
            {groups.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="workspace-empty">Crie um grupo na aba Pessoas e grupos.</p>
      )}
      <div className="workspace-context">
        <small>{tab === 'people' ? 'Renda individual do mês' : 'Você está organizando'}</small>
        <strong>
          {tab === 'people' || mode === 'individual'
            ? 'Orçamento individual · ' + personName
            : group
              ? 'Orçamento do grupo · ' + group.name
              : 'Nenhum grupo cadastrado'}
        </strong>
      </div>
    </section>
  );
}
