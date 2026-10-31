import React, { useEffect, useRef, useState } from 'react';
import { money, parseMoney } from '../../domain/expenses/expenseCalculations.js';
import { validateNewSettlement } from '../../domain/settlements/settlementCalculations.js';
import {
  saveReceipt,
  getReceipt,
  removeReceipt,
  validateReceiptFile,
} from '../../infrastructure/storage/receiptRepository.js';

const amountText = (amount) => (amount / 100).toFixed(2).replace('.', ',');
const dateLabel = (date) => date.split('-').reverse().join('/');
const monthLabel = (month) => month.split('-').reverse().join('/');
function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function initialForm(stats, members, receiverId) {
  const suggestion = receiverId
    ? stats.transfers?.find((item) => item.to === receiverId)
    : stats.transfers?.[0];
  return {
    from: suggestion?.from ?? members[0] ?? '',
    to: receiverId || suggestion?.to || members[1] || '',
    amount: suggestion ? amountText(suggestion.amount) : '',
    date: today(),
    note: '',
  };
}

export function SettlementsPanel({
  data,
  setData,
  scope,
  month,
  stats,
  notify,
  storageNamespace = 'local',
  receiverId,
  receiverUid,
  onSharedReceive,
  onSharedUndo,
}) {
  const group = data.groups.find((item) => `group:${item.id}` === scope);
  const memberIds = group?.memberIds ?? [];
  const names = Object.fromEntries(data.people.map((person) => [person.id, person.name]));
  const [form, setForm] = useState(() =>
    initialForm(stats, memberIds, onSharedReceive ? receiverId : null),
  );
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [voidId, setVoidId] = useState('');
  const [viewingId, setViewingId] = useState('');
  const [preview, setPreview] = useState(null);
  const fileInput = useRef(null),
    formRef = useRef(null),
    busyRef = useRef(false),
    previewUrl = useRef('');
  const mounted = useRef(true);
  const current = useRef(null);
  current.current = { stats, memberIds, scope, month, storageNamespace, receiverId };
  const contextKey = `${storageNamespace}|${scope}|${month}`;
  function revokePreview() {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = '';
  }
  useEffect(() => {
    const context = current.current;
    setForm(
      initialForm(context.stats, context.memberIds, onSharedReceive ? context.receiverId : null),
    );
    setFile(null);
    setError('');
    setVoidId('');
    setPreview(null);
    revokePreview();
    if (fileInput.current) fileInput.current.value = '';
  }, [scope, month, storageNamespace, receiverId, Boolean(onSharedReceive)]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      revokePreview();
    };
  }, []);
  function stillCurrent(key) {
    const context = current.current;
    return (
      mounted.current && `${context.storageNamespace}|${context.scope}|${context.month}` === key
    );
  }
  function chooseFile(event) {
    const selected = event.target.files?.[0] ?? null;
    setError('');
    try {
      if (selected) validateReceiptFile(selected);
      setFile(selected);
    } catch (err) {
      setFile(null);
      event.target.value = '';
      setError(err.message);
    }
  }
  function suggest(transfer) {
    setForm((previous) => ({
      ...previous,
      from: transfer.from,
      to: transfer.to,
      amount: amountText(transfer.amount),
    }));
    setError('');
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    formRef.current
      ?.querySelector('input[name="settlementAmount"]')
      ?.focus({ preventScroll: true });
  }
  async function submit(event) {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    let receipt = null,
      committed = false;
    const namespace = storageNamespace,
      key = contextKey;
    try {
      const record = {
        id: crypto.randomUUID(),
        scope,
        from: form.from,
        to: form.to,
        amount: parseMoney(form.amount),
        date: form.date,
        referenceMonth: month,
        note: form.note.trim(),
        status: 'confirmed',
      };
      validateNewSettlement(record, stats, memberIds);
      if (onSharedReceive) {
        if (record.to !== receiverId)
          throw new Error('Você só pode confirmar o dinheiro que recebeu.');
        if (file || record.note)
          throw new Error(
            'O recebimento compartilhado aceita valor e data. Registre-o sem anexo ou observação.',
          );
        await onSharedReceive(record);
        committed = true;
        setForm((previous) => ({ ...previous, amount: '', note: '' }));
        notify('Recebimento confirmado e compartilhado com o grupo.');
        return;
      }
      if (file) receipt = await saveReceipt(file, namespace);
      if (!stillCurrent(key))
        throw new Error(
          'O espaço, a conta ou a competência mudou. Revise o repasse antes de registrar.',
        );
      const completeRecord = receipt ? { ...record, receipt } : record;
      validateNewSettlement(completeRecord, current.current.stats, current.current.memberIds);
      setData((previous) => ({
        ...previous,
        settlements: [...(previous.settlements ?? []), completeRecord],
      }));
      committed = true;
      setForm((previous) => ({ ...previous, amount: '', note: '' }));
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      notify(
        'Recebimento confirmado. O saldo devedor foi atualizado sem criar despesa ou receita.',
      );
    } catch (err) {
      let message = err.message;
      if (receipt && !committed) {
        try {
          await removeReceipt(receipt.id, namespace);
        } catch (cleanupError) {
          message += ` O anexo não foi vinculado e não pôde ser removido: ${cleanupError.message}`;
        }
      }
      if (stillCurrent(key)) setError(message);
      else notify(message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function voidRecord(record) {
    try {
      if (record.sharedReceipt) {
        await onSharedUndo(record.id);
        setVoidId('');
        return;
      }
      setData((previous) => ({
        ...previous,
        settlements: (previous.settlements ?? []).map((item) =>
          item.id === record.id ? { ...item, status: 'void' } : item,
        ),
      }));
      setVoidId('');
      setError('');
      notify(
        'Repasse estornado. O histórico e o comprovante foram preservados; a dívida foi recalculada.',
      );
    } catch (err) {
      setError(err.message);
    }
  }
  async function viewReceipt(record) {
    const key = contextKey;
    setViewingId(record.id);
    setError('');
    try {
      const blob = await getReceipt(record.receipt.id, storageNamespace);
      if (!stillCurrent(key)) return;
      revokePreview();
      const url = URL.createObjectURL(blob);
      previewUrl.current = url;
      setPreview({ url, name: record.receipt.name, recordId: record.id });
    } catch (err) {
      if (stillCurrent(key)) setError(err.message);
    } finally {
      setViewingId('');
    }
  }
  if (!group)
    return (
      <section className="panel settlements-panel">
        <h2>Repasses do grupo</h2>
        <p>Selecione um grupo para registrar os acertos entre integrantes.</p>
      </section>
    );
  const history = (data.settlements ?? [])
    .filter((record) => record.scope === scope && record.referenceMonth === month)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));
  const suggestions = stats.transfers ?? [];
  return (
    <div className="settlements-panel">
      <section className="panel">
        <p className="eyebrow">ACERTOS ENTRE INTEGRANTES</p>
        <h2>Repasses de {group.name}</h2>
        <p>
          Competência da dívida: <strong>{monthLabel(month)}</strong>. Um repasse quita uma dívida
          entre pessoas; não é uma nova despesa ou receita.
        </p>
        <div className="notice">
          <p>
            Comprovantes e dados ficam neste navegador; exportação JSON não inclui arquivos. Os
            anexos não são enviados para a nuvem.
          </p>
        </div>
        <div className="settlement-suggestions">
          <h3>Acertos pendentes</h3>
          {suggestions.length ? (
            suggestions.map((transfer) => (
              <div className="settlement-record" key={`${transfer.from}:${transfer.to}`}>
                <p>
                  <strong>{names[transfer.from]}</strong> deve{' '}
                  <strong>{money(transfer.amount)}</strong> a <strong>{names[transfer.to]}</strong>.
                </p>
                <button
                  className="button"
                  type="button"
                  disabled={busy || (Boolean(onSharedReceive) && transfer.to !== receiverId)}
                  onClick={() => suggest(transfer)}
                >
                  Registrar recebimento
                </button>
              </div>
            ))
          ) : (
            <p className="empty">Nenhum acerto pendente nesta competência.</p>
          )}
        </div>
      </section>
      <section className="panel" ref={formRef}>
        <h2>Confirmar um recebimento</h2>
        <p>
          Registre somente depois de o dinheiro ter sido recebido. A sugestão preenche o formulário
          e você confirma abaixo.
        </p>
        {onSharedReceive && (
          <p className="hint">
            Confirme somente recebimentos destinados ao seu nome. As confirmações compartilhadas
            registram valor e data; anexos e observações não são compartilhados.
          </p>
        )}
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="field">
              Quem devolveu o dinheiro?
              <select
                required
                value={form.from}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, from: event.target.value }))
                }
              >
                <option value="">Selecione quem pagou</option>
                {memberIds.map((id) => (
                  <option value={id} key={id}>
                    {names[id]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Quem recebeu?
              <select
                required
                disabled={Boolean(onSharedReceive)}
                value={form.to}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, to: event.target.value }))
                }
              >
                <option value="">Selecione quem recebeu</option>
                {memberIds.map((id) => (
                  <option value={id} key={id}>
                    {names[id]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Valor recebido (R$)
              <input
                required
                name="settlementAmount"
                inputMode="decimal"
                value={form.amount}
                placeholder="0,00"
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, amount: event.target.value }))
                }
              />
              <small>
                O valor não pode exceder a dívida de quem paga nem o crédito de quem recebe.
              </small>
            </label>
            <label className="field">
              Data real do pagamento
              <input
                required
                type="date"
                value={form.date}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, date: event.target.value }))
                }
              />
              <small>
                Pode ser de outro mês. Este repasse abate a dívida de {monthLabel(month)}.
              </small>
            </label>
            <label className="field">
              Observação (opcional)
              <input
                disabled={Boolean(onSharedReceive)}
                maxLength={240}
                value={form.note}
                placeholder="Ex.: PIX referente às contas do mês"
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, note: event.target.value }))
                }
              />
            </label>
            <label className="field receipt-field">
              Comprovante (opcional)
              <input
                ref={fileInput}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                onChange={chooseFile}
                disabled={busy || Boolean(onSharedReceive)}
              />
              <small>
                JPG, PNG, WEBP ou PDF de até 5 MB.{' '}
                {file ? `Selecionado: ${file.name}.` : 'O arquivo fica apenas neste navegador.'}
              </small>
            </label>
          </div>
          <div className="form-actions">
            <button className="button primary" disabled={busy || memberIds.length < 2}>
              {busy ? 'Salvando recebimento…' : 'Confirmar recebimento'}
            </button>
          </div>
        </form>
      </section>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <section className="panel settlement-history">
        <h2>Histórico de {monthLabel(month)}</h2>
        <p>Inclui recebimentos confirmados e registros estornados desta competência.</p>
        {history.length ? (
          history.map((record) => (
            <article className="settlement-record" key={record.id}>
              <div>
                <span className="pill">
                  {record.status === 'void' ? 'Estornado' : 'Recebimento confirmado'}
                </span>
                <h3>
                  {names[record.from] ?? record.from} → {names[record.to] ?? record.to}
                </h3>
                <strong>{money(record.amount)}</strong>
                <p>
                  Pago em {dateLabel(record.date)} · dívida de {monthLabel(record.referenceMonth)}
                </p>
                {record.note && <p>{record.note}</p>}
                {record.status === 'void' && (
                  <p>
                    Este registro não abate a dívida. O histórico e o comprovante foram mantidos.
                  </p>
                )}
              </div>
              <div className="form-actions">
                {record.receipt && (
                  <button
                    type="button"
                    className="button"
                    disabled={viewingId === record.id}
                    onClick={() => viewReceipt(record)}
                  >
                    {viewingId === record.id ? 'Preparando arquivo…' : 'Visualizar comprovante'}
                  </button>
                )}
                {record.status === 'confirmed' &&
                  (!record.sharedReceipt || record.receiverUid === receiverUid) &&
                  voidId !== record.id && (
                    <button
                      type="button"
                      className="button"
                      disabled={busy}
                      onClick={() => setVoidId(record.id)}
                    >
                      Estornar registro
                    </button>
                  )}
              </div>
              {record.receipt && <small>Comprovante: {record.receipt.name}</small>}
              {preview?.recordId === record.id && (
                <p>
                  <a href={preview.url} target="_blank" rel="noopener noreferrer">
                    Abrir {preview.name} em nova aba ↗
                  </a>
                </p>
              )}
              {voidId === record.id && record.status === 'confirmed' && (
                <div className="notice warning">
                  <p>
                    Estornar {money(record.amount)} de {names[record.from]} para {names[record.to]}?
                    A dívida será recalculada. O registro e o comprovante serão preservados.
                  </p>
                  <div className="form-actions">
                    <button type="button" className="button" onClick={() => setVoidId('')}>
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="button primary"
                      onClick={() => voidRecord(record)}
                    >
                      Confirmar estorno
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))
        ) : (
          <p className="empty">
            Nenhum repasse registrado nesta competência. Confirme um recebimento para começar o
            histórico.
          </p>
        )}
      </section>
    </div>
  );
}
