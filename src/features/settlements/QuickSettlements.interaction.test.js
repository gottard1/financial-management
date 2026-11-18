import { after, before, afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { summarize } from '../../domain/expenses/expenseCalculations.js';
import { createPaymentReport } from '../../domain/settlements/paymentReports.js';
import { applySettlements } from '../../domain/settlements/settlementCalculations.js';

let server, dom, createRoot, QuickSettlements, root, container, props, reports;
const globals = ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'];
const descriptors = globals.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
const members = ['marcel', 'duda', 'zenke', 'bonacolsi', 'gabi'];
const names = {
  marcel: 'Marcel',
  duda: 'Duda',
  zenke: 'Zenke',
  bonacolsi: 'Bonacolsi',
  gabi: 'Gabi',
};
const expense = (amount, payer, participants) => ({
  amount,
  payer,
  participants,
  split: 'equal',
  status: 'paid',
});
const stats = summarize(
  [
    expense(2602, 'duda', ['marcel']),
    expense(1600, 'marcel', ['duda']),
    expense(8340, 'zenke', ['marcel']),
    expense(1700, 'marcel', ['zenke']),
    expense(5400, 'marcel', ['bonacolsi', 'gabi']),
  ],
  {},
  members,
);

before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  for (const [name, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    IS_REACT_ACT_ENVIRONMENT: true,
  }))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  ({ createRoot } = await import('react-dom/client'));
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    appType: 'custom',
  });
  ({ QuickSettlements } = await server.ssrLoadModule(
    '/src/features/settlements/QuickSettlements.jsx',
  ));
});
beforeEach(async () => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  reports = [];
  props = {
    transfers: stats.transfers,
    settlementPairs: stats.settlementPairs,
    nameOf: (id) => names[id],
    scope: 'group:g',
    month: '2026-11',
    receiverId: 'marcel',
    onReport: async (transfer) =>
      reports.push(
        createPaymentReport(
          {
            id: `report-${reports.length}`,
            scope: 'group:g',
            month: '2026-11',
            transfer,
            date: '2026-11-18',
          },
          'marcel',
          stats,
          members,
          reports,
        ),
      ),
  };
  await render();
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
});
after(async () => {
  await server?.close();
  dom?.window.close();
  globals.forEach((name, index) =>
    descriptors[index]
      ? Object.defineProperty(globalThis, name, descriptors[index])
      : delete globalThis[name],
  );
});
async function render(extra = {}) {
  props = { ...props, ...extra };
  await act(() => root.render(React.createElement(QuickSettlements, props)));
}
function buttons(label, parent = container) {
  return [...parent.querySelectorAll('button')].filter((button) => button.textContent === label);
}
async function click(button) {
  assert.ok(button);
  assert.equal(button.disabled, false);
  await act(async () => {
    button.click();
  });
}
async function setAmount(value) {
  const input = container.querySelector('.settlement-return-form input');
  await act(() => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(
      input,
      value,
    );
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}

test('a five-person group opens the correct pair immediately; cancel and switching pairs never submit payments', async () => {
  assert.equal(buttons('Devolver').length, 2);
  await click(buttons('Devolver')[0]);
  let form = container.querySelector('.settlement-return-form');
  assert.match(form.getAttribute('aria-label'), /Marcel para Duda/);
  assert.equal(form.querySelector('input').value, '10,02');
  assert.equal(document.activeElement, form.querySelector('input'));
  assert.equal(reports.length, 0);
  await click(buttons('Cancelar', form)[0]);
  assert.equal(container.querySelector('.settlement-return-form'), null);
  await click(buttons('Devolver')[1]);
  form = container.querySelector('.settlement-return-form');
  assert.match(form.getAttribute('aria-label'), /Marcel para Zenke/);
  assert.equal(form.querySelector('input').value, '66,40');
  assert.equal(reports.length, 0);
});

for (const size of [2, 3, 4]) {
  test(`Devolver also opens and submits for a group of ${size} people`, async () => {
    const ids = members.slice(0, size);
    const groupStats = summarize([expense(2000, 'duda', ['marcel'])], {}, ids);
    await render({
      transfers: groupStats.transfers,
      settlementPairs: groupStats.settlementPairs,
      onReport: async (transfer) =>
        reports.push(
          createPaymentReport(
            {
              id: 'payment',
              scope: 'group:g',
              month: '2026-11',
              transfer,
              date: '2026-11-18',
            },
            'marcel',
            groupStats,
            ids,
          ),
        ),
    });
    await click(buttons('Devolver')[0]);
    assert.ok(container.querySelector('.settlement-return-form'));
    assert.equal(reports.length, 0);
    await click(buttons('Informar devolução')[0]);
    assert.equal(reports[0].amount, 2000);
    assert.equal(reports[0].to, 'duda');
    assert.equal(reports[0].status, 'pending');
  });
}

test('submitting the form reports the selected pair and visibly explains receiver confirmation', async () => {
  await click(buttons('Devolver')[1]);
  await click(buttons('Informar devolução')[0]);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].to, 'zenke');
  assert.equal(reports[0].amount, 6640);
  assert.equal(reports[0].status, 'pending');
  assert.equal(container.querySelector('.settlement-return-form'), null);
  assert.match(
    container.querySelector('[role="status"]').textContent,
    /Zenke.*informada.*confirmar/s,
  );
  assert.equal(stats.transfers[1].amount, 6640);
});

