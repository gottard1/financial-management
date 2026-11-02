import { CATEGORIES } from '../../shared/constants/categories.js';

const normalize = (name) =>
  name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');

export function categoryOwner(data, scope) {
  if (scope?.startsWith('person:'))
    return data.people.find((person) => person.id === scope.slice(7));
  if (scope?.startsWith('group:')) return data.groups.find((group) => group.id === scope.slice(6));
  return null;
}

export function validateCategoryNames(categories) {
  if (!Array.isArray(categories)) throw new Error('Lista de categorias inválida.');
  const names = new Set(CATEGORIES.map(normalize));
  for (const name of categories) {
    if (
      typeof name !== 'string' ||
      !name.trim() ||
      name.length > 60 ||
      /[\u0000-\u001f\u007f]/.test(name)
    )
      throw new Error('Informe um nome de até 60 caracteres para a categoria.');
    const key = normalize(name);
    if (names.has(key)) throw new Error('Já existe uma categoria com este nome neste espaço.');
    names.add(key);
  }
}

/** Include historical names so old expenses and budget limits remain editable. */
export function categoryOptions(data, scope, additional = []) {
  return [
    ...new Set([
      ...CATEGORIES,
      ...(categoryOwner(data, scope)?.categories || []),
      ...(data.expenses || [])
        .filter((expense) => expense.workspace === scope)
        .map((expense) => expense.category),
      ...Object.entries(data.plans || {})
        .filter(([key]) => key.startsWith(`${scope}|`))
        .flatMap(([, plan]) => Object.keys(plan.categories || {})),
      ...additional,
    ]),
  ].filter((name) => typeof name === 'string' && name.trim());
}

export function addExpenseCategory(data, scope, input) {
  const target = categoryOwner(data, scope);
  if (!target || target.removed || target.deleted)
    throw new Error('Selecione um espaço financeiro ativo para cadastrar categorias.');
  const name = typeof input === 'string' ? input.trim().replace(/\s+/g, ' ') : '';
  validateCategoryNames([name]);
  if (categoryOptions(data, scope).some((existing) => normalize(existing) === normalize(name)))
    throw new Error('Já existe uma categoria com este nome neste espaço.');
  const key = scope.startsWith('group:') ? 'groups' : 'people';
  return {
    ...data,
    [key]: data[key].map((item) =>
      item.id === target.id ? { ...item, categories: [...(item.categories || []), name] } : item,
    ),
  };
}

export function extraCategoryOptions(data, scope, kind) {
  const defaults =
    kind === 'incomeCategories'
      ? ['Salário', 'Renda extra', 'Dividendos', 'Outras receitas']
      : ['Renda fixa', 'Ações', 'Fundos', 'Previdência', 'Outros investimentos'];
  const records = kind === 'incomeCategories' ? data.incomeEntries || [] : data.investments || [];
  return [
    ...new Set([
      ...defaults,
      ...(categoryOwner(data, scope)?.[kind] || []),
      ...records
        .filter((r) => r.scope === scope)
        .map((r) => (kind === 'incomeCategories' ? r.category : r.type)),
    ]),
  ];
}
export function addExtraCategory(data, scope, kind, input) {
  if (!['incomeCategories', 'investmentTypes'].includes(kind))
    throw new Error('Tipo de categoria inválido.');
  const target = categoryOwner(data, scope),
    name = input.trim().replace(/\s+/g, ' ');
  if (!target || target.deleted || target.removed) throw new Error('Espaço indisponível.');
  validateCategoryNames([name]);
  if (extraCategoryOptions(data, scope, kind).some((n) => normalize(n) === normalize(name)))
    throw new Error('Categoria já cadastrada.');
  const section = scope.startsWith('group:') ? 'groups' : 'people';
  return {
    ...data,
    [section]: data[section].map((o) =>
      o.id === target.id ? { ...o, [kind]: [...(o[kind] || []), name] } : o,
    ),
  };
}
