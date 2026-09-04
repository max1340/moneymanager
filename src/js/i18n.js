// ============================================
// Financy PRO — Localization (i18n)
// ============================================

const LOCALES = {
  ru: {
    // General
    appName: '🏦 Financy PRO',
    appSubtitle: 'Выберите стартовый финансовый цикл, с которого начинается ваш учёт.',
    startAccounting: 'Начать учёт',

    // Navbar
    fileNotAttached: 'Файл не привязан',
    attachFile: '🎯 Привязать файл',
    themeLight: '🌙',
    themeDark: '☀️',
    autosaveTimer: '⏱',

    // Metric Cards
    totalBalance: '💰 Общий баланс на счёте',
    totalBalanceSub: 'Накоплено за всё время',
    cycleIncome: '📈 Доходы за текущий цикл',
    cycleIncomeSub: 'с {start} по {end}',
    remainingBudget: '💳 Остаток от ЗП (Свободный бюджет)',
    remainingBudgetSub: 'Доходы цикла − Расходы цикла',
    initialCapital: '🏁 Начальный счёт',
    initialCapitalDesc: 'Укажите сумму, с которой вы начали вести учёт.',
    setCapital: 'Ок',
    expenseStructure: '📊 Структура расходов',

    // Forms
    income: '💵 Доходы',
    incomePlaceholder: 'Название (Зарплата)',
    fixedExpenses: '📋 Постоянные траты',
    fixedPlaceholder: 'Аренда, подписки...',
    variableExpenses: '💳 Непостоянные траты / Кредитка',
    variablePlaceholder: 'Покупка, услуга...',
    template: '📋 Шаблон',
    templateNoPrev: 'Нет предыдущего цикла для копирования шаблона.',
    templateNoFixed: 'В предыдущем цикле нет постоянных трат для копирования.',
    addBtn: '+',
    okBtn: 'Ок',

    // Table
    operationsLog: '📜 Журнал операций',
    operationsCount: '{count} операций',
    noOperations: 'В этом цикле пока нет операций',
    thName: 'Название',
    thDate: 'Дата',
    thCategory: 'Категория',
    thAmount: 'Сумма',
    thActions: '',

    // Categories
    catIncome: 'Доход',
    catFixed: 'Постоянная',
    catVariable: 'Непостоянная',
    catCustom: 'Пользовательская',

    // Modal
    editOperation: '✏️ Редактировать операцию',
    editName: 'Название',
    editAmount: 'Сумма (₪)',
    editCategory: 'Категория',
    cancel: 'Отмена',
    save: 'Сохранить',
    delete: 'Удалить',
    deleteConfirm: 'Удалить операцию «{name}»?',
    deleteConfirmTitle: 'Подтверждение удаления',
    undoDelete: 'Операция удалена',
    undoBtn: 'Отменить',

    // Budget Limits
    budgetLimits: '💰 Бюджетные лимиты',
    budgetCategory: 'Категория',
    budgetLimit: 'Лимит (₪)',
    budgetSpent: 'Потрачено',
    budgetRemaining: 'Осталось',
    budgetSet: 'Установить лимит',
    budgetEdit: 'Редактировать лимиты',

    // Categories management
    customCategories: '📂 Категории',
    addCategory: 'Добавить категорию',
    categoryName: 'Название категории',
    categoryColor: 'Цвет',
    categoryDelete: 'Удалить категорию',
    categoryDeleteConfirm: 'Удалить категорию «{name}»? Операции этой категории перейдут в «Непостоянные».',

    // Goals
    goals: '🎯 Финансовые цели',
    addGoal: 'Добавить цель',
    goalName: 'Название цели',
    goalTarget: 'Целевая сумма (₪)',
    goalCurrent: 'Текущая сумма (₪)',
    goalProgress: 'Прогресс: {pct}%',
    goalDelete: 'Удалить цель',

    // Validation
    fillAllFields: 'Пожалуйста, заполните все поля корректно.',
    invalidAmount: 'Пожалуйста, введите корректную сумму.',
    noPrevCycle: 'Нет предыдущего цикла для копирования шаблона.',
    noFixedInPrev: 'В предыдущем цикле нет постоянных трат для копирования.',
    fileAttachError: 'Не удалось привязать файл.',

    // Setup
    setupTitle: '🏦 Financy PRO',
    setupDesc: 'Выберите стартовый финансовый цикл, с которого начинается ваш учёт.',
    setupStart: 'Начать учёт',

    // Trend chart
    trendTitle: '📈 Динамика баланса',
    trendIncome: 'Доходы',
    trendExpenses: 'Расходы',
    trendBalance: 'Баланс',

    // Hotkeys
    hotkeysTitle: '⌨️ Горячие клавиши',
    hotkeyNewIncome: 'Новый доход',
    hotkeyNewFixed: 'Новая постоянная трата',
    hotkeyNewVariable: 'Новая переменная трата',
    hotkeySave: 'Сохранить',
    hotkeyClose: 'Закрыть модалку',
    hotkeySearch: 'Поиск',
    hotkeyToggleTheme: 'Тема',
    hotkeyHelp: 'Помощь',

    // Tags
    tags: 'Теги',
    addTag: 'Добавить тег',

    // Export/Import
    exportData: '📤 Экспорт',
    importData: '📥 Импорт',
    exportCSV: 'Экспорт в CSV',
    importCSV: 'Импорт из CSV',

    // Period
    cyclePeriod: 'Период',

    // Search
    searchPlaceholder: 'Поиск по операциям...',
    filterAll: 'Все категории',

    // Recurring
    recurringTransactions: '🔄 Регулярные транзакции',
    addRecurring: 'Добавить регулярную',
    recurringName: 'Название',
    recurringAmount: 'Сумма',
    recurringDay: 'День месяца',
    recurringCategory: 'Категория',
    recurringNextDate: 'Следующая дата',
    noRecurring: 'Нет регулярных транзакций',

    // Annual report
    annualReport: '📊 Годовой отчёт',
    reportIncome: 'Доходы',
    reportExpenses: 'Расходы',
    reportBalance: 'Баланс на конец периода',
    reportSavings: 'Накопления',
    reportYear: 'Год',
    generateReport: 'Сгенерировать',
    reportExportPDF: 'Экспорт в PDF',
  }
};

// Default locale
let currentLocale = 'ru';

function t(key, replacements = {}) {
  const locale = LOCALES[currentLocale];
  if (!locale) return key;
  let text = locale[key];
  if (!text) return key;
  for (const [k, v] of Object.entries(replacements)) {
    text = text.replace(`{${k}}`, v);
  }
  return text;
}

function setLocale(locale) {
  if (LOCALES[locale]) {
    currentLocale = locale;
    document.documentElement.lang = locale === 'ru' ? 'ru' : 'en';
    localStorage.setItem('financy_locale', locale);
  }
}

function initLocale() {
  const saved = localStorage.getItem('financy_locale');
  if (saved && LOCALES[saved]) {
    currentLocale = saved;
  }
  document.documentElement.lang = currentLocale === 'ru' ? 'ru' : 'en';
}

export { t, setLocale, initLocale, currentLocale, LOCALES };