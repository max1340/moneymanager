// ============================================
// Financy PRO v2.0 — Main Application Controller
// Firebase RTDB edition
// ============================================

import { state, subscribe } from './state.js';
import {
  calcTotalIncome, calcTotalExpenses, calcRemainingBudget,
  calcOverallBalance, calcExpensePercent, calcBudgetProgress,
  calcCashFlowForecast, calcGoalProgress
} from './calculations.js';
import {
  addOperation, deleteOperation, updateOperation,
  findOperation, getAllOperations, setStartCapital,
  addCustomCategory, deleteCustomCategory, setBudgetLimit,
  addGoal, deleteGoal, addRecurringTransaction,
  deleteRecurringTransaction, processRecurringTransactions,
  changeCycle, applyTemplate
} from './crud.js';
import { renderDonutChart, renderTrendChart } from './charts.js';
import {
  setStatusCallbacks, loadFromFirebase, subscribeToRealtime,
  markDirty, exportToCSV, exportToJSON, importFromCSV, importFromJSON,
} from './firebase-db.js';
import {
  uuid, formatDate, toInputDate, getInitials, cycleLabel,
  cycleRange, currentCycleKey, generateCycleOptions, escapeHtml, pluralize
} from './utils.js';

// ---- State ----
let currentSort = { column: 'date', direction: 'desc' };
let searchQuery = '';
let filterCategory = 'all';
let editTarget = null;
let undoStack = [];

// ---- Initialize ----
async function init() {
  initTheme();

  setStatusCallbacks({
    onStatusChange: updateSyncStatusUI,
    onSavingChange: updateSavingIndicator,
    onTimerUpdate: () => {}, // no-op
  });

  // Show loading state
  updateSyncStatusUI(null); // "connecting"

  // Load data from Firebase (falls back to localStorage if offline)
  const hasData = await loadFromFirebase();

  // Start real-time listener for cross-device sync
  subscribeToRealtime();

  setupEventListeners();
  setDefaultDates();
  subscribe(renderAll);

  if (hasData && state.currentCycle) {
    document.getElementById('setupOverlay').classList.remove('active');
    renderAll();
    processRecurringTransactions();
    return;
  }

  // Check localStorage for setup flag
  const setupDone = localStorage.getItem('financy_setup_done') === 'true';
  if (setupDone) {
    state.currentCycle = currentCycleKey();
    document.getElementById('setupOverlay').classList.remove('active');
    renderAll();
    processRecurringTransactions();
    return;
  }

  // First run: show setup
  showSetup();
}

// ---- Theme ----
function initTheme() {
  const saved = localStorage.getItem('financy_theme');
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.getElementById('themeToggle').textContent = '☀️';
  }
}

function toggleTheme() {
  const html = document.documentElement;
  const btn = document.getElementById('themeToggle');
  if (html.getAttribute('data-theme') === 'dark') {
    html.removeAttribute('data-theme');
    btn.textContent = '🌙';
    localStorage.setItem('financy_theme', 'light');
  } else {
    html.setAttribute('data-theme', 'dark');
    btn.textContent = '☀️';
    localStorage.setItem('financy_theme', 'dark');
  }
}

// ---- Sync Status Bar ----
function updateSyncStatusUI(connected) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  if (connected === null) {
    el.innerHTML = '<span class="dot yellow"></span><span class="status-text">Подключение...</span>';
  } else if (connected) {
    el.innerHTML = '<span class="dot green"></span><span class="status-text">Firebase</span>';
  } else {
    el.innerHTML = '<span class="dot red"></span><span class="status-text">Оффлайн</span>';
  }
}

function updateSavingIndicator(isSaving) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  if (isSaving) {
    el.innerHTML = '<span class="dot blue"></span><span class="status-text">Синхронизация...</span>';
  } else {
    updateSyncStatusUI(true);
  }
}

