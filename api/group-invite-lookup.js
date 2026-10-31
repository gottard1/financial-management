import { adminServices } from '../server/firebaseAdmin.js';
import { createGroupInviteLookup } from '../server/groupInviteLookup.js';

export default createGroupInviteLookup({
  verifyToken: (token) => adminServices().auth.verifyIdToken(token, true),
  getGroup: async (id) => {
    const record = await adminServices().db.collection('sharedGroups').doc(id).get();
    return record.exists ? record.data() : null;
  },
  lookupUser: async (email) => {
    try {
      return await adminServices().auth.getUserByEmail(email);
    } catch (error) {
      if (error.code === 'auth/user-not-found') return null;
      throw error;
    }
  },
  lookupProfileName: async (uid) => {
    const people = await adminServices()
      .db.collection('users')
      .doc(uid)
      .collection('finance')
      .where('kind', '==', 'people')
      .select('payload')
      .get();
    const records = people.docs.map((doc) => JSON.parse(doc.data().payload));
    const person =
      records.find((item) => item.accountUid === uid) ||
      records.find((item) => item.id === 'person-0' && !item.accountUid);
    return person?.name === 'Você' ? null : person?.name;
  },
  consumeLookup: async (uid) => {
    const db = adminServices().db;
    const ref = db.collection('invitationLookupLimits').doc(uid);
    return db.runTransaction(async (transaction) => {
      const current = await transaction.get(ref);
      const previous = current.data();
      const now = Date.now();
      const active = previous && now - previous.windowStart < 600000;
      const count = active ? previous.count : 0;
      if (count >= 30) return false;
      transaction.set(ref, { windowStart: active ? previous.windowStart : now, count: count + 1 });
      return true;
    });
  },
});
