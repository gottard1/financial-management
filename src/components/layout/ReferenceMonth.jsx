import React from 'react';

export function ReferenceMonth({ month, onChange }) {
  return (
    <label className="field reference-month">
      Mês de referência
      <input
        type="month"
        required
        min="2000-01"
        max="2099-12"
        value={month}
        onChange={(event) => {
          if (event.target.value) onChange(event.target.value);
        }}
      />
    </label>
  );
}
