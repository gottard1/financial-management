// Authentication identifies the account; names never identify or merge people.
export function applyGoogleAccountName(data, user) {
  const google = user?.providerData?.find((provider) => provider.providerId === 'google.com');
  const name = (google?.displayName || (google && user.displayName) || '').trim();
  if (!user?.uid || !name || name.length > 60) return data;
  const linked = data.people.find((person) => person.accountUid === user.uid);
  const person =
    linked ||
    data.people.find((item) => item.id === 'person-0' && item.name === 'Você' && !item.accountUid);
  if (person?.accountUid === user.uid && person.name === name) return data;
  if (!person || (person.accountUid === user.uid && person.name !== 'Você')) return data;
  return {
    ...data,
    people: data.people.map((item) =>
      item.id === person.id
        ? { ...item, name: item.name === 'Você' ? name : item.name, accountUid: user.uid }
        : item,
    ),
  };
}
