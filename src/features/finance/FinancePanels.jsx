import { MoneyInput, PercentInput } from '../../components/ui/FormattedInput.jsx';
import React, { useState } from 'react';
import { money, parseMoney } from '../../domain/expenses/expenseCalculations.js';
import {
  calculateWorkspace,
  defaultIncomeConfig,
} from '../../domain/budget/workspaceCalculations.js';
import {
  assetSummary,
  reserveBalances,
  dateInMonth,
  cardInvoicePeriod,
  expenseMonth,
  installmentCommitments,
  total,
  monthlyIncomes,
  savingsSuggestions,
  suggestedDistribution,
} from '../../domain/finance/extendedFinance.js';
import { extraCategoryOptions } from '../../domain/expenses/expenseCategories.js';
import { Progress } from '../../components/ui/Progress.jsx';

const amountText = (n) => ((n || 0) / 100).toFixed(2);
const goalOptions = (data, scope) => [
  ['', 'Reserva livre'],
  ...data.goals.filter((g) => g.scope === scope).map((g) => [g.id, g.title]),
];
const moneyField = (name, label = 'Valor (R$)', required = true) => ({
  name,
  label,
  type: 'money',
  required,
});
const dateField = (month) => ({
  name: 'date',
  label: 'Data',
  type: 'date',
  required: true,
  initial: `${month}-01`,
});
const destinationField = (data, scope, month) => ({
  name: 'destinationId',
  label: 'Destino da distribuição (opcional)',
  options: [
    ['', 'Sem classificação'],
    ...(data.plans[scope + '|' + month]?.savingsStrategy?.distribution || []).map((d) => [
      d.id,
      d.name,
    ]),
  ],
});
const noteField = { name: 'note', label: 'Observação', maxLength: 200 };
const labels = {
  opening: 'Saldo inicial',
  deposit: 'Aporte',
  withdrawal: 'Retirada',
  transfer: 'Transferência',
  application: 'Aplicação',
  redemption: 'Resgate',
  yield: 'Rendimento realizado',
  fee: 'Taxa',
  tax: 'Imposto',
};

