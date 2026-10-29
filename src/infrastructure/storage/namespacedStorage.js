/** Keep authenticated browser datasets isolated; local mode retains existing legacy keys. */
export function createNamespacedStorage(namespace = 'local', storage) {
  if (typeof namespace !== 'string' || !namespace.trim())
    throw new Error('Identificador de armazenamento inválido.');
  const prefix = namespace === 'local' ? '' : `financial-user:${encodeURIComponent(namespace)}:`;
  const resolveStorage = () => (storage === undefined ? globalThis.localStorage : storage);
  return {
    getItem(key) {
      return resolveStorage().getItem(prefix + key);
    },
    setItem(key, value) {
      return resolveStorage().setItem(prefix + key, value);
    },
  };
}
