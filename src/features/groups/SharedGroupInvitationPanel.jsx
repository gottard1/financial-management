import React from 'react';

export function SharedGroupInvitationPanel({ snapshot, onInvite }) {
  const active = snapshot.activeMemberIds || snapshot.people.map((person) => person.id);
  return (
    <section className="panel shared-group-invitation">
      <h2>{snapshot.name}</h2>
      <p className="muted">Os dados cadastrais do grupo são gerenciados pelo administrador.</p>
      <h3>Participantes</h3>
      <ul className="shared-group-members">
        {snapshot.people.map((person) => (
          <li key={person.id}>
            {person.name}
            {!active.includes(person.id)
              ? ' · Removido'
              : person.id === snapshot.adminPersonId
                ? ' · Administrador'
                : ''}
          </li>
        ))}
      </ul>
      <h3>Convidar novo participante</h3>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const values = new FormData(form);
          try {
            await onInvite({ email: values.get('email'), name: values.get('name') });
            form.reset();
          } catch {
            // The workspace retains the form and displays the server error.
          }
        }}
      >
        <div className="form-grid">
          <label className="field">
            E-mail
            <input name="email" type="email" required maxLength={254} />
          </label>
          <label className="field">
            Nome no grupo
            <input name="name" required maxLength={60} />
          </label>
        </div>
        <button className="button primary">Convidar participante</button>
      </form>
    </section>
  );
}
