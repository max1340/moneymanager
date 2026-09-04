// ============================================
// Financy PRO v2.0 — Main Application Controller
// Refined UX, Accessible & PWA-ready
// ============================================

import { state, subscribe, getCurrentCycleData } from './state.js';
import {
  calcTotalIncome, calcTotalExpenses, calcRemainingBudget,
  calcOverallBalance, calcExpensePercent, calcBudgetProgress,
  calcCashFlowForecast, calcGoalProgress
} from './calculations.js';
import {
  addOperation, deleteOperation, updateOperation,
  findOperation, getAllOperations, setStartCapital,
  addCustomCategory, deleteCustomCategory, setBudgetLimit,
  addGoal, updateGoal, depositToGoal, deleteGoal,
  addRecurringTransaction, toggleRecurringAuto,
  deleteRecurringTransaction, processRecurringTransactions,
  changeCycle, applyTemplate, undoTemplate
} from './crud.js';
import { renderDonutChart, renderTrendChart } from './charts.js';
import {
  setStatusCallbacks, loadFromFirebase, subscribeToRealtime,
  markDirty, exportToCSV, exportToJSON, importFromCSV, importFromJSON,
} from './firebase-db.js';
import {
  CURRENCY, fmt, formatShortMoney, uuid, formatDate,
  formatDayHeader, toInputDate, toIsoDate, cycleLabel,
  cycleRange, cycleShortRange, cycleExplicitLabel,
  currentCycleKey, generateCycleOptions, escapeHtml,
  pluralize, groupOperationsByDay
} from './utils.js';

// ---- Module State ----
let currentSort = { column: 'date', direction: 'desc' };
let searchQuery = '';
let filterType = 'all'; // 'all' | 'income' | 'expense'
let filterCategory = 'all';
let selectedOpForDetail = null;
let editTarget = null;
let selectedGoalForAction = null;
let undoStack = [];
let currentTab = 'overview';

// Unified Form State
let formType = 'expense'; // 'expense' | 'income'
let formSubtype = 'fixed'; // 'fixed' | 'variable'

// Standard income categories
const INCOME_CATEGORIES = [
  { id: 'salary', name: 'Зарплата' },
  { id: 'freelance', name: 'Фриланс / Подработка' },
  { id: 'investments', name: 'Инвестиции / Дивиденды' },
  { id: 'gifts', name: 'Подарки / Переводы' },
  { id: 'other_income', name: 'Другой доход' }
];

