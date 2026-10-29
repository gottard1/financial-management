import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateIncome } from './calculateIncome.js';
import { calculateCompensation, sumRestrictedBenefits } from './calculateCompensation.js';

test('legacy income configs preserve their base result with zero additions', () => {
  const config = { type: 'clt', gross: 600000 };
  const base = calculateIncome(config);
  const result = calculateCompensation(config);
  assert.equal(result.net, base.net);
  assert.equal(result.baseNet, base.net);
  assert.equal(result.cashExtras, 0);
  assert.equal(result.restrictedBenefits, 0);
  assert.equal(result.totalResources, base.net);
  assert.deepEqual(result.details, base.details);
});

test('already net cash bonus and extra income enter cash income exactly once', () => {
  const result = calculateCompensation({
    type: 'net',
    gross: 200000,
    cashBonus: 50000,
    otherCashIncome: 10000,
  });
  assert.equal(result.baseNet, 200000);
  assert.equal(result.cashExtras, 60000);
  assert.equal(result.net, 260000);
  assert.equal(result.totalResources, 260000);
});

test('restricted VA and VR never enter net cash or influence base tax calculation', () => {
  const config = {
    type: 'clt',
    gross: 600000,
    cashBonus: 50000,
    foodAllowance: 70000,
    mealAllowance: 30000,
  };
  const base = calculateIncome(config);
  const result = calculateCompensation(config);
  assert.equal(result.inss, base.inss);
  assert.equal(result.irrf, base.irrf);
  assert.equal(result.net, base.net + 50000);
  assert.equal(result.restrictedBenefits, 100000);
  assert.equal(result.totalResources, result.net + 100000);
});

test('empty config stays zero and a cash deficit is not hidden by restricted benefits', () => {
  assert.equal(calculateCompensation().totalResources, 0);
  const result = calculateCompensation({
    type: 'net',
    gross: 100,
    otherDeductions: 200,
    foodAllowance: 50000,
  });
  assert.equal(result.net, -100);
  assert.equal(result.totalResources, 49900);
});

test('rejects malformed monetary additions and totals that exceed safe integer cents', () => {
  for (const field of ['cashBonus', 'otherCashIncome', 'foodAllowance', 'mealAllowance']) {
    for (const value of [-1, 0.1, NaN, Infinity, '100', null])
      assert.throws(() => calculateCompensation({ [field]: value }));
  }
  assert.throws(
    () => calculateCompensation({ cashBonus: Number.MAX_SAFE_INTEGER, otherCashIncome: 1 }),
    /limite/,
  );
  assert.throws(
    () => calculateCompensation({ foodAllowance: Number.MAX_SAFE_INTEGER, mealAllowance: 1 }),
    /limite/,
  );
  assert.throws(
    () => calculateCompensation({ gross: Number.MAX_SAFE_INTEGER, cashBonus: 1 }),
    /limite/,
  );
  assert.throws(
    () => calculateCompensation({ gross: Number.MAX_SAFE_INTEGER, foodAllowance: 1 }),
    /limite/,
  );
});

test('benefit aggregation isolates selected people and months and does not recompute taxes', () => {
  const months = {
    '2026-10': [
      { foodAllowance: 50000, mealAllowance: 20000 },
      { foodAllowance: 30000, mealAllowance: 10000 },
    ],
    '2026-11': [{ foodAllowance: 90000 }, null],
  };
  assert.deepEqual(sumRestrictedBenefits(months['2026-10']), {
    foodAllowance: 80000,
    mealAllowance: 30000,
    total: 110000,
  });
  assert.deepEqual(sumRestrictedBenefits([months['2026-10'][0]]), {
    foodAllowance: 50000,
    mealAllowance: 20000,
    total: 70000,
  });
  assert.deepEqual(sumRestrictedBenefits(months['2026-11']), {
    foodAllowance: 90000,
    mealAllowance: 0,
    total: 90000,
  });
  assert.deepEqual(sumRestrictedBenefits([null, undefined, {}]), {
    foodAllowance: 0,
    mealAllowance: 0,
    total: 0,
  });
  assert.deepEqual(
    sumRestrictedBenefits([{ type: 'not-a-real-tax-profile', gross: -10, foodAllowance: 100 }]),
    { foodAllowance: 100, mealAllowance: 0, total: 100 },
  );
});

test('benefit aggregates validate cents and aggregate overflow', () => {
  assert.throws(() => sumRestrictedBenefits({}));
  assert.throws(() => sumRestrictedBenefits(['wrong']));
  assert.throws(() => sumRestrictedBenefits([{ foodAllowance: -1 }]));
  assert.throws(() => sumRestrictedBenefits([{ mealAllowance: null }]));
  assert.throws(
    () => sumRestrictedBenefits([{ foodAllowance: Number.MAX_SAFE_INTEGER }, { foodAllowance: 1 }]),
    /limite/,
  );
  assert.throws(
    () => sumRestrictedBenefits([{ foodAllowance: Number.MAX_SAFE_INTEGER, mealAllowance: 1 }]),
    /limite/,
  );
});
