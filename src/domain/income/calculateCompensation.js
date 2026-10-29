import { calculateIncome } from './calculateIncome.js';

function validCents(value, name) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`${name} deve ser um valor não negativo em centavos.`);
  return value;
}

function sum(values) {
  const value = Number(values.reduce((total, item) => total + BigInt(item), 0n));
  if (!Number.isSafeInteger(value))
    throw new Error('O total da remuneração ultrapassa o limite permitido.');
  return value;
}

/** Cash additions are already net; restricted VA/VR never change cash income or split weights. */
export function calculateCompensation(config = {}) {
  const base = calculateIncome(config);
  const cashBonus = validCents(
    config.cashBonus === undefined ? 0 : config.cashBonus,
    'Bonificação líquida',
  );
  const otherCashIncome = validCents(
    config.otherCashIncome === undefined ? 0 : config.otherCashIncome,
    'Outras entradas líquidas',
  );
  const { total: restrictedBenefits } = sumRestrictedBenefits([config]);
  const cashExtras = sum([cashBonus, otherCashIncome]);
  const net = sum([base.net, cashExtras]);
  return {
    ...base,
    baseNet: base.net,
    cashExtras,
    net,
    restrictedBenefits,
    totalResources: sum([net, restrictedBenefits]),
  };
}

/** Aggregate selected people/month configs without recalculating income or taxes. */
export function sumRestrictedBenefits(configs = []) {
  if (!Array.isArray(configs)) throw new Error('Informe uma lista de configurações de benefícios.');
  const foodValues = [];
  const mealValues = [];
  for (const config of configs) {
    if (config == null) continue;
    if (typeof config !== 'object' || Array.isArray(config))
      throw new Error('Configuração de benefícios inválida.');
    foodValues.push(
      validCents(config.foodAllowance === undefined ? 0 : config.foodAllowance, 'Vale-alimentação'),
    );
    mealValues.push(
      validCents(config.mealAllowance === undefined ? 0 : config.mealAllowance, 'Vale-refeição'),
    );
  }
  const foodAllowance = sum(foodValues);
  const mealAllowance = sum(mealValues);
  return { foodAllowance, mealAllowance, total: sum([foodAllowance, mealAllowance]) };
}
