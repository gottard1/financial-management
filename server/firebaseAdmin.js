import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export function adminServices() {
  let app = getApps().find((item) => item.name === 'invitation-server');
  if (!app) {
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!projectId || !clientEmail || !privateKey) {
      const error = new Error('Os serviços do Firebase ainda não foram configurados no servidor.');
      error.status = 503;
      throw error;
    }
    try {
      app = initializeApp(
        { credential: cert({ projectId, clientEmail, privateKey }) },
        'invitation-server',
      );
    } catch {
      const error = new Error('Confira as credenciais do Firebase Admin no servidor.');
      error.status = 503;
      throw error;
    }
  }
  return { auth: getAuth(app), db: getFirestore(app) };
}
