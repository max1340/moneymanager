import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney, formatShortMoney, formatDate } from '../src/js/utils.js';
import { calcTotalIncome, calcTotalExpenses, calcRemainingBudget, calcExpensePercent } from '../src/js/calculations.js';

test('formatMoney formats numbers according to ru-RU locale with ₪', () => {
  const result = formatMoney(121016.71);
  // Russian locale uses non-breaking space or standard space
  assert.ok(result.includes('121') && result.includes('016') && result.includes('71') && result.includes('₪'), `Actual: ${result}`);
});

test('formatShortMoney shortens thousands and millions', () => {
  const thousands = formatShortMoney(12340);
  assert.ok(thousands.includes('тыс'), `Expected thousands to include 'тыс', got: ${thousands}`);

  const millions = formatShortMoney(2500000);
  assert.ok(millions.includes('млн'), `Expected millions to include 'млн', got: ${millions}`);

  const small = formatShortMoney(450);
  assert.strictEqual(small, '450');
});

test('formatDate formats YYYY-MM-DD to DD.MM.YYYY', () => {
  const result = formatDate('2026-09-04');
  assert.strictEqual(result, '04.09.2026');
});

test('financial calculations calculate totals accurately', () => {
  const cycleData = {
    income: [
      { id: '1', amount: 15000, name: 'Зарплата', date: '2026-09-10' },
      { id: '2', amount: 5000, name: 'Фриланс', date: '2026-09-15' }
    ],
    fixed: [
      { id: '3', amount: 4000, name: 'Аренда', date: '2026-09-12' }
    ],
    variable: [
      { id: '4', amount: 2500, name: 'Продукты', date: '2026-09-14' }
    ]
  };

  const income = calcTotalIncome(cycleData);
  assert.strictEqual(income, 20000);

  const expenses = calcTotalExpenses(cycleData);
  assert.strictEqual(expenses, 6500);

  const remaining = calcRemainingBudget(cycleData);
  assert.strictEqual(remaining, 13500);

  const pct = calcExpensePercent(cycleData);
  assert.strictEqual(pct, 32.5);
});