// ---- Render All ----
function renderAll() {
  const cycleData = getCurrentCycleData();
  const totalIncome = calcTotalIncome(cycleData);
  const totalExpenses = calcTotalExpenses(cycleData);
  const remaining = calcRemainingBudget(cycleData);
  const overall = calcOverallBalance();

  // Metric cards
  document.getElementById('totalBalance').textContent = overall.toFixed(2) + ' ₪';
  document.getElementById('cycleIncome').textContent = totalIncome.toFixed(2) + ' ₪';
  document.getElementById('cycleIncomeSub').textContent = cycleRange(state.currentCycle);

  const remainingEl = document.getElementById('remainingBudget');
  remainingEl.textContent = remaining.toFixed(2) + ' ₪';
  remainingEl.classList.toggle('danger', remaining < 0);
  remainingEl.classList.toggle('success', remaining >= 0);

  // Expense percent chip
  const pct = calcExpensePercent(cycleData);
  const chip = document.getElementById('expensePercent');
  chip.textContent = pct.toFixed(1) + '%';
  chip.className = 'chip';
  if (pct > 90) chip.classList.add('chip-danger');
  else if (pct > 70) chip.classList.add('chip-warning');
  else chip.classList.add('chip-primary');

  // Start capital
  document.getElementById('startCapitalInput').value = state.startCapital || '';

  // Charts
  renderDonutChart(cycleData);
  renderTrendChart();

  // Operations table
  renderOperations();

  // Cycle selector
  updateCycleSelector();

  // Budget limits
  renderBudgetLimits();

  // Goals
  renderGoals();

  // Cash flow forecast
  renderCashFlowForecast();

  // Update filter options
  updateFilterOptions();
}

// ---- Operations Table ----
function renderOperations() {
  let allOps = getAllOperations();

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    allOps = allOps.filter(op => op.name.toLowerCase().includes(q));
  }
  if (filterCategory !== 'all') {
    allOps = allOps.filter(op => op.category === filterCategory);
  }

  allOps.sort((a, b) => {
    let cmp = 0;
    if (currentSort.column === 'date') cmp = a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    else if (currentSort.column === 'name') cmp = a.name.localeCompare(b.name);
    else if (currentSort.column === 'amount') cmp = a.amount - b.amount;
    else if (currentSort.column === 'category') cmp = (a.category || '').localeCompare(b.category || '');
    return currentSort.direction === 'desc' ? -cmp : cmp;
  });

  const tbody = document.getElementById('operationsBody');
  const empty = document.getElementById('emptyState');
  const mobileList = document.getElementById('mobileOpsList');

  if (allOps.length === 0) {
    tbody.innerHTML = '';
    if (mobileList) mobileList.innerHTML = '';
    empty.style.display = 'block';
    document.getElementById('operationsCount').textContent = '0 операций';
    document.getElementById('searchInput').value = searchQuery;
    return;
  }

  empty.style.display = 'none';
  const count = allOps.length;
  document.getElementById('operationsCount').textContent =
    count + ' ' + pluralize(count, ['операция', 'операции', 'операций']);

  const catNames = { income: 'Доход', fixed: 'Постоянная', variable: 'Непостоянная' };
  const catClasses = { income: 'category-income', fixed: 'category-fixed', variable: 'category-variable' };
  state.customCategories.forEach(c => { catNames[c.id] = c.name; });

  // Desktop table rows
  let tableHtml = '';
  // Mobile card items
  let mobileHtml = '';

  allOps.forEach(op => {
    const isIncome = op.category === 'income';
    const amountClass = isIncome ? 'positive' : 'negative';
    const sign = isIncome ? '+' : '−';
    const catClass = catClasses[op.category] || 'category-variable';
    const catName = catNames[op.category] || op.category;

    tableHtml += `
      <tr class="row-enter">
        <td><div class="avatar">${getInitials(op.name)}</div></td>
        <td>${escapeHtml(op.name)}</td>
        <td>${formatDate(op.date)}</td>
        <td><span class="category-badge ${catClass}">${catName}</span></td>
        <td class="amount ${amountClass}">${sign} ${op.amount.toFixed(2)} ₪</td>
        <td>
          <div class="action-cell">
            <button class="edit-btn" data-category="${op.category}" data-id="${op.id}" title="Редактировать">✏️</button>
            <button class="delete-btn danger" data-category="${op.category}" data-id="${op.id}" title="Удалить">×</button>
          </div>
        </td>
      </tr>
    `;

    mobileHtml += `
      <div class="mobile-op-card row-enter">
        <div class="mobile-op-left">
          <div class="avatar">${getInitials(op.name)}</div>
          <div class="mobile-op-info">
            <div class="mobile-op-name">${escapeHtml(op.name)}</div>
            <div class="mobile-op-meta">
              <span class="category-badge ${catClass}">${catName}</span>
              <span class="mobile-op-date">${formatDate(op.date)}</span>
            </div>
          </div>
        </div>
        <div class="mobile-op-right">
          <div class="amount ${amountClass}">${sign} ${op.amount.toFixed(2)} ₪</div>
          <div class="mobile-op-actions">
            <button class="edit-btn" data-category="${op.category}" data-id="${op.id}">✏️</button>
            <button class="delete-btn danger" data-category="${op.category}" data-id="${op.id}">×</button>
          </div>
        </div>
      </div>
    `;
  });

  tbody.innerHTML = tableHtml;
  if (mobileList) mobileList.innerHTML = mobileHtml;

  // Attach events to both table and mobile cards
  [tbody, mobileList].filter(Boolean).forEach(container => {
    container.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.category, btn.dataset.id));
    });
    container.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', () => showDeleteConfirm(btn.dataset.category, btn.dataset.id));
    });
  });

  document.getElementById('searchInput').value = searchQuery;
}

