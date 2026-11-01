import React, { useState } from 'react';
import { IncomePanel } from '../income/IncomePanel.jsx';
import { profilePerson, saveProfile } from '../../domain/groups/profile.js';

export function ProfilePanel({ data, setData, month, user, notify, onMonthChange }) {
  const person = profilePerson(data, user?.uid);
  if (!person)
    return (
      <section className="panel">
        <h2>Seu perfil</h2>
        <p>Não foi possível identificar o cadastro vinculado à sua conta.</p>
      </section>
    );
  return (
    <div className="profile-panel">
      <PersonalDetails
        key={JSON.stringify([person.id, person.name, person.profile])}
        {...{ person, user, setData, notify }}
      />
      <IncomePanel
        key={`${person.id}|${month}`}
        {...{ data, setData, month, notify }}
        person={person.id}
        onMonthChange={onMonthChange}
      />
    </div>
  );
}

function PersonalDetails({ person, user, setData, notify }) {
  const [form, setForm] = useState(() => ({
    name: person.name,
    phone: person.profile?.phone || '',
    city: person.profile?.city || '',
    occupation: person.profile?.occupation || '',
  }));
  const [error, setError] = useState('');
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <section className="panel personal-details-panel">
      <p className="eyebrow">SEU PERFIL</p>
      <h2>Dados pessoais</h2>
      <p className="muted section-intro">
        Atualize seu nome e suas informações. Telefone, cidade, ocupação, renda e benefícios ficam
        privados na sua conta. Seu nome identifica você nos grupos que administra.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            setData((current) => saveProfile(current, user?.uid, form));
            setError('');
            notify?.('Perfil atualizado. Seus lançamentos e vínculos foram preservados.');
          } catch (err) {
            setError(err.message);
          }
        }}
      >
        <div className="form-grid">
          <label className="field">
            Nome
            <input
              required
              autoComplete="name"
              maxLength={60}
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
            />
          </label>
          <label className="field">
            E-mail da conta
            <input type="email" readOnly value={user?.email || ''} placeholder="Modo local" />
            <small>E-mail utilizado para entrar no aplicativo.</small>
          </label>
          <label className="field">
            Telefone (opcional)
            <input
              type="tel"
              autoComplete="tel"
              maxLength={30}
              value={form.phone}
              onChange={(event) => set('phone', event.target.value)}
            />
          </label>
          <label className="field">
            Cidade (opcional)
            <input
              autoComplete="address-level2"
              maxLength={100}
              value={form.city}
              onChange={(event) => set('city', event.target.value)}
            />
          </label>
          <label className="field">
            Ocupação (opcional)
            <input
              autoComplete="organization-title"
              maxLength={100}
              value={form.occupation}
              onChange={(event) => set('occupation', event.target.value)}
            />
          </label>
        </div>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="button primary">Salvar dados pessoais</button>
        </div>
      </form>
    </section>
  );
}
