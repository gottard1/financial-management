import { FieldValue } from 'firebase-admin/firestore';
import { adminServices } from '../server/firebaseAdmin.js';
import { createSharedGroupFinanceHandler, editSharedGroup } from '../server/sharedGroupFinance.js';

export default createSharedGroupFinanceHandler({
  verifyToken: (token) => adminServices().auth.verifyIdToken(token, true),
  execute: (uid, command) =>
    editSharedGroup({
      db: adminServices().db,
      timestamp: () => FieldValue.serverTimestamp(),
      uid,
      command,
    }),
});