// ---- Delete with Undo ----
function showDeleteConfirm(category, id) {
  const op = findOperation(category, id);
  if (!op) return;

  const overlay = document.getElementById('confirmOverlay');
  document.getElementById('confirmTitle').textContent = 'Подтверждение удаления';
  document.getElementById('confirmText').textContent =
    `Удалить операцию «${op.name}» на сумму ${op.amount.toFixed(2)} ₪?`;
  overlay.classList.add('active');

  document.getElementById('confirmYesBtn').onclick = () => {
    overlay.classList.remove('active');
    performDelete(category, id, op);
  };
  document.getElementById('confirmNoBtn').onclick = () => {
    overlay.classList.remove('active');
  };
}

function performDelete(category, id, op) {
  const removed = deleteOperation(category, id);
  if (removed) {
    undoStack.push({ type: 'delete', category, data: removed, timestamp: Date.now() });
    showUndoSnackbar(`Удалена операция «${removed.name}»`);
    if (undoStack.length > 10) undoStack.shift();
  }
}

function undoLastDelete() {
  const last = undoStack.pop();
  if (!last || last.type !== 'delete') return;
  const cycleData = getCurrentCycleData();
  cycleData[last.category].push(last.data);
  markDirty();
  renderAll();
  hideUndoSnackbar();
}

function showUndoSnackbar(message) {
  const snackbar = document.getElementById('undoSnackbar');
  snackbar.querySelector('.snackbar-text').textContent = message;
  snackbar.classList.add('active');
  setTimeout(() => { if (undoStack.length === 0) hideUndoSnackbar(); }, 5000);
}

function hideUndoSnackbar() {
  document.getElementById('undoSnackbar').classList.remove('active');
}

// ---- Cycle Selector ----
function updateCycleSelector() {
  const sel = document.getElementById('cycleSelect');
  const options = generateCycleOptions(state.currentCycle);
  sel.innerHTML = options
    .map(key => `<option value="${key}"${key === state.currentCycle ? ' selected' : ''}>${cycleLabel(key)}</option>`)
    .join('');
}

// ---- Budget Limits ----
function renderBudgetLimits() {
  const container = document.getElementById('budgetLimitsContainer');
  if (!container) return;
  const cycleData = getCurrentCycleData();
  let html = '';

  ['fixed', 'variable'].forEach(catId => {
    const catName = catId === 'fixed' ? 'Постоянные' : 'Непостоянные';
    const progress = calcBudgetProgress(catId, cycleData);
    if (progress) html += renderBudgetBar(catId, catName, progress);
  });

  state.customCategories.forEach(cat => {
    const progress = calcBudgetProgress(cat.id, cycleData);
    if (progress) html += renderBudgetBar(cat.id, cat.name, progress);
  });

  if (!html) html = '<div class="empty-state" style="padding:10px;"><p>Лимиты не установлены</p></div>';
  container.innerHTML = html;
}

function renderBudgetBar(id, name, progress) {
  const barClass = progress.percent > 90 ? 'danger' : progress.percent > 70 ? 'warning' : 'normal';
  return `
    <div class="budget-bar-item">
      <div class="budget-bar-header">
        <span class="budget-bar-label">${name}</span>
        <span class="budget-bar-value">${progress.spent.toFixed(0)} / ${progress.limit.toFixed(0)} ₪ (${progress.percent.toFixed(0)}%)</span>
      </div>
      <div class="budget-bar-track">
        <div class="budget-bar-fill ${barClass}" style="width:${progress.percent}%"></div>
      </div>
    </div>
  `;
}

