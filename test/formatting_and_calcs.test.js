import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fmt,
  CURRENCY,
  formatMoney,
  formatShortMoney,
  formatDate,
  cycleRange,
  cycleExplicitLabel,
  groupOperationsByDay
} from '../src/js/utils.js';
import { calcTotalIncome, calcTotalExpenses, calcRemainingBudget, calcExpensePercent } from '../src/js/calculations.js';

test('fmt and CURRENCY formats numbers with unified currency symbol', () => {
  assert.strictEqual(CURRENCY, '₪');
  const result = fmt(121016.71);
  assert.ok(result.includes('121') && result.includes('016') && result.includes('71') && result.includes('₪'), `Actual: ${result}`);
  assert.strictEqual(fmt(0).trim().endsWith('₪'), true);
});

test('cycleExplicitLabel produces clear cycle date range with month', () => {
  const label = cycleExplicitLabel('2026-08');
  assert.ok(label.includes('10.08') && label.includes('09.09') && label.includes('Август 2026'), `Actual: ${label}`);
});

test('groupOperationsByDay groups operations descending by date with day totals', () => {
  const ops = [
    { id: '1', date: '2026-08-15', amount: 1500, category: 'income', name: 'Фриланс' },
    { id: '2', date: '2026-08-15', amount: 500, category: 'variable', name: 'Кафе' },
    { id: '3', date: '2026-08-12', amount: 3000, category: 'fixed', name: 'Аренда' }
  ];

  const groups = groupOperationsByDay(ops);
  assert.strictEqual(groups.length, 2);
  assert.strictEqual(groups[0].date, '2026-08-15');
  assert.strictEqual(groups[0].totalIncome, 1500);
  assert.strictEqual(groups[0].totalExpense, 500);
  assert.strictEqual(groups[0].items.length, 2);

  assert.strictEqual(groups[1].date, '2026-08-12');
  assert.strictEqual(groups[1].totalExpense, 3000);
  assert.strictEqual(groups[1].items.length, 1);
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
