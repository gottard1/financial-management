import React, { forwardRef, useEffect, useRef, useState } from 'react';
import {
  editInput,
  formatInput,
  inputError,
  percentInputValue,
} from '../../shared/formatting/inputFormatters.js';

/** Keeps financial state compatible with existing parsers and formats only at rest. */
const FormattedInput = forwardRef(function FormattedInput(
  { format, value, defaultValue = '', onChange, onBlur, onFocus, onKeyDown, ...props },
  forwardedRef,
) {
  const input = useRef(null),
    focused = useRef(false),
    dirty = useRef(false);
  const [text, setText] = useState(() => formatInput(value ?? defaultValue, format));

  useEffect(() => {
    if (!focused.current && (value !== undefined || !dirty.current)) {
      const next = formatInput(value ?? defaultValue, format);
      setText(next);
      input.current?.setCustomValidity(inputError(next, format));
    }
  }, [value, defaultValue, format]);

  useEffect(() => {
    const form = input.current?.form;
    const reset = () => {
      focused.current = false;
      dirty.current = false;
      const next = formatInput(value ?? defaultValue, format);
      setText(next);
      input.current?.setCustomValidity(inputError(next, format));
    };
    form?.addEventListener('reset', reset);
    return () => form?.removeEventListener('reset', reset);
  }, [value, defaultValue, format]);

  function emit(event, raw) {
    const element = event.target,
      displayed = element.value;
    const { selectionStart, selectionEnd, selectionDirection } = element;
    element.value = format === 'percent' ? percentInputValue(raw) : raw;
    try {
      onChange?.(event);
    } finally {
      if (format === 'percent') {
        element.value = displayed;
        if (selectionStart !== null)
          element.setSelectionRange(selectionStart, selectionEnd, selectionDirection);
      }
    }
  }

  return (
    <input
      {...props}
      ref={(element) => {
        input.current = element;
        if (typeof forwardedRef === 'function') forwardedRef(element);
        else if (forwardedRef) forwardedRef.current = element;
      }}
      type={format === 'phone' ? 'tel' : 'text'}
      inputMode={format === 'phone' ? 'tel' : 'decimal'}
      role={format === 'percent' ? 'spinbutton' : props.role}
      aria-valuemin={format === 'percent' ? Number(props.min ?? 0) : undefined}
      aria-valuemax={format === 'percent' ? Number(props.max ?? 100) : undefined}
      aria-valuenow={
        format === 'percent' && text && !inputError(text, format)
          ? Number(percentInputValue(text))
          : undefined
      }
      value={text}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (
          format !== 'percent' ||
          event.defaultPrevented ||
          props.readOnly ||
          !['ArrowUp', 'ArrowDown'].includes(event.key) ||
          inputError(text, format)
        )
          return;
        event.preventDefault();
        const current = Math.round(Number(percentInputValue(text) || 0) * 100);
        const step = Math.round(Number(props.step || 0.01) * 100);
        const next =
          Math.max(
            Number(props.min ?? 0) * 100,
            Math.min(
              Number(props.max ?? 100) * 100,
              current + (event.key === 'ArrowUp' ? step : -step),
            ),
          ) / 100;
        const displayed = formatInput(next, format);
        dirty.current = true;
        setText(displayed);
        event.target.value = displayed;
        event.target.setCustomValidity('');
        emit(event, String(next));
      }}
      onFocus={(event) => {
        focused.current = true;
        setText(editInput(event.target.value, format));
        onFocus?.(event);
      }}
      onChange={(event) => {
        const raw = event.target.value;
        dirty.current = true;
        setText(raw);
        event.target.setCustomValidity(inputError(raw, format));
        emit(event, raw);
      }}
      onBlur={(event) => {
        focused.current = false;
        const next = formatInput(event.target.value, format);
        setText(next);
        event.target.setCustomValidity(inputError(next, format));
        emit(event, next);
        onBlur?.(event);
      }}
    />
  );
});

export const MoneyInput = forwardRef((props, ref) => (
  <FormattedInput {...props} format="money" ref={ref} />
));
export const PercentInput = forwardRef((props, ref) => (
  <FormattedInput {...props} format="percent" ref={ref} />
));
export const PhoneInput = forwardRef((props, ref) => (
  <FormattedInput {...props} format="phone" ref={ref} />
));
