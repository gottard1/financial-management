import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney } from '../../domain/expenses/expenseCalculations.js';
import {
  formatMoneyInput,
  formatPhoneInput,
  formatPercentInput,
  percentInputValue,
  inputError,
  editInput,
} from './inputFormatters.js';

test('currency format preserves cents, accepts existing decimal formats and never silently rounds invalid input', () => {
  for (const [input, expected] of [
    ['1250.5', '1.250,50'],
    ['1250,50', '1.250,50'],
    ['1.250,50', '1.250,50'],
    ['R$ 1.250,50', '1.250,50'],
    ['0', '0,00'],
    ['0.01', '0,01'],
    ['90071992547409.91', '90.071.992.547.409,91'],
  ]) {
    assert.equal(formatMoneyInput(input), expected);
    assert.equal(parseMoney(expected), parseMoney(input));
  }
  for (const invalid of ['1.234', '12,345', '-50', '1e3', 'abc', '90071992547409.92']) {
    assert.equal(formatMoneyInput(invalid), invalid);
    assert.ok(inputError(invalid, 'money'));
  }
  assert.equal(formatMoneyInput(''), '');
  assert.equal(inputError('', 'money'), '');
});
test('editing removes grouping without turning a real amount into a digit-shifting cents mask', () => {
  assert.equal(editInput('1.250,50', 'money'), '1250,50');
  assert.equal(parseMoney(formatMoneyInput('1250')), 125000);
  assert.equal(editInput('bad.input', 'money'), 'bad.input');
});
test('percentages display Brazilian decimals while preserving canonical input for existing numeric callbacks', () => {
  assert.equal(formatPercentInput('53.8'), '53,8');
  assert.equal(percentInputValue('53,8%'), '53.8');
  assert.equal(formatPercentInput('65'), '65');
  assert.equal(formatPercentInput('0,01'), '0,01');
  assert.equal(formatPercentInput('.5'), '0,5');
  assert.equal(inputError('100', 'percent'), '');
  for (const invalid of ['100,01', '53,888', '-1', '1e2', 'abc', '%'])
    assert.ok(inputError(invalid, 'percent'));
  assert.equal(formatPercentInput('53,888'), '53,888');
  assert.equal(formatPercentInput(''), '');
});
test('Brazilian telephone formatting preserves digits and other supported historical contacts', () => {
  assert.equal(formatPhoneInput('11987654321'), '(11) 98765-4321');
  assert.equal(formatPhoneInput('1134567890'), '(11) 3456-7890');
  assert.equal(formatPhoneInput('+55 11 98765 4321'), '+55 (11) 98765-4321');
  for (const phone of ['', '1198', '+1 212 555 0123', '11 3456-7890 ramal 12', 'telefone antigo'])
    assert.equal(formatPhoneInput(phone), phone);
  assert.equal(formatPhoneInput('(11) 98765-4321'), '(11) 98765-4321');
});
