// ============================================
// Financy PRO v2.0 — Main Application Controller
// Comprehensive UI/UX Overhaul
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
  uuid, formatDate, toInputDate, cycleLabel,
  cycleRange, currentCycleKey, generateCycleOptions,
  escapeHtml, pluralize, formatMoney
} from './utils.js';

// ---- Module State ----
let currentSort = { column: 'date', direction: 'desc' };
let searchQuery = '';
let filterType = 'all'; // 'all' | 'income' | 'expense'
let filterCategory = 'all';
let selectedOpForDetail = null;
let editTarget = null;
let undoStack = [];
let currentTab = 'overview';

// Unified Form State
let formType = 'expense'; // 'expense' | 'income'
let formSubtype = 'fixed'; // 'fixed' | 'variable'

// ---- Toast Notification System ----
function showToast(message, type = 'info', action = null, duration = 3500) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'status');

  let iconName = 'icon-bank';
  if (type === 'success') iconName = 'icon-check';
  else if (type === 'error') iconName = 'icon-x';
  else if (type === 'warning') iconName = 'icon-bank';
  else iconName = 'icon-cloud';

  let html = `
    <div class="toast-message">
      <svg class="icon"><use href="#${iconName}"></use></svg>
      <span>${escapeHtml(message)}</span>
    </div>
  `;

  if (action && action.text && typeof action.onClick === 'function') {
    html += `<button type="button" class="toast-action-btn">${escapeHtml(action.text)}</button>`;
  }

  toast.innerHTML = html;

  if (action && action.text && typeof action.onClick === 'function') {
    const actBtn = toast.querySelector('.toast-action-btn');
    if (actBtn) {
      actBtn.addEventListener('click', () => {
        action.onClick();
        dismissToast(toast);
      });
    }
  }

  container.appendChild(toast);

  const timer = setTimeout(() => {
    dismissToast(toast);
  }, duration);

  toast.addEventListener('click', (e) => {
    if (!e.target.classList.contains('toast-action-btn')) {
      clearTimeout(timer);
      dismissToast(toast);
    }
  });
}

function dismissToast(toast) {
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(8px)';
  toast.style.transition = 'all 0.2s ease-out';
  setTimeout(() => {
    if (toast.parentElement) toast.remove();
  }, 200);
}

