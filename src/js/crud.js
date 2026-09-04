// ============================================
// Financy PRO — CRUD Operations
// ============================================

import { state, getCurrentCycleData, getCycleData, notifyListeners } from './state.js';
import { markDirty } from './firebase-db.js';
import { uuid } from './utils.js';

// ---- Operations ----
function addOperation(category, name, date, amount) {
  const cycleData = getCurrentCycleData();
  const op = { id: uuid(), name: name.trim(), date: date, amount: Math.abs(amount) };
  cycleData[category].push(op);
  markDirty();
  notifyListeners();
  return op;
}

function deleteOperation(category, id) {
  const cycleData = getCurrentCycleData();
  const index = cycleData[category].findIndex(t => t.id === id);
  if (index === -1) return null;
  const removed = cycleData[category][index];
  cycleData[category].splice(index, 1);
  markDirty();
  notifyListeners();
  return removed;
}

function updateOperation(category, id, newName, newAmount, newCategory) {
  const cycleData = getCurrentCycleData();
  let op = null;
  // Find and remove from old category
  cycleData[category] = cycleData[category].filter(t => {
    if (t.id === id) { op = { ...t }; return false; }
    return true;
  });
  if (!op) return null;

  op.name = newName.trim();
  op.amount = Math.abs(newAmount);

  if (newCategory !== category) {
    getCurrentCycleData()[newCategory].push(op);
  } else {
    cycleData[category].push(op);
  }

  markDirty();
  notifyListeners();
  return op;
}

function findOperation(category, id) {
  const cycleData = getCurrentCycleData();
  for (const cat of ['income', 'fixed', 'variable', ...state.customCategories.map(c => c.id)]) {
    if (cycleData[cat]) {
      const found = cycleData[cat].find(t => t.id === id);
      if (found) return { ...found, category: cat };
    }
  }
  return null;
}

function getAllOperations() {
  const cycleData = getCurrentCycleData();
  const allOps = [];
  const categories = ['income', 'fixed', 'variable', ...state.customCategories.map(c => c.id)];

  categories.forEach(cat => {
    if (cycleData[cat]) {
      cycleData[cat].forEach(t => allOps.push({ ...t, category: cat }));
    }
  });

  return allOps;
}

// ---- Start Capital ----
function setStartCapital(value) {
  state.startCapital = value;
  markDirty();
  notifyListeners();
}

// ---- Custom Categories ----
function addCustomCategory(name, color) {
  const cat = { id: uuid(), name: name.trim(), color: color || '#8b5cf6', type: 'expense' };
  state.customCategories.push(cat);
  // Initialize array in all existing cycles
  for (const ck in state.cycles) {
    if (!state.cycles[ck][cat.id]) {
      state.cycles[ck][cat.id] = [];
    }
  }
  markDirty();
  notifyListeners();
  return cat;
}

function deleteCustomCategory(categoryId) {
  state.customCategories = state.customCategories.filter(c => c.id !== categoryId);
  // Move operations from this category to 'variable'
  for (const ck in state.cycles) {
    if (state.cycles[ck][categoryId]) {
      const ops = state.cycles[ck][categoryId] || [];
      ops.forEach(op => {
        state.cycles[ck].variable.push({ ...op, id: uuid() });
      });
      delete state.cycles[ck][categoryId];
    }
  }
  // Remove budget limit for this category
  delete state.budgetLimits[categoryId];
  markDirty();
  notifyListeners();
}

function updateCustomCategory(categoryId, name, color) {
  const cat = state.customCategories.find(c => c.id === categoryId);
  if (!cat) return;
  if (name) cat.name = name.trim();
  if (color) cat.color = color;
  markDirty();
  notifyListeners();
}

// ---- Budget Limits ----
function setBudgetLimit(categoryId, limit) {
  if (limit <= 0) {
    delete state.budgetLimits[categoryId];
  } else {
    state.budgetLimits[categoryId] = limit;
  }
  markDirty();
  notifyListeners();
}

// ---- Goals ----
function addGoal(name, target, current = 0) {
  const goal = { id: uuid(), name: name.trim(), target: Math.abs(target), current: Math.abs(current) };
  state.goals.push(goal);
  markDirty();
  notifyListeners();
  return goal;
}

function updateGoal(id, current) {
  const goal = state.goals.find(g => g.id === id);
  if (!goal) return;
  goal.current = Math.abs(current);
  markDirty();
  notifyListeners();
}

