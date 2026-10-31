export function profilePerson(data, uid) {
  return (
    (uid && data.people.find((person) => person.accountUid === uid)) ||
    data.people.find(
      (person) => person.id === 'person-0' && (!person.accountUid || person.accountUid === uid),
    ) ||
    null
  );
}

export function saveProfile(data, uid, fields) {
  const person = profilePerson(data, uid);
  if (!person) throw new Error('Não foi possível identificar o perfil desta conta.');
  const name = fields.name.trim();
  if (!name || name.length > 60) throw new Error('Informe um nome de até 60 caracteres.');
  if (
    data.people.some(
      (item) =>
        item.id !== person.id &&
        item.name.trim().toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'),
    )
  )
    throw new Error('Já existe uma pessoa com esse nome.');
  const profile = {};
  for (const [key, limit] of [
    ['phone', 30],
    ['city', 100],
    ['occupation', 100],
  ]) {
    const value = (fields[key] || '').trim();
    if (value.length > limit) throw new Error(`Use até ${limit} caracteres neste campo.`);
    profile[key] = value;
  }
  return {
    ...data,
    people: data.people.map((item) =>
      item.id === person.id
        ? {
            ...item,
            name,
            profile: { ...item.profile, ...profile },
            ...(uid ? { accountUid: uid } : {}),
          }
        : item,
    ),
  };
}
