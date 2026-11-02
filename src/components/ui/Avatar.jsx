import React, { useEffect, useState } from 'react';

export function Avatar({ name = 'Você', photoURL, large = false }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photoURL]);
  const remote = typeof photoURL === 'string' && photoURL.startsWith('https://') && !failed;
  return (
    <span className={'avatar' + (large ? ' avatar-large' : '')}>
      {remote ? (
        <img
          src={photoURL}
          alt={'Foto de ' + name}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{name.slice(0, 1).toLocaleUpperCase('pt-BR')}</span>
      )}
    </span>
  );
}