function deleteGoal(id) {
  state.goals = state.goals.filter(g => g.id !== id);
  markDirty();
  notifyListeners();
}

// ---- Recurring Transactions ----
function addRecurringTransaction(name, amount, day, category) {
  const nextDate = calculateNextDate(day);
  const rt = {
    id: uuid(),
    name: name.trim(),
    amount: Math.abs(amount),
    day: Math.min(Math.max(1, day), 28),
    category,
    nextDate
  };
  state.recurringTransactions.push(rt);
  markDirty();
  notifyListeners();
  return rt;
}

function deleteRecurringTransaction(id) {
  state.recurringTransactions = state.recurringTransactions.filter(r => r.id !== id);
  markDirty();
  notifyListeners();
}

function calculateNextDate(day) {
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth();
  if (now.getDate() > day) {
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function processRecurringTransactions() {
  const today = new Date().toISOString().split('T')[0];
  let processed = 0;

  state.recurringTransactions.forEach(rt => {
    if (rt.nextDate <= today) {
      // Add operation
      const cycleData = getCurrentCycleData();
      const op = {
        id: uuid(),
        name: rt.name,
        date: rt.nextDate,
        amount: rt.amount
      };
      // Determine category
      const cat = rt.category === 'income' ? 'income' :
                  rt.category === 'fixed' ? 'fixed' :
                  state.customCategories.find(c => c.id === rt.category) ? rt.category : 'variable';

      if (!cycleData[cat]) cycleData[cat] = [];
      cycleData[cat].push(op);

      // Calculate next date
      const [y, m, d] = rt.nextDate.split('-').map(Number);
      let nm = m + 1;
      let ny = y;
      if (nm > 12) { nm = 1; ny += 1; }
      rt.nextDate = `${ny}-${String(nm).padStart(2, '0')}-${String(rt.day).padStart(2, '0')}`;

      processed++;
    }
  });

  if (processed > 0) {
    markDirty();
    notifyListeners();
  }
}

// ---- Tags ----
function addTag(tag) {
  tag = tag.trim().toLowerCase();
  if (!tag || state.tags.includes(tag)) return;
  state.tags.push(tag);
  markDirty();
  notifyListeners();
}

function removeTag(tag) {
  state.tags = state.tags.filter(t => t !== tag);
  markDirty();
  notifyListeners();
}

// ---- Cycle Management ----
function changeCycle(newCycle) {
  if (newCycle === state.currentCycle) return;
  state.currentCycle = newCycle;
  getCycleData(newCycle); // ensure it exists
  markDirty();
  notifyListeners();
}

function applyTemplate() {
  const currentKey = state.currentCycle;
  const [y, m] = currentKey.split('-').map(Number);
  let py = y, pm = m - 1;
  if (pm <= 0) { pm = 12; py -= 1; }
  const prevKey = `${py}-${String(pm).padStart(2, '0')}`;

  const prevData = state.cycles[prevKey];
  if (!prevData || !prevData.fixed || prevData.fixed.length === 0) {
    return { error: 'templateNoFixed' };
  }

  const currentData = getCurrentCycleData();
  let copied = 0;

  prevData.fixed.forEach(op => {
    const oldDate = new Date(op.date + 'T00:00:00');
    const day = oldDate.getDate();
    const newDate = new Date(y, m - 1, day);
    const dateStr = newDate.toISOString().split('T')[0];

    // Check if similar already exists
    const exists = currentData.fixed.some(t =>
      t.name === op.name && new Date(t.date + 'T00:00:00').getDate() === day
    );
    if (exists) return;

    currentData.fixed.push({
      id: uuid(),
      name: op.name,
      date: dateStr,
      amount: op.amount
    });
    copied++;
  });

  if (copied > 0) {
    markDirty();
    notifyListeners();
  }

  return { copied };
}

export {
  addOperation,
  deleteOperation,
  updateOperation,
  findOperation,
  getAllOperations,
  setStartCapital,
  addCustomCategory,
  deleteCustomCategory,
  updateCustomCategory,
  setBudgetLimit,
  addGoal,
  updateGoal,
  deleteGoal,
  addRecurringTransaction,
  deleteRecurringTransaction,
  processRecurringTransactions,
  addTag,
  removeTag,
  changeCycle,
  applyTemplate
};