import React, { useEffect, useRef, useState } from 'react';

export function PurgeGroupDialog({ group, count, busy, error, onClose, onConfirm, onExport }) {
  const dialog = useRef();
  const [text, setText] = useState('');
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="dialog expense-dialog"
      aria-labelledby="purge-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
    >
      <form
        className="expense-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (text === 'APAGAR' && !busy) onConfirm();
        }}
      >
        <p className="eyebrow">EXCLUSÃO DEFINITIVA</p>
        <h2 id="purge-title">Apagar o histórico de {group.name}?</h2>
        <p>
          Serão apagados {count} registro(s) do grupo: despesas, parcelas lançadas, repasses,
          orçamento, metas e aportes. Eles deixarão de aparecer nos resumos e na comparação mensal.
        </p>
        <p>
          Pessoas, rendas e dados de outros grupos serão mantidos. Esta operação não pode ser
          desfeita pelo aplicativo.
        </p>
        <p className="hint">
          A cópia compartilhada e os convites serão apagados. Permanecerá apenas um pequeno marcador
          de bloqueio para impedir a restauração por uma sessão antiga. Backups que você já exportou
          não são alterados.
        </p>
        {onExport && (
          <button type="button" className="button secondary" disabled={busy} onClick={onExport}>
            Exportar backup antes de apagar
          </button>
        )}
        <label className="field">
          Digite APAGAR para confirmar
          <input
            autoFocus
            required
            autoComplete="off"
            disabled={busy}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="APAGAR"
          />
        </label>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {busy && (
          <p role="status">
            Apagando e aguardando confirmação de cada etapa. Mantenha o aplicativo aberto.
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button className="button danger" disabled={busy || text !== 'APAGAR'}>
            {busy ? 'Apagando…' : 'Apagar definitivamente'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