// ---- Tab Router ----
function switchTab(tabName) {
  currentTab = tabName;

  // Update panels
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.remove('active');
  });
  const targetPanel = document.getElementById(`tab${capitalize(tabName)}`);
  if (targetPanel) targetPanel.classList.add('active');

  // Update desktop tabs
  document.querySelectorAll('.desktop-tabs .tab-btn').forEach(btn => {
    const isActive = btn.dataset.tabTarget === tabName;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  // Update mobile bottom bar tabs
  document.querySelectorAll('.bottom-tab-bar .bottom-tab-btn').forEach(btn => {
    const isActive = btn.dataset.tabTarget === tabName;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  // Re-render charts or lists if switching to relevant tab
  if (tabName === 'overview') {
    const cycleData = getCurrentCycleData();
    renderDonutChart(cycleData);
    renderTrendChart();
  } else if (tabName === 'operations') {
    renderOperations();
  }
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ---- Initialize Application ----
async function init() {
  initTheme();

  setStatusCallbacks({
    onStatusChange: updateSyncStatusUI,
    onSavingChange: updateSavingIndicator,
    onTimerUpdate: () => {},
  });

  updateSyncStatusUI(null);

  // Load data
  const hasData = await loadFromFirebase();
  subscribeToRealtime();

  setupEventListeners();
  setDefaultDates();
  setupUnifiedForm();
  updateCategoryDropdowns();
  subscribe(renderAll);

  if (hasData && state.currentCycle) {
    document.getElementById('setupOverlay')?.classList.remove('active');
    renderAll();
    processRecurringTransactions();
    return;
  }

  const setupDone = localStorage.getItem('financy_setup_done') === 'true';
  if (setupDone) {
    state.currentCycle = currentCycleKey();
    document.getElementById('setupOverlay')?.classList.remove('active');
    renderAll();
    processRecurringTransactions();
    return;
  }

  showSetup();
}

// ---- Theme ----
function initTheme() {
  const saved = localStorage.getItem('financy_theme');
  const themeLabel = document.getElementById('themeLabel');
  const themeIcon = document.getElementById('themeIcon');

  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    if (themeLabel) themeLabel.textContent = 'Светлая тема';
    if (themeIcon) themeIcon.innerHTML = '<use href="#icon-sun"></use>';
  } else {
    document.documentElement.removeAttribute('data-theme');
    if (themeLabel) themeLabel.textContent = 'Тёмная тема';
    if (themeIcon) themeIcon.innerHTML = '<use href="#icon-moon"></use>';
  }
}

function toggleTheme() {
  const html = document.documentElement;
  const themeLabel = document.getElementById('themeLabel');
  const themeIcon = document.getElementById('themeIcon');

  if (html.getAttribute('data-theme') === 'dark') {
    html.removeAttribute('data-theme');
    localStorage.setItem('financy_theme', 'light');
    if (themeLabel) themeLabel.textContent = 'Тёмная тема';
    if (themeIcon) themeIcon.innerHTML = '<use href="#icon-moon"></use>';
    showToast('Включена светлая тема', 'info');
  } else {
    html.setAttribute('data-theme', 'dark');
    localStorage.setItem('financy_theme', 'dark');
    if (themeLabel) themeLabel.textContent = 'Светлая тема';
    if (themeIcon) themeIcon.innerHTML = '<use href="#icon-sun"></use>';
    showToast('Включена тёмная тема', 'info');
  }
}

// ---- Sync Status UI ----
function updateSyncStatusUI(connected) {
  const el = document.getElementById('syncStatus');
  if (!el) return;

  if (connected === null) {
    el.className = 'sync-badge connecting';
    el.innerHTML = '<svg class="icon sync-icon"><use href="#icon-refresh"></use></svg><span class="status-text">Подключение...</span>';
  } else if (connected) {
    el.className = 'sync-badge';
    el.innerHTML = '<svg class="icon sync-icon"><use href="#icon-cloud"></use></svg><span class="status-text">Синхронизировано</span>';
  } else {
    el.className = 'sync-badge offline';
    el.innerHTML = '<svg class="icon sync-icon"><use href="#icon-cloud-off"></use></svg><span class="status-text">Оффлайн</span>';
  }
}

function updateSavingIndicator(isSaving) {
  const el = document.getElementById('syncStatus');
  if (!el) return;

  if (isSaving) {
    el.className = 'sync-badge connecting';
    el.innerHTML = '<svg class="icon sync-icon"><use href="#icon-refresh"></use></svg><span class="status-text">Сохранение...</span>';
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

  // Metric cards with formatMoney
  const totalBalanceEl = document.getElementById('totalBalance');
  if (totalBalanceEl) totalBalanceEl.textContent = formatMoney(overall);

  const cycleIncomeEl = document.getElementById('cycleIncome');
  if (cycleIncomeEl) cycleIncomeEl.textContent = formatMoney(totalIncome);

  const cycleIncomeSub = document.getElementById('cycleIncomeSub');
  if (cycleIncomeSub) cycleIncomeSub.textContent = cycleRange(state.currentCycle);

  const remainingEl = document.getElementById('remainingBudget');
  if (remainingEl) {
    remainingEl.textContent = formatMoney(remaining);
    remainingEl.classList.toggle('danger', remaining < 0);
    remainingEl.classList.toggle('success', remaining >= 0);
  }

  // Expense percent chip with explanatory subtitle
  const pct = calcExpensePercent(cycleData);
  const chip = document.getElementById('expensePercent');
  if (chip) {
    chip.textContent = pct.toFixed(1) + '%';
    chip.className = 'chip';
    if (pct > 90) chip.classList.add('chip-danger');
    else if (pct > 70) chip.classList.add('chip-warning');
    else chip.classList.add('chip-primary');
  }

  // Initial capital in Settings
  renderInitialCapital();

  // Charts
  renderDonutChart(cycleData);
  renderTrendChart();

  // Operations table & journal summary
  renderOperations();

  // Cycle selector
  updateCycleSelector();

  // Budget limits
  renderBudgetLimits();

  // Goals
  renderGoals();

  // Cash flow forecast
  renderCashFlowForecast();

  // Settings: categories & recurring
  renderSettingsCategories();
  renderSettingsRecurring();

  // Category dropdowns
  updateCategoryDropdowns();
}

// ---- Initial Capital Block in Settings ----
function renderInitialCapital() {
  const displayEl = document.getElementById('startCapitalDisplay');
  const inputEl = document.getElementById('startCapitalInput');
  const currentVal = state.startCapital || 0;

  if (displayEl) displayEl.textContent = formatMoney(currentVal);
  if (inputEl) inputEl.value = currentVal ? currentVal.toString() : '';
}

// ---- Unified Form Setup & Handling ----
function setupUnifiedForm() {
  const typeExpenseBtn = document.getElementById('typeExpenseBtn');
  const typeIncomeBtn = document.getElementById('typeIncomeBtn');
  const subFixedBtn = document.getElementById('subFixedBtn');
  const subVariableBtn = document.getElementById('subVariableBtn');
  const expenseSubtypeContainer = document.getElementById('expenseSubtypeContainer');
  const opSubmitBtnText = document.getElementById('opSubmitBtnText');
  const opCategoryGroup = document.getElementById('opCategoryGroup');
  const formHeaderTitle = document.getElementById('formHeaderTitle');
  const templateBtn = document.getElementById('templateBtn');

  // Segment: Expense vs Income
  typeExpenseBtn?.addEventListener('click', () => {
    formType = 'expense';
    typeExpenseBtn.classList.add('active');
    typeExpenseBtn.setAttribute('aria-checked', 'true');
    typeIncomeBtn.classList.remove('active');
    typeIncomeBtn.setAttribute('aria-checked', 'false');

    if (expenseSubtypeContainer) expenseSubtypeContainer.style.display = 'flex';
    if (opCategoryGroup) opCategoryGroup.style.display = 'flex';
    if (opSubmitBtnText) opSubmitBtnText.textContent = 'Добавить расход';
    if (formHeaderTitle) formHeaderTitle.textContent = 'Новый расход';
    if (templateBtn) templateBtn.style.display = 'inline-flex';
    updateCategoryDropdowns();
  });

  typeIncomeBtn?.addEventListener('click', () => {
    formType = 'income';
    typeIncomeBtn.classList.add('active');
    typeIncomeBtn.setAttribute('aria-checked', 'true');
    typeExpenseBtn.classList.remove('active');
    typeExpenseBtn.setAttribute('aria-checked', 'false');

    if (expenseSubtypeContainer) expenseSubtypeContainer.style.display = 'none';
    if (opCategoryGroup) opCategoryGroup.style.display = 'none';
    if (opSubmitBtnText) opSubmitBtnText.textContent = 'Добавить доход';
    if (formHeaderTitle) formHeaderTitle.textContent = 'Новый доход';
    if (templateBtn) templateBtn.style.display = 'none';
  });

  // Subtype: Fixed vs Variable
  subFixedBtn?.addEventListener('click', () => {
    formSubtype = 'fixed';
    subFixedBtn.classList.add('active');
    subFixedBtn.setAttribute('aria-checked', 'true');
    subVariableBtn.classList.remove('active');
    subVariableBtn.setAttribute('aria-checked', 'false');
    updateCategoryDropdowns();
  });

  subVariableBtn?.addEventListener('click', () => {
    formSubtype = 'variable';
    subVariableBtn.classList.add('active');
    subVariableBtn.setAttribute('aria-checked', 'true');
    subFixedBtn.classList.remove('active');
    subFixedBtn.setAttribute('aria-checked', 'false');
    updateCategoryDropdowns();
  });

  // Form Submit
  const form = document.getElementById('unifiedAddForm');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    submitUnifiedForm();
  });

  document.getElementById('opSubmitBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    submitUnifiedForm();
  });
}

function submitUnifiedForm() {
  const nameInput = document.getElementById('opName');
  const amountInput = document.getElementById('opAmount');
  const dateInput = document.getElementById('opDate');
  const categorySelect = document.getElementById('opCategory');

  const name = nameInput?.value.trim();
  const amount = parseFloat(amountInput?.value);
  const date = dateInput?.value || new Date().toISOString().split('T')[0];

  if (!name) {
    showToast('Укажите название операции', 'warning');
    nameInput?.focus();
    return;
  }
  if (isNaN(amount) || amount <= 0) {
    showToast('Укажите корректную сумму больше нуля', 'warning');
    amountInput?.focus();
    return;
  }

  let finalCategory = 'income';
  if (formType === 'income') {
    finalCategory = 'income';
    addOperation('income', name, date, amount);
    showToast(`Доход «${name}» на сумму ${formatMoney(amount)} добавлен`, 'success');
  } else {
    // Expense
    const selectedCat = categorySelect?.value;
    if (selectedCat && selectedCat !== 'fixed' && selectedCat !== 'variable') {
      finalCategory = selectedCat;
      addOperation(selectedCat, name, date, amount);
    } else if (formSubtype === 'fixed') {
      finalCategory = 'fixed';
      addOperation('fixed', name, date, amount);
    } else {
      finalCategory = 'variable';
      addOperation('variable', name, date, amount);
    }
    showToast(`Расход «${name}» на сумму ${formatMoney(amount)} добавлен`, 'success');
  }

  // Reset inputs but preserve date & type selection
  if (nameInput) nameInput.value = '';
  if (amountInput) amountInput.value = '';
  nameInput?.focus();
  renderAll();
}

// ---- Operations Journal & Details ----
function renderOperations() {
  const cycleData = getCurrentCycleData();
  const totalIncome = calcTotalIncome(cycleData);
  const totalExpenses = calcTotalExpenses(cycleData);
  const netBalance = totalIncome - totalExpenses;

  // Update Period Summary Bar
  const sumIncEl = document.getElementById('summaryTotalIncome');
  const sumExpEl = document.getElementById('summaryTotalExpenses');
  const sumNetEl = document.getElementById('summaryNetBalance');

  if (sumIncEl) sumIncEl.textContent = '+' + formatMoney(totalIncome);
  if (sumExpEl) sumExpEl.textContent = '−' + formatMoney(totalExpenses);
  if (sumNetEl) {
    sumNetEl.textContent = (netBalance >= 0 ? '+' : '') + formatMoney(netBalance);
    sumNetEl.style.color = netBalance >= 0 ? 'var(--success)' : 'var(--danger)';
  }

  let allOps = getAllOperations();

  // Search filter
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    allOps = allOps.filter(op => op.name.toLowerCase().includes(q));
  }

  // Type filter: all | income | expense
  if (filterType === 'income') {
    allOps = allOps.filter(op => op.category === 'income');
  } else if (filterType === 'expense') {
    allOps = allOps.filter(op => op.category !== 'income');
  }

  // Category filter
  if (filterCategory !== 'all') {
    allOps = allOps.filter(op => op.category === filterCategory);
  }

  // Sort
  allOps.sort((a, b) => {
    let cmp = 0;
    if (currentSort.column === 'date') cmp = a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    else if (currentSort.column === 'name') cmp = a.name.localeCompare(b.name);
    else if (currentSort.column === 'amount') cmp = a.amount - b.amount;
    return currentSort.direction === 'desc' ? -cmp : cmp;
  });

  const listContainer = document.getElementById('operationsList');
  const emptyState = document.getElementById('emptyState');
  const countEl = document.getElementById('operationsCount');

  if (!listContainer) return;

  if (allOps.length === 0) {
    listContainer.innerHTML = '';
    if (emptyState) emptyState.style.display = 'flex';
    if (countEl) countEl.textContent = '0 операций';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  const count = allOps.length;
  if (countEl) countEl.textContent = `${count} ${pluralize(count, ['операция', 'операции', 'операций'])}`;

  const catNames = { income: 'Доход', fixed: 'Постоянная', variable: 'Непостоянная' };
  const catClasses = { income: 'category-income', fixed: 'category-fixed', variable: 'category-variable' };
  state.customCategories.forEach(c => { catNames[c.id] = c.name; });

  let html = '';
  allOps.forEach(op => {
    const isIncome = op.category === 'income';
    const amountClass = isIncome ? 'positive' : 'negative';
    const sign = isIncome ? '+' : '−';
    const catClass = catClasses[op.category] || 'category-variable';
    const catName = catNames[op.category] || op.category;

    // SVG icon for category
    let iconName = 'icon-variable';
    let avatarClass = 'variable';
    let customColorStyle = '';

    if (isIncome) {
      iconName = 'icon-income';
      avatarClass = 'income';
    } else if (op.category === 'fixed') {
      iconName = 'icon-fixed';
      avatarClass = 'fixed';
    } else {
      const customCat = state.customCategories.find(c => c.id === op.category);
      if (customCat) {
        iconName = 'icon-tag';
        avatarClass = 'custom';
        customColorStyle = `background:${customCat.color};`;
      }
    }

    html += `
      <div class="operation-item" data-id="${op.id}" data-category="${op.category}" role="button" tabindex="0" aria-label="${escapeHtml(op.name)}, ${catName}, ${sign} ${formatMoney(op.amount)}">
        <div class="op-left">
          <div class="op-avatar ${avatarClass}" style="${customColorStyle}">
            <svg class="icon"><use href="#${iconName}"></use></svg>
          </div>
          <div class="op-info">
            <div class="op-name">${escapeHtml(op.name)}</div>
            <div class="op-meta">
              <span class="category-badge ${catClass}">${escapeHtml(catName)}</span>
              <span class="op-date">${formatDate(op.date)}</span>
            </div>
          </div>
        </div>
        <div class="op-right">
          <div class="op-amount ${amountClass}">${sign} ${formatMoney(op.amount)}</div>
        </div>
      </div>
    `;
  });

  listContainer.innerHTML = html;

  // Attach tap/click handlers to open detail sheet
  listContainer.querySelectorAll('.operation-item').forEach(item => {
    const handler = () => {
      openOperationDetail(item.dataset.category, item.dataset.id);
    };
    item.addEventListener('click', handler);
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handler();
      }
    });
  });
}