// ---- Toast Notification System ----
function showToast(message, type = 'info', action = null, duration = 4000) {
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
      <svg class="icon" aria-hidden="true"><use href="#${iconName}"></use></svg>
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

// ---- Tab Router & FAB Behavior ----
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

  // Manage FAB visibility and role based on active tab
  const fabBtn = document.getElementById('fabBtn');
  if (fabBtn) {
    if (tabName === 'settings') {
      fabBtn.style.display = 'none';
    } else {
      fabBtn.style.display = 'flex';
      if (tabName === 'goals') {
        fabBtn.setAttribute('aria-label', 'Добавить цель');
        fabBtn.setAttribute('title', 'Добавить цель');
      } else {
        fabBtn.setAttribute('aria-label', 'Добавить операцию');
        fabBtn.setAttribute('title', 'Добавить операцию');
      }
    }
  }

  // Re-render relevant tab elements
  if (tabName === 'overview') {
    const cycleData = getCurrentCycleData();
    renderDonutChart(cycleData);
    renderTrendChart();
  } else if (tabName === 'operations') {
    renderOperations();
  } else if (tabName === 'goals') {
    renderGoals();
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
  setupDateMaskAndPicker();
  setupUnifiedForm();
  updateCategoryDropdowns();
  checkBackupReminder();
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

// ---- Sync Status UI (with Tooltip & Accessible Labels) ----
function updateSyncStatusUI(connected) {
  const el = document.getElementById('syncStatus');
  if (!el) return;

  if (connected === null) {
    el.className = 'sync-badge connecting';
    el.setAttribute('title', 'Подключение к Firebase...');
    el.setAttribute('aria-label', 'Статус: Подключение к базе данных');
    el.innerHTML = '<svg class="icon sync-icon" aria-hidden="true"><use href="#icon-refresh"></use></svg><span class="status-text">Подключение...</span>';
  } else if (connected) {
    el.className = 'sync-badge';
    el.setAttribute('title', 'Сохранено в облаке (Firebase)');
    el.setAttribute('aria-label', 'Статус: Все изменения сохранены в облаке');
    el.innerHTML = '<svg class="icon sync-icon" aria-hidden="true"><use href="#icon-cloud"></use></svg><span class="status-text">Синхронизировано</span>';
  } else {
    el.className = 'sync-badge offline';
    el.setAttribute('title', 'Нет связи с сервером — работа в автономном режиме');
    el.setAttribute('aria-label', 'Статус: Оффлайн, данные сохраняются локально');
    el.innerHTML = '<svg class="icon sync-icon" aria-hidden="true"><use href="#icon-cloud-off"></use></svg><span class="status-text">Оффлайн</span>';
  }
}

function updateSavingIndicator(isSaving) {
  const el = document.getElementById('syncStatus');
  if (!el) return;

  if (isSaving) {
    el.className = 'sync-badge connecting';
    el.setAttribute('title', 'Идет сохранение в облако...');
    el.setAttribute('aria-label', 'Статус: Сохранение данных...');
    el.innerHTML = '<svg class="icon sync-icon" aria-hidden="true"><use href="#icon-refresh"></use></svg><span class="status-text">Сохранение...</span>';
  } else {
    updateSyncStatusUI(true);
  }
}

// ---- Backup 7-Day Reminder Check ----
function checkBackupReminder() {
  const dot = document.getElementById('backupReminderDot');
  const badge = document.getElementById('backupDropdownBadge');
  const lastBackupStr = localStorage.getItem('financy_last_backup_time');

  let needsBackup = false;
  if (!lastBackupStr) {
    needsBackup = true;
  } else {
    const lastBackup = parseInt(lastBackupStr, 10);
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - lastBackup > sevenDaysMs) {
      needsBackup = true;
    }
  }

  if (dot) dot.style.display = needsBackup ? 'block' : 'none';
  if (badge) badge.style.display = needsBackup ? 'inline-block' : 'none';
}

// ---- Date Mask & Native Picker Integration ----
function setupDateMaskAndPicker() {
  const textInput = document.getElementById('opDateText');
  const pickerInput = document.getElementById('opDate');
  const pickerBtn = document.getElementById('opDatePickerBtn');

  const todayIso = new Date().toISOString().split('T')[0];
  if (pickerInput) pickerInput.value = todayIso;
  if (textInput) textInput.value = formatDate(todayIso);

  // Mask auto-formatting for DD.MM.YYYY
  textInput?.addEventListener('input', (e) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 8) val = val.slice(0, 8);

    let formatted = '';
    if (val.length > 4) {
      formatted = `${val.slice(0, 2)}.${val.slice(2, 4)}.${val.slice(4)}`;
    } else if (val.length > 2) {
      formatted = `${val.slice(0, 2)}.${val.slice(2)}`;
    } else {
      formatted = val;
    }

    e.target.value = formatted;

    // Sync to native picker if valid date
    if (formatted.length === 10) {
      const iso = toIsoDate(formatted);
      if (iso && pickerInput) pickerInput.value = iso;
    }
  });

  // Calendar button opens native date picker
  pickerBtn?.addEventListener('click', () => {
    if (!pickerInput) return;
    try {
      if (typeof pickerInput.showPicker === 'function') {
        pickerInput.showPicker();
      } else {
        pickerInput.focus();
        pickerInput.click();
      }
    } catch {
      pickerInput.focus();
    }
  });

  // When native picker value changes, update masked text input
  pickerInput?.addEventListener('change', (e) => {
    if (e.target.value && textInput) {
      textInput.value = formatDate(e.target.value);
    }
  });
}

