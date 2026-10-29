/** Official ordinary monthly tables effective in 2026. Money is BRL cents. */
export const TAX_TABLES_2026 = {
  year: 2026,
  sources: {
    ir: 'https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026',
    inss: 'https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal',
    mei: 'https://www8.receita.fazenda.gov.br/simplesnacional/Noticias/NoticiaCompleta.aspx?id=c3b2044c-ff97-432a-b33c-ecf2a3df6dc3',
  },
  inss: {
    // Rates in basis points: 750 = 7.5%.
    bands: [
      { ceiling: 162100, rate: 750 },
      { ceiling: 290284, rate: 900 },
      { ceiling: 435427, rate: 1200 },
      { ceiling: 847555, rate: 1400 },
    ],
  },
  ir: {
    dependentDeduction: 18959,
    simplifiedDeduction: 60720,
    bands: [
      { ceiling: 242880, rate: 0, deduction: 0 },
      { ceiling: 282665, rate: 750, deduction: 18216 },
      { ceiling: 375105, rate: 1500, deduction: 39416 },
      { ceiling: 466468, rate: 2250, deduction: 67549 },
      { ceiling: Infinity, rate: 2750, deduction: 90873 },
    ],
    reduction: {
      fullExemptionGross: 500000,
      partialReductionCeiling: 735000,
      intercept: 97862,
      coefficientNumerator: 133145,
      coefficientDenominator: 1000000,
    },
  },
  mei: {
    inss: 8105,
    activityTaxes: { commerce: 100, services: 500, mixed: 600 },
  },
};