// ---- Goals ----
function renderGoals() {
  const container = document.getElementById('goalsContainer');
  if (!container) return;

  if (state.goals.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:10px;"><p>Цели не добавлены</p></div>';
    return;
  }

  let html = '';
  state.goals.forEach(goal => {
    const progress = calcGoalProgress(goal);
    const barClass = progress >= 100 ? 'normal' : progress > 50 ? 'warning' : 'danger';
    html += `
      <div class="goal-card">
        <div class="goal-header">
          <span class="goal-name">${escapeHtml(goal.name)}</span>
          <span class="goal-amount">${goal.current.toFixed(0)} / ${goal.target.toFixed(0)} ₪</span>
        </div>
        <div class="budget-bar-track">
          <div class="budget-bar-fill ${barClass}" style="width:${Math.min(progress, 100)}%"></div>
        </div>
        <div class="goal-progress-text">${progress.toFixed(0)}% выполнено</div>
      </div>
    `;
  });
  container.innerHTML = html;
}

// ---- Cash Flow Forecast ----
function renderCashFlowForecast() {
  const container = document.getElementById('forecastContainer');
  if (!container) return;

  const forecast = calcCashFlowForecast(3);
  if (!forecast) {
    container.innerHTML = '<div class="empty-state" style="padding:10px;"><p>Недостаточно данных для прогноза</p></div>';
    return;
  }

  const balanceChange = forecast.avgMonthlySavings >= 0 ? '+' : '';
  const changeColor = forecast.avgMonthlySavings >= 0 ? 'var(--success)' : 'var(--danger)';

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div>
        <div style="font-size:0.75rem;color:var(--text-muted);">Средний доход/мес</div>
        <div style="font-weight:600;">${forecast.avgMonthlyIncome.toFixed(0)} ₪</div>
      </div>
      <div>
        <div style="font-size:0.75rem;color:var(--text-muted);">Средний расход/мес</div>
        <div style="font-weight:600;">${forecast.avgMonthlyExpenses.toFixed(0)} ₪</div>
      </div>
      <div>
        <div style="font-size:0.75rem;color:var(--text-muted);">Экономия/мес</div>
        <div style="font-weight:600;color:${changeColor};">${balanceChange}${forecast.avgMonthlySavings.toFixed(0)} ₪</div>
      </div>
      <div>
        <div style="font-size:0.75rem;color:var(--text-muted);">Прогноз через 3 мес</div>
        <div style="font-weight:600;">${forecast.projectedBalance.toFixed(0)} ₪</div>
      </div>
    </div>
  `;
}

// ---- Search & Filter ----
function setupSearch() {
  const searchInput = document.getElementById('searchInput');
  const filterSelect = document.getElementById('filterSelect');

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    renderOperations();
  });

  filterSelect.addEventListener('change', () => {
    filterCategory = filterSelect.value;
    renderOperations();
  });

  updateFilterOptions();
}

function updateFilterOptions() {
  const sel = document.getElementById('filterSelect');
  let html = '<option value="all">Все категории</option>';
  html += '<option value="income">Доходы</option>';
  html += '<option value="fixed">Постоянные</option>';
  html += '<option value="variable">Непостоянные</option>';
  state.customCategories.forEach(c => {
    html += `<option value="${c.id}">${escapeHtml(c.name)}</option>`;
  });
  if (sel.innerHTML !== html) sel.innerHTML = html;
}

// ---- Edit Modal ----
function openEditModal(category, id) {
  const op = findOperation(category, id);
  if (!op) return;

  editTarget = { category, id };
  document.getElementById('editName').value = op.name;
  document.getElementById('editAmount').value = op.amount;

  const catSelect = document.getElementById('editCategory');
  let html = '<option value="income">Доход</option>';
  html += '<option value="fixed">Постоянная трата</option>';
  html += '<option value="variable">Непостоянная трата</option>';
  state.customCategories.forEach(c => {
    html += `<option value="${c.id}">${escapeHtml(c.name)}</option>`;
  });
  catSelect.innerHTML = html;
  catSelect.value = op.category;

  document.getElementById('editModal').classList.add('active');
}

function closeEditModal() {
  document.getElementById('editModal').classList.remove('active');
  editTarget = null;
}

function saveEdit() {
  if (!editTarget) return;
  const name = document.getElementById('editName').value.trim();
  const amount = parseFloat(document.getElementById('editAmount').value);
  const category = document.getElementById('editCategory').value;
  if (!name || isNaN(amount) || amount <= 0) {
    alert('Пожалуйста, заполните все поля корректно.');
    return;
  }
  updateOperation(editTarget.category, editTarget.id, name, amount, category);
  closeEditModal();
}

// ---- Setup ----
function showSetup() {
  const overlay = document.getElementById('setupOverlay');
  overlay.classList.add('active');
  const sel = document.getElementById('setupCycleSelect');
  const options = generateCycleOptions(currentCycleKey());
  sel.innerHTML = options
    .map(key => `<option value="${key}">${cycleLabel(key)} (${cycleRange(key)})</option>`)
    .join('');
  sel.value = currentCycleKey();
}

function completeSetup() {
  const sel = document.getElementById('setupCycleSelect');
  state.currentCycle = sel.value;
  document.getElementById('setupOverlay').classList.remove('active');
  localStorage.setItem('financy_setup_done', 'true');
  processRecurringTransactions();
  renderAll();
  markDirty();
}

// ---- Category Management Modal ----
function openCategoriesModal() {
  const overlay = document.getElementById('categoriesModal');
  const container = document.getElementById('categoriesList');
  overlay.classList.add('active');

  let html = '';
  state.customCategories.forEach(cat => {
    html += `
      <div class="category-list-item">
        <div class="category-color-dot" style="background:${cat.color};"></div>
        <span class="category-list-name">${escapeHtml(cat.name)}</span>
        <button class="btn btn-danger btn-xs del-cat-btn" data-id="${cat.id}">×</button>
      </div>
    `;
  });

  if (!html) html = '<div class="empty-state" style="padding:10px;"><p>Нет пользовательских категорий</p></div>';
  container.innerHTML = html;

  container.querySelectorAll('.del-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Удалить категорию? Операции перейдут в «Непостоянные».')) {
        deleteCustomCategory(btn.dataset.id);
        openCategoriesModal();
        updateFilterOptions();
      }
    });
  });
}

function closeCategoriesModal() {
  document.getElementById('categoriesModal').classList.remove('active');
}

// ---- Goals Modal ----
function openGoalsModal() {
  document.getElementById('goalsModal').classList.add('active');
}

function closeGoalsModal() {
  document.getElementById('goalsModal').classList.remove('active');
}

function addGoalFromModal() {
  const name = document.getElementById('goalNameInput').value.trim();
  const target = parseFloat(document.getElementById('goalTargetInput').value);
  const current = parseFloat(document.getElementById('goalCurrentInput').value) || 0;
  if (!name || isNaN(target) || target <= 0) {
    alert('Заполните название и целевую сумму.');
    return;
  }
  addGoal(name, target, current);
  document.getElementById('goalNameInput').value = '';
  document.getElementById('goalTargetInput').value = '';
  document.getElementById('goalCurrentInput').value = '';
  closeGoalsModal();
}

// ---- Budget Limit Modal ----
function openBudgetModal() {
  const overlay = document.getElementById('budgetModal');
  const container = document.getElementById('budgetEditContainer');
  overlay.classList.add('active');

  let html = '';
  ['fixed', 'variable'].forEach(catId => {
    const name = catId === 'fixed' ? 'Постоянные' : 'Непостоянные';
    const val = state.budgetLimits[catId] || '';
    html += `
      <div class="form-row" style="margin-bottom:10px;">
        <span style="min-width:120px;font-size:0.85rem;">${name}</span>
        <input type="number" class="budget-limit-input" data-cat="${catId}" value="${val}" placeholder="Лимит ₪" style="flex:1;min-width:80px;">
      </div>
    `;
  });

  state.customCategories.forEach(cat => {
    const val = state.budgetLimits[cat.id] || '';
    html += `
      <div class="form-row" style="margin-bottom:10px;">
        <span style="min-width:120px;font-size:0.85rem;">${escapeHtml(cat.name)}</span>
        <input type="number" class="budget-limit-input" data-cat="${cat.id}" value="${val}" placeholder="Лимит ₪" style="flex:1;min-width:80px;">
      </div>
    `;
  });

  container.innerHTML = html;
}

function closeBudgetModal() {
  document.getElementById('budgetModal').classList.remove('active');
}

function saveBudgetLimits() {
  document.querySelectorAll('.budget-limit-input').forEach(input => {
    const cat = input.dataset.cat;
    const val = parseFloat(input.value);
    setBudgetLimit(cat, isNaN(val) ? 0 : val);
  });
  closeBudgetModal();
}

// ---- Recurring Transactions Modal ----
function openRecurringModal() {
  const overlay = document.getElementById('recurringModal');
  const container = document.getElementById('recurringList');
  overlay.classList.add('active');

  if (state.recurringTransactions.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:10px;"><p>Нет регулярных транзакций</p></div>';
    return;
  }

  const catNames = { income: 'Доход', fixed: 'Постоянная', variable: 'Непостоянная' };
  state.customCategories.forEach(c => { catNames[c.id] = c.name; });

  let html = '';
  state.recurringTransactions.forEach(rt => {
    html += `
      <div class="category-list-item">
        <span class="category-list-name">
          ${escapeHtml(rt.name)} — ${rt.amount.toFixed(0)} ₪ (${catNames[rt.category] || rt.category}, ${rt.day}-го числа)
        </span>
        <button class="btn btn-danger btn-xs del-rec-btn" data-id="${rt.id}">×</button>
      </div>
    `;
  });
  container.innerHTML = html;

  container.querySelectorAll('.del-rec-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteRecurringTransaction(btn.dataset.id);
      openRecurringModal();
    });
  });
}

function closeRecurringModal() {
  document.getElementById('recurringModal').classList.remove('active');
}

function addRecurringFromModal() {
  const name = document.getElementById('recNameInput').value.trim();
  const amount = parseFloat(document.getElementById('recAmountInput').value);
  const day = parseInt(document.getElementById('recDayInput').value);
  const category = document.getElementById('recCategoryInput').value;
  if (!name || isNaN(amount) || amount <= 0 || isNaN(day) || day < 1 || day > 28) {
    alert('Заполните все поля корректно. День: 1-28.');
    return;
  }
  addRecurringTransaction(name, amount, day, category);
  document.getElementById('recNameInput').value = '';
  document.getElementById('recAmountInput').value = '';
  document.getElementById('recDayInput').value = '';
  closeRecurringModal();
}

// ---- Hotkeys ----
function setupHotkeys() {
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      if (e.key === 'Escape') closeAllModals();
      return;
    }
    switch (e.key) {
      case 'Escape': closeAllModals(); break;
      case 'n': case 'N':
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); document.getElementById('incomeName').focus(); }
        break;
      case 'f': case 'F':
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); document.getElementById('searchInput').focus(); }
        break;
      case '?': showHotkeysHelp(); break;
    }
  });
}

function closeAllModals() {
  ['editModal', 'categoriesModal', 'goalsModal', 'budgetModal',
    'recurringModal', 'hotkeysModal', 'reportModal', 'confirmOverlay'].forEach(id => {
    document.getElementById(id)?.classList.remove('active');
  });
}

function showHotkeysHelp() {
  document.getElementById('hotkeysModal').classList.add('active');
}

function closeHotkeysModal() {
  document.getElementById('hotkeysModal').classList.remove('active');
}

// ---- Annual Report ----
function generateAnnualReport() {
  const yearSelect = document.getElementById('reportYearSelect');
  const year = parseInt(yearSelect.value);
  const container = document.getElementById('reportContent');
  const monthNames = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];

  let totalIncome = 0, totalExpenses = 0;
  let monthlyData = [];

  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`;
    const cd = state.cycles[key];
    if (cd) {
      const inc = calcTotalIncome(cd);
      const exp = calcTotalExpenses(cd);
      totalIncome += inc;
      totalExpenses += exp;
      monthlyData.push({ month: m, income: inc, expenses: exp });
    } else {
      monthlyData.push({ month: m, income: 0, expenses: 0 });
    }
  }

  const balance = totalIncome - totalExpenses;
  const tableRows = monthlyData.map(d => `
    <tr>
      <td>${monthNames[d.month - 1]}</td>
      <td class="amount positive">${d.income.toFixed(0)} ₪</td>
      <td class="amount negative">${d.expenses.toFixed(0)} ₪</td>
      <td class="amount ${d.income - d.expenses >= 0 ? 'positive' : 'danger'}">${(d.income - d.expenses).toFixed(0)} ₪</td>
    </tr>
  `).join('');

  container.innerHTML = `
    <table>
      <thead><tr><th>Месяц</th><th>Доходы</th><th>Расходы</th><th>Результат</th></tr></thead>
      <tbody>
        ${tableRows}
        <tr style="font-weight:700;">
          <td>Итого</td>
          <td class="amount positive">${totalIncome.toFixed(0)} ₪</td>
          <td class="amount negative">${totalExpenses.toFixed(0)} ₪</td>
          <td class="amount ${balance >= 0 ? 'positive' : 'danger'}">${balance.toFixed(0)} ₪</td>
        </tr>
      </tbody>
    </table>
    <div style="margin-top:12px;font-size:0.85rem;color:var(--text-secondary);">
      Среднемесячный доход: ${(totalIncome / 12).toFixed(0)} ₪ |
      Среднемесячный расход: ${(totalExpenses / 12).toFixed(0)} ₪
    </div>
  `;
}