// ---- Render All ----
function renderAll() {
  const cycleData = getCurrentCycleData();
  const totalIncome = calcTotalIncome(cycleData);
  const totalExpenses = calcTotalExpenses(cycleData);
  const remaining = calcRemainingBudget(cycleData);
  const overall = calcOverallBalance();

  // Metric cards with unified fmt()
  const totalBalanceEl = document.getElementById('totalBalance');
  if (totalBalanceEl) totalBalanceEl.textContent = fmt(overall);

  const cycleIncomeEl = document.getElementById('cycleIncome');
  if (cycleIncomeEl) cycleIncomeEl.textContent = fmt(totalIncome);

  // Period label on cards
  const cycleIncomeSub = document.getElementById('cycleIncomeSub');
  if (cycleIncomeSub) {
    cycleIncomeSub.textContent = `${cycleRange(state.currentCycle)} (${cycleLabel(state.currentCycle)})`;
  }

  const remainingEl = document.getElementById('remainingBudget');
  if (remainingEl) {
    remainingEl.textContent = fmt(remaining);
    remainingEl.classList.toggle('danger', remaining < 0);
    remainingEl.classList.toggle('success', remaining >= 0);
  }

  // Expense percent chip
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

  // Backup reminder
  checkBackupReminder();
}

// ---- Initial Capital Block in Settings ----
function renderInitialCapital() {
  const displayEl = document.getElementById('startCapitalDisplay');
  const inputEl = document.getElementById('startCapitalInput');
  const currentVal = state.startCapital || 0;

  if (displayEl) displayEl.textContent = fmt(currentVal);
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
  const opCategoryLabel = document.getElementById('opCategoryLabel');
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
    if (opCategoryLabel) opCategoryLabel.textContent = 'Категория расхода';
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
    if (opCategoryLabel) opCategoryLabel.textContent = 'Категория дохода';
    if (opSubmitBtnText) opSubmitBtnText.textContent = 'Добавить доход';
    if (formHeaderTitle) formHeaderTitle.textContent = 'Новый доход';
    if (templateBtn) templateBtn.style.display = 'none';
    updateCategoryDropdowns();
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
  const dateTextInput = document.getElementById('opDateText');
  const pickerInput = document.getElementById('opDate');
  const categorySelect = document.getElementById('opCategory');

  const name = nameInput?.value.trim();
  const amount = parseFloat(amountInput?.value);

  // Determine date: either from masked text or from picker
  let date = pickerInput?.value;
  if (dateTextInput?.value && dateTextInput.value.length === 10) {
    const fromText = toIsoDate(dateTextInput.value);
    if (fromText) date = fromText;
  }
  if (!date) date = new Date().toISOString().split('T')[0];

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

  if (formType === 'income') {
    const selectedIncomeCat = categorySelect?.value;
    const incomeCatObj = INCOME_CATEGORIES.find(c => c.id === selectedIncomeCat);
    const subcatName = incomeCatObj ? incomeCatObj.name : '';
    addOperation('income', name, date, amount, subcatName);
    showToast(`Доход «${name}» на сумму ${fmt(amount)} добавлен`, 'success');
  } else {
    // Expense
    const selectedCat = categorySelect?.value;
    if (selectedCat && selectedCat !== 'fixed' && selectedCat !== 'variable') {
      addOperation(selectedCat, name, date, amount);
    } else if (formSubtype === 'fixed') {
      addOperation('fixed', name, date, amount);
    } else {
      addOperation('variable', name, date, amount);
    }
    showToast(`Расход «${name}» на сумму ${fmt(amount)} добавлен`, 'success');
  }

  // Reset inputs
  if (nameInput) nameInput.value = '';
  if (amountInput) amountInput.value = '';
  nameInput?.focus();
  renderAll();
}

