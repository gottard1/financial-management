import { CATEGORIES } from '../../shared/constants/categories.js';

const normalize = (name) =>
  name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');

function owner(data, scope) {
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
      ...(owner(data, scope)?.categories || []),
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
  const target = owner(data, scope);
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
