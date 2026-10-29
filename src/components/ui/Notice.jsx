import React from 'react';

/** Feedback shared by forms and workspace views. */
export function Notice({ children, variant = 'info', onDismiss, className = '', ...props }) {
  const isError = variant === 'error';
  return (
    <div
      className={`notice ${variant === 'info' ? '' : variant} ${className}`.trim()}
      role={isError ? 'alert' : 'status'}
      {...props}
    >
      <div>{children}</div>
      {onDismiss && (
        <button type="button" aria-label="Fechar aviso" onClick={onDismiss}>
          ×
        </button>
      )}
    </div>
  );
}
