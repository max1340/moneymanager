// ============================================
// Financy PRO — State Management
// ============================================

/**
 * The global application state
 * Structure:
 * {
 *   startCapital: number,
 *   cycles: { [cycleKey]: { income: [], fixed: [], variable: [], [customCategory]: [] } },
 *   currentCycle: string (e.g. "2026-06"),
 *   customCategories: [{ id, name, color, type: 'expense' }],
 *   budgetLimits: { [categoryId]: number },
 *   goals: [{ id, name, target, current }],
 *   recurringTransactions: [{ id, name, amount, day, category, nextDate }],
 *   tags: [string]
 * }
 */
let state = {
  startCapital: 0,
  cycles: {},
  currentCycle: null,
  customCategories: [],
  budgetLimits: {},
  goals: [],
  recurringTransactions: [],
  tags: []
};

let fileHandle = null;
let listeners = [];

function getState() {
  return state;
}

function setState(newState) {
  state = newState;
  notifyListeners();
}

function getCycleData(cycleKey) {
  if (!state.cycles[cycleKey]) {
    state.cycles[cycleKey] = { income: [], fixed: [], variable: [] };
    // Add custom categories arrays
    state.customCategories.forEach(cat => {
      if (!state.cycles[cycleKey][cat.id]) {
        state.cycles[cycleKey][cat.id] = [];
      }
    });
  }
  return state.cycles[cycleKey];
}

function getCurrentCycleData() {
  return getCycleData(state.currentCycle);
}

function subscribe(fn) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter(l => l !== fn);
  };
}

function notifyListeners() {
  listeners.forEach(fn => fn(state));
}

function resetState() {
  state = {
    startCapital: 0,
    cycles: {},
    currentCycle: null,
    customCategories: [],
    budgetLimits: {},
    goals: [],
    recurringTransactions: [],
    tags: []
  };
  notifyListeners();
}

export {
  state,
  getState,
  setState,
  getCycleData,
  getCurrentCycleData,
  subscribe,
  notifyListeners,
  resetState,
  fileHandle
};