// ---- Operation Detail Sheet ----
function openOperationDetail(category, id) {
  const op = findOperation(category, id);
  if (!op) return;

  selectedOpForDetail = op;

  const modal = document.getElementById('opDetailModal');
  const nameEl = document.getElementById('detailOpName');
  const badgeEl = document.getElementById('detailCategoryBadge');
  const dateEl = document.getElementById('detailDate');
  const amountEl = document.getElementById('detailAmount');
  const iconEl = document.getElementById('detailCategoryIcon');
  const avatarEl = document.getElementById('detailAvatar');

  const isIncome = op.category === 'income';
  const catNames = { income: 'Доход', fixed: 'Постоянная трата', variable: 'Непостоянная трата' };
  state.customCategories.forEach(c => { catNames[c.id] = c.name; });

  if (nameEl) nameEl.textContent = op.name;
  if (badgeEl) badgeEl.textContent = catNames[op.category] || op.category;
  if (dateEl) dateEl.textContent = formatDate(op.date);

  if (amountEl) {
    const sign = isIncome ? '+' : '−';
    amountEl.textContent = `${sign} ${formatMoney(op.amount)}`;
    amountEl.style.color = isIncome ? 'var(--success)' : 'var(--danger)';
  }

  // Update Icon
  let iconName = 'icon-variable';
  let avatarBg = 'var(--chart-color-2)';
  if (isIncome) {
    iconName = 'icon-income';
    avatarBg = 'var(--success)';
  } else if (op.category === 'fixed') {
    iconName = 'icon-fixed';
    avatarBg = 'var(--chart-color-1)';
  } else {
    const customCat = state.customCategories.find(c => c.id === op.category);
    if (customCat) {
      iconName = 'icon-tag';
      avatarBg = customCat.color;
    }
  }

  if (iconEl) iconEl.innerHTML = `<use href="#${iconName}"></use>`;
  if (avatarEl) {
    avatarEl.style.background = avatarBg;
    avatarEl.style.color = '#ffffff';
  }

  if (modal) modal.classList.add('active');
}

function closeOperationDetail() {
  document.getElementById('opDetailModal')?.classList.remove('active');
  selectedOpForDetail = null;
}

function deleteSelectedDetailOp() {
  if (!selectedOpForDetail) return;
  const op = selectedOpForDetail;
  const removed = deleteOperation(op.category, op.id);

  if (removed) {
    undoStack.push({ type: 'delete', category: op.category, data: removed, timestamp: Date.now() });
    closeOperationDetail();
    renderAll();

    showToast(`Удалена операция «${removed.name}»`, 'info', {
      text: 'Отменить',
      onClick: () => undoLastDelete()
    }, 4500);
  }
}

function undoLastDelete() {
  const last = undoStack.pop();
  if (!last || last.type !== 'delete') return;

  const cycleData = getCurrentCycleData();
  if (cycleData[last.category]) {
    cycleData[last.category].push(last.data);
    markDirty();
    renderAll();
    showToast(`Операция «${last.data.name}» восстановлена`, 'success');
  }
}

// ---- Edit Modal ----
function openEditFromDetail() {
  if (!selectedOpForDetail) return;
  const op = selectedOpForDetail;
  closeOperationDetail();
  openEditModal(op.category, op.id);
}

function openEditModal(category, id) {
  const op = findOperation(category, id);
  if (!op) return;

  editTarget = { category, id };
  const nameInput = document.getElementById('editName');
  const amountInput = document.getElementById('editAmount');
  const catSelect = document.getElementById('editCategory');

  if (nameInput) nameInput.value = op.name;
  if (amountInput) amountInput.value = op.amount;

  if (catSelect) {
    let html = '<option value="income">Доход</option>';
    html += '<option value="fixed">Постоянная трата</option>';
    html += '<option value="variable">Непостоянная трата</option>';
    state.customCategories.forEach(c => {
      html += `<option value="${c.id}">${escapeHtml(c.name)}</option>`;
    });
    catSelect.innerHTML = html;
    catSelect.value = op.category;
  }

  document.getElementById('editModal')?.classList.add('active');
}

function closeEditModal() {
  document.getElementById('editModal')?.classList.remove('active');
  editTarget = null;
}

function saveEdit() {
  if (!editTarget) return;
  const name = document.getElementById('editName')?.value.trim();
  const amount = parseFloat(document.getElementById('editAmount')?.value);
  const category = document.getElementById('editCategory')?.value;

  if (!name || isNaN(amount) || amount <= 0) {
    showToast('Заполните корректно название и сумму', 'warning');
    return;
  }

  updateOperation(editTarget.category, editTarget.id, name, amount, category);
  closeEditModal();
  renderAll();
  showToast('Операция успешно обновлена', 'success');
}

// ---- Budget Limits ----
function renderBudgetLimits() {
  const container = document.getElementById('budgetLimitsContainer');
  if (!container) return;

  const cycleData = getCurrentCycleData();
  let hasAnyLimit = false;
  let html = '';

  ['fixed', 'variable'].forEach(catId => {
    const catName = catId === 'fixed' ? 'Постоянные' : 'Непостоянные';
    const progress = calcBudgetProgress(catId, cycleData);
    if (progress) {
      hasAnyLimit = true;
      html += renderBudgetBar(catId, catName, progress);
    }
  });

  state.customCategories.forEach(cat => {
    const progress = calcBudgetProgress(cat.id, cycleData);
    if (progress) {
      hasAnyLimit = true;
      html += renderBudgetBar(cat.id, cat.name, progress);
    }
  });

  if (!hasAnyLimit) {
    html = `
      <div class="empty-state" style="padding:16px;">
        <svg class="empty-icon"><use href="#icon-overview"></use></svg>
        <p>Лимиты не установлены</p>
        <button class="btn btn-outline btn-sm" id="emptyBudgetBtn">
          <svg class="icon"><use href="#icon-plus"></use></svg>
          <span>Установить лимиты</span>
        </button>
      </div>
    `;
  }

  container.innerHTML = html;

  container.querySelector('#emptyBudgetBtn')?.addEventListener('click', openBudgetModal);
}

function renderBudgetBar(id, name, progress) {
  const barClass = progress.percent > 90 ? 'danger' : progress.percent > 70 ? 'warning' : 'normal';
  return `
    <div class="budget-bar-item">
      <div class="budget-bar-header">
        <span class="budget-bar-label">${escapeHtml(name)}</span>
        <span class="budget-bar-value">${formatMoney(progress.spent)} из ${formatMoney(progress.limit)} (${progress.percent.toFixed(0)}%)</span>
      </div>
      <div class="budget-bar-track">
        <div class="budget-bar-fill ${barClass}" style="width:${progress.percent}%"></div>
      </div>
    </div>
  `;
}

function openBudgetModal() {
  const overlay = document.getElementById('budgetModal');
  const container = document.getElementById('budgetEditContainer');
  if (!overlay || !container) return;

  overlay.classList.add('active');

  let html = '';
  ['fixed', 'variable'].forEach(catId => {
    const name = catId === 'fixed' ? 'Постоянные' : 'Непостоянные';
    const val = state.budgetLimits[catId] || '';
    html += `
      <div class="modal-field" style="margin-bottom:12px;">
        <label>${name}</label>
        <input type="number" class="form-input budget-limit-input" data-cat="${catId}" value="${val}" placeholder="Лимит ₪" step="100">
      </div>
    `;
  });

  state.customCategories.forEach(cat => {
    const val = state.budgetLimits[cat.id] || '';
    html += `
      <div class="modal-field" style="margin-bottom:12px;">
        <label>${escapeHtml(cat.name)}</label>
        <input type="number" class="form-input budget-limit-input" data-cat="${cat.id}" value="${val}" placeholder="Лимит ₪" step="100">
      </div>
    `;
  });

  container.innerHTML = html;
}

function closeBudgetModal() {
  document.getElementById('budgetModal')?.classList.remove('active');
}

function saveBudgetLimits() {
  document.querySelectorAll('.budget-limit-input').forEach(input => {
    const cat = input.dataset.cat;
    const val = parseFloat(input.value);
    setBudgetLimit(cat, isNaN(val) ? 0 : val);
  });
  closeBudgetModal();
  renderAll();
  showToast('Бюджетные лимиты сохранены', 'success');
}

// ---- Financial Goals ----
function renderGoals() {
  const container = document.getElementById('goalsContainer');
  if (!container) return;

  if (state.goals.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding:24px;grid-column:1/-1;">
        <svg class="empty-icon"><use href="#icon-goals"></use></svg>
        <p>Цели пока не добавлены</p>
        <button class="btn btn-primary btn-sm" id="emptyGoalsBtn">
          <svg class="icon"><use href="#icon-plus"></use></svg>
          <span>Добавить цель</span>
        </button>
      </div>
    `;
    container.querySelector('#emptyGoalsBtn')?.addEventListener('click', openGoalsModal);
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
          <button class="btn btn-outline btn-xs del-goal-btn" data-id="${goal.id}" title="Удалить цель" aria-label="Удалить цель ${escapeHtml(goal.name)}">
            <svg class="icon"><use href="#icon-trash"></use></svg>
          </button>
        </div>
        <div class="goal-amount">${formatMoney(goal.current)} из ${formatMoney(goal.target)}</div>
        <div class="budget-bar-track">
          <div class="budget-bar-fill ${barClass}" style="width:${Math.min(progress, 100)}%"></div>
        </div>
        <div class="goal-progress-text">${progress.toFixed(0)}% достигнуто</div>
      </div>
    `;
  });

  container.innerHTML = html;

  container.querySelectorAll('.del-goal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteGoal(btn.dataset.id);
      renderAll();
      showToast('Цель удалена', 'info');
    });
  });
}

function openGoalsModal() {
  document.getElementById('goalsModal')?.classList.add('active');
}

function closeGoalsModal() {
  document.getElementById('goalsModal')?.classList.remove('active');
}

function addGoalFromModal() {
  const name = document.getElementById('goalNameInput')?.value.trim();
  const target = parseFloat(document.getElementById('goalTargetInput')?.value);
  const current = parseFloat(document.getElementById('goalCurrentInput')?.value) || 0;

  if (!name || isNaN(target) || target <= 0) {
    showToast('Укажите название цели и целевую сумму', 'warning');
    return;
  }

  addGoal(name, target, current);
  document.getElementById('goalNameInput').value = '';
  document.getElementById('goalTargetInput').value = '';
  document.getElementById('goalCurrentInput').value = '';
  closeGoalsModal();
  renderAll();
  showToast(`Цель «${name}» добавлена`, 'success');
}

// ---- Cash Flow Forecast ----
function renderCashFlowForecast() {
  const container = document.getElementById('forecastContainer');
  if (!container) return;

  const forecast = calcCashFlowForecast(3);
  if (!forecast) {
    container.innerHTML = `
      <div class="empty-state" style="padding:16px;">
        <svg class="empty-icon"><use href="#icon-bar-chart-2"></use></svg>
        <p>Недостаточно данных для прогноза (нужно от 2 циклов)</p>
      </div>
    `;
    return;
  }

  const changeColor = forecast.avgMonthlySavings >= 0 ? 'var(--success)' : 'var(--danger)';

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:14px;">
      <div class="card" style="padding:14px;background:var(--bg);">
        <div style="font-size:0.75rem;color:var(--text-secondary);font-weight:600;">Средний доход/мес</div>
        <div style="font-weight:700;font-size:1.125rem;margin-top:4px;">${formatMoney(forecast.avgMonthlyIncome)}</div>
      </div>
      <div class="card" style="padding:14px;background:var(--bg);">
        <div style="font-size:0.75rem;color:var(--text-secondary);font-weight:600;">Средний расход/мес</div>
        <div style="font-weight:700;font-size:1.125rem;margin-top:4px;">${formatMoney(forecast.avgMonthlyExpenses)}</div>
      </div>
      <div class="card" style="padding:14px;background:var(--bg);">
        <div style="font-size:0.75rem;color:var(--text-secondary);font-weight:600;">Экономия/мес</div>
        <div style="font-weight:700;font-size:1.125rem;margin-top:4px;color:${changeColor};">
          ${forecast.avgMonthlySavings >= 0 ? '+' : ''}${formatMoney(forecast.avgMonthlySavings)}
        </div>
      </div>
      <div class="card" style="padding:14px;background:var(--bg);">
        <div style="font-size:0.75rem;color:var(--text-secondary);font-weight:600;">Прогноз через 3 мес</div>
        <div style="font-weight:700;font-size:1.125rem;margin-top:4px;color:var(--primary);">${formatMoney(forecast.projectedBalance)}</div>
      </div>
    </div>
  `;
}

// ---- Settings Tab Components ----
function renderSettingsCategories() {
  const container = document.getElementById('categoriesList');
  if (!container) return;

  if (state.customCategories.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:12px;"><p>Пользовательских категорий нет</p></div>';
    return;
  }

  let html = '';
  state.customCategories.forEach(cat => {
    html += `
      <div class="category-list-item">
        <div style="display:flex;align-items:center;">
          <span class="category-color-dot" style="background:${cat.color};"></span>
          <span style="font-weight:600;font-size:0.9375rem;">${escapeHtml(cat.name)}</span>
        </div>
        <button class="btn btn-outline btn-xs del-custom-cat-btn" data-id="${cat.id}" title="Удалить категорию" aria-label="Удалить категорию ${escapeHtml(cat.name)}">
          <svg class="icon"><use href="#icon-trash"></use></svg>
        </button>
      </div>
    `;
  });

  container.innerHTML = html;

  container.querySelectorAll('.del-custom-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteCustomCategory(btn.dataset.id);
      renderAll();
      showToast('Категория удалена', 'info');
    });
  });
}

function renderSettingsRecurring() {
  const container = document.getElementById('recurringList');
  if (!container) return;

  if (state.recurringTransactions.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding:16px;">
        <svg class="empty-icon"><use href="#icon-refresh"></use></svg>
        <p>Нет регулярных транзакций</p>
        <button class="btn btn-outline btn-sm" id="emptyRecurringBtn">
          <svg class="icon"><use href="#icon-plus"></use></svg>
          <span>Добавить</span>
        </button>
      </div>
    `;
    container.querySelector('#emptyRecurringBtn')?.addEventListener('click', openRecurringModal);
    return;
  }

  const catNames = { income: 'Доход', fixed: 'Постоянная', variable: 'Непостоянная' };
  state.customCategories.forEach(c => { catNames[c.id] = c.name; });

  let html = '';
  state.recurringTransactions.forEach(rt => {
    html += `
      <div class="category-list-item">
        <div>
          <span style="font-weight:600;">${escapeHtml(rt.name)}</span> — ${formatMoney(rt.amount)}
          <span style="font-size:0.75rem;color:var(--text-muted);display:block;">
            ${catNames[rt.category] || rt.category}, списание ${rt.day}-го числа
          </span>
        </div>
        <button class="btn btn-outline btn-xs del-rec-btn" data-id="${rt.id}" title="Удалить регулярную транзакцию" aria-label="Удалить регулярную транзакцию ${escapeHtml(rt.name)}">
          <svg class="icon"><use href="#icon-trash"></use></svg>
        </button>
      </div>
    `;
  });

  container.innerHTML = html;

  container.querySelectorAll('.del-rec-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteRecurringTransaction(btn.dataset.id);
      renderAll();
      showToast('Регулярная транзакция удалена', 'info');
    });
  });
}