function openReportModal() {
  const overlay = document.getElementById('reportModal');
  const yearSelect = document.getElementById('reportYearSelect');
  overlay.classList.add('active');

  const years = new Set();
  for (const ck in state.cycles) {
    const [y] = ck.split('-').map(Number);
    years.add(y);
  }
  const currentYear = new Date().getFullYear();
  years.add(currentYear);
  yearSelect.innerHTML = Array.from(years).sort((a, b) => b - a)
    .map(y => `<option value="${y}"${y === currentYear ? ' selected' : ''}>${y}</option>`)
    .join('');

  generateAnnualReport();
}

function closeReportModal() {
  document.getElementById('reportModal').classList.remove('active');
}

// ---- Event Listeners ----
function setupEventListeners() {
  const today = new Date().toISOString().split('T')[0];

  // Cycle selector
  document.getElementById('cycleSelect').addEventListener('change', (e) => changeCycle(e.target.value));

  // Theme toggle
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  // Export/Import JSON (migration + backup)
  document.getElementById('importJsonBtn')?.addEventListener('click', async () => {
    try {
      const data = await importFromJSON();
      if (!data) return;

      const overlay = document.getElementById('confirmOverlay');
      document.getElementById('confirmTitle').textContent = 'Импорт из JSON';
      document.getElementById('confirmText').textContent =
        'Восстановить данные из выбранного JSON-файла? Все текущие данные будут заменены.';
      overlay.classList.add('active');

      document.getElementById('confirmYesBtn').onclick = () => {
        overlay.classList.remove('active');
        Object.assign(state, data);
        markDirty();
        renderAll();
        alert('Данные успешно импортированы!');
      };
      document.getElementById('confirmNoBtn').onclick = () => overlay.classList.remove('active');
    } catch (err) {
      alert('Ошибка импорта JSON: ' + err.message);
    }
  });

  // Export JSON
  document.getElementById('exportJsonBtn')?.addEventListener('click', exportToJSON);

  // Search
  setupSearch();

  // Set capital
  document.getElementById('setCapitalBtn').addEventListener('click', () => {
    const val = parseFloat(document.getElementById('startCapitalInput').value);
    if (!isNaN(val)) setStartCapital(val);
  });

  // Add income
  document.getElementById('addIncomeBtn').addEventListener('click', () => {
    const name = document.getElementById('incomeName').value;
    const date = document.getElementById('incomeDate').value;
    const amount = parseFloat(document.getElementById('incomeAmount').value);
    if (!name || isNaN(amount) || amount <= 0) { alert('Заполните название и сумму.'); return; }
    addOperation('income', name, date, amount);
    document.getElementById('incomeName').value = '';
    document.getElementById('incomeAmount').value = '';
    document.getElementById('incomeDate').value = today;
  });

  // Add fixed
  document.getElementById('addFixedBtn').addEventListener('click', () => {
    const name = document.getElementById('fixedName').value;
    const date = document.getElementById('fixedDate').value;
    const amount = parseFloat(document.getElementById('fixedAmount').value);
    if (!name || isNaN(amount) || amount <= 0) { alert('Заполните название и сумму.'); return; }
    addOperation('fixed', name, date, amount);
    document.getElementById('fixedName').value = '';
    document.getElementById('fixedAmount').value = '';
    document.getElementById('fixedDate').value = today;
  });

  // Add variable
  document.getElementById('addVariableBtn').addEventListener('click', () => {
    const name = document.getElementById('variableName').value;
    const date = document.getElementById('variableDate').value;
    const amount = parseFloat(document.getElementById('variableAmount').value);
    if (!name || isNaN(amount) || amount <= 0) { alert('Заполните название и сумму.'); return; }
    addOperation('variable', name, date, amount);
    document.getElementById('variableName').value = '';
    document.getElementById('variableAmount').value = '';
    document.getElementById('variableDate').value = today;
  });

  // Template
  document.getElementById('templateBtn').addEventListener('click', () => {
    const result = applyTemplate();
    if (result.error === 'templateNoFixed') alert('В предыдущем цикле нет постоянных трат для копирования.');
    else if (result.error === 'templateNoPrev') alert('Нет предыдущего цикла для копирования шаблона.');
  });

  // Table sort
  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const column = th.dataset.sort;
      if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        currentSort.column = column;
        currentSort.direction = 'desc';
      }
      renderOperations();
    });
  });

  // Edit modal
  document.getElementById('editCancelBtn').addEventListener('click', closeEditModal);
  document.getElementById('editSaveBtn').addEventListener('click', saveEdit);
  document.getElementById('editModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('editModal')) closeEditModal();
  });

  // Confirm modal
  document.getElementById('confirmOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('confirmOverlay')) {
      document.getElementById('confirmOverlay').classList.remove('active');
    }
  });

  // Undo
  document.getElementById('undoBtn').addEventListener('click', undoLastDelete);

  // Categories
  document.getElementById('addCategoryBtn').addEventListener('click', () => {
    const name = document.getElementById('newCategoryName').value.trim();
    const color = document.getElementById('newCategoryColor').value;
    if (!name) { alert('Введите название категории.'); return; }
    addCustomCategory(name, color);
    document.getElementById('newCategoryName').value = '';
    openCategoriesModal();
    updateFilterOptions();
  });
  document.getElementById('closeCategoriesBtn').addEventListener('click', closeCategoriesModal);
  document.getElementById('categoriesModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('categoriesModal')) closeCategoriesModal();
  });

  // Goals
  document.getElementById('addGoalBtn').addEventListener('click', openGoalsModal);
  document.getElementById('saveGoalBtn').addEventListener('click', addGoalFromModal);
  document.getElementById('closeGoalsBtn').addEventListener('click', closeGoalsModal);
  document.getElementById('goalsModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('goalsModal')) closeGoalsModal();
  });

  // Budget
  document.getElementById('editBudgetBtn').addEventListener('click', openBudgetModal);
  document.getElementById('saveBudgetBtn').addEventListener('click', saveBudgetLimits);
  document.getElementById('closeBudgetBtn').addEventListener('click', closeBudgetModal);
  document.getElementById('budgetModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('budgetModal')) closeBudgetModal();
  });

  // Recurring
  document.getElementById('addRecurringBtn').addEventListener('click', openRecurringModal);
  document.getElementById('saveRecurringBtn').addEventListener('click', addRecurringFromModal);
  document.getElementById('closeRecurringBtn').addEventListener('click', closeRecurringModal);
  document.getElementById('recurringModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('recurringModal')) closeRecurringModal();
  });

  // Export/Import CSV
  document.getElementById('exportBtn').addEventListener('click', exportToCSV);
  document.getElementById('importBtn').addEventListener('click', async () => {
    try {
      const count = await importFromCSV();
      if (count > 0) { renderAll(); alert(`Импортировано ${count} операций.`); }
    } catch (err) {
      alert('Ошибка импорта: ' + err.message);
    }
  });

  // Report
  document.getElementById('openReportBtn').addEventListener('click', openReportModal);
  document.getElementById('generateReportBtn').addEventListener('click', generateAnnualReport);
  document.getElementById('closeReportBtn').addEventListener('click', closeReportModal);
  document.getElementById('reportModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('reportModal')) closeReportModal();
  });

  // Hotkeys
  document.getElementById('closeHotkeysBtn').addEventListener('click', closeHotkeysModal);
  document.getElementById('hotkeysModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('hotkeysModal')) closeHotkeysModal();
  });

  // Setup
  document.getElementById('setupConfirmBtn').addEventListener('click', completeSetup);

  // Enter key on form inputs
  document.querySelectorAll('.form-row input').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const btn = input.parentElement.querySelector('.btn-primary');
        if (btn) btn.click();
      }
    });
  });

  // Hotkeys
  setupHotkeys();
}

function setDefaultDates() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('incomeDate').value = today;
  document.getElementById('fixedDate').value = today;
  document.getElementById('variableDate').value = today;
}

function getCurrentCycleData() {
  if (!state.cycles[state.currentCycle]) {
    state.cycles[state.currentCycle] = { income: [], fixed: [], variable: [] };
  }
  return state.cycles[state.currentCycle];
}

export { init };