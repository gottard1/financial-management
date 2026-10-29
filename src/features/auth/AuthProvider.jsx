import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
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
  'auth/invalid-email': 'Confira o endereço de e-mail informado.',
  'auth/missing-email': 'Informe seu e-mail para continuar.',
  'auth/missing-password': 'Informe sua senha para continuar.',
  'auth/invalid-credential': 'E-mail ou senha incorretos. Confira os dados e tente novamente.',
  'auth/invalid-login-credentials':
    'E-mail ou senha incorretos. Confira os dados e tente novamente.',
  'auth/wrong-password': 'E-mail ou senha incorretos. Confira os dados e tente novamente.',
  'auth/user-not-found': 'E-mail ou senha incorretos. Confira os dados e tente novamente.',
  'auth/email-already-in-use': 'Já existe uma conta com este e-mail. Entre ou recupere sua senha.',
  'auth/weak-password': 'Escolha uma senha mais forte, com pelo menos 6 caracteres.',
  'auth/password-does-not-meet-requirements':
    'A senha não atende aos requisitos configurados. Use uma senha mais forte.',
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
    'Este e-mail já usa outra forma de acesso. Entre pelo método usado no cadastro.',
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
    return onAuthStateChanged(
      auth,
      (nextUser) => {
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
  }, []);
  const signIn = useCallback(
    (email, password) =>
      authenticate(() => signInWithEmailAndPassword(requireAuth(), email.trim(), password)),
    [],
  );
  const signUp = useCallback(
    (email, password) =>
      authenticate(() => createUserWithEmailAndPassword(requireAuth(), email.trim(), password)),
    [],
  );
  const signInGoogle = useCallback(
    () =>
      authenticate(() => {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        return signInWithPopup(requireAuth(), provider);
      }),
    [],
  );
  const resetPassword = useCallback(
    (email) => authenticate(() => sendPasswordResetEmail(requireAuth(), email.trim())),
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
      signIn,
      signUp,
      signInGoogle,
      resetPassword,
      signOut,
      enterLocalMode,
      configError,
    }),
    [
      user,
      loading,
      localMode,
      signIn,
      signUp,
      signInGoogle,
      resetPassword,
      signOut,
      enterLocalMode,
      configError,
    ],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return context;
}
