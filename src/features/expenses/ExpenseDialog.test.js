import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { migrateData } from '../../domain/budget/workspaceCalculations.js';
import { projectSharedGroup } from '../../domain/groups/groupSharing.js';
import { sharedGroupData } from '../../domain/groups/sharedGroupEditing.js';

let server, ExpenseDialog;
before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    appType: 'custom',
  });
  ({ ExpenseDialog } = await server.ssrLoadModule('/src/features/expenses/ExpenseDialog.jsx'));
});
after(async () => {
  await server?.close();
});

function sharedExpense() {
  const data = migrateData({
    ...migrateData(null),
    people: [
      { id: 'a', name: 'Ana' },
      { id: 'b', name: 'Bia' },
    ],
    groups: [{ id: 'home', name: 'Casa', memberIds: ['a', 'b'], adminPersonId: 'a' }],
    expenses: [
      {
        id: 'rent',
        description: 'Aluguel',
        amount: 200000,
        category: 'Moradia',
        date: '2026-11-01',
        status: 'paid',
        workspace: 'group:home',
        payer: 'a',
        participants: ['a', 'b'],
        split: 'equal',
      },
    ],
  });
  const snapshot = projectSharedGroup(data, 'home');
  const shared = sharedGroupData(snapshot);
  return { snapshot, data: shared, draft: { ...shared.expenses[0], amount: '2000,00' } };
}
function render(data, draft, preview) {
  return renderToStaticMarkup(
    React.createElement(ExpenseDialog, {
      data,
      draft,
      preview,
      memberIds: ['a', 'b'],
      dialog: { current: null },
      close() {},
      saveExpense() {},
      setDraft() {},
      error: '',
      previewError: '',
    }),
  );
}

test('a participant can render an existing paid shared expense with group and payer controls', () => {
  const { data, draft, snapshot } = sharedExpense();
  assert.equal(snapshot.expenses[0].workspace, undefined);
  const html = render(data, draft, { a: 100000, b: 100000 });
  assert.match(html, /Editar despesa/);
  assert.match(html, /DESPESA DO GRUPO/);
  assert.match(html, /Quem pagou o valor total/);
  assert.match(html, /Assim fica a divisão/);
  assert.equal(snapshot.expenses[0].workspace, undefined);
});

test('a preview for an older participant selection never crashes the expense dialog', () => {
  const { data, draft } = sharedExpense();
  const html = render(data, { ...draft, workspace: 'group:home' }, { a: 200000 });
  assert.match(html, /Editar despesa/);
  assert.doesNotMatch(html, /Assim fica a divisão/);
  assert.match(html, /Atualizando a divisão/);
});
