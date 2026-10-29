import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateIncome } from './calculateIncome.js';

test('2026 INSS progressively taxes each band and stops at the ceiling', () => {
  for (const [gross, expected] of [
    [0, 0],
    [162100, 12158],
    [290284, 23694],
    [435427, 41111],
    [847555, 98809],
    [1000000, 98809],
  ]) {
    assert.equal(calculateIncome({ type: 'clt', gross }).inss, expected);
  }
  assert.equal(calculateIncome({ type: 'clt', gross: 162101 }).inss, 12158);
});

test('2026 IRRF exemption through 5000 uses taxable gross, not salary after INSS', () => {
  for (const gross of [162100, 300000, 450000, 499999, 500000])
    assert.equal(calculateIncome({ type: 'clt', gross }).irrf, 0);
  const result = calculateIncome({ type: 'clt', gross: 500000 });
  assert.equal(result.net, 449849);
  assert.ok(result.details.some((line) => line.includes('desconto simplificado')));
});

test('6000 CLT example applies legal INSS deduction and intermediate reduction', () => {
  const result = calculateIncome({ type: 'clt', gross: 600000 });
  assert.equal(result.inss, 64151);
  assert.equal(result.irrf, 38510);
  assert.equal(result.net, 497339);
  assert.ok(result.details.some((line) => line.includes('179,75')));
  assert.ok(result.details.some((line) => line.includes('deduções legais')));
});

test('reduction boundary at 7350 and ordinary table above it are continuous in cents', () => {
  assert.equal(calculateIncome({ type: 'clt', gross: 735000 }).irrf, 88413);
  assert.equal(calculateIncome({ type: 'clt', gross: 735001 }).irrf, 88413);
  assert.equal(calculateIncome({ type: 'clt', gross: 1000000 }).irrf, 156955);
  for (const gross of [499999, 500000, 500001, 734999, 735000, 735001]) {
    const result = calculateIncome({ type: 'clt', gross });
    assert.ok(result.irrf >= 0 && Number.isInteger(result.irrf));
  }
});

test('dependents reduce legal tax base; other financial discounts do not', () => {
  const baseline = calculateIncome({ type: 'clt', gross: 600000 });
  const dependent = calculateIncome({ type: 'clt', gross: 600000, dependents: 1 });
  assert.equal(dependent.irrf, 33297);
  assert.ok(dependent.irrf < baseline.irrf);
  const cashDiscount = calculateIncome({ type: 'clt', gross: 600000, otherDeductions: 10000 });
  assert.equal(cashDiscount.irrf, baseline.irrf);
  assert.equal(cashDiscount.net, baseline.net - 10000);
});

test('MEI uses the fixed activity DAS and never estimates personal IRPF', () => {
  for (const [meiActivity, expectedDas] of [
    ['commerce', 8205],
    ['services', 8605],
    ['mixed', 8705],
  ]) {
    const result = calculateIncome({
      type: 'mei',
      gross: 400000,
      meiActivity,
      otherDeductions: 10000,
    });
    assert.equal(result.inss + result.tax, expectedDas);
    assert.equal(result.irrf, 0);
    assert.equal(result.net, 400000 - expectedDas - 10000);
    assert.match(result.details.join(' '), /Não determina lucro/);
  }
  assert.equal(calculateIncome({ type: 'mei', gross: 0, meiActivity: 'services' }).net, -8605);
});

test('PJ uses configured rate and separately describes fixed and other costs', () => {
  const result = calculateIncome({
    type: 'pj',
    gross: 1000000,
    pjTaxPercent: 6,
    pjFixedCosts: 30000,
    otherDeductions: 20000,
  });
  assert.equal(result.tax, 60000);
  assert.equal(result.inss, 0);
  assert.equal(result.irrf, 0);
  assert.equal(result.otherDeductions, 50000);
  assert.equal(result.net, 890000);
  assert.equal(calculateIncome({ type: 'pj', gross: 101, pjTaxPercent: 50 }).tax, 51);
  assert.equal(calculateIncome({ type: 'pj', gross: 1000000, pjTaxPercent: 6.125 }).tax, 61250);
});

test('already net income is not taxed again and deficits remain visible', () => {
  const result = calculateIncome({ type: 'net', gross: 100000, otherDeductions: 1000 });
  assert.equal(result.net, 99000);
  assert.equal(result.inss + result.irrf + result.tax, 0);
  assert.equal(calculateIncome().net, 0);
  assert.equal(calculateIncome({ type: 'net', gross: 100, otherDeductions: 200 }).net, -100);
});

test('all output types reconcile without double-counting taxes', () => {
  for (const type of ['clt', 'mei', 'pj', 'net']) {
    const result = calculateIncome({
      type,
      gross: 800000,
      otherDeductions: 11111,
      pjTaxPercent: 9.2,
      pjFixedCosts: 22222,
    });
    assert.equal(
      result.net,
      result.gross - result.inss - result.irrf - result.tax - result.otherDeductions,
    );
    assert.ok(result.details.length > 0);
    assert.ok(result.reference.length > 0);
  }
});

test('invalid inputs are rejected', () => {
  for (const gross of [-1, 0.5, Infinity, NaN, '1000'])
    assert.throws(() => calculateIncome({ gross }));
  for (const dependents of [-1, 1.5, 101, NaN])
    assert.throws(() => calculateIncome({ type: 'clt', dependents }));
  for (const pjTaxPercent of [-1, 101, NaN, '6'])
    assert.throws(() => calculateIncome({ type: 'pj', pjTaxPercent }));
  assert.throws(() => calculateIncome({ type: 'other' }));
  assert.throws(() => calculateIncome({ type: 'mei', meiActivity: 'trucker' }));
  assert.throws(() => calculateIncome({ type: 'pj', pjFixedCosts: -1 }));
  assert.throws(() =>
    calculateIncome({ type: 'pj', otherDeductions: Number.MAX_SAFE_INTEGER, pjFixedCosts: 1 }),
  );
});
