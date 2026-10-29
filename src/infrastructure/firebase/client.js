import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim(),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim(),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim(),
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim(),
};
const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim();
const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim();
if (storageBucket) config.storageBucket = storageBucket;
if (messagingSenderId) config.messagingSenderId = messagingSenderId;

export const firebaseConfigured = Boolean(
  config.apiKey && config.authDomain && config.projectId && config.appId,
);
let instance = null;
let initializationError = '';
if (firebaseConfigured) {
  try {
    const app = getApps().some((item) => item.name === '[DEFAULT]')
      ? getApp()
      : initializeApp(config);
    instance = getAuth(app);
    instance.languageCode = 'pt-BR';
  } catch {
    initializationError =
      'Não foi possível iniciar o acesso. Confira a configuração do Firebase e reinicie o site.';
  }
}
export const auth = instance;
export const firebaseInitializationError = initializationError;