// ---- Operations Journal Grouped By Days ----
function renderOperations() {
  const cycleData = getCurrentCycleData();
  const totalIncome = calcTotalIncome(cycleData);
  const totalExpenses = calcTotalExpenses(cycleData);
  const netBalance = totalIncome - totalExpenses;

  // Update Period Summary Bar
  const sumIncEl = document.getElementById('summaryTotalIncome');
  const sumExpEl = document.getElementById('summaryTotalExpenses');
  const sumNetEl = document.getElementById('summaryNetBalance');
  const periodBadge = document.getElementById('journalPeriodBadge');

  if (periodBadge) {
    periodBadge.textContent = `Цикл: ${cycleShortRange(state.currentCycle)}`;
  }
  if (sumIncEl) sumIncEl.textContent = '+' + fmt(totalIncome);
  if (sumExpEl) sumExpEl.textContent = '−' + fmt(totalExpenses);
  if (sumNetEl) {
    sumNetEl.textContent = (netBalance >= 0 ? '+' : '') + fmt(netBalance);
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

  // Group operations by day
  const dayGroups = groupOperationsByDay(allOps);

  const catNames = { income: 'Доход', fixed: 'Постоянная', variable: 'Непостоянная' };
  const catClasses = { income: 'category-income', fixed: 'category-fixed', variable: 'category-variable' };
  state.customCategories.forEach(c => { catNames[c.id] = c.name; });

  let html = '';
  dayGroups.forEach(group => {
    const dayHeader = formatDayHeader(group.date);
    const incStr = group.totalIncome > 0 ? `<span class="day-inc">+${fmt(group.totalIncome)}</span>` : '';
    const expStr = group.totalExpense > 0 ? `<span class="day-exp">−${fmt(group.totalExpense)}</span>` : '';

    html += `
      <div class="journal-day-group">
        <div class="journal-day-header">
          <span class="day-date">${escapeHtml(dayHeader)}</span>
          <span class="day-summary">${incStr} ${expStr}</span>
        </div>
        <div class="journal-day-items">
    `;

    group.items.forEach(op => {
      const isIncome = op.category === 'income';
      const amountClass = isIncome ? 'positive' : 'negative';
      const sign = isIncome ? '+' : '−';
      const catClass = catClasses[op.category] || 'category-variable';
      const catName = op.subcategory || catNames[op.category] || op.category;

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
        <div class="operation-item" data-id="${op.id}" data-category="${op.category}" role="button" tabindex="0" aria-label="${escapeHtml(op.name)}, ${catName}, ${sign} ${fmt(op.amount)}">
          <div class="op-left">
            <div class="op-avatar ${avatarClass}" style="${customColorStyle}">
              <svg class="icon" aria-hidden="true"><use href="#${iconName}"></use></svg>
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
            <div class="op-amount ${amountClass}">${sign} ${fmt(op.amount)}</div>
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;
  });

  listContainer.innerHTML = html;

  // Attach tap handlers to open detail sheet
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
  if (badgeEl) badgeEl.textContent = op.subcategory || catNames[op.category] || op.category;
  if (dateEl) dateEl.textContent = formatDate(op.date);

  if (amountEl) {
    const sign = isIncome ? '+' : '−';
    amountEl.textContent = `${sign} ${fmt(op.amount)}`;
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
    }, 5000);
  }
}

function undoLastDelete() {
  const last = undoStack.pop();
  if (!last || last.type !== 'delete') return;

  const cycleData = getCurrentCycleData();
  if (!cycleData[last.category]) cycleData[last.category] = [];
  cycleData[last.category].push(last.data);
  markDirty();
  renderAll();
  showToast(`Операция «${last.data.name}» восстановлена`, 'success');
}

// ---- Edit Operation Modal ----
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
        <svg class="empty-icon" aria-hidden="true"><use href="#icon-overview"></use></svg>
        <p>Лимиты не установлены</p>
        <button class="btn btn-outline btn-sm" id="emptyBudgetBtn" aria-label="Установить бюджетные лимиты">
          <svg class="icon" aria-hidden="true"><use href="#icon-plus"></use></svg>
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
        <span class="budget-bar-value">${fmt(progress.spent)} из ${fmt(progress.limit)} (${progress.percent.toFixed(0)}%)</span>
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
        <input type="number" class="form-input budget-limit-input" data-cat="${catId}" value="${val}" placeholder="Лимит ₪" step="100" inputmode="decimal">
      </div>
    `;
  });

  state.customCategories.forEach(cat => {
    const val = state.budgetLimits[cat.id] || '';
    html += `
      <div class="modal-field" style="margin-bottom:12px;">
        <label>${escapeHtml(cat.name)}</label>
        <input type="number" class="form-input budget-limit-input" data-cat="${cat.id}" value="${val}" placeholder="Лимит ₪" step="100" inputmode="decimal">
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

// ---- Financial Goals with Target Date & Recommended Monthly Contribution ----
function renderGoals() {
  const container = document.getElementById('goalsContainer');
  if (!container) return;

  if (state.goals.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding:24px;grid-column:1/-1;">
        <svg class="empty-icon" aria-hidden="true"><use href="#icon-goals"></use></svg>
        <p>Цели пока не добавлены</p>
        <button class="btn btn-primary btn-sm" id="emptyGoalsBtn" aria-label="Добавить новую цель">
          <svg class="icon" aria-hidden="true"><use href="#icon-plus"></use></svg>
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

    // Calculate recommended monthly deposit
    let recDepositText = '';
    const needed = Math.max(0, goal.target - goal.current);
    if (needed === 0) {
      recDepositText = 'Цель достигнута! 🎉';
    } else if (goal.targetDate) {
      const now = new Date();
      const targetDate = new Date(goal.targetDate + 'T00:00:00');
      const diffMonths = (targetDate.getFullYear() - now.getFullYear()) * 12 + (targetDate.getMonth() - now.getMonth());
      if (diffMonths > 0) {
        const monthly = needed / diffMonths;
        recDepositText = `Взнос: ${fmt(monthly)} / мес.`;
      } else {
        recDepositText = `Срок истёк — нужно ${fmt(needed)}`;
      }
    } else {
      recDepositText = `Осталось накопить: ${fmt(needed)}`;
    }

    const dateLabel = goal.targetDate ? `До: ${formatDate(goal.targetDate)}` : 'Срок не указан';

    html += `
      <div class="goal-card" data-id="${goal.id}">
        <div class="goal-header">
          <div>
            <span class="goal-name">${escapeHtml(goal.name)}</span>
            <div class="goal-target-date">${escapeHtml(dateLabel)}</div>
          </div>
          <div class="goal-actions">
            <button class="btn btn-outline btn-xs deposit-goal-btn" data-id="${goal.id}" title="Пополнить цель" aria-label="Пополнить цель ${escapeHtml(goal.name)}">
              <svg class="icon" aria-hidden="true"><use href="#icon-wallet"></use></svg>
              <span>Пополнить</span>
            </button>
            <button class="btn btn-outline btn-xs edit-goal-btn" data-id="${goal.id}" title="Редактировать цель" aria-label="Редактировать цель ${escapeHtml(goal.name)}">
              <svg class="icon" aria-hidden="true"><use href="#icon-edit"></use></svg>
            </button>
            <button class="btn btn-outline btn-xs del-goal-btn" data-id="${goal.id}" title="Удалить цель" aria-label="Удалить цель ${escapeHtml(goal.name)}">
              <svg class="icon" aria-hidden="true"><use href="#icon-trash"></use></svg>
            </button>
          </div>
        </div>

        <div class="goal-amount">${fmt(goal.current)} из ${fmt(goal.target)}</div>
        <div class="budget-bar-track">
          <div class="budget-bar-fill ${barClass}" style="width:${Math.min(progress, 100)}%"></div>
        </div>

        <div class="goal-card-footer">
          <span class="goal-rec-deposit">${escapeHtml(recDepositText)}</span>
          <span class="goal-progress-text">${progress.toFixed(0)}%</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Attach goal button handlers
  container.querySelectorAll('.deposit-goal-btn').forEach(btn => {
    btn.addEventListener('click', () => openDepositGoalModal(btn.dataset.id));
  });

  container.querySelectorAll('.edit-goal-btn').forEach(btn => {
    btn.addEventListener('click', () => openEditGoalModal(btn.dataset.id));
  });

  container.querySelectorAll('.del-goal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const goalId = btn.dataset.id;
      const g = state.goals.find(x => x.id === goalId);
      deleteGoal(goalId);
      renderAll();
      showToast(`Цель «${g?.name || ''}» удалена`, 'info');
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
  const targetDate = document.getElementById('goalDateInput')?.value || '';

  if (!name || isNaN(target) || target <= 0) {
    showToast('Укажите название цели и целевую сумму', 'warning');
    return;
  }

  addGoal(name, target, current, targetDate);
  document.getElementById('goalNameInput').value = '';
  document.getElementById('goalTargetInput').value = '';
  document.getElementById('goalCurrentInput').value = '';
  document.getElementById('goalDateInput').value = '';
  closeGoalsModal();
  renderAll();
  showToast(`Цель «${name}» добавлена`, 'success');
}

// Deposit to Goal Modal
function openDepositGoalModal(goalId) {
  const goal = state.goals.find(g => g.id === goalId);
  if (!goal) return;

  selectedGoalForAction = goal;
  const modal = document.getElementById('depositGoalModal');
  const headerName = document.getElementById('depositGoalHeaderName');
  const sub = document.getElementById('depositGoalSub');
  const input = document.getElementById('depositAmountInput');

  if (headerName) headerName.textContent = `Пополнить «${goal.name}»`;
  if (sub) sub.textContent = `Текущие накопления: ${fmt(goal.current)} из ${fmt(goal.target)}`;
  if (input) {
    input.value = '';
    setTimeout(() => input.focus(), 100);
  }

  modal?.classList.add('active');
}

function closeDepositGoalModal() {
  document.getElementById('depositGoalModal')?.classList.remove('active');
  selectedGoalForAction = null;
}

function confirmDepositGoal() {
  if (!selectedGoalForAction) return;
  const input = document.getElementById('depositAmountInput');
  const amount = parseFloat(input?.value);

  if (isNaN(amount) || amount <= 0) {
    showToast('Укажите сумму пополнения больше нуля', 'warning');
    return;
  }

  depositToGoal(selectedGoalForAction.id, amount);
  closeDepositGoalModal();
  renderAll();
  showToast(`Цель «${selectedGoalForAction.name}» пополнена на ${fmt(amount)}`, 'success');
}

// Edit Goal Modal
function openEditGoalModal(goalId) {
  const goal = state.goals.find(g => g.id === goalId);
  if (!goal) return;

  selectedGoalForAction = goal;
  const modal = document.getElementById('editGoalModal');
  const nameInput = document.getElementById('editGoalName');
  const targetInput = document.getElementById('editGoalTarget');
  const currentInput = document.getElementById('editGoalCurrent');
  const dateInput = document.getElementById('editGoalDate');

  if (nameInput) nameInput.value = goal.name;
  if (targetInput) targetInput.value = goal.target;
  if (currentInput) currentInput.value = goal.current;
  if (dateInput) dateInput.value = goal.targetDate || '';

  modal?.classList.add('active');
}

function closeEditGoalModal() {
  document.getElementById('editGoalModal')?.classList.remove('active');
  selectedGoalForAction = null;
}

function saveEditGoal() {
  if (!selectedGoalForAction) return;
  const name = document.getElementById('editGoalName')?.value.trim();
  const target = parseFloat(document.getElementById('editGoalTarget')?.value);
  const current = parseFloat(document.getElementById('editGoalCurrent')?.value);
  const targetDate = document.getElementById('editGoalDate')?.value || '';

  if (!name || isNaN(target) || target <= 0 || isNaN(current) || current < 0) {
    showToast('Заполните корректно название и суммы', 'warning');
    return;
  }

  updateGoal(selectedGoalForAction.id, name, target, current, targetDate);
  closeEditGoalModal();
  renderAll();
  showToast('Параметры цели обновлены', 'success');
}

// ---- Cash Flow Forecast ----
function renderCashFlowForecast() {
  const container = document.getElementById('forecastContainer');
  if (!container) return;

  const forecast = calcCashFlowForecast(3);
  if (!forecast) {
    container.innerHTML = `
      <div class="empty-state" style="padding:16px;">
        <svg class="empty-icon" aria-hidden="true"><use href="#icon-bar-chart-2"></use></svg>
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
        <div style="font-weight:700;font-size:1.125rem;margin-top:4px;">${fmt(forecast.avgMonthlyIncome)}</div>
      </div>
      <div class="card" style="padding:14px;background:var(--bg);">
        <div style="font-size:0.75rem;color:var(--text-secondary);font-weight:600;">Средний расход/мес</div>
        <div style="font-weight:700;font-size:1.125rem;margin-top:4px;">${fmt(forecast.avgMonthlyExpenses)}</div>
      </div>
      <div class="card" style="padding:14px;background:var(--bg);">
        <div style="font-size:0.75rem;color:var(--text-secondary);font-weight:600;">Экономия/мес</div>
        <div style="font-weight:700;font-size:1.125rem;margin-top:4px;color:${changeColor};">
          ${forecast.avgMonthlySavings >= 0 ? '+' : ''}${fmt(forecast.avgMonthlySavings)}
        </div>
      </div>
      <div class="card" style="padding:14px;background:var(--bg);">
        <div style="font-size:0.75rem;color:var(--text-secondary);font-weight:600;">Прогноз через 3 мес</div>
        <div style="font-weight:700;font-size:1.125rem;margin-top:4px;color:var(--primary);">${fmt(forecast.projectedBalance)}</div>
      </div>
    </div>
  `;
}

// ---- Settings Tab Components ----
function renderSettingsCategories() {
  const container = document.getElementById('categoriesList');
  if (!container) return;

  if (state.customCategories.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:12px;"><p>Пользовательских категорий пока нет</p></div>';
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
          <svg class="icon" aria-hidden="true"><use href="#icon-trash"></use></svg>
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
        <svg class="empty-icon" aria-hidden="true"><use href="#icon-refresh"></use></svg>
        <p>Нет регулярных транзакций</p>
        <button class="btn btn-outline btn-sm" id="emptyRecurringBtn" aria-label="Создать регулярную транзакцию">
          <svg class="icon" aria-hidden="true"><use href="#icon-plus"></use></svg>
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
    const isChecked = rt.auto !== false;
    html += `
      <div class="recurring-item" data-id="${rt.id}">
        <div class="recurring-info">
          <div class="recurring-name">${escapeHtml(rt.name)} — ${fmt(rt.amount)}</div>
          <div class="recurring-meta">
            ${catNames[rt.category] || rt.category}, день списания: ${rt.day}-е число
          </div>
        </div>
        <div class="recurring-actions">
          <label class="toggle-switch-label" title="Добавлять автоматически каждый цикл">
            <span class="toggle-switch">
              <input type="checkbox" class="recurring-toggle" data-id="${rt.id}" ${isChecked ? 'checked' : ''} aria-label="Автодобавление транзакции ${escapeHtml(rt.name)}">
              <span class="slider"></span>
            </span>
            <span>Автоматически</span>
          </label>
          <button class="btn btn-outline btn-xs del-rec-btn" data-id="${rt.id}" title="Удалить регулярную транзакцию" aria-label="Удалить регулярную транзакцию ${escapeHtml(rt.name)}">
            <svg class="icon" aria-hidden="true"><use href="#icon-trash"></use></svg>
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Toggle switch handler
  container.querySelectorAll('.recurring-toggle').forEach(chk => {
    chk.addEventListener('change', () => {
      const isAuto = toggleRecurringAuto(chk.dataset.id);
      showToast(isAuto ? 'Автодобавление включено' : 'Автодобавление отключено', 'info');
    });
  });

  // Delete button handler
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
  const day = parseInt(document.getElementById('recDayInput')?.value, 10);
  const category = document.getElementById('recCategoryInput')?.value;
  const isAuto = document.getElementById('recAutoInput')?.checked !== false;

  if (!name || isNaN(amount) || amount <= 0 || isNaN(day) || day < 1 || day > 28) {
    showToast('Заполните корректно все поля. День: от 1 до 28.', 'warning');
    return;
  }

  addRecurringTransaction(name, amount, day, category, isAuto);
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
    if (formType === 'income') {
      INCOME_CATEGORIES.forEach(c => {
        formOptions += `<option value="${c.id}">${escapeHtml(c.name)}</option>`;
      });
    } else {
      if (formSubtype === 'fixed') {
        formOptions = '<option value="fixed">Постоянные (общие)</option>';
      } else {
        formOptions = '<option value="variable">Непостоянные (общие)</option>';
      }
      state.customCategories.forEach(c => {
        formOptions += `<option value="${c.id}">${escapeHtml(c.name)}</option>`;
      });
    }
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

// ---- Cycle Selector (Explicit Date Range) ----
function updateCycleSelector() {
  const sel = document.getElementById('cycleSelect');
  if (!sel) return;
  const options = generateCycleOptions(state.currentCycle);
  sel.innerHTML = options
    .map(key => `<option value="${key}"${key === state.currentCycle ? ' selected' : ''}>${cycleExplicitLabel(key)}</option>`)
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
    .map(key => `<option value="${key}">${cycleExplicitLabel(key)}</option>`)
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
  const year = parseInt(yearSelect.value, 10);
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
      <td class="amount positive" style="color:var(--success);">${fmt(d.income)}</td>
      <td class="amount negative" style="color:var(--danger);">${fmt(d.expenses)}</td>
      <td class="amount" style="color:${d.income - d.expenses >= 0 ? 'var(--success)' : 'var(--danger)'};">
        ${fmt(d.income - d.expenses)}
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
          <td class="amount positive" style="color:var(--success);">${fmt(totalIncome)}</td>
          <td class="amount negative" style="color:var(--danger);">${fmt(totalExpenses)}</td>
          <td class="amount" style="color:${balance >= 0 ? 'var(--success)' : 'var(--danger)'};">${fmt(balance)}</td>
        </tr>
      </tbody>
    </table>
    <div style="margin-top:14px;font-size:0.8125rem;color:var(--text-secondary);display:flex;gap:16px;flex-wrap:wrap;">
      <span>Среднемесячный доход: <strong>${fmt(totalIncome / 12)}</strong></span>
      <span>Среднемесячный расход: <strong>${fmt(totalExpenses / 12)}</strong></span>
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
    'editModal', 'budgetModal', 'goalsModal', 'depositGoalModal', 'editGoalModal',
    'recurringModal', 'reportModal', 'hotkeysModal', 'opDetailModal', 'confirmOverlay'
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

  // FAB button context-aware action
  document.getElementById('fabBtn')?.addEventListener('click', () => {
    if (currentTab === 'goals') {
      openGoalsModal();
    } else {
      switchTab('operations');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => {
        document.getElementById('opName')?.focus();
      }, 150);
    }
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

  // JSON Import & Export
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
    checkBackupReminder();
    showToast('Резервная копия сохранена на устройство', 'success');
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
      showToast(`Начальный счёт обновлен: ${fmt(val)}`, 'success');
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

  // Template Copy Button with Undo Toast
  document.getElementById('templateBtn')?.addEventListener('click', () => {
    const result = applyTemplate();
    if (result.error === 'templateNoFixed') {
      showToast('В предыдущем цикле нет постоянных трат для копирования', 'warning');
    } else if (result.error === 'templateNoPrev') {
      showToast('Нет предыдущего цикла для копирования шаблона', 'warning');
    } else if (result.copied === 0) {
      showToast('Все постоянные траты уже скопированы в этот цикл', 'info');
    } else {
      renderAll();
      showToast(`Добавлено ${result.copied} ${pluralize(result.copied, ['операция', 'операции', 'операций'])}`, 'success', {
        text: 'Отменить',
        onClick: () => {
          undoTemplate(result.addedIds);
          renderAll();
          showToast('Копирование шаблона отменено', 'info');
        }
      }, 6000);
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

  // Goals Actions (Add, Deposit, Edit)
  document.getElementById('addGoalBtn')?.addEventListener('click', openGoalsModal);
  document.getElementById('saveGoalBtn')?.addEventListener('click', addGoalFromModal);
  document.getElementById('closeGoalsBtn')?.addEventListener('click', closeGoalsModal);
  document.getElementById('goalsModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('goalsModal')) closeGoalsModal();
  });

  document.getElementById('confirmDepositGoalBtn')?.addEventListener('click', confirmDepositGoal);
  document.getElementById('cancelDepositGoalBtn')?.addEventListener('click', closeDepositGoalModal);
  document.getElementById('depositGoalModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('depositGoalModal')) closeDepositGoalModal();
  });

  document.getElementById('saveEditGoalBtn')?.addEventListener('click', saveEditGoal);
  document.getElementById('cancelEditGoalBtn')?.addEventListener('click', closeEditGoalModal);
  document.getElementById('editGoalModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('editGoalModal')) closeEditGoalModal();
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

export { init };