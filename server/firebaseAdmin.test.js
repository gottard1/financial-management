import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { deleteApp, getApps } from 'firebase-admin/app';
import { adminServices } from './firebaseAdmin.js';

test('server accepts escaped PEM newlines and reports missing or invalid configuration without exposing keys', async () => {
  const names = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
  const original = Object.fromEntries(names.map((key) => [key, process.env[key]]));
  try {
    for (const key of names) delete process.env[key];
    assert.throws(
      () => adminServices(),
      (error) => error.status === 503,
    );
    process.env.FIREBASE_PROJECT_ID = 'demo-invitation-server';
    process.env.FIREBASE_CLIENT_EMAIL = 'server@demo-invitation-server.iam.gserviceaccount.com';
    process.env.FIREBASE_PRIVATE_KEY = 'invalid-key';
    assert.throws(
      () => adminServices(),
      (error) => error.status === 503 && !error.message.includes('invalid-key'),
    );
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    process.env.FIREBASE_PRIVATE_KEY = privateKey
      .split(String.fromCharCode(10))
      .join(String.fromCharCode(92) + 'n');
    const services = adminServices();
    assert.equal(services.auth.app.name, 'invitation-server');
    assert.equal(adminServices().auth, services.auth);
  } finally {
    const app = getApps().find((item) => item.name === 'invitation-server');
    if (app) await deleteApp(app);
    for (const key of names) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
});
