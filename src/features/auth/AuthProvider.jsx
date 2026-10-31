import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  auth,
  firebaseConfigured,
  firebaseInitializationError,
} from '../../infrastructure/firebase/client.js';

const AuthContext = createContext(null);
const ERRORS = {
  'auth/invalid-credential': 'Não foi possível validar sua conta Google. Tente entrar novamente.',
  'auth/user-disabled':
    'O acesso desta conta está desativado. Entre em contato com quem administra o projeto.',
  'auth/too-many-requests':
    'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.',
  'auth/network-request-failed':
    'Não foi possível conectar. Confira sua internet e tente novamente.',
  'auth/popup-closed-by-user': 'A janela de acesso foi fechada. Tente novamente quando quiser.',
  'auth/cancelled-popup-request':
    'Outra janela de acesso foi aberta. Conclua o acesso na janela mais recente.',
  'auth/popup-blocked':
    'O navegador bloqueou a janela do Google. Permita pop-ups para este site e tente novamente.',
  'auth/operation-not-allowed': 'Este método de acesso ainda não está habilitado no Firebase.',
  'auth/unauthorized-domain':
    'Este endereço do site precisa ser autorizado no Firebase Authentication.',
  'auth/account-exists-with-different-credential':
    'Este e-mail possui um acesso antigo. A administração precisa vincular a conta Google ao mesmo cadastro, preservando seu histórico.',
  'auth/invalid-api-key': 'A configuração do Firebase precisa ser revisada antes de entrar.',
  'auth/app-not-authorized': 'Este site ainda não está autorizado para acessar o projeto Firebase.',
  'auth/configuration-not-found':
    'O Firebase Authentication ainda precisa ser ativado neste projeto.',
  'auth/web-storage-unsupported':
    'Seu navegador está bloqueando o armazenamento necessário para manter a sessão. Revise as permissões do site.',
};
function translatedError(error) {
  return new Error(
    ERRORS[error?.code] || 'Não foi possível concluir o acesso. Tente novamente em instantes.',
  );
}
function requireAuth() {
  if (!auth)
    throw new Error(
      firebaseInitializationError ||
        'O login ainda não foi configurado. Configure o Firebase para continuar.',
    );
  return auth;
}
async function authenticate(operation) {
  try {
    return await operation();
  } catch (error) {
    if (!auth) throw error;
    throw translatedError(error);
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(auth));
  const [localMode, setLocalMode] = useState(false);
  const [configError, setConfigError] = useState(firebaseInitializationError);
  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return undefined;
    }
    let generation = 0;
    const stop = onAuthStateChanged(
      auth,
      async (nextUser) => {
        const session = ++generation;
        if (nextUser) {
          try {
            const token = await nextUser.getIdTokenResult();
            if (session !== generation || auth.currentUser?.uid !== nextUser.uid) return;
            if (token.signInProvider !== 'google.com') {
              await firebaseSignOut(auth);
              setUser(null);
              setLoading(false);
              return;
            }
          } catch {
            if (session === generation) {
              setUser(null);
              setLoading(false);
            }
            return;
          }
        }
        setUser(nextUser);
        setLocalMode(false);
        setLoading(false);
      },
      (error) => {
        setUser(null);
        setLoading(false);
        setConfigError(translatedError(error).message);
      },
    );
    return () => {
      generation += 1;
      stop();
    };
  }, []);
  const signInGoogle = useCallback(
    () =>
      authenticate(() => {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        return signInWithPopup(requireAuth(), provider);
      }),
    [],
  );
  const signOut = useCallback(async () => {
    if (auth) await authenticate(() => firebaseSignOut(auth));
    setLocalMode(false);
    setUser(null);
  }, []);
  const enterLocalMode = useCallback(() => {
    if (!import.meta.env.DEV || firebaseConfigured)
      throw new Error(
        'O modo local está disponível apenas no desenvolvimento sem Firebase configurado.',
      );
    setUser(null);
    setLocalMode(true);
  }, []);
  const value = useMemo(
    () => ({
      user,
      loading,
      localMode,
      signInGoogle,
      signOut,
      enterLocalMode,
      configError,
    }),
    [user, loading, localMode, signInGoogle, signOut, enterLocalMode, configError],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return context;
}