function openRecurringModal() {
  document.getElementById('recurringModal')?.classList.add('active');
}

function closeRecurringModal() {
  document.getElementById('recurringModal')?.classList.remove('active');
}

function addRecurringFromModal() {
  const name = document.getElementById('recNameInput')?.value.trim();
  const amount = parseFloat(document.getElementById('recAmountInput')?.value);
  const day = parseInt(document.getElementById('recDayInput')?.value);
  const category = document.getElementById('recCategoryInput')?.value;

  if (!name || isNaN(amount) || amount <= 0 || isNaN(day) || day < 1 || day > 28) {
    showToast('Заполните корректно все поля. День: от 1 до 28.', 'warning');
    return;
  }

  addRecurringTransaction(name, amount, day, category);
  document.getElementById('recNameInput').value = '';
  document.getElementById('recAmountInput').value = '';
  document.getElementById('recDayInput').value = '';
  closeRecurringModal();
  renderAll();
  showToast(`Регулярная транзакция «${name}» добавлена`, 'success');
}

// ---- Category Dropdowns Update ----
function updateCategoryDropdowns() {
  // Form Category Select
  const formCatSelect = document.getElementById('opCategory');
  if (formCatSelect) {
    let formOptions = '';
    if (formSubtype === 'fixed') {
      formOptions = '<option value="fixed">Постоянные (общие)</option>';
    } else {
      formOptions = '<option value="variable">Непостоянные (общие)</option>';
    }
    state.customCategories.forEach(c => {
      formOptions += `<option value="${c.id}">${escapeHtml(c.name)}</option>`;
    });
    formCatSelect.innerHTML = formOptions;
  }

  // Journal Filter Select
  const journalCatSelect = document.getElementById('filterSelect');
  if (journalCatSelect) {
    let filterOptions = '<option value="all">Все категории</option>';
    filterOptions += '<option value="income">Доходы</option>';
    filterOptions += '<option value="fixed">Постоянные</option>';
    filterOptions += '<option value="variable">Непостоянные</option>';
    state.customCategories.forEach(c => {
      filterOptions += `<option value="${c.id}">${escapeHtml(c.name)}</option>`;
    });
    if (journalCatSelect.innerHTML !== filterOptions) {
      const prevVal = journalCatSelect.value;
      journalCatSelect.innerHTML = filterOptions;
      journalCatSelect.value = prevVal || 'all';
    }
  }
}

// ---- Cycle Selector ----
function updateCycleSelector() {
  const sel = document.getElementById('cycleSelect');
  if (!sel) return;
  const options = generateCycleOptions(state.currentCycle);
  sel.innerHTML = options
    .map(key => `<option value="${key}"${key === state.currentCycle ? ' selected' : ''}>${cycleLabel(key)}</option>`)
    .join('');
}

// ---- First Run Setup ----
function showSetup() {
  const overlay = document.getElementById('setupOverlay');
  if (!overlay) return;
  overlay.classList.add('active');

  const sel = document.getElementById('setupCycleSelect');
  if (!sel) return;
  const options = generateCycleOptions(currentCycleKey());
  sel.innerHTML = options
    .map(key => `<option value="${key}">${cycleLabel(key)} (${cycleRange(key)})</option>`)
    .join('');
  sel.value = currentCycleKey();
}

function completeSetup() {
  const sel = document.getElementById('setupCycleSelect');
  if (sel) state.currentCycle = sel.value;
  document.getElementById('setupOverlay')?.classList.remove('active');
  localStorage.setItem('financy_setup_done', 'true');
  processRecurringTransactions();
  renderAll();
  markDirty();
  showToast('Учёт успешно начат!', 'success');
}

// ---- Annual Report ----
function openReportModal() {
  const overlay = document.getElementById('reportModal');
  const yearSelect = document.getElementById('reportYearSelect');
  if (!overlay || !yearSelect) return;

  overlay.classList.add('active');

  const years = new Set();
  for (const ck in state.cycles) {
    const [y] = ck.split('-').map(Number);
    years.add(y);
  }
  const currentYear = new Date().getFullYear();
  years.add(currentYear);

  yearSelect.innerHTML = Array.from(years).sort((a, b) => b - a)
    .map(y => `<option value="${y}"${y === currentYear ? ' selected' : ''}>${y} год</option>`)
    .join('');

  generateAnnualReport();
}

