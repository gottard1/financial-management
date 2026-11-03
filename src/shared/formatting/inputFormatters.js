import { parseMoney } from '../../domain/expenses/expenseCalculations.js';

const wholeFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** Presentation only: never round, truncate or reinterpret invalid financial input. */
export function formatMoneyInput(value) {
  const raw = String(value ?? '');
  if (!raw.trim()) return '';
  try {
    const cents = BigInt(parseMoney(raw));
    return `${wholeFormatter.format(cents / 100n)},${String(cents % 100n).padStart(2, '0')}`;
  } catch {
    return raw;
  }
}

export function percentInputValue(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s*%$/, '')
    .replace(',', '.');
}

export function percentInputError(value) {
  const raw = percentInputValue(value);
  if (!raw && !String(value ?? '').trim()) return '';
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(raw) || Number(raw) > 100)
    return 'Informe um percentual de 0 a 100, com até duas casas decimais.';
  return '';
}

export function formatPercentInput(value) {
  const raw = String(value ?? '');
  if (!raw.trim()) return '';
  if (percentInputError(raw)) return raw;
  return Number(percentInputValue(raw)).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

export function formatPhoneInput(value) {
  const raw = String(value ?? '');
  // Keep extensions, international and historical free-form contacts intact.
  if (!/^[+\d\s().-]+$/.test(raw)) return raw;
  let digits = raw.replace(/\D/g, ''),
    prefix = '';
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    prefix = '+55 ';
    digits = digits.slice(2);
  } else if (raw.trim().startsWith('+')) return raw;
  if (![10, 11].includes(digits.length)) return raw;
  const split = digits.length === 11 ? 7 : 6;
  return `${prefix}(${digits.slice(0, 2)}) ${digits.slice(2, split)}-${digits.slice(split)}`;
}

export function formatInput(value, format) {
  if (format === 'money') return formatMoneyInput(value);
  if (format === 'percent') return formatPercentInput(value);
  if (format === 'phone') return formatPhoneInput(value);
  return String(value ?? '');
}

export function inputError(value, format) {
  if (!String(value ?? '').trim()) return '';
  if (format === 'percent') return percentInputError(value);
  if (format === 'money') {
    try {
      parseMoney(String(value));
    } catch (error) {
      return error.message;
    }
  }
  return '';
}

export function editInput(value, format) {
  const formatted = formatInput(value, format);
  return format === 'money' && !inputError(formatted, format)
    ? formatted.replaceAll('.', '')
    : formatted;
}