/** Shared editor persists through the same local/sync or authenticated group adapter. */
function RecordsEditor({
  data,
  setData,
  scope,
  kind,
  title,
  fields,
  notify,
  canDelete = true,
  describe,
  help,
  preview,
}) {
  const [editing, setEditing] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [previewValues, setPreviewValues] = useState(null);
  const rows = (data[kind] || []).filter((r) => r.scope === scope);
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget,
      f = new FormData(form);
    setBusy(true);
    try {
      const record = { ...editing, id: editing?.id || crypto.randomUUID(), scope };
      for (const field of fields) {
        const value = String(f.get(field.name) || '').trim();
        record[field.name] =
          field.type === 'money'
            ? parseMoney(value || '0')
            : field.type === 'number'
              ? Number(value)
              : field.type === 'checkbox'
                ? f.has(field.name)
                : value;
      }
      await setData((current) => ({
        ...current,
        [kind]: [...(current[kind] || []).filter((r) => r.id !== record.id), record],
      }));
      setEditing(null);
      setPreviewValues(null);
      form.reset();
      setError('');
      notify?.('Registro salvo.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel finance-panel">
      <h2>{title}</h2>
      {help && <p className="muted">{help}</p>}
      <form
        key={editing?.id || 'new'}
        onSubmit={save}
        onChange={
          preview
            ? (event) => setPreviewValues(Object.fromEntries(new FormData(event.currentTarget)))
            : undefined
        }
      >
        <div className="form-grid">
          {fields.map((field) => {
            const v = editing?.[field.name] ?? field.initial ?? '';
            const props = {
              name: field.name,
              required: field.required,
              maxLength: field.maxLength || 120,
              disabled: busy,
            };
            return (
              <label
                className={field.type === 'checkbox' ? 'checkbox-label' : 'field'}
                key={field.name}
              >
                {field.type === 'checkbox' && (
                  <input {...props} type="checkbox" defaultChecked={Boolean(v)} />
                )}
                {field.label}
                {field.options ? (
                  <select {...props} defaultValue={v}>
                    {field.options.map((o) => {
                      const [value, label] = Array.isArray(o) ? o : [o, o];
                      return (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                ) : field.type === 'money' ? (
                  <MoneyInput {...props} defaultValue={amountText(v)} />
                ) : (
                  field.type !== 'checkbox' && (
                    <input
                      {...props}
                      type={field.type === 'money' ? 'text' : field.type || 'text'}
                      inputMode={field.type === 'money' ? 'decimal' : undefined}
                      min={field.min}
                      max={field.max}
                      step={field.type === 'number' ? '1' : undefined}
                      defaultValue={field.type === 'money' ? amountText(v) : v}
                    />
                  )
                )}
              </label>
            );
          })}
        </div>
        {preview?.(
          previewValues ||
            Object.fromEntries(
              fields.map((field) => [field.name, editing?.[field.name] ?? field.initial ?? '']),
            ),
        )}
        <div className="form-actions">
          <button className="button primary" disabled={busy}>
            {editing ? 'Salvar alteração' : 'Adicionar'}
          </button>
          {editing && (
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setEditing(null);
                setPreviewValues(null);
                setError('');
              }}
            >
              Cancelar edição
            </button>
          )}
        </div>
      </form>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <ul className="compact-list finance-record-list">
        {rows.map((r) => (
          <li key={r.id}>
            <div>
              <strong>{describe?.(r) || r.name || r.description}</strong>
              {r.note && <p>{r.note}</p>}
            </div>
            <div className="actions">
              <button
                className="button secondary"
                onClick={() => {
                  setEditing(r);
                  setPreviewValues(null);
                  setError('');
                }}
              >
                Editar
              </button>
              {canDelete && (
                <button
                  className="button danger"
                  onClick={async () => {
                    if (
                      !confirm(
                        'Excluir este registro? Use retirada ou resgate para movimentar valores.',
                      )
                    )
                      return;
                    try {
                      await setData((c) => ({
                        ...c,
                        [kind]: c[kind].filter((v) => v.id !== r.id),
                      }));
                      setError('');
                      if (editing?.id === r.id) setEditing(null);
                    } catch (e) {
                      setError(e.message);
                    }
                  }}
                >
                  Excluir
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const dateText = (date) => date.split('-').reverse().join('/');
function CardInvoicePreview({ values, month }) {
  let period,
    error = '';
  try {
    period = cardInvoicePeriod(month, {
      closingDay: Number(values.closingDay),
      dueDay: Number(values.dueDay),
      dueMonthMode: values.dueMonthMode || 'auto',
    });
  } catch (e) {
    error = e.message;
  }
  return (
    <div className="notice card-invoice-preview" role="status">
      <div>
        <strong>
          Prévia da fatura · {values.name || 'Novo cartão'} · mês de fechamento{' '}
          {month.split('-').reverse().join('/')}
        </strong>
        {period ? (
          <>
            <p>
              Fechamento em <strong>{dateText(period.closingDate)}</strong> · vencimento em{' '}
              <strong>{dateText(period.date)}</strong>.
            </p>
            {Number(values.closingDay) > Number(period.closingDate.slice(-2)) && (
              <p>
                Este mês não tem dia {values.closingDay}. O fechamento será no último dia do mês.
              </p>
            )}
            <small>
              No dia do fechamento a compra ainda entra nesta fatura. Depois dele, entra na próxima.
            </small>
          </>
        ) : (
          <p>{error}</p>
        )}
      </div>
    </div>
  );
}

export function FinanceSetupPanel(props) {
  const { data, scope, month } = props;
  const [essential, setEssential] = useState(false),
    [companion, setCompanion] = useState(''),
    [cardId, setCardId] = useState('');
  const expenses = data.expenses.filter(
    (e) =>
      e.workspace === scope &&
      (!essential || e.essential === true) &&
      (!companion || e.companion === companion),
  );
  const cards = (data.cards || []).filter((c) => c.scope === scope);
  const invoices = expenses.filter(
    (e) => e.cardId && expenseMonth(e) === month && (!cardId || e.cardId === cardId),
  );
  return (
    <>
      <RecordsEditor
        {...props}
        kind="cards"
        title="Cartões e faturas"
        fields={[
          { name: 'name', label: 'Nome do cartão', required: true },
          {
            name: 'closingDay',
            label: 'Dia do fechamento',
            type: 'number',
            min: 1,
            max: 31,
            initial: 10,
            required: true,
          },
          {
            name: 'dueDay',
            label: 'Dia do vencimento',
            type: 'number',
            min: 1,
            max: 31,
            initial: 20,
            required: true,
          },
          {
            name: 'dueMonthMode',
            label: 'Mês do vencimento',
            initial: 'auto',
            options: [
              ['auto', 'Automático · manter a regra atual'],
              ['same', 'Mesmo mês do fechamento'],
              ['next', 'Mês seguinte ao fechamento'],
            ],
          },
        ]}
        preview={(values) => <CardInvoicePreview values={values} month={month} />}
        describe={(r) => {
          const period = cardInvoicePeriod(month, r);
          return `${r.name} · fechamento ${dateText(period.closingDate)} · vencimento ${dateText(period.date)}`;
        }}
        help="Configure o fechamento e o vencimento separadamente. No modo automático, um vencimento com dia anterior ou igual ao fechamento fica no mês seguinte. Dias inexistentes usam o último dia do mês. A prévia abaixo usa o mês selecionado; alterar o cartão preserva as faturas já registradas."
      />
      <section className="panel finance-panel">
        <h2>Faturas de {month}</h2>
        <label className="field">
          Cartão
          <select value={cardId} onChange={(e) => setCardId(e.target.value)}>
            <option value="">Todos</option>
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <strong className="amount">{money(total(invoices.map((e) => e.amount)))}</strong>
        <ul className="compact-list finance-record-list">
          {invoices.map((e) => (
            <li key={e.id}>
              {e.description} · compra {e.purchaseDate} · fatura {e.invoiceMonth} · vence {e.date}
              <strong>{money(e.amount)}</strong>
            </li>
          ))}
        </ul>
      </section>
      <RecordsEditor
        {...props}
        kind="events"
        title="Cadastrar eventos"
        fields={[{ name: 'name', label: 'Nome do evento', required: true }]}
        help="Vincule despesas a viagens, shows ou outros eventos pelo formulário de despesa."
      />
      <section className="panel">
        <h2>Despesas por evento · todo o histórico</h2>
        <div className="form-grid">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={essential}
              onChange={(e) => setEssential(e.target.checked)}
            />
            Somente essenciais
          </label>
          <label className="field">
            Com quem
            <select value={companion} onChange={(e) => setCompanion(e.target.value)}>
              <option value="">Todos</option>
              {[
                ...new Set(
                  data.expenses
                    .filter((e) => e.workspace === scope)
                    .map((e) => e.companion)
                    .filter(Boolean),
                ),
              ].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
        {(data.events || [])
          .filter((e) => e.scope === scope)
          .map((event) => {
            const rows = expenses.filter((e) => e.eventId === event.id);
            return (
              <article className="income-breakdown" key={event.id}>
                <h3>
                  {event.name} · {money(total(rows.map((e) => e.amount)))}
                </h3>
                {[...new Set(rows.map((e) => e.category))].map((category) => (
                  <p key={category}>
                    {category}:{' '}
                    {money(total(rows.filter((e) => e.category === category).map((e) => e.amount)))}
                  </p>
                ))}
              </article>
            );
          })}
      </section>
    </>
  );
}

export function IncomeEntriesPanel(props) {
  const { data, setData, scope, month, notify } = props,
    person = scope.slice(7);
  const config =
    data.incomeConfigs[month]?.[person] || defaultIncomeConfig(data.months[month]?.[person] || 0);
  const [mode, setMode] = useState(config.receiptMode || 'supplement'),
    [error, setError] = useState('');
  return (
    <>
      <section className="panel">
        <h2>Renda do mês</h2>
        <p>
          Renda nova integrada: <strong>{money(monthlyIncomes(data, month)[person])}</strong>
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await setData((c) => ({
                ...c,
                incomeConfigs: {
                  ...c.incomeConfigs,
                  [month]: {
                    ...c.incomeConfigs[month],
                    [person]: {
                      ...(c.incomeConfigs[month]?.[person] || config),
                      receiptMode: mode,
                    },
                  },
                },
              }));
              setError('');
              notify?.('Modo de renda salvo somente para este mês.');
            } catch (err) {
              setError(err.message);
            }
          }}
        >
          <label className="field">
            Como integrar perfil e recebimentos?
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="supplement">
                Perfil + recebimentos que ainda não estão no perfil
              </option>
              <option value="profile">
                Somente o perfil · lançamentos servem como detalhamento
              </option>
              <option value="entries">
                Somente recebimentos individuais · substituir o total do perfil neste mês
              </option>
            </select>
          </label>
          <p className="hint">
            Marque receitas já incluídas no perfil para não contá-las novamente. Resgates são
            registrados em Reservas ou Investimentos e ficam fora da renda nova.
          </p>
          <button className="button primary">Salvar integração do mês</button>
        </form>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
      </section>
      <RecordsEditor
        {...props}
        kind="incomeEntries"
        title="Recebimentos individuais"
        fields={[
          dateField(month),
          { name: 'description', label: 'Descrição', required: true },
          {
            name: 'category',
            label: 'Categoria',
            required: true,
            initial: 'Salário',
            options: extraCategoryOptions(data, scope, 'incomeCategories'),
          },
          moneyField('amount'),
          {
            name: 'includedInProfile',
            label: 'Já está incluído na renda do perfil',
            type: 'checkbox',
            initial: true,
          },
        ]}
        describe={(r) =>
          `${r.date} · ${r.description} · ${r.category} · ${money(r.amount)}${r.includedInProfile ? ' · incluído no perfil' : ''}`
        }
        help="Cadastre salário, renda extra ou dividendos. Novas categorias podem ser criadas na aba Categorias. As datas podem pertencer a qualquer mês; a integração usa a data de cada recebimento."
      />
    </>
  );
}

export function ReserveLedgerPanel(props) {
  const { data, scope, month } = props;
  const [asOf, setAsOf] = useState(dateInMonth(month, 31));
  const balances = reserveBalances(data, scope, asOf),
    goals = goalOptions(data, scope);
  return (
    <>
      <section className="panel">
        <h2>Saldos das reservas por data</h2>
        <label className="field">
          Até a data
          <input
            type="date"
            required
            value={asOf}
            onChange={(e) => e.target.value && setAsOf(e.target.value)}
          />
        </label>
        <ul className="compact-list">
          {goals.map(([id, name]) => (
            <li key={id}>
              {name}
              <strong>{money(balances.get(id) || 0)}</strong>
            </li>
          ))}
        </ul>
        <p className="hint">
          Aplicações com origem na reserva transferem seu valor para investimentos. O mesmo valor
          não permanece nos dois saldos.
        </p>
      </section>
      <RecordsEditor
        {...props}
        kind="reserveMovements"
        title="Movimentar reservas"
        fields={[
          {
            name: 'kind',
            label: 'Movimento',
            required: true,
            initial: 'withdrawal',
            options: [
              ['opening', 'Saldo inicial · não altera o fluxo do mês'],
              ['deposit', 'Aporte do caixa'],
              ['withdrawal', 'Retirada para o caixa'],
              ['transfer', 'Transferência entre destinos'],
            ],
          },
          dateField(month),
          moneyField('amount'),
          { name: 'goalId', label: 'Objetivo / origem', options: goals },
          { name: 'toGoalId', label: 'Destino (somente transferência)', options: goals },
          destinationField(data, scope, month),
          noteField,
        ]}
        describe={(r) =>
          `${r.date} · ${labels[r.kind]} · ${money(r.amount)} · ${goals.find(([id]) => id === (r.goalId || ''))?.[1] || 'Reserva livre'}${r.kind === 'transfer' ? ' → ' + (goals.find(([id]) => id === (r.toGoalId || ''))?.[1] || 'Reserva livre') : ''}`
        }
        help="Mantenha o histórico: registrar uma retirada não exige excluir aportes. Transferências e retiradas não são renda nova nem consumo. Saldos insuficientes são bloqueados, inclusive para datas anteriores."
      />
    </>
  );
}

export function InvestmentsPanel(props) {
  const { data, scope, month } = props;
  const [asOf, setAsOf] = useState(dateInMonth(month, 31));
  const assets = (data.investments || []).filter((a) => a.scope === scope),
    options = assets.map((a) => [a.id, a.name]);
  const summary = assetSummary(data, scope, asOf),
    goals = goalOptions(data, scope);
  return (
    <>
      <section className="panel">
        <h2>Patrimônio por data</h2>
        <label className="field">
          Posição em
          <input
            type="date"
            value={asOf}
            required
            onChange={(e) => e.target.value && setAsOf(e.target.value)}
          />
        </label>
        <div className="summary-grid summary-grid--three">
          {[
            ['Reservas', summary.reserveTotal],
            ['Investimentos', summary.invested],
            ['Patrimônio neste espaço', summary.wealth],
          ].map(([name, value]) => (
            <article className="card summary-card" key={name}>
              <p>{name}</p>
              <strong className="amount">{money(value)}</strong>
            </article>
          ))}
        </div>
        <p className="hint">
          As posições são manuais. Não há operações financeiras reais nem consulta a corretoras. Não
          some patrimônios de espaços pessoais e grupos como se fossem independentes.
        </p>
      </section>
      <RecordsEditor
        {...props}
        kind="investments"
        title="Cadastrar ativo ou posição"
        fields={[
          { name: 'name', label: 'Nome do ativo', required: true },
          {
            name: 'type',
            label: 'Tipo / categoria',
            required: true,
            initial: 'Renda fixa',
            options: extraCategoryOptions(data, scope, 'investmentTypes'),
          },
          { name: 'institution', label: 'Instituição', required: true },
          { name: 'identifier', label: 'Identificador (opcional)' },
          {
            name: 'goalId',
            label: 'Objetivo vinculado',
            options: [['', 'Sem objetivo'], ...goals.filter(([id]) => id)],
          },
        ]}
        help="Cadastre novos tipos na aba Categorias. Vincular a um objetivo organiza o progresso; não cria um segundo aporte."
      />
      {summary.positions.map((p) => (
        <section className="panel" key={p.id}>
          <h3>
            {p.name} · {p.institution}
          </h3>
          <div className="form-grid">
            {[
              ['Aplicado', p.applied],
              ['Resgatado', p.withdrawn],
              ['Rendimentos realizados brutos', p.yields],
              ['Taxas', p.fees],
              ['Impostos', p.taxes],
              ['Ganhos realizados em resgates', p.realizedGains],
              ['Perdas realizadas em resgates', p.realizedLosses],
              [
                'Resultado realizado líquido',
                total([p.yields, p.realizedGains, -p.realizedLosses, -p.fees, -p.taxes]),
              ],
              ['Valor atual', p.current],
              ['Ajuste por avaliação (separado do realizado)', p.unrealized],
            ].map(([name, value]) => (
              <p key={name}>
                {name}
                <br />
                <strong>{money(value)}</strong>
              </p>
            ))}
          </div>
          <small>
            {p.valuation
              ? `Avaliação manual de ${p.valuation.date}; inclui movimentos posteriores à data.`
              : 'Sem avaliação: valor calculado pelos movimentos registrados.'}
          </small>
        </section>
      ))}
      {assets.length > 0 && (
        <>
          <RecordsEditor
            {...props}
            kind="investmentMovements"
            title="Registrar movimento de investimento"
            fields={[
              {
                name: 'investmentId',
                label: 'Ativo',
                required: true,
                initial: assets[0].id,
                options,
              },
              {
                name: 'kind',
                label: 'Movimento',
                required: true,
                initial: 'application',
                options: Object.entries(labels).filter(([k]) =>
                  ['application', 'redemption', 'yield', 'fee', 'tax'].includes(k),
                ),
              },
              dateField(month),
              moneyField('amount'),
              {
                name: 'funding',
                label: 'Origem / destino',
                required: true,
                initial: 'cash',
                options: [
                  ['cash', 'Caixa do mês · aplicações/resgates'],
                  ['reserve', 'Reserva · aplicações/resgates'],
                  ['asset', 'No ativo · rendimentos, taxas e impostos'],
                ],
              },
              { name: 'goalId', label: 'Reserva de origem/destino (se escolhida)', options: goals },
              destinationField(data, scope, month),
              moneyField('realizedGain', 'Ganho realizado neste resgate (R$, opcional)', false),
              moneyField('realizedLoss', 'Perda realizada neste resgate (R$, opcional)', false),
              noteField,
            ]}
            describe={(r) =>
              `${r.date} · ${assets.find((a) => a.id === r.investmentId)?.name} · ${labels[r.kind]} · ${money(r.amount)} · ${r.funding === 'cash' ? 'caixa' : r.funding === 'reserve' ? 'reserva' : 'no ativo'}`
            }
            help="Aplicação do caixa reduz o disponível uma única vez. Aplicação de reserva transfere o saldo para o investimento. No resgate, escolha o destino e informe ganho ou perda realizados, se houver, sem repeti-los como rendimento. Rendimentos creditados ao ativo usam a opção No ativo; registre o resgate ao retirar esse dinheiro. Não repita esses valores em Receitas. O ajuste da avaliação pode incluir resultados ainda não classificados; não é apuração automática de lucro."
          />
          <RecordsEditor
            {...props}
            kind="investmentValuations"
            title="Avaliação atual manual"
            fields={[
              {
                name: 'investmentId',
                label: 'Ativo',
                required: true,
                initial: assets[0].id,
                options,
              },
              dateField(month),
              moneyField('amount', 'Valor avaliado (R$)'),
              noteField,
            ]}
            describe={(r) =>
              `${r.date} · ${assets.find((a) => a.id === r.investmentId)?.name} · ${money(r.amount)}`
            }
            help="Informe a posição no fim do dia. A avaliação já inclui todos os movimentos daquela data, não cria aplicação nem rendimento realizado. Movimentos de dias posteriores ajustam essa posição. Para corrigir uma avaliação da mesma data, use Editar."
          />
        </>
      )}
    </>
  );
}

export function SavingsStrategyPanel({ data, setData, scope, month, stats, notify }) {
  const plan = data.plans[`${scope}|${month}`] || {};
  const [strategy, setStrategy] = useState(() =>
    structuredClone(
      plan.savingsStrategy || {
        targetType: 'percent',
        targetPercent: 53.8,
        targetAmount: plan.savingTarget || 0,
        distribution: suggestedDistribution.map(([name, percent], index) => ({
          id: `destination-${index}`,
          name,
          percent,
          fixedAmount: 0,
          goalId: '',
        })),
      },
    ),
  );
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [copyMonth, setCopyMonth] = useState('');
  const before = stats.balanceBeforeContributions;
  const recorded = [
    ...data.contributions,
    ...(data.reserveMovements || []).filter((m) => m.kind === 'deposit'),
    ...(data.investmentMovements || []).filter(
      (m) => m.kind === 'application' && m.funding === 'cash',
    ),
  ].filter((c) => c.scope === scope && c.date.startsWith(month));
  let suggestion = null,
    suggestionError = '';
  try {
    suggestion = savingsSuggestions(strategy, stats.income || 0, before || 0, recorded);
  } catch (e) {
    suggestionError = e.message;
  }
  function change(index, key, value) {
    setStrategy((c) => ({
      ...c,
      distribution: c.distribution.map((d, i) => (i === index ? { ...d, [key]: value } : d)),
    }));
  }
  return (
    <section className="panel">
      <h2>Meta de economia e distribuição do saldo</h2>
      <p className="muted">
        Configuração opcional por mês. O modelo sugere 53,8% da renda nova; resgates ficam fora
        dessa base. Salvar aqui não cria aportes realizados. Os valores fixos têm prioridade na
        ordem dos destinos e o restante segue os percentuais.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          try {
            const form = new FormData(e.currentTarget);
            const validatedStrategy = {
              ...strategy,
              targetAmount: parseMoney(String(form.get('targetAmount') || '0')),
              distribution: strategy.distribution.map((d) => ({
                ...d,
                fixedAmount: parseMoney(String(form.get(`fixed-${d.id}`) || '0')),
              })),
            };
            savingsSuggestions(validatedStrategy, stats.income || 0, before || 0);
            await setData((c) => ({
              ...c,
              plans: {
                ...c.plans,
                [`${scope}|${month}`]: {
                  ...c.plans[`${scope}|${month}`],
                  savingsStrategy: validatedStrategy,
                  ...(c.plans[`${scope}|${month}`]?.savingsStrategy
                    ? {
                        savingsStrategyHistory: [
                          ...(c.plans[`${scope}|${month}`]?.savingsStrategyHistory || []),
                          c.plans[`${scope}|${month}`].savingsStrategy,
                        ],
                      }
                    : {}),
                },
              },
            }));
            setStrategy(validatedStrategy);
            setError('');
            notify?.('Estratégia salva para este mês. Meses anteriores foram preservados.');
          } catch (err) {
            setError(err.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <label className="field">
            Tipo de meta
            <select
              value={strategy.targetType}
              onChange={(e) => setStrategy((c) => ({ ...c, targetType: e.target.value }))}
            >
              <option value="percent">Percentual da renda nova</option>
              <option value="amount">Valor em reais</option>
            </select>
          </label>
          <label className="field">
            Percentual da meta (%)
            <PercentInput
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={strategy.targetPercent}
              onChange={(e) =>
                setStrategy((c) => ({ ...c, targetPercent: Number(e.target.value) }))
              }
            />
          </label>
          <label className="field">
            Meta em reais
            <MoneyInput
              inputMode="decimal"
              defaultValue={amountText(strategy.targetAmount)}
              name="targetAmount"
              key={'target' + strategy.targetAmount}
              onBlur={(e) => {
                try {
                  setStrategy((c) => ({ ...c, targetAmount: parseMoney(e.target.value) }));
                  setError('');
                } catch (err) {
                  setError(err.message);
                }
              }}
            />
          </label>
        </div>
        {strategy.distribution.map((d, index) => (
          <fieldset className="form-section" key={d.id}>
            <legend>Destino {index + 1}</legend>
            <div className="form-grid">
              <label className="field">
                Nome
                <input
                  required
                  maxLength={100}
                  value={d.name}
                  onChange={(e) => change(index, 'name', e.target.value)}
                />
              </label>
              <label className="field">
                Percentual (%)
                <PercentInput
                  required
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={d.percent}
                  onChange={(e) => change(index, 'percent', Number(e.target.value))}
                />
              </label>
              <label className="field">
                Aporte fixo programado (R$)
                <MoneyInput
                  inputMode="decimal"
                  defaultValue={amountText(d.fixedAmount)}
                  name={`fixed-${d.id}`}
                  key={d.id + d.fixedAmount}
                  onBlur={(e) => {
                    try {
                      change(index, 'fixedAmount', parseMoney(e.target.value));
                      setError('');
                    } catch (err) {
                      setError(err.message);
                    }
                  }}
                />
              </label>
              <label className="field">
                Objetivo
                <select
                  value={d.goalId || ''}
                  onChange={(e) => change(index, 'goalId', e.target.value)}
                >
                  {goalOptions(data, scope).map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                setStrategy((c) => ({
                  ...c,
                  distribution: c.distribution.filter((v) => v.id !== d.id),
                }))
              }
            >
              Remover destino desta configuração
            </button>
          </fieldset>
        ))}
        <div className="form-actions">
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              setStrategy((c) => ({
                ...c,
                distribution: [
                  ...c.distribution,
                  {
                    id: crypto.randomUUID(),
                    name: 'Novo destino',
                    percent: 0,
                    fixedAmount: 0,
                    goalId: '',
                  },
                ],
              }))
            }
          >
            Adicionar destino
          </button>
          <button className="button primary" disabled={busy}>
            Salvar estratégia do mês
          </button>
        </div>
      </form>
      <div className="form-grid">
        <label className="field">
          Copiar configuração de outro mês
          <input type="month" value={copyMonth} onChange={(e) => setCopyMonth(e.target.value)} />
        </label>
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            const prior = data.plans[`${scope}|${copyMonth}`]?.savingsStrategy;
            if (prior) {
              setStrategy(structuredClone(prior));
              setError('');
            } else setError('O mês escolhido não tem estratégia salva.');
          }}
        >
          Carregar configuração para revisão
        </button>
      </div>
      {!plan.savingsStrategy && (
        <p className="notice">
          Modelo em revisão. Sua meta atual continua em {money(plan.savingTarget || 0)} até salvar
          esta estratégia opcional.
        </p>
      )}
      {before === undefined ? (
        <p className="hint">
          As sugestões com base na renda são privadas do administrador. A configuração e os aportes
          do grupo permanecem compartilhados.
        </p>
      ) : (
        suggestion && (
          <>
            <p>
              Renda nova: {money(stats.income)} · saldo antes dos aportes: {money(before)} · meta:{' '}
              {money(suggestion.target)}
            </p>
            <Progress
              amount={total(recorded.map((r) => r.amount))}
              target={suggestion.target}
              label="Meta de economia"
            />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Destino</th>
                    <th>Sugerido</th>
                    <th>Efetivamente aportado</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestion.rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td>{money(r.suggested)}</td>
                      <td>{money(r.actual)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint">
              Sugerido distribui o saldo positivo antes dos aportes, sem incluir resgates. Realizado
              considera lançamentos com o destino selecionado em Metas e reservas ou Investimentos.
              Use o formulário de aporte para registrar somente o que efetivamente guardou.
            </p>
          </>
        )
      )}
      {(error || suggestionError) && (
        <p className="notice error" role="alert">
          {error || suggestionError}
        </p>
      )}
    </section>
  );
}

export function AnnualPanel({ data, scope, month, snapshot }) {
  const [year, setYear] = useState(month.slice(0, 4));
  const rows = Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${String(i + 1).padStart(2, '0')}`;
    try {
      const stats = snapshot
        ? snapshot.overview?.[m]?.stats || {
            total: 0,
            savingsThisMonth: 0,
            investmentApplications: 0,
          }
        : calculateWorkspace(data, m, scope, data.months[m] || {});
      return {
        month: m,
        ...stats,
        cashExpenses: stats.cashExpenses ?? stats.total,
        benefitExpenses: stats.benefitExpenses ?? 0,
      };
    } catch (e) {
      return { month: m, error: e.message };
    }
  });
  const fields = [
    ['income', 'Receitas novas'],
    ['total', 'Despesas'],
    ['cashExpenses', 'Despesas em dinheiro'],
    ['benefitExpenses', 'Parte coberta por VA/VR'],
    ['balanceBeforeContributions', 'Saldo antes dos aportes'],
    ['savingsThisMonth', 'Aportes às reservas'],
    ['investmentApplications', 'Aplicações do caixa'],
    ['redemptions', 'Resgates'],
    ['available', 'Disponível'],
  ];
  const assets = assetSummary(data, scope, `${year}-12-31`);
  const future = installmentCommitments(data, scope, month);
  return (
    <>
      <section className="panel finance-annual">
        <h2>Visão anual</h2>
        <label className="field">
          Ano
          <input
            type="number"
            min="1900"
            max="9998"
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
            }}
          />
        </label>
        {snapshot && (
          <p className="hint">
            Receitas e disponibilidade do administrador são privadas. Esta visão mostra os fluxos
            compartilhados autorizados.
          </p>
        )}
        <p className="hint">Em telas pequenas, deslize a tabela para ver todas as colunas.</p>
        <div className="table-wrap" tabIndex="0" role="region" aria-label="Fluxos dos doze meses">
          <table>
            <thead>
              <tr>
                <th>Mês</th>
                {fields
                  .filter(
                    ([key]) =>
                      !snapshot ||
                      !['income', 'balanceBeforeContributions', 'available'].includes(key),
                  )
                  .map(([key, label]) => (
                    <th key={key}>{label}</th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.month}>
                  <td>{r.month}</td>
                  {r.error ? (
                    <td colSpan={fields.length} role="alert">
                      {r.error}
                    </td>
                  ) : (
                    fields
                      .filter(
                        ([key]) =>
                          !snapshot ||
                          !['income', 'balanceBeforeContributions', 'available'].includes(key),
                      )
                      .map(([key]) => <td key={key}>{money(r[key] || 0)}</td>)
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>Total</th>
                {fields
                  .filter(
                    ([key]) =>
                      !snapshot ||
                      !['income', 'balanceBeforeContributions', 'available'].includes(key),
                  )
                  .map(([key]) => (
                    <td key={key}>
                      {money(total(rows.filter((r) => !r.error).map((r) => r[key] || 0)))}
                    </td>
                  ))}
              </tr>
            </tfoot>
          </table>
        </div>
        {rows.some((r) => r.error) && (
          <p className="notice error">
            Total parcial: corrija os meses com erro para obter o consolidado completo.
          </p>
        )}
      </section>
      <section className="panel">
        <h2>Reservas e investimentos em 31/12/{year}</h2>
        <p>
          Reservas: <strong>{money(assets.reserveTotal)}</strong> · Investimentos:{' '}
          <strong>{money(assets.invested)}</strong> · Patrimônio deste espaço:{' '}
          <strong>{money(assets.wealth)}</strong>
        </p>
        <p className="hint">
          Fluxos mensais e patrimônio são medidas diferentes. O espaço pessoal já inclui suas cotas
          nos grupos nas despesas; não some novamente o total dos grupos.
        </p>
        {data.goals
          .filter((g) => g.scope === scope)
          .map((g) => {
            const saved = total([
              assets.reserves.get(g.id) || 0,
              ...assets.positions.filter((p) => p.goalId === g.id).map((p) => p.current),
            ]);
            return (
              <article key={g.id}>
                <h3>
                  {g.title} · {money(saved)} de {money(g.target)}
                </h3>
                <Progress amount={saved} target={g.target} label={g.title} />
              </article>
            );
          })}
      </section>
      <section className="panel">
        <h2>Compromissos futuros das parcelas</h2>
        <p className="hint">
          Inclui parcelas já registradas e projeções de até 600 meses por origem, sem gravar novos
          lançamentos. Valores variáveis precisam de revisão. Não inclui recorrências sem prazo.
        </p>
        <strong className="amount">{money(total(future.map((e) => e.amount)))}</strong>
        {future.some((e) => e.projectionError) && (
          <p className="notice error">
            Total parcial: algumas cotas proporcionais dependem da renda dos meses futuros.
          </p>
        )}
        <ul className="compact-list finance-record-list">
          {future.map((e, index) => (
            <li key={e.id + '-' + index}>
              {expenseMonth(e)} · {e.description} · {e.installments.current}/{e.installments.total}
              <strong>{e.projectionError || money(e.amount)}</strong>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
