import React, { useState } from 'react';
import { money, parseMoney } from '../../domain/expenses/expenseCalculations.js';
import { calculateCompensation } from '../../domain/income/calculateCompensation.js';
import { TAX_TABLES_2026 } from '../../domain/income/taxTables2026.js';
import { defaultIncomeConfig } from '../../domain/budget/workspaceCalculations.js';

const numberText = (cents) => (cents / 100).toFixed(2).replace('.', ',');
export function IncomePanel({ data, setData, month, person, notify }) {
  const saved = {
    ...defaultIncomeConfig(data.months[month]?.[person] || 0),
    ...(data.incomeConfigs[month]?.[person] || {}),
  };
  const [form, setForm] = useState({
    ...saved,
    gross: numberText(saved.gross),
    otherDeductions: numberText(saved.otherDeductions),
    pjFixedCosts: numberText(saved.pjFixedCosts),
    cashBonus: numberText(saved.cashBonus),
    otherCashIncome: numberText(saved.otherCashIncome),
    foodAllowance: numberText(saved.foodAllowance),
    mealAllowance: numberText(saved.mealAllowance),
  });
  const [error, setError] = useState('');
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  let result = null,
    previewError = '';
  const config = () => ({
    ...form,
    gross: parseMoney(form.gross),
    otherDeductions: parseMoney(form.otherDeductions),
    pjFixedCosts: parseMoney(form.pjFixedCosts),
    cashBonus: parseMoney(form.cashBonus),
    otherCashIncome: parseMoney(form.otherCashIncome),
    foodAllowance: parseMoney(form.foodAllowance),
    mealAllowance: parseMoney(form.mealAllowance),
    dependents: Number(form.dependents),
    pjTaxPercent: Number(form.pjTaxPercent),
  });
  try {
    result = calculateCompensation(config());
  } catch (err) {
    previewError = err.message;
  }
  function save(e) {
    e.preventDefault();
    try {
      const c = config(),
        r = calculateCompensation(c);
      if (r.net < 0)
        throw Error('Os descontos excedem a renda. Revise os valores antes de salvar.');
      setData((d) => {
        const incomes = { ...(d.months[month] || {}) };
        incomes[person] = r.net;
        const configs = { ...(d.incomeConfigs[month] || {}) };
        configs[person] = c;
        return {
          ...d,
          months: { ...d.months, [month]: incomes },
          incomeConfigs: { ...d.incomeConfigs, [month]: configs },
        };
      });
      setError('');
      notify(
        'Renda e benefícios atualizados. Apenas a renda em dinheiro entra no orçamento e no rateio.',
      );
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <section className="panel income-panel">
      <p className="eyebrow">INFORMAÇÕES FINANCEIRAS DO PERFIL</p>
      <h2>Renda e benefícios</h2>
      <p className="muted section-intro">
        Configure sua renda de {month.split('-').reverse().join('/')}. O dinheiro disponível
        alimenta o orçamento e a divisão proporcional; VA e VR ficam separados.
      </p>
      <form className="income-form" onSubmit={save}>
        <fieldset className="form-section">
          <legend>1. Como você recebe?</legend>
          <div className="income-type-grid">
            {[
              ['net', 'Líquido', 'Já sei quanto recebo'],
              ['clt', 'CLT', 'Salário bruto → líquido'],
              ['mei', 'MEI', 'Receita menos DAS'],
              ['pj', 'Outro PJ', 'Tributos configuráveis'],
            ].map(([id, label, subtitle]) => (
              <button
                type="button"
                key={id}
                className={'income-type-option ' + (form.type === id ? 'active' : '')}
                aria-pressed={form.type === id}
                onClick={() => set('type', id)}
              >
                <strong>{label}</strong>
                <small>{subtitle}</small>
              </button>
            ))}
          </div>
        </fieldset>
        <div className="form-grid">
          <label className="field">
            {form.type === 'net'
              ? 'Renda já líquida (R$)'
              : form.type === 'clt'
                ? 'Salário bruto mensal (R$)'
                : 'Receita bruta do mês (R$)'}
            <input
              required
              inputMode="decimal"
              value={form.gross}
              onChange={(e) => set('gross', e.target.value)}
            />
            <small>Não inclua aqui os adicionais e benefícios informados abaixo.</small>
          </label>
          <label className="field">
            Outros descontos / custos (R$)
            <input
              required
              inputMode="decimal"
              value={form.otherDeductions}
              onChange={(e) => set('otherDeductions', e.target.value)}
            />
            <small>
              {form.type === 'clt'
                ? 'Ex.: vale-transporte, plano de saúde e consignado. Não abatem automaticamente a base do IR.'
                : 'Valores adicionais descontados da receita.'}
            </small>
          </label>
          {form.type === 'clt' && (
            <label className="field">
              Dependentes para IRRF
              <input
                type="number"
                min="0"
                max="99"
                step="1"
                required
                value={form.dependents}
                onChange={(e) => set('dependents', e.target.value)}
              />
            </label>
          )}
          {form.type === 'mei' && (
            <label className="field">
              Atividade do MEI
              <select value={form.meiActivity} onChange={(e) => set('meiActivity', e.target.value)}>
                <option value="commerce">Comércio ou indústria</option>
                <option value="services">Serviços</option>
                <option value="mixed">Comércio e serviços</option>
              </select>
              <small>MEI comum. MEI Caminhoneiro não está incluído.</small>
            </label>
          )}
          {form.type === 'pj' && (
            <>
              <label className="field">
                Alíquota efetiva de tributos (%)
                <input
                  required
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={form.pjTaxPercent}
                  onChange={(e) => set('pjTaxPercent', e.target.value)}
                />
                <small>Informe a alíquota aplicável à sua empresa.</small>
              </label>
              <label className="field">
                Custos fixos da empresa (R$)
                <input
                  required
                  inputMode="decimal"
                  value={form.pjFixedCosts}
                  onChange={(e) => set('pjFixedCosts', e.target.value)}
                />
                <small>Ex.: contabilidade. Não repita em outros descontos.</small>
              </label>
            </>
          )}
        </div>
        <fieldset className="form-section">
          <legend>2. Adicionais em dinheiro</legend>
          <p className="section-intro muted">
            Informe valores líquidos já recebidos, sem repetir o que está na renda principal.
          </p>
          <div className="compensation-grid">
            <label className="field">
              Bonificação líquida (R$)
              <input
                required
                inputMode="decimal"
                value={form.cashBonus}
                onChange={(e) => set('cashBonus', e.target.value)}
              />
              <small>Valor que caiu na conta, já após os descontos.</small>
            </label>
            <label className="field">
              Outras entradas líquidas (R$)
              <input
                required
                inputMode="decimal"
                value={form.otherCashIncome}
                onChange={(e) => set('otherCashIncome', e.target.value)}
              />
              <small>Ex.: renda extra já disponível neste mês.</small>
            </label>
          </div>
        </fieldset>
        <fieldset className="form-section">
          <legend>3. Benefícios de alimentação</legend>
          <div className="compensation-grid">
            <label className="field">
              Vale-alimentação — VA (R$)
              <input
                required
                inputMode="decimal"
                value={form.foodAllowance}
                onChange={(e) => set('foodAllowance', e.target.value)}
              />
            </label>
            <label className="field">
              Vale-refeição — VR (R$)
              <input
                required
                inputMode="decimal"
                value={form.mealAllowance}
                onChange={(e) => set('mealAllowance', e.target.value)}
              />
            </label>
          </div>
          <p className="benefits-note">
            VA e VR são benefícios de uso restrito: não entram na renda em dinheiro nem no peso da
            divisão das contas.
          </p>
        </fieldset>
        <div className="compensation-summary" aria-live="polite">
          {result ? (
            <>
              <div className="income-row">
                <span>Renda principal líquida</span>
                <strong>{money(result.baseNet)}</strong>
              </div>
              <div className="income-row">
                <span>Adicionais líquidos</span>
                <strong>+ {money(result.cashExtras)}</strong>
              </div>
              <div className="income-row total">
                <strong>Renda total em dinheiro</strong>
                <strong className={result.net < 0 ? 'metric-negative' : 'metric-positive'}>
                  {money(result.net)}
                </strong>
              </div>
              <div className="income-row">
                <span>VA · separado do dinheiro</span>
                <strong>{money(parseMoney(form.foodAllowance))}</strong>
              </div>
              <div className="income-row">
                <span>VR · separado do dinheiro</span>
                <strong>{money(parseMoney(form.mealAllowance))}</strong>
              </div>
              <div className="income-row">
                <span>Total em benefícios restritos</span>
                <strong>{money(result.restrictedBenefits)}</strong>
              </div>
            </>
          ) : (
            <p role="status">{previewError}</p>
          )}
        </div>
        {form.type !== 'net' && !month.startsWith(String(TAX_TABLES_2026.year)) && (
          <p className="notice warning">
            Mês fora de {TAX_TABLES_2026.year}: a estimativa tributária usa as tabelas desse ano.
          </p>
        )}
        <details className="tax-details">
          <summary>Ver descontos e cálculo</summary>
          <div className="tax-details-content">
            <div className="income-breakdown">
              {result ? (
                <>
                  <div className="income-row">
                    <span>{form.type === 'net' ? 'Renda informada' : 'Valor bruto'}</span>
                    <strong>{money(result.gross)}</strong>
                  </div>
                  {result.inss > 0 && (
                    <div className="income-row">
                      <span>
                        {form.type === 'mei' ? 'INSS incluído no DAS' : 'INSS progressivo'}
                      </span>
                      <span>− {money(result.inss)}</span>
                    </div>
                  )}
                  {result.irrf > 0 && (
                    <div className="income-row">
                      <span>IRRF após redução de 2026</span>
                      <span>− {money(result.irrf)}</span>
                    </div>
                  )}
                  {result.tax > 0 && (
                    <div className="income-row">
                      <span>
                        {form.type === 'mei'
                          ? 'ICMS / ISS incluídos no DAS'
                          : 'Tributos informados'}
                      </span>
                      <span>− {money(result.tax)}</span>
                    </div>
                  )}
                  {result.otherDeductions > 0 && (
                    <div className="income-row">
                      <span>Outros descontos e custos</span>
                      <span>− {money(result.otherDeductions)}</span>
                    </div>
                  )}
                  <div className="income-row total">
                    <strong>Renda principal líquida</strong>
                    <strong className={result.baseNet < 0 ? 'metric-negative' : 'metric-positive'}>
                      {money(result.baseNet)}
                    </strong>
                  </div>
                  <ul>
                    {result.details.map((detail, i) => (
                      <li key={i}>{detail}</li>
                    ))}
                  </ul>
                  <p>
                    Adicionais em dinheiro são valores já líquidos. A tributação da bonificação
                    depende da natureza do pagamento e não é recalculada aqui. Não some novamente um
                    adicional já incluído na renda principal.
                  </p>
                  <p>
                    VA e VR são registrados como benefícios de uso restrito, sem conversão
                    automática para dinheiro ou desconto de despesas.
                  </p>
                </>
              ) : (
                <p role="status">{previewError}</p>
              )}
            </div>
            {form.type !== 'net' && (
              <div className="notice warning">
                <div>
                  <strong>Estimativa com referência em 2026.</strong>
                  <p>
                    {form.type === 'clt'
                      ? 'Salário mensal regular com um vínculo. Não inclui férias, 13º, horas extras ou particularidades da folha. FGTS não é desconto do salário.'
                      : form.type === 'mei'
                        ? 'O DAS é fixo mesmo sem faturamento. Receita menos DAS e custos é um saldo de caixa; não calcula o IRPF do titular nem verifica seu enquadramento no MEI.'
                        : 'PJ não possui um desconto único. A alíquota é informada por você; pró-labore, INSS e IRPF não são calculados automaticamente.'}
                  </p>
                  {!month.startsWith('2026') && (
                    <p>
                      <strong>
                        O mês escolhido está fora de 2026. Estas tabelas não representam esse ano.
                      </strong>
                    </p>
                  )}
                  <a
                    href={
                      form.type === 'mei' ? TAX_TABLES_2026.sources.mei : TAX_TABLES_2026.sources.ir
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    {form.type === 'mei' ? 'DAS-MEI oficial ↗' : 'Tabelas oficiais de IRPF ↗'}
                  </a>
                  {' · '}
                  <a href={TAX_TABLES_2026.sources.inss} target="_blank" rel="noreferrer">
                    INSS ↗
                  </a>
                </div>
              </div>
            )}
          </div>
        </details>
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="button primary">Salvar renda e benefícios do mês</button>
        </div>
      </form>
    </section>
  );
}
