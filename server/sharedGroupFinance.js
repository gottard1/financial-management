import { randomUUID } from 'node:crypto';
import { encodeFinance, decodeFinance } from '../src/domain/budget/financeCloudCodec.js';
import { projectSharedGroup } from '../src/domain/groups/groupSharing.js';
import {
  applySharedGroupChanges,
  copySharedRecurring,
} from '../src/domain/groups/sharedGroupEditing.js';
import { prepareEmailInvitation } from '../src/domain/groups/emailInvitation.js';
import { splitExpense } from '../src/domain/expenses/expenseCalculations.js';
import { activeGroupMembers } from '../src/domain/groups/groupMembers.js';

const problem = (status, message) => Object.assign(new Error(message), { status });

/** Membership, private records and public projection are checked and committed atomically. */
export async function editSharedGroup({ db, timestamp, uid, command }) {
  const ref = db.collection('sharedGroups').doc(command.groupId);
  const newPersonId = randomUUID();
  return db.runTransaction(async (transaction) => {
    const record = await transaction.get(ref);
    const group = record.data();
    if (!record.exists || group.deleted) throw problem(403, 'Grupo indisponível.');
    if (group.adminUid !== uid) {
      const membership = (
        await transaction.get(db.collection('groupMemberships').doc(`${uid}_${command.groupId}`))
      ).data();
      if (
        !membership ||
        membership.uid !== uid ||
        membership.groupId !== command.groupId ||
        !(group.snapshot.activeMemberIds || group.snapshot.people.map((item) => item.id)).includes(
          membership.personId,
        )
      )
        throw problem(403, 'Sua conta não tem permissão para editar este grupo.');
      const invite = (
        await transaction.get(db.collection('groupInvites').doc(membership.inviteId))
      ).data();
      if (
        !invite ||
        invite.status !== 'accepted' ||
        invite.acceptedUid !== uid ||
        invite.groupId !== command.groupId ||
        invite.personId !== membership.personId
      )
        throw problem(403, 'Seu acesso ao grupo foi revogado.');
    }
    if (group.revision !== command.revision)
      throw problem(
        409,
        'O grupo mudou em outra sessão. Confira os dados atualizados e tente novamente.',
      );
    const financeRef = db.collection('users').doc(group.adminUid).collection('finance');
    const records = (await transaction.get(financeRef)).docs.map((item) => ({
      ...item.data(),
      id: item.id,
    }));
    const finance = decodeFinance(records);
    if (!finance) throw problem(409, 'Aguarde o administrador sincronizar os dados financeiros.');
    const groupId = group.snapshot.id;
    let next = finance.data;
    let invitation;
    try {
      if (command.action === 'upsert' || command.action === 'preview') {
        next = applySharedGroupChanges(next, groupId, command.changes);
        if (command.action === 'preview') {
          const change = command.changes[0];
          if (command.changes.length !== 1 || change.kind !== 'expenses')
            throw new Error('Prévia inválida.');
          const expense = next.expenses.find((item) => item.id === change.id);
          return {
            shares: splitExpense(
              expense,
              next.months[expense.date.slice(0, 7)] || {},
              next.groups.find((item) => item.id === groupId).memberIds,
            ),
          };
        }
      } else if (command.action === 'recurring') {
        next = copySharedRecurring(next, groupId, command.month, command.entries);
      } else if (command.action === 'rename') {
        if (group.adminUid !== uid)
          throw problem(403, 'Somente o administrador pode alterar os dados cadastrais do grupo.');
        const name = command.name?.trim();
        if (!name || name.length > 80) throw new Error('Informe um nome de até 80 caracteres.');
        next = {
          ...next,
          groups: next.groups.map((item) => (item.id === groupId ? { ...item, name } : item)),
        };
      } else if (command.action === 'invite') {
        const localGroup = next.groups.find((item) => item.id === groupId);
        if (
          group.adminUid !== uid &&
          (command.personId ||
            next.people.some(
              (person) =>
                localGroup.memberIds.includes(person.id) &&
                person.inviteEmail === command.email?.trim().toLowerCase(),
            ))
        )
          throw problem(
            403,
            'Participantes só podem convidar novos membros, sem alterar vínculos existentes.',
          );
        if (
          command.personId &&
          (!activeGroupMembers(localGroup).includes(command.personId) ||
            command.personId === localGroup.adminPersonId)
        )
          throw new Error('Selecione um participante ativo que não seja o administrador.');
        const prepared = prepareEmailInvitation(next, {
          groupId,
          email: command.email,
          name: command.name,
          personId: command.personId,
          newPersonId,
        });
        const inviteRef = db
          .collection('groupInvites')
          .doc(`${command.groupId}_${prepared.personId}`);
        const existing = (await transaction.get(inviteRef)).data();
        if (existing?.status === 'accepted')
          throw new Error('Este participante já possui acesso ao grupo.');
        next = prepared.data;
        invitation = {
          ref: inviteRef,
          data: {
            groupId: command.groupId,
            personId: prepared.personId,
            email: command.email.trim().toLowerCase(),
            personName: prepared.personName,
            groupName: localGroup.name,
            adminUid: group.adminUid,
            status: 'pending',
            updatedAt: timestamp(),
          },
        };
      } else
        throw problem(
          403,
          'Esta ação é exclusiva do administrador. Exclusões e remoções não são permitidas.',
        );
    } catch (error) {
      throw error.status ? error : problem(400, error.message);
    }
    const encoded = encodeFinance(next);
    const existing = new Map(records.map((item) => [item.id, item]));
    const changes = encoded.records.filter(
      (item) => existing.get(item.id)?.payload !== item.payload,
    );
    if (changes.length > 450) throw problem(400, 'Há alterações demais para uma única gravação.');
    const revision = finance.revision + 1;
    transaction.set(financeRef.doc('state'), {
      schemaVersion: 2,
      revision,
      recordCount: encoded.records.length,
      orders: encoded.orders,
      updatedAt: timestamp(),
    });
    changes.forEach(({ id, ...item }) =>
      transaction.set(financeRef.doc(id), { ...item, revision }),
    );
    const snapshot = projectSharedGroup(next, groupId);
    transaction.update(ref, {
      snapshot,
      revision: group.revision + 1,
      financeRevision: revision,
      updatedAt: timestamp(),
    });
    if (invitation) transaction.set(invitation.ref, invitation.data);
    return { snapshot, revision: group.revision + 1 };
  });
}