function closeReportModal() {
  document.getElementById('reportModal')?.classList.remove('active');
}

function generateAnnualReport() {
  const yearSelect = document.getElementById('reportYearSelect');
  const year = parseInt(yearSelect.value);
  const container = document.getElementById('reportContent');
  if (!container) return;

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
      <td class="amount positive" style="color:var(--success);">${formatMoney(d.income)}</td>
      <td class="amount negative" style="color:var(--danger);">${formatMoney(d.expenses)}</td>
      <td class="amount" style="color:${d.income - d.expenses >= 0 ? 'var(--success)' : 'var(--danger)'};">
        ${formatMoney(d.income - d.expenses)}
      </td>
    </tr>
  `).join('');

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Месяц</th>
          <th style="text-align:right;">Доходы</th>
          <th style="text-align:right;">Расходы</th>
          <th style="text-align:right;">Баланс</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
        <tr style="font-weight:700;border-top:2px solid var(--border);">
          <td>Итого за ${year} год</td>
          <td class="amount positive" style="color:var(--success);">${formatMoney(totalIncome)}</td>
          <td class="amount negative" style="color:var(--danger);">${formatMoney(totalExpenses)}</td>
          <td class="amount" style="color:${balance >= 0 ? 'var(--success)' : 'var(--danger)'};">${formatMoney(balance)}</td>
        </tr>
      </tbody>
    </table>
    <div style="margin-top:14px;font-size:0.8125rem;color:var(--text-secondary);display:flex;gap:16px;flex-wrap:wrap;">
      <span>Среднемесячный доход: <strong>${formatMoney(totalIncome / 12)}</strong></span>
      <span>Среднемесячный расход: <strong>${formatMoney(totalExpenses / 12)}</strong></span>
    </div>
  `;
}

// ---- Hotkeys ----
function setupHotkeys() {
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      if (e.key === 'Escape') closeAllModals();
      return;
    }
    switch (e.key) {
      case 'Escape':
        closeAllModals();
        break;
      case 'n': case 'N':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          switchTab('operations');
          document.getElementById('opName')?.focus();
        }
        break;
      case 'f': case 'F':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          switchTab('operations');
          document.getElementById('searchInput')?.focus();
        }
        break;
      case '?':
        showHotkeysHelp();
        break;
    }
  });
}

function showHotkeysHelp() {
  document.getElementById('hotkeysModal')?.classList.add('active');
}

function closeHotkeysModal() {
  document.getElementById('hotkeysModal')?.classList.remove('active');
}

function closeAllModals() {
  [
    'editModal', 'budgetModal', 'goalsModal', 'recurringModal',
    'reportModal', 'hotkeysModal', 'opDetailModal', 'confirmOverlay'
  ].forEach(id => {
    document.getElementById(id)?.classList.remove('active');
  });
  closeOverflowMenu();
}

