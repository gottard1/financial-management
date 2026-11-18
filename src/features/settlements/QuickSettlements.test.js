import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { summarize } from '../../domain/expenses/expenseCalculations.js';
import { applySettlements } from '../../domain/settlements/settlementCalculations.js';

let server, QuickSettlements;
before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    appType: 'custom',
  });
  ({ QuickSettlements } = await server.ssrLoadModule(
    '/src/features/settlements/QuickSettlements.jsx',
  ));
});
after(async () => {
  await server?.close();
});

const members = ['a', 'b', 'c'];
const stats = summarize(
  [
    {
      id: 'coffee',
      description: 'Café',
      amount: 2602,
      payer: 'b',
      participants: ['a'],
      split: 'equal',
      status: 'paid',
    },
    {
      id: 'hotdog',
      description: 'Cachorro-quente',
      amount: 1600,
      payer: 'a',
      participants: ['b'],
      split: 'equal',
      status: 'paid',
    },
    {
      id: 'pending',
      description: 'Conta pendente',
      amount: 50000,
      payer: 'b',
      participants: ['a'],
      split: 'equal',
      status: 'pending',
    },
  ],
  {},
  members,
);
const names = { a: 'Marcel', b: 'Duda', c: 'Zenke' };
const render = (extra = {}) =>
  renderToStaticMarkup(
    React.createElement(QuickSettlements, {
      transfers: stats.transfers,
      settlementPairs: stats.settlementPairs,
      nameOf: (id) => names[id],
      receiverId: 'a',
      onReport() {},
      ...extra,
    }),
  );

test('shows pair expenses, the payer, both obligations, compensation and Devolver for the debtor', () => {
  const html = render();
  for (const text of [
    'Marcel',
    'Duda',
    'Café',
    'Cachorro-quente',
    'Quem pagou:',
    '26,02',
    '16,00',
    '10,02',
    'Compensado',
    'Falta devolver:',
    '>Devolver</button>',
  ])
    assert.ok(html.includes(text), text);
  assert.ok(!html.includes('Conta pendente'));
  assert.ok(!html.includes('Já recebi'));
  assert.match(html, /<details class="settlement-details">/);
});

test('receiver, third party, read-only and pending request retain the existing action permissions', () => {
  assert.ok(render({ receiverId: 'b' }).includes('Já recebi'));
  for (const extra of [
    { receiverId: 'b' },
    { receiverId: 'c' },
    { readOnly: true },
    { pendingReports: [{ from: 'a', to: 'b' }] },
  ])
    assert.ok(!render(extra).includes('>Devolver</button>'));
  assert.ok(
    render({ pendingReports: [{ from: 'a', to: 'b' }] }).includes('Aguardando confirmação'),
  );
});

test('partial confirmation shows remaining amount and its preserved payment in the details', () => {
  const adjusted = applySettlements(
    stats,
    [
      {
        id: 'pix',
        scope: 'group:g',
        from: 'a',
        to: 'b',
        amount: 400,
        date: '2026-11-18',
        referenceMonth: '2026-11',
        note: '',
        status: 'confirmed',
      },
    ],
    members,
  );
  const html = render({ transfers: adjusted.transfers, settlementPairs: adjusted.settlementPairs });
  assert.ok(html.includes('6,02'));
  assert.ok(html.includes('Repasse confirmado: Marcel → Duda, '));
  assert.ok(html.includes('4,00'));
  assert.ok(html.includes('18/11/2026'));
});

test('unreconciled history explains suspension and offers no payment action', () => {
  const html = render({
    transfers: [],
    settlementIssues: [{ first: 'a', second: 'c', reason: 'payment-mismatch' }],
  });
  assert.ok(html.includes('Acerto aguardando revisão'));
  assert.ok(html.includes('histórico foi preservado'));
  assert.ok(html.includes('Marcel e Zenke'));
  assert.ok(!html.includes('>Devolver</button>'));
});