export function createSharedGroupFinanceHandler({ verifyToken, execute }) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Use POST.' });
    }
    try {
      const bearer = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
      if (!bearer) throw problem(401, 'Entre com Google para editar o grupo.');
      let token;
      try {
        token = await verifyToken(bearer);
      } catch (error) {
        throw error.status === 503 ? error : problem(401, 'Sua sessão expirou. Entre novamente.');
      }
      if (token.firebase?.sign_in_provider !== 'google.com' || token.email_verified !== true)
        throw problem(403, 'Use uma conta Google com e-mail confirmado.');
      const command = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (Buffer.byteLength(JSON.stringify(command) || '') > 100000)
        throw problem(413, 'Envie menos alterações por vez.');
      if (
        typeof command?.groupId !== 'string' ||
        !command.groupId ||
        command.groupId.length > 300 ||
        command.groupId.includes('/') ||
        !Number.isSafeInteger(command.revision) ||
        command.revision < 1
      )
        throw problem(400, 'Grupo ou revisão inválidos.');
      return res.status(200).json(await execute(token.uid, command));
    } catch (error) {
      return res.status(error instanceof SyntaxError ? 400 : error.status || 500).json({
        error: error.status
          ? error.message
          : 'Não foi possível salvar o grupo. Confira a conexão e tente novamente.',
      });
    }
  };
}