function closeOverflowMenu() {
  const dropdown = document.getElementById('overflowDropdown');
  const btn = document.getElementById('overflowMenuBtn');
  if (dropdown) dropdown.classList.remove('active');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

// ---- Event Listeners Registration ----
function setupEventListeners() {
  // Navigation: Desktop & Mobile Tabs
  document.querySelectorAll('[data-tab-target]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tabTarget);
    });
  });

  // FAB button
  document.getElementById('fabBtn')?.addEventListener('click', () => {
    switchTab('operations');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      document.getElementById('opName')?.focus();
    }, 150);
  });

  // Cycle selector
  document.getElementById('cycleSelect')?.addEventListener('change', (e) => {
    changeCycle(e.target.value);
  });

  // Overflow Menu
  const overflowBtn = document.getElementById('overflowMenuBtn');
  const overflowDropdown = document.getElementById('overflowDropdown');

  overflowBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = overflowDropdown?.classList.contains('active');
    if (isOpen) {
      closeOverflowMenu();
    } else {
      overflowDropdown?.classList.add('active');
      overflowBtn.setAttribute('aria-expanded', 'true');
    }
  });

  document.addEventListener('click', (e) => {
    if (!overflowDropdown?.contains(e.target) && e.target !== overflowBtn) {
      closeOverflowMenu();
    }
  });

  // Theme toggle
  document.getElementById('themeToggle')?.addEventListener('click', () => {
    toggleTheme();
    closeOverflowMenu();
  });

  // Overflow actions
  document.getElementById('openReportBtn')?.addEventListener('click', () => {
    openReportModal();
    closeOverflowMenu();
  });

  document.getElementById('openHotkeysBtn')?.addEventListener('click', () => {
    showHotkeysHelp();
    closeOverflowMenu();
  });

  // JSON Import & Export (from overflow or settings)
  const handleJsonImport = async () => {
    closeOverflowMenu();
    try {
      const data = await importFromJSON();
      if (!data) return;

      Object.assign(state, data);
      markDirty();
      renderAll();
      showToast('Данные успешно импортированы из JSON-бэкапа!', 'success');
    } catch (err) {
      showToast(`Ошибка импорта JSON: ${err.message}`, 'error');
    }
  };

  const handleJsonExport = () => {
    closeOverflowMenu();
    exportToJSON();
    showToast('Бэкап JSON сохранен на устройство', 'success');
  };

  document.getElementById('importJsonBtn')?.addEventListener('click', handleJsonImport);
  document.getElementById('settingsImportJsonBtn')?.addEventListener('click', handleJsonImport);
  document.getElementById('exportJsonBtn')?.addEventListener('click', handleJsonExport);
  document.getElementById('settingsExportJsonBtn')?.addEventListener('click', handleJsonExport);
  document.getElementById('settingsOpenReportBtn')?.addEventListener('click', openReportModal);

  // Initial Capital Inline Edit in Settings Tab
  const editCapitalBtn = document.getElementById('editCapitalBtn');
  const capitalDisplayBox = document.getElementById('capitalDisplayBox');
  const capitalEditBox = document.getElementById('capitalEditBox');
  const saveCapitalBtn = document.getElementById('saveCapitalBtn');
  const cancelCapitalBtn = document.getElementById('cancelCapitalBtn');
  const startCapitalInput = document.getElementById('startCapitalInput');

  editCapitalBtn?.addEventListener('click', () => {
    if (capitalDisplayBox) capitalDisplayBox.style.display = 'none';
    if (capitalEditBox) capitalEditBox.style.display = 'block';
    startCapitalInput?.focus();
  });

  cancelCapitalBtn?.addEventListener('click', () => {
    if (capitalEditBox) capitalEditBox.style.display = 'none';
    if (capitalDisplayBox) capitalDisplayBox.style.display = 'flex';
  });

  saveCapitalBtn?.addEventListener('click', () => {
    const val = parseFloat(startCapitalInput?.value);
    if (!isNaN(val) && val >= 0) {
      setStartCapital(val);
      if (capitalEditBox) capitalEditBox.style.display = 'none';
      if (capitalDisplayBox) capitalDisplayBox.style.display = 'flex';
      renderAll();
      showToast(`Начальный счёт обновлен: ${formatMoney(val)}`, 'success');
    } else {
      showToast('Укажите корректную сумму', 'warning');
    }
  });

  // Custom Category Add in Settings Tab
  document.getElementById('addCategoryBtn')?.addEventListener('click', () => {
    const nameInput = document.getElementById('newCategoryName');
    const colorInput = document.getElementById('newCategoryColor');
    const name = nameInput?.value.trim();
    const color = colorInput?.value || '#8b5cf6';

    if (!name) {
      showToast('Введите название новой категории', 'warning');
      nameInput?.focus();
      return;
    }

    addCustomCategory(name, color);
    if (nameInput) nameInput.value = '';
    renderAll();
    showToast(`Категория «${name}» добавлена`, 'success');
  });

  // Recurring Add Button in Settings Tab
  document.getElementById('addRecurringBtn')?.addEventListener('click', openRecurringModal);
  document.getElementById('saveRecurringBtn')?.addEventListener('click', addRecurringFromModal);
  document.getElementById('closeRecurringBtn')?.addEventListener('click', closeRecurringModal);

  // Template Copy Button
  document.getElementById('templateBtn')?.addEventListener('click', () => {
    const result = applyTemplate();
    if (result.error === 'templateNoFixed') {
      showToast('В предыдущем цикле нет постоянных трат для копирования', 'warning');
    } else if (result.error === 'templateNoPrev') {
      showToast('Нет предыдущего цикла для копирования шаблона', 'warning');
    } else {
      renderAll();
      showToast('Постоянные траты скопированы из прошлого цикла', 'success');
    }
  });

  // Search & Filter Toolbar
  document.getElementById('searchInput')?.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderOperations();
  });

  // Type filter chips
  document.querySelectorAll('[data-type-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-type-filter]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      filterType = chip.dataset.typeFilter;
      renderOperations();
    });
  });

  // Category filter select
  document.getElementById('filterSelect')?.addEventListener('change', (e) => {
    filterCategory = e.target.value;
    renderOperations();
  });

  // CSV Export & Import
  document.getElementById('exportBtn')?.addEventListener('click', () => {
    exportToCSV();
    showToast('Файл CSV успешно экспортирован', 'success');
  });

  document.getElementById('importBtn')?.addEventListener('click', async () => {
    try {
      const count = await importFromCSV();
      if (count > 0) {
        renderAll();
        showToast(`Импортировано ${count} операций из CSV`, 'success');
      }
    } catch (err) {
      showToast(`Ошибка импорта CSV: ${err.message}`, 'error');
    }
  });

  // Operation Detail Sheet Actions
  document.getElementById('detailCloseBtn')?.addEventListener('click', closeOperationDetail);
  document.getElementById('detailEditBtn')?.addEventListener('click', openEditFromDetail);
  document.getElementById('detailDeleteBtn')?.addEventListener('click', deleteSelectedDetailOp);
  document.getElementById('opDetailModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('opDetailModal')) closeOperationDetail();
  });

  // Edit Modal Actions
  document.getElementById('editCancelBtn')?.addEventListener('click', closeEditModal);
  document.getElementById('editSaveBtn')?.addEventListener('click', saveEdit);
  document.getElementById('editModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('editModal')) closeEditModal();
  });

  // Goals Actions
  document.getElementById('addGoalBtn')?.addEventListener('click', openGoalsModal);
  document.getElementById('saveGoalBtn')?.addEventListener('click', addGoalFromModal);
  document.getElementById('closeGoalsBtn')?.addEventListener('click', closeGoalsModal);
  document.getElementById('goalsModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('goalsModal')) closeGoalsModal();
  });

  // Budget Actions
  document.getElementById('editBudgetBtn')?.addEventListener('click', openBudgetModal);
  document.getElementById('saveBudgetBtn')?.addEventListener('click', saveBudgetLimits);
  document.getElementById('closeBudgetBtn')?.addEventListener('click', closeBudgetModal);
  document.getElementById('budgetModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('budgetModal')) closeBudgetModal();
  });

  // Recurring Modal Backdrop
  document.getElementById('recurringModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('recurringModal')) closeRecurringModal();
  });

  // Annual Report Actions
  document.getElementById('generateReportBtn')?.addEventListener('click', generateAnnualReport);
  document.getElementById('closeReportBtn')?.addEventListener('click', closeReportModal);
  document.getElementById('reportModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('reportModal')) closeReportModal();
  });

  // Hotkeys Help Actions
  document.getElementById('closeHotkeysBtn')?.addEventListener('click', closeHotkeysModal);
  document.getElementById('hotkeysModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('hotkeysModal')) closeHotkeysModal();
  });

  // Setup Confirmation
  document.getElementById('setupConfirmBtn')?.addEventListener('click', completeSetup);

  // Undo Snackbar button
  document.getElementById('undoBtn')?.addEventListener('click', undoLastDelete);

  // Empty state button in operations tab
  document.getElementById('emptyAddOpBtn')?.addEventListener('click', () => {
    document.getElementById('opName')?.focus();
  });

  setupHotkeys();
}

function setDefaultDates() {
  const today = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('opDate');
  if (dateInput) dateInput.value = today;
}

function getCurrentCycleData() {
  if (!state.cycles[state.currentCycle]) {
    state.cycles[state.currentCycle] = { income: [], fixed: [], variable: [] };
  }
  return state.cycles[state.currentCycle];
}

export { init };