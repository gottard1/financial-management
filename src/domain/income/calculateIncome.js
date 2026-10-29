import { money } from '../expenses/expenseCalculations.js';
import { TAX_TABLES_2026 as tables } from './taxTables2026.js';

function validMoney(value, name) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`${name} deve ser um valor não negativo em centavos.`);
  return value;
}

function safe(value) {
  const result = Number(value);
  if (!Number.isSafeInteger(result))
    throw new Error('Valor de renda ou desconto acima do limite permitido.');
  return result;
}

function roundRatio(numerator, denominator) {
  return safe((numerator * 2n + denominator) / (denominator * 2n));
}

function percentage(amount, percent) {
  const [coefficient, exponentText = '0'] = String(percent).toLowerCase().split('e');
  const decimals = (coefficient.split('.')[1] || '').length;
  const exponent = Number(exponentText) - decimals;
  let numerator = BigInt(amount) * BigInt(coefficient.replace('.', ''));
  let denominator = 100n;
  if (exponent >= 0) numerator *= 10n ** BigInt(exponent);
  else denominator *= 10n ** BigInt(-exponent);
  return roundRatio(numerator, denominator);
}

function employeeInss(gross) {
  let previous = 0;
  let weighted = 0n;
  for (const { ceiling, rate } of tables.inss.bands) {
    const taxable = Math.max(0, Math.min(gross, ceiling) - previous);
    weighted += BigInt(taxable) * BigInt(rate);
    previous = ceiling;
  }
  return roundRatio(weighted, 10000n);
}

function monthlyIncomeTax(base) {
  const { rate, deduction } = tables.ir.bands.find((band) => base <= band.ceiling);
  return Math.max(0, roundRatio(BigInt(base) * BigInt(rate), 10000n) - deduction);
}

/**
 * Monthly budgeting estimate for ordinary 2026 income, in integer BRL cents.
 * tax is additional tax EXCLUDING inss and irrf, to avoid double counting.
 * Negative net values intentionally expose a deficit; never use them as split weights.
 */
export function calculateIncome({
  type = 'net',
  gross = 0,
  dependents = 0,
  otherDeductions = 0,
  meiActivity = 'services',
  pjTaxPercent = 0,
  pjFixedCosts = 0,
} = {}) {
  validMoney(gross, 'Renda');
  validMoney(otherDeductions, 'Outros descontos');
  if (!Number.isSafeInteger(dependents) || dependents < 0 || dependents > 100)
    throw new Error('Informe de 0 a 100 dependentes.');
  let inss = 0;
  let irrf = 0;
  let tax = 0;
  let deductions = otherDeductions;
  let reference = 'Valor líquido informado pelo usuário; sem recálculo tributário.';
  const details = [];

  if (type === 'clt') {
    inss = employeeInss(gross);
    const legal = safe(BigInt(inss) + BigInt(dependents) * BigInt(tables.ir.dependentDeduction));
    const simplified = tables.ir.simplifiedDeduction;
    const deduction = Math.max(legal, simplified);
    const base = Math.max(0, gross - deduction);
    const beforeReduction = monthlyIncomeTax(base);
    let reduction = 0;
    const rule = tables.ir.reduction;
    if (gross <= rule.fullExemptionGross) reduction = beforeReduction;
    else if (gross < rule.partialReductionCeiling) {
      const denominator = BigInt(rule.coefficientDenominator);
      const numerator =
        BigInt(rule.intercept) * denominator - BigInt(gross) * BigInt(rule.coefficientNumerator);
      reduction = Math.min(beforeReduction, Math.max(0, roundRatio(numerator, denominator)));
    }
    irrf = beforeReduction - reduction;
    details.push(
      `INSS progressivo: ${money(inss)} (teto de contribuição em ${money(tables.inss.bands.at(-1).ceiling)}).`,
    );
    details.push(
      `Base do IRRF: ${money(base)}; ${legal >= simplified ? 'deduções legais' : 'desconto simplificado'} de ${money(deduction)} (alternativa: ${money(legal >= simplified ? simplified : legal)}).`,
    );
    details.push(
      `IRRF da tabela: ${money(beforeReduction)}; redução de ${tables.year}: ${money(reduction)}; IRRF a descontar: ${money(irrf)}.`,
    );
    details.push(
      'Estimativa de salário mensal comum, uma fonte pagadora; sem férias, 13º, benefícios ou ajuste anual. FGTS do empregador não é descontado.',
    );
    reference = `${tables.sources.ir} | ${tables.sources.inss}`;
  } else if (type === 'mei') {
    const taxes = tables.mei.activityTaxes;
    if (!Object.hasOwn(taxes, meiActivity)) throw new Error('Selecione a atividade do MEI.');
    inss = tables.mei.inss;
    tax = taxes[meiActivity];
    details.push(
      `DAS-MEI de ${tables.year}: ${money(inss + tax)} = INSS ${money(inss)} + ICMS/ISS ${money(tax)}.`,
    );
    details.push(
      'Estimativa de caixa: faturamento menos DAS e custos informados. Não determina lucro distribuível, pró-labore ou renda pessoal tributável. Não inclui MEI Caminhoneiro.',
    );
    details.push(
      'O DAS mensal permanece devido mesmo sem faturamento, enquanto o MEI estiver ativo.',
    );
    reference = tables.sources.mei;
  } else if (type === 'pj') {
    if (
      typeof pjTaxPercent !== 'number' ||
      !Number.isFinite(pjTaxPercent) ||
      pjTaxPercent < 0 ||
      pjTaxPercent > 100
    )
      throw new Error('A alíquota PJ deve estar entre 0 e 100%.');
    validMoney(pjFixedCosts, 'Custos fixos PJ');
    tax = percentage(gross, pjTaxPercent);
    deductions = safe(BigInt(otherDeductions) + BigInt(pjFixedCosts));
    details.push(
      `Tributos estimados: ${pjTaxPercent.toLocaleString('pt-BR')}% de ${money(gross)} = ${money(tax)}.`,
    );
    details.push(
      `Custos fixos PJ informados: ${money(pjFixedCosts)}; outros descontos: ${money(otherDeductions)}.`,
    );
    details.push(
      'Estimativa de caixa com alíquota definida por você. Não identifica regime, anexo, fator R, pró-labore, INSS ou IRPF automaticamente.',
    );
    reference =
      'Alíquota e custos informados pelo usuário; não corresponde a uma apuração fiscal automática.';
  } else if (type === 'net') {
    details.push('Renda já líquida: não recalculamos INSS ou imposto de renda.');
  } else {
    throw new Error('Selecione um tipo de renda válido.');
  }

  if (type !== 'pj')
    details.push(
      `Outros descontos financeiros: ${money(otherDeductions)}; não reduzem automaticamente a base do IRRF.`,
    );
  const net = safe(BigInt(gross) - BigInt(inss) - BigInt(irrf) - BigInt(tax) - BigInt(deductions));
  details.push(
    `Disponível estimado: ${money(gross)} − INSS ${money(inss)} − IRRF ${money(irrf)} − outros tributos ${money(tax)} − descontos/custos ${money(deductions)} = ${money(net)}.`,
  );
  if (net < 0)
    details.push(
      'Os descontos superam a entrada: há déficit. Ajuste a renda ou os descontos antes de salvar esta configuração.',
    );
  return { gross, net, inss, irrf, tax, otherDeductions: deductions, details, reference };
}