test('partial report lowers only its pair after confirmation and preserves other transfers', async () => {
  await click(buttons('Devolver')[0]);
  await setAmount('4,00');
  await click(buttons('Informar devolução')[0]);
  assert.equal(reports[0].amount, 400);
  const adjusted = applySettlements(
    stats,
    [{ ...reports[0], referenceMonth: '2026-11', note: '', status: 'confirmed' }],
    members,
  );
  assert.equal(adjusted.transfers[0].amount, 602);
  assert.deepEqual(adjusted.transfers.slice(1), stats.transfers.slice(1));
});

test('API failure remains visible beside the clicked pair and allows retrying', async () => {
  let attempts = 0;
  await render({
    onReport: async () => {
      attempts++;
      throw new Error('Quem recebe precisa aceitar o convite e vincular uma conta ao grupo.');
    },
  });
  await click(buttons('Devolver')[0]);
  await click(buttons('Informar devolução')[0]);
  const form = container.querySelector('.settlement-return-form');
  assert.match(form.querySelector('[role="alert"]').textContent, /aceitar o convite/);
  assert.equal(form.querySelector('input').value, '10,02');
  await click(buttons('Informar devolução', form)[0]);
  assert.equal(attempts, 2);
  assert.equal(reports.length, 0);
});

test('zero or excessive amounts cannot report, and pending or read-only changes hide the form', async () => {
  await click(buttons('Devolver')[0]);
  for (const value of ['0,00', '10,03']) {
    await setAmount(value);
    await click(buttons('Informar devolução')[0]);
    assert.match(
      container.querySelector('.settlement-return-form [role="alert"]').textContent,
      /até.*10,02/,
    );
    assert.equal(reports.length, 0);
  }
  await render({ pendingReports: [{ from: 'marcel', to: 'duda' }] });
  assert.equal(container.querySelector('.settlement-return-form'), null);
  await render({ readOnly: true });
  assert.equal(buttons('Devolver').length, 0);
});

test('repeated submits while the request is pending issue only one report', async () => {
  let complete,
    calls = 0;
  await render({
    onReport: () => {
      calls++;
      return new Promise((resolve) => {
        complete = resolve;
      });
    },
  });
  await click(buttons('Devolver')[0]);
  const form = container.querySelector('.settlement-return-form');
  await click(buttons('Informar devolução')[0]);
  await act(() =>
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })),
  );
  assert.equal(calls, 1);
  assert.equal(buttons('Enviando…')[0].disabled, true);
  await act(async () => {
    complete();
  });
  assert.ok(container.querySelector('[role="status"]'));
});
