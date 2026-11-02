import React, { useState } from 'react';
import {
  addExpenseCategory,
  categoryOptions,
  addExtraCategory,
  extraCategoryOptions,
} from '../../domain/expenses/expenseCategories.js';
import { CATEGORIES } from '../../shared/constants/categories.js';

export function CategoriesPanel({ data, setData, scope, notify, canManage = true }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState('expenses');
  const shared = scope.startsWith('group:');
  const categories =
    kind === 'expenses' ? categoryOptions(data, scope) : extraCategoryOptions(data, scope, kind);
  const owner = shared
    ? data.groups.find((group) => `group:${group.id}` === scope)
    : data.people.find((person) => `person:${person.id}` === scope);
  async function save(event) {
    event.preventDefault();
    if (!canManage || saving) return;
    setSaving(true);
    try {
      await setData((current) =>
        kind === 'expenses'
          ? addExpenseCategory(current, scope, name)
          : addExtraCategory(current, scope, kind, name),
      );
      setName('');
      setError('');
      notify?.(
        'Categoria adicionada. Ela já está disponível nas despesas e no orçamento deste espaço.',
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="panel categories-panel">
      <p className="eyebrow">CADA GASTO NO SEU LUGAR</p>
      <h2>{shared ? `Categorias de ${owner?.name || 'seu grupo'}` : 'Minhas categorias'}</h2>
      <label className="field">
        Tipo de categoria
        <select
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setError('');
          }}
        >
          <option value="expenses">Despesas</option>
          {!shared && <option value="incomeCategories">Receitas</option>}
          <option value="investmentTypes">Investimentos</option>
        </select>
      </label>
      <p className="muted section-intro">
        {shared
          ? 'As categorias deste grupo ficam disponíveis para todos os participantes.'
          : 'Suas categorias pessoais ficam privadas e separadas das categorias dos grupos.'}{' '}
        Use-as nas despesas e nos limites do orçamento, em qualquer mês.
      </p>
      {canManage ? (
        <form onSubmit={save} className="category-form">
          <label className="field">
            Nome da nova categoria
            <input
              required
              maxLength={60}
              value={name}
              disabled={saving}
              onChange={(event) => {
                setName(event.target.value);
                setError('');
              }}
              placeholder="Ex.: Animais de estimação"
            />
          </label>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button className="button primary" disabled={saving}>
              {saving ? 'Adicionando…' : 'Adicionar categoria'}
            </button>
          </div>
        </form>
      ) : (
        <p className="notice">Somente o administrador pode cadastrar categorias para este grupo.</p>
      )}
      <div className="section-heading">
        <h3>
          Disponíveis neste espaço <span className="pill">{categories.length}</span>
        </h3>
      </div>
      <ul className="category-catalog">
        {categories.map((category) => (
          <li key={category}>
            <strong>{category}</strong>
            <small>
              {CATEGORIES.includes(category)
                ? 'Padrão'
                : owner?.categories?.includes(category)
                  ? 'Personalizada'
                  : 'No histórico'}
            </small>
          </li>
        ))}
      </ul>
    </section>
  );
}
