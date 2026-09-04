// ============================================
// Financy PRO — Financial Calculations
// ============================================

import { state, getCycleData } from './state.js';

function calcTotalIncome(cycleData) {
  let total = 0;
  for (const key in cycleData) {
    if (key === 'income') {
      total += cycleData.income.reduce((sum, t) => sum + t.amount, 0);
    }
  }
  return total;
}

function calcTotalFixed(cycleData) {
  return cycleData.fixed ? cycleData.fixed.reduce((sum, t) => sum + t.amount, 0) : 0;
}

function calcTotalVariable(cycleData) {
  return cycleData.variable ? cycleData.variable.reduce((sum, t) => sum + t.amount, 0) : 0;
}

function calcTotalCustomExpenses(cycleData) {
  let total = 0;
  if (state.customCategories) {
    state.customCategories.forEach(cat => {
      if (cycleData[cat.id]) {
        total += cycleData[cat.id].reduce((sum, t) => sum + t.amount, 0);
      }
    });
  }
  return total;
}

function calcTotalExpenses(cycleData) {
  return calcTotalFixed(cycleData) + calcTotalVariable(cycleData) + calcTotalCustomExpenses(cycleData);
}

function calcRemainingBudget(cycleData) {
  return calcTotalIncome(cycleData) - calcTotalExpenses(cycleData);
}

function calcOverallBalance() {
  let total = state.startCapital || 0;
  for (const ck in state.cycles) {
    const cd = state.cycles[ck];
    total += calcTotalIncome(cd);
    total -= calcTotalExpenses(cd);
  }
  return total;
}

function calcExpensePercent(cycleData) {
  const income = calcTotalIncome(cycleData);
  const expenses = calcTotalExpenses(cycleData);
  return income > 0 ? (expenses / income * 100) : 0;
}

function calcCategoryExpenses(cycleData) {
  const result = [];
  // Built-in categories
  const fixed = calcTotalFixed(cycleData);
  const variable = calcTotalVariable(cycleData);
  if (fixed > 0) result.push({ id: 'fixed', name: 'Постоянные', amount: fixed, color: 'var(--chart-color-1)' });
  if (variable > 0) result.push({ id: 'variable', name: 'Непостоянные', amount: variable, color: 'var(--chart-color-2)' });

  // Custom categories
  state.customCategories.forEach(cat => {
    const amount = cycleData[cat.id] ? cycleData[cat.id].reduce((sum, t) => sum + t.amount, 0) : 0;
    if (amount > 0) {
      result.push({ id: cat.id, name: cat.name, amount, color: cat.color });
    }
  });

  return result;
}

// Budget calculations
function calcBudgetProgress(categoryId, cycleData) {
  const limit = state.budgetLimits[categoryId] || 0;
  if (limit <= 0) return null;

  let spent = 0;
  if (categoryId === 'fixed') spent = calcTotalFixed(cycleData);
  else if (categoryId === 'variable') spent = calcTotalVariable(cycleData);
  else if (cycleData[categoryId]) {
    spent = cycleData[categoryId].reduce((sum, t) => sum + t.amount, 0);
  }

  return {
    limit,
    spent,
    remaining: limit - spent,
    percent: limit > 0 ? Math.min((spent / limit) * 100, 100) : 0
  };
}

// Goals calculation
function calcGoalProgress(goal) {
  if (goal.target <= 0) return 0;
  return Math.min((goal.current / goal.target) * 100, 100);
}

// Cash flow forecast (simple)
function calcCashFlowForecast(months = 3) {
  const cycleKeys = Object.keys(state.cycles).sort();
  if (cycleKeys.length === 0) return null;

  const recentKeys = cycleKeys.slice(-months);
  let totalIncome = 0, totalExpenses = 0, count = 0;

  recentKeys.forEach(key => {
    const cd = state.cycles[key];
    totalIncome += calcTotalIncome(cd);
    totalExpenses += calcTotalExpenses(cd);
    count++;
  });

  if (count === 0) return null;

  const avgMonthlyIncome = totalIncome / count;
  const avgMonthlyExpenses = totalExpenses / count;
  const currentBalance = calcOverallBalance();

  return {
    avgMonthlyIncome,
    avgMonthlyExpenses,
    avgMonthlySavings: avgMonthlyIncome - avgMonthlyExpenses,
    projectedBalance: currentBalance + (avgMonthlyIncome - avgMonthlyExpenses) * months,
    months: count
  };
}

export {
  calcTotalIncome,
  calcTotalFixed,
  calcTotalVariable,
  calcTotalCustomExpenses,
  calcTotalExpenses,
  calcRemainingBudget,
  calcOverallBalance,
  calcExpensePercent,
  calcCategoryExpenses,
  calcBudgetProgress,
  calcGoalProgress,
  calcCashFlowForecast
};