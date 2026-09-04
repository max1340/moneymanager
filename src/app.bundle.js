(() => {
  // src/js/state.js
  var state = {
    startCapital: 0,
    cycles: {},
    currentCycle: null,
    customCategories: [],
    budgetLimits: {},
    goals: [],
    recurringTransactions: [],
    tags: []
  };
  var fileHandle = null;
  var listeners = [];
  function setState(newState) {
    state = newState;
    notifyListeners();
  }
  function getCycleData(cycleKey) {
    if (!state.cycles[cycleKey]) {
      state.cycles[cycleKey] = { income: [], fixed: [], variable: [] };
      state.customCategories.forEach((cat) => {
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
      listeners = listeners.filter((l) => l !== fn);
    };
  }
  function notifyListeners() {
    listeners.forEach((fn) => fn(state));
  }

  // src/js/calculations.js
  function calcTotalIncome(cycleData) {
    let total = 0;
    for (const key in cycleData) {
      if (key === "income") {
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
      state.customCategories.forEach((cat) => {
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
    return income > 0 ? expenses / income * 100 : 0;
  }
  function calcCategoryExpenses(cycleData) {
    const result = [];
    const fixed = calcTotalFixed(cycleData);
    const variable = calcTotalVariable(cycleData);
    if (fixed > 0) result.push({ id: "fixed", name: "\u041F\u043E\u0441\u0442\u043E\u044F\u043D\u043D\u044B\u0435", amount: fixed, color: "var(--chart-color-1)" });
    if (variable > 0) result.push({ id: "variable", name: "\u041D\u0435\u043F\u043E\u0441\u0442\u043E\u044F\u043D\u043D\u044B\u0435", amount: variable, color: "var(--chart-color-2)" });
    state.customCategories.forEach((cat) => {
      const amount = cycleData[cat.id] ? cycleData[cat.id].reduce((sum, t) => sum + t.amount, 0) : 0;
      if (amount > 0) {
        result.push({ id: cat.id, name: cat.name, amount, color: cat.color });
      }
    });
    return result;
  }
  function calcBudgetProgress(categoryId, cycleData) {
    const limit = state.budgetLimits[categoryId] || 0;
    if (limit <= 0) return null;
    let spent = 0;
    if (categoryId === "fixed") spent = calcTotalFixed(cycleData);
    else if (categoryId === "variable") spent = calcTotalVariable(cycleData);
    else if (cycleData[categoryId]) {
      spent = cycleData[categoryId].reduce((sum, t) => sum + t.amount, 0);
    }
    return {
      limit,
      spent,
      remaining: limit - spent,
      percent: limit > 0 ? Math.min(spent / limit * 100, 100) : 0
    };
  }
  function calcGoalProgress(goal) {
    if (goal.target <= 0) return 0;
    return Math.min(goal.current / goal.target * 100, 100);
  }
  function calcCashFlowForecast(months = 3) {
    const cycleKeys = Object.keys(state.cycles).sort();
    if (cycleKeys.length === 0) return null;
    const recentKeys = cycleKeys.slice(-months);
    let totalIncome = 0, totalExpenses = 0, count = 0;
    recentKeys.forEach((key) => {
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

  // src/js/utils.js
  function uuid() {
    return crypto.randomUUID();
  }
  function formatDate(d) {
    if (!d) return "";
    const date = /* @__PURE__ */ new Date(d + "T00:00:00");
    if (isNaN(date.getTime())) return d;
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  }
  function getInitials(name) {
    if (!name || name.trim() === "") return "??";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  function cycleLabel(cycleKey) {
    if (!cycleKey) return "";
    const [year, month] = cycleKey.split("-").map(Number);
    const monthNames = [
      "\u042F\u043D\u0432\u0430\u0440\u044C",
      "\u0424\u0435\u0432\u0440\u0430\u043B\u044C",
      "\u041C\u0430\u0440\u0442",
      "\u0410\u043F\u0440\u0435\u043B\u044C",
      "\u041C\u0430\u0439",
      "\u0418\u044E\u043D\u044C",
      "\u0418\u044E\u043B\u044C",
      "\u0410\u0432\u0433\u0443\u0441\u0442",
      "\u0421\u0435\u043D\u0442\u044F\u0431\u0440\u044C",
      "\u041E\u043A\u0442\u044F\u0431\u0440\u044C",
      "\u041D\u043E\u044F\u0431\u0440\u044C",
      "\u0414\u0435\u043A\u0430\u0431\u0440\u044C"
    ];
    return `${monthNames[month - 1]} ${year}`;
  }
  function cycleRange(cycleKey) {
    if (!cycleKey) return "";
    const [year, month] = cycleKey.split("-").map(Number);
    const start = new Date(year, month - 1, 10);
    const end = new Date(year, month, 9);
    const fmt = (d) => {
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      return `${dd}.${mm}.${yyyy}`;
    };
    return `${fmt(start)} \u2014 ${fmt(end)}`;
  }
  function currentCycleKey() {
    const now = /* @__PURE__ */ new Date();
    const day = now.getDate();
    let y = now.getFullYear();
    let m = now.getMonth() + 1;
    if (day < 10) {
      m -= 1;
      if (m <= 0) {
        m = 12;
        y -= 1;
      }
    }
    return `${y}-${String(m).padStart(2, "0")}`;
  }
  function generateCycleOptions(selected) {
    const now = /* @__PURE__ */ new Date();
    let cy = now.getFullYear();
    let cm = now.getMonth() + 1;
    if (now.getDate() < 10) {
      cm -= 1;
      if (cm <= 0) {
        cm = 12;
        cy -= 1;
      }
    }
    const options = [];
    for (let i = -6; i <= 6; i++) {
      let y = cy, m = cm + i;
      while (m < 1) {
        m += 12;
        y -= 1;
      }
      while (m > 12) {
        m -= 12;
        y += 1;
      }
      const key = `${y}-${String(m).padStart(2, "0")}`;
      options.push(key);
    }
    return options;
  }
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
  function pluralize(count, forms) {
    const n = Math.abs(count) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return forms[2];
    if (n1 > 1 && n1 < 5) return forms[1];
    if (n1 === 1) return forms[0];
    return forms[2];
  }

  // src/js/fileio.js
  var fileHandle2 = null;

  // ---- IndexedDB for File Handle Persistence ----
  var DB_NAME = 'financy_pro_db';
  var STORE_NAME = 'handles';
  var HANDLE_KEY = 'active_file_handle';

  async function openDB() {
    return new Promise((resolve, reject) => {
      var request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function saveHandleToDB(handle) {
    try {
      var db = await openDB();
      var tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
      return new Promise((resolve) => {
        tx.oncomplete = () => resolve(true);
      });
    } catch (err) {
      console.error('Failed to save handle to DB:', err);
      return false;
    }
  }

  async function getHandleFromDB() {
    try {
      var db = await openDB();
      var tx = db.transaction(STORE_NAME, 'readonly');
      var handle = await new Promise((resolve) => {
        var req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
      return handle;
    } catch (err) {
      console.error('Failed to get handle from DB:', err);
      return null;
    }
  }

  var autoSaveCountdown = 300;
  var autoSaveIntervalId = null;
  var isDirty = false;
  var debouncedSaveTimer = null;
  var onStatusChange = null;
  var onSavingChange = null;
  var onTimerUpdate = null;
  function setStatusCallbacks(callbacks) {
    if (callbacks.onStatusChange) onStatusChange = callbacks.onStatusChange;
    if (callbacks.onSavingChange) onSavingChange = callbacks.onSavingChange;
    if (callbacks.onTimerUpdate) onTimerUpdate = callbacks.onTimerUpdate;
  }
  function markDirty() {
    isDirty = true;
    autoSaveCountdown = 300;
    updateAutoSaveTimer();
    if (debouncedSaveTimer) clearTimeout(debouncedSaveTimer);
    debouncedSaveTimer = setTimeout(() => {
      saveToFile();
      debouncedSaveTimer = null;
    }, 500);
  }
  async function attachFile() {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: "financy_db.json",
        types: [{ description: "JSON Database", accept: { "application/json": [".json"] } }]
      });
      fileHandle2 = handle;
      await saveHandleToDB(handle);
      await loadFromFile();
      if (onStatusChange) onStatusChange(true);
      startAutoSave();
      return true;
    } catch (err) {
      if (err.name !== "AbortError" && err.name !== "SecurityError") {
        console.error("File attach error:", err);
        throw err;
      }
      return false;
    }
  }
  async function loadFromFile() {
    if (!fileHandle2) return;
    try {
      const file = await fileHandle2.getFile();
      if (file.size === 0) {
        saveToFile();
        return;
      }
      const text = await file.text();
      const data = JSON.parse(text);
      setState({
        ...state,
        ...data,
        cycles: data.cycles || {},
        startCapital: data.startCapital || 0,
        currentCycle: data.currentCycle || currentCycleKey(),
        customCategories: data.customCategories || [],
        budgetLimits: data.budgetLimits || {},
        goals: data.goals || [],
        recurringTransactions: data.recurringTransactions || [],
        tags: data.tags || []
      });
      notifyListeners();
    } catch (err) {
      console.error("Load error:", err);
      const backup = localStorage.getItem("financy_pro_backup");
      if (backup) {
        try {
          const data = JSON.parse(backup);
          setState({
            ...state,
            ...data,
            cycles: data.cycles || {},
            startCapital: data.startCapital || 0,
            currentCycle: data.currentCycle || currentCycleKey(),
            customCategories: data.customCategories || [],
            budgetLimits: data.budgetLimits || {},
            goals: data.goals || [],
            recurringTransactions: data.recurringTransactions || [],
            tags: data.tags || []
          });
          notifyListeners();
          if (onStatusChange) onStatusChange(true);
        } catch (e) {
          console.error("Backup recovery failed:", e);
        }
      }
    }
  }
  async function saveToFile() {
    if (!fileHandle2) {
      localStorage.setItem("financy_pro_backup", JSON.stringify(state));
      return;
    }
    try {
      const writable = await fileHandle2.createWritable();
      await writable.write(JSON.stringify(state, null, 2));
      await writable.close();
      localStorage.setItem("financy_pro_backup", JSON.stringify(state));
      isDirty = false;
    } catch (err) {
      console.error("Save error:", err);
      localStorage.setItem("financy_pro_backup", JSON.stringify(state));
    }
  }
  function startAutoSave() {
    if (autoSaveIntervalId) clearInterval(autoSaveIntervalId);
    autoSaveCountdown = 300;
    updateAutoSaveTimer();
    autoSaveIntervalId = setInterval(() => {
      autoSaveCountdown -= 1;
      if (autoSaveCountdown <= 0) {
        autoSaveCountdown = 300;
        if (onSavingChange) onSavingChange(true);
        saveToFile().then(() => {
          setTimeout(() => {
            if (onSavingChange) onSavingChange(false);
            if (onStatusChange) onStatusChange(true);
          }, 600);
        });
      }
      updateAutoSaveTimer();
    }, 1e3);
  }
  function updateAutoSaveTimer() {
    if (onTimerUpdate) {
      const min = Math.floor(autoSaveCountdown / 60);
      const sec = autoSaveCountdown % 60;
      onTimerUpdate(min, sec);
    }
  }
  function exportToCSV() {
    const rows = [["\u0414\u0430\u0442\u0430", "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F", "\u0421\u0443\u043C\u043C\u0430", "\u0426\u0438\u043A\u043B"]];
    for (const ck in state.cycles) {
      const cd = state.cycles[ck];
      const categories = ["income", "fixed", "variable", ...state.customCategories.map((c) => c.id)];
      const catNames = {
        income: "\u0414\u043E\u0445\u043E\u0434",
        fixed: "\u041F\u043E\u0441\u0442\u043E\u044F\u043D\u043D\u0430\u044F",
        variable: "\u041D\u0435\u043F\u043E\u0441\u0442\u043E\u044F\u043D\u043D\u0430\u044F"
      };
      state.customCategories.forEach((c) => {
        catNames[c.id] = c.name;
      });
      categories.forEach((cat) => {
        if (cd[cat]) {
          cd[cat].forEach((op) => {
            rows.push([op.date, op.name, catNames[cat] || cat, op.amount, ck]);
          });
        }
      });
    }
    const csv = rows.map(
      (row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financy_export_${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function importFromJSON() {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";
      input.onchange = async (e) => {
        try {
          const file = e.target.files[0];
          if (!file) {
            resolve(null);
            return;
          }
          const text = await file.text();
          const data = JSON.parse(text);
          if (!data.cycles && data.startCapital === undefined) {
            throw new Error("Некорректный формат JSON-бекапа");
          }
          resolve(data);
        } catch (err) {
          reject(err);
        }
      };
      input.click();
    });
  }

  function importFromCSV() {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".csv";
      input.onchange = async (e) => {
        try {
          const file = e.target.files[0];
          if (!file) {
            resolve(0);
            return;
          }
          const text = await file.text();
          const lines = text.split("\n").filter((l) => l.trim());
          if (lines.length <= 1) {
            resolve(0);
            return;
          }
          let imported = 0;
          for (let i = 1; i < lines.length; i++) {
            const cols = parseCSVLine(lines[i]);
            if (cols.length < 4) continue;
            const date = cols[0];
            const name = cols[1];
            const category = normalizeCategory(cols[2]);
            const amount = parseFloat(cols[3]);
            if (!date || !name || isNaN(amount)) continue;
            const d = /* @__PURE__ */ new Date(date + "T00:00:00");
            if (isNaN(d.getTime())) continue;
            const day = d.getDate();
            let y = d.getFullYear();
            let m = d.getMonth() + 1;
            if (day < 10) {
              m -= 1;
              if (m <= 0) {
                m = 12;
                y -= 1;
              }
            }
            const cycleKey = `${y}-${String(m).padStart(2, "0")}`;
            if (!state.cycles[cycleKey]) {
              state.cycles[cycleKey] = { income: [], fixed: [], variable: [] };
            }
            const op = {
              id: crypto.randomUUID(),
              name: name.trim(),
              date,
              amount: Math.abs(amount)
            };
            const cat = category === "income" ? "income" : category === "fixed" ? "fixed" : "variable";
            state.cycles[cycleKey][cat].push(op);
            imported++;
          }
          if (imported > 0) {
            markDirty();
            notifyListeners();
          }
          resolve(imported);
        } catch (err) {
          reject(err);
        }
      };
      input.click();
    });
  }
  function parseCSVLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  }
  function normalizeCategory(cat) {
    const lower = cat.toLowerCase().trim();
    if (lower === "\u0434\u043E\u0445\u043E\u0434" || lower === "income") return "income";
    if (lower === "\u043F\u043E\u0441\u0442\u043E\u044F\u043D\u043D\u0430\u044F" || lower === "fixed" || lower === "\u043F\u043E\u0441\u0442\u043E\u044F\u043D\u043D\u044B\u0435") return "fixed";
    if (lower === "\u043D\u0435\u043F\u043E\u0441\u0442\u043E\u044F\u043D\u043D\u0430\u044F" || lower === "variable" || lower === "\u043D\u0435\u043F\u043E\u0441\u0442\u043E\u044F\u043D\u043D\u044B\u0435") return "variable";
    return "variable";
  }

  // src/js/crud.js
  function addOperation(category, name, date, amount) {
    const cycleData = getCurrentCycleData2();
    const op = { id: uuid(), name: name.trim(), date, amount: Math.abs(amount) };
    cycleData[category].push(op);
    markDirty();
    notifyListeners();
    return op;
  }
  function deleteOperation(category, id) {
    const cycleData = getCurrentCycleData2();
    const index = cycleData[category].findIndex((t) => t.id === id);
    if (index === -1) return null;
    const removed = cycleData[category][index];
    cycleData[category].splice(index, 1);
    markDirty();
    notifyListeners();
    return removed;
  }
  function updateOperation(category, id, newName, newAmount, newCategory) {
    const cycleData = getCurrentCycleData2();
    let op = null;
    cycleData[category] = cycleData[category].filter((t) => {
      if (t.id === id) {
        op = { ...t };
        return false;
      }
      return true;
    });
    if (!op) return null;
    op.name = newName.trim();
    op.amount = Math.abs(newAmount);
    if (newCategory !== category) {
      getCurrentCycleData2()[newCategory].push(op);
    } else {
      cycleData[category].push(op);
    }
    markDirty();
    notifyListeners();
    return op;
  }
  function findOperation(category, id) {
    const cycleData = getCurrentCycleData2();
    for (const cat of ["income", "fixed", "variable", ...state.customCategories.map((c) => c.id)]) {
      if (cycleData[cat]) {
        const found = cycleData[cat].find((t) => t.id === id);
        if (found) return { ...found, category: cat };
      }
    }
    return null;
  }
  function getAllOperations() {
    const cycleData = getCurrentCycleData2();
    const allOps = [];
    const categories = ["income", "fixed", "variable", ...state.customCategories.map((c) => c.id)];
    categories.forEach((cat) => {
      if (cycleData[cat]) {
        cycleData[cat].forEach((t) => allOps.push({ ...t, category: cat }));
      }
    });
    return allOps;
  }
  function setStartCapital(value) {
    state.startCapital = value;
    markDirty();
    notifyListeners();
  }
  function addCustomCategory(name, color) {
    const cat = { id: uuid(), name: name.trim(), color: color || "#8b5cf6", type: "expense" };
    state.customCategories.push(cat);
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
    state.customCategories = state.customCategories.filter((c) => c.id !== categoryId);
    for (const ck in state.cycles) {
      if (state.cycles[ck][categoryId]) {
        const ops = state.cycles[ck][categoryId] || [];
        ops.forEach((op) => {
          state.cycles[ck].variable.push({ ...op, id: uuid() });
        });
        delete state.cycles[ck][categoryId];
      }
    }
    delete state.budgetLimits[categoryId];
    markDirty();
    notifyListeners();
  }
  function setBudgetLimit(categoryId, limit) {
    if (limit <= 0) {
      delete state.budgetLimits[categoryId];
    } else {
      state.budgetLimits[categoryId] = limit;
    }
    markDirty();
    notifyListeners();
  }
  function addGoal(name, target, current = 0) {
    const goal = { id: uuid(), name: name.trim(), target: Math.abs(target), current: Math.abs(current) };
    state.goals.push(goal);
    markDirty();
    notifyListeners();
    return goal;
  }
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
    state.recurringTransactions = state.recurringTransactions.filter((r) => r.id !== id);
    markDirty();
    notifyListeners();
  }
  function calculateNextDate(day) {
    const now = /* @__PURE__ */ new Date();
    let y = now.getFullYear();
    let m = now.getMonth();
    if (now.getDate() > day) {
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  function processRecurringTransactions() {
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    let processed = 0;
    state.recurringTransactions.forEach((rt) => {
      if (rt.nextDate <= today) {
        const cycleData = getCurrentCycleData();
        const op = {
          id: uuid(),
          name: rt.name,
          date: rt.nextDate,
          amount: rt.amount
        };
        const cat = rt.category === "income" ? "income" : rt.category === "fixed" ? "fixed" : state.customCategories.find((c) => c.id === rt.category) ? rt.category : "variable";
        if (!cycleData[cat]) cycleData[cat] = [];
        cycleData[cat].push(op);
        const [y, m, d] = rt.nextDate.split("-").map(Number);
        let nm = m + 1;
        let ny = y;
        if (nm > 12) {
          nm = 1;
          ny += 1;
        }
        rt.nextDate = `${ny}-${String(nm).padStart(2, "0")}-${String(rt.day).padStart(2, "0")}`;
        processed++;
      }
    });
    if (processed > 0) {
      markDirty();
      notifyListeners();
    }
  }
  function changeCycle(newCycle) {
    if (newCycle === state.currentCycle) return;
    state.currentCycle = newCycle;
    getCycleData(newCycle);
    markDirty();
    notifyListeners();
  }
  function applyTemplate() {
    const currentKey = state.currentCycle;
    const [y, m] = currentKey.split("-").map(Number);
    let py = y, pm = m - 1;
    if (pm <= 0) {
      pm = 12;
      py -= 1;
    }
    const prevKey = `${py}-${String(pm).padStart(2, "0")}`;
    const prevData = state.cycles[prevKey];
    if (!prevData || !prevData.fixed || prevData.fixed.length === 0) {
      return { error: "templateNoFixed" };
    }
    const currentData = getCurrentCycleData();
    let copied = 0;
    prevData.fixed.forEach((op) => {
      const oldDate = /* @__PURE__ */ new Date(op.date + "T00:00:00");
      const day = oldDate.getDate();
      const newDate = new Date(y, m - 1, day);
      const dateStr = newDate.toISOString().split("T")[0];
      const exists = currentData.fixed.some(
        (t) => t.name === op.name && (/* @__PURE__ */ new Date(t.date + "T00:00:00")).getDate() === day
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

  // src/js/charts.js
  function renderDonutChart(cycleData) {
    const categories = calcCategoryExpenses(cycleData);
    const total = categories.reduce((sum, c) => sum + c.amount, 0);
    const donutCenter = document.getElementById("donutCenterText");
    const seg1 = document.getElementById("donutSegment1");
    const seg2 = document.getElementById("donutSegment2");
    const donutLegend = document.querySelector(".donut-legend");
    const circumference = 2 * Math.PI * 60;
    if (total === 0 || categories.length === 0) {
      seg1.setAttribute("stroke-dasharray", "0 " + circumference);
      seg2.setAttribute("stroke-dasharray", "0 " + circumference);
      donutCenter.textContent = "0%";
      donutLegend.innerHTML = `
      <div class="legend-item">
        <div class="color-box" style="background:var(--chart-color-1);"></div>
        <span>\u041F\u043E\u0441\u0442\u043E\u044F\u043D\u043D\u044B\u0435 \u0442\u0440\u0430\u0442\u044B</span>
        <span style="font-weight:600;">0</span>
      </div>
      <div class="legend-item">
        <div class="color-box" style="background:var(--chart-color-2);"></div>
        <span>\u041D\u0435\u043F\u043E\u0441\u0442\u043E\u044F\u043D\u043D\u044B\u0435 \u0442\u0440\u0430\u0442\u044B</span>
        <span style="font-weight:600;">0</span>
      </div>
    `;
      return;
    }
    const mainCategories = categories.slice(0, 2);
    const others = categories.slice(2);
    const otherTotal = others.reduce((sum, c) => sum + c.amount, 0);
    if (otherTotal > 0) {
      mainCategories.push({ id: "other", name: "\u041F\u0440\u043E\u0447\u0435\u0435", amount: otherTotal, color: "#94a3b8" });
    }
    const ratio1 = mainCategories[0] ? mainCategories[0].amount / total : 0;
    const ratio2 = mainCategories[1] ? mainCategories[1].amount / total : 0;
    const len1 = ratio1 * circumference;
    const len2 = ratio2 * circumference;
    seg1.setAttribute("stroke-dasharray", len1 + " " + (circumference - len1));
    seg2.setAttribute("stroke-dasharray", len2 + " " + (circumference - len2));
    const income = calcTotalIncome(cycleData);
    const expenses = calcTotalExpenses(cycleData);
    const pct = income > 0 ? expenses / income * 100 : 0;
    donutCenter.textContent = pct.toFixed(0) + "%";
    let legendHTML = "";
    const colorMap = {
      fixed: "var(--chart-color-1)",
      variable: "var(--chart-color-2)",
      other: "#94a3b8"
    };
    state.customCategories.forEach((c) => {
      colorMap[c.id] = c.color;
    });
    categories.forEach((cat) => {
      const color = colorMap[cat.id] || cat.color;
      const amountText = cat.amount.toFixed(0) + " \u20AA";
      legendHTML += `
      <div class="legend-item">
        <div class="color-box" style="background:${color};"></div>
        <span>${cat.name}</span>
        <span style="font-weight:600;">${amountText}</span>
      </div>
    `;
    });
    donutLegend.innerHTML = legendHTML;
  }
  function renderTrendChart() {
    const wrapper = document.getElementById("trendChartWrapper");
    if (!wrapper) return;
    const cycleKeys = Object.keys(state.cycles).sort();
    if (cycleKeys.length < 2) {
      wrapper.innerHTML = '<div class="empty-state" style="padding:20px;"><p>\u0414\u043B\u044F \u0433\u0440\u0430\u0444\u0438\u043A\u0430 \u0442\u0440\u0435\u043D\u0434\u043E\u0432 \u043D\u0443\u0436\u043D\u043E \u043C\u0438\u043D\u0438\u043C\u0443\u043C 2 \u0446\u0438\u043A\u043B\u0430 \u0434\u0430\u043D\u043D\u044B\u0445</p></div>';
      return;
    }
    const data = cycleKeys.map((key) => {
      const cd = state.cycles[key];
      return {
        key,
        label: cycleLabel(key).split(" ")[0],
        income: calcTotalIncome(cd),
        expenses: calcTotalExpenses(cd)
      };
    });
    const maxVal = Math.max(...data.map((d) => Math.max(d.income, d.expenses)), 1);
    const padding = { top: 20, right: 20, bottom: 30, left: 50 };
    const width = Math.max(300, data.length * 80);
    const height = 200;
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;
    const scaleY = (v) => chartH - v / maxVal * chartH + padding.top;
    const scaleX = (i) => padding.left + i / (data.length - 1) * chartW;
    let paths = { income: "", expenses: "" };
    data.forEach((d, i) => {
      const x = scaleX(i);
      const yIncome = scaleY(d.income);
      const yExpenses = scaleY(d.expenses);
      paths.income += (i === 0 ? "M" : "L") + x + "," + yIncome;
      paths.expenses += (i === 0 ? "M" : "L") + x + "," + yExpenses;
    });
    let yLabels = "";
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const val = maxVal / steps * i;
      const y = scaleY(val);
      yLabels += `
      <text x="${padding.left - 8}" y="${y + 3}" text-anchor="end">${Math.round(val).toLocaleString()}</text>
      <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3"/>
    `;
    }
    let xLabels = "";
    data.forEach((d, i) => {
      xLabels += `<text x="${scaleX(i)}" y="${height - 5}" text-anchor="middle">${d.label}</text>`;
    });
    wrapper.innerHTML = `
    <svg class="trend-chart-svg" viewBox="0 0 ${width} ${height}">
      ${yLabels}
      ${xLabels}
      <path d="${paths.income}" fill="none" stroke="var(--chart-color-3)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${paths.expenses}" fill="none" stroke="var(--chart-color-4)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${data.map((d, i) => `
        <circle cx="${scaleX(i)}" cy="${scaleY(d.income)}" r="4" fill="var(--chart-color-3)" stroke="var(--surface)" stroke-width="2"/>
        <circle cx="${scaleX(i)}" cy="${scaleY(d.expenses)}" r="4" fill="var(--chart-color-4)" stroke="var(--surface)" stroke-width="2"/>
      `).join("")}
    </svg>
    <div class="trend-legend">
      <div class="trend-legend-item">
        <div class="trend-legend-dot" style="background:var(--chart-color-3);"></div>
        <span>\u0414\u043E\u0445\u043E\u0434\u044B</span>
      </div>
      <div class="trend-legend-item">
        <div class="trend-legend-dot" style="background:var(--chart-color-4);"></div>
        <span>\u0420\u0430\u0441\u0445\u043E\u0434\u044B</span>
      </div>
    </div>
  `;
  }

  // src/js/app.js
  var currentSort = { column: "date", direction: "desc" };
  var searchQuery = "";
  var filterCategory = "all";
  var editTarget = null;
  var undoStack = [];
  async function init() {
    initTheme();
    setStatusCallbacks({
      onStatusChange: updateFileStatusUI,
      onSavingChange: updateSavingIndicator,
      onTimerUpdate: updateTimerDisplay
    });

    try {
      const savedHandle = await getHandleFromDB();
      if (savedHandle) {
        fileHandle2 = savedHandle;
        await loadFromFile();
        startAutoSave();
        updateFileStatusUI(true);
      }
    } catch (e) {
      console.error("Handle restore failed:", e);
    }

    setupEventListeners();
    setDefaultDates();
    subscribe(renderAll);
    const backup = localStorage.getItem("financy_pro_backup");
    if (backup) {
      try {
        const data = JSON.parse(backup);
        Object.assign(state, data);
        if (state.currentCycle) {
          document.getElementById("setupOverlay").classList.remove("active");
          renderAll();
          updateFileStatusUI(true);
          return;
        }
      } catch (e) {
      }
    }
    const setupDone = localStorage.getItem("financy_setup_done") === "true";
    if (setupDone) {
      state.currentCycle = currentCycleKey();
      document.getElementById("setupOverlay").classList.remove("active");
      renderAll();
      updateFileStatusUI(true);
      processRecurringTransactions();
      return;
    }
    showSetup();
  }
  function initTheme() {
    const saved = localStorage.getItem("financy_theme");
    if (saved === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
      document.getElementById("themeToggle").textContent = "\u2600\uFE0F";
    }
  }
  function toggleTheme() {
    const html = document.documentElement;
    const btn = document.getElementById("themeToggle");
    if (html.getAttribute("data-theme") === "dark") {
      html.removeAttribute("data-theme");
      btn.textContent = "\u{1F319}";
      localStorage.setItem("financy_theme", "light");
    } else {
      html.setAttribute("data-theme", "dark");
      btn.textContent = "\u2600\uFE0F";
      localStorage.setItem("financy_theme", "dark");
    }
  }
  function updateFileStatusUI(connected) {
    const el = document.getElementById("fileStatus");
    const dot = el.querySelector(".dot");
    const text = el.querySelector(".status-text");
    if (connected && typeof fileHandle !== 'undefined' && fileHandle) {
      dot.className = "dot green";
      text.textContent = fileHandle.name || "LocalStorage";
    } else if (connected) {
      dot.className = "dot green";
      text.textContent = "LocalStorage";
    } else {
      dot.className = "dot red";
      text.textContent = "\u0424\u0430\u0439\u043B \u043D\u0435 \u043F\u0440\u0438\u0432\u044F\u0437\u0430\u043D";
    }
  }
  function updateSavingIndicator(isSaving) {
    if (isSaving) {
      const status = document.getElementById("fileStatus");
      status.classList.add("saving");
      status.querySelector(".dot").className = "dot blue";
    } else {
      const status = document.getElementById("fileStatus");
      status.classList.remove("saving");
      updateFileStatusUI(true);
    }
  }
  function updateTimerDisplay(min, sec) {
    document.getElementById("autosaveTimer").textContent = `\u23F1 ${min}:${String(sec).padStart(2, "0")}`;
  }
  function renderAll() {
    const cycleData = getCurrentCycleData2();
    const totalIncome = calcTotalIncome(cycleData);
    const totalExpenses = calcTotalExpenses(cycleData);
    const remaining = calcRemainingBudget(cycleData);
    const overall = calcOverallBalance();
    document.getElementById("totalBalance").textContent = overall.toFixed(2) + " \u20AA";
    document.getElementById("cycleIncome").textContent = totalIncome.toFixed(2) + " \u20AA";
    document.getElementById("cycleIncomeSub").textContent = cycleRange(state.currentCycle);
    const remainingEl = document.getElementById("remainingBudget");
    remainingEl.textContent = remaining.toFixed(2) + " \u20AA";
    remainingEl.classList.toggle("danger", remaining < 0);
    remainingEl.classList.toggle("success", remaining >= 0);
    const pct = calcExpensePercent(cycleData);
    const chip = document.getElementById("expensePercent");
    chip.textContent = pct.toFixed(1) + "%";
    chip.className = "chip";
    if (pct > 90) chip.classList.add("chip-danger");
    else if (pct > 70) chip.classList.add("chip-warning");
    else chip.classList.add("chip-primary");
    document.getElementById("startCapitalInput").value = state.startCapital || "";
    renderDonutChart(cycleData);
    renderTrendChart();
    renderOperations();
    updateCycleSelector();
    renderBudgetLimits();
    renderGoals();
    renderCashFlowForecast();
  }
  function renderOperations() {
    let allOps = getAllOperations();
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      allOps = allOps.filter((op) => op.name.toLowerCase().includes(q));
    }
    if (filterCategory !== "all") {
      allOps = allOps.filter((op) => op.category === filterCategory);
    }
    allOps.sort((a, b) => {
      let cmp = 0;
      if (currentSort.column === "date") {
        cmp = a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
      } else if (currentSort.column === "name") {
        cmp = a.name.localeCompare(b.name);
      } else if (currentSort.column === "amount") {
        cmp = a.amount - b.amount;
      } else if (currentSort.column === "category") {
        cmp = (a.category || "").localeCompare(b.category || "");
      }
      return currentSort.direction === "desc" ? -cmp : cmp;
    });
    const tbody = document.getElementById("operationsBody");
    const empty = document.getElementById("emptyState");
    if (allOps.length === 0) {
      tbody.innerHTML = "";
      empty.style.display = "block";
      document.getElementById("operationsCount").textContent = "0 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u0439";
      document.getElementById("searchInput").value = searchQuery;
      return;
    }
    empty.style.display = "none";
    const count = allOps.length;
    document.getElementById("operationsCount").textContent = count + " " + pluralize(count, ["\u043E\u043F\u0435\u0440\u0430\u0446\u0438\u044F", "\u043E\u043F\u0435\u0440\u0430\u0446\u0438\u0438", "\u043E\u043F\u0435\u0440\u0430\u0446\u0438\u0439"]);
    const catNames = {
      income: "\u0414\u043E\u0445\u043E\u0434",
      fixed: "\u041F\u043E\u0441\u0442\u043E\u044F\u043D\u043D\u0430\u044F",
      variable: "\u041D\u0435\u043F\u043E\u0441\u0442\u043E\u044F\u043D\u043D\u0430\u044F"
    };
    const catClasses = {
      income: "category-income",
      fixed: "category-fixed",
      variable: "category-variable"
    };
    state.customCategories.forEach((c) => {
      catNames[c.id] = c.name;
    });
    let html = "";
    allOps.forEach((op) => {
      const isIncome = op.category === "income";
      const amountClass = isIncome ? "positive" : op.category === "variable" ? "" : "negative";
      const sign = isIncome ? "+" : "\u2212";
      const catClass = catClasses[op.category] || "category-variable";
      html += `
      <tr class="row-enter">
        <td><div class="avatar">${getInitials(op.name)}</div></td>
        <td>${escapeHtml(op.name)}</td>
        <td>${formatDate(op.date)}</td>
        <td><span class="category-badge ${catClass}">${catNames[op.category] || op.category}</span></td>
        <td class="amount ${amountClass}">${sign} ${op.amount.toFixed(2)} \u20AA</td>
        <td>
          <div class="action-cell">
            <button class="edit-btn" data-category="${op.category}" data-id="${op.id}" title="\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C">\u270F\uFE0F</button>
            <button class="delete-btn danger" data-category="${op.category}" data-id="${op.id}" title="\u0423\u0434\u0430\u043B\u0438\u0442\u044C">\xD7</button>
          </div>
        </td>
      </tr>
    `;
    });
    tbody.innerHTML = html;
    tbody.querySelectorAll(".edit-btn").forEach((btn) => {
      btn.addEventListener("click", () => openEditModal(btn.dataset.category, btn.dataset.id));
    });
    tbody.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        showDeleteConfirm(btn.dataset.category, btn.dataset.id);
      });
    });
    document.getElementById("searchInput").value = searchQuery;
  }
  function showDeleteConfirm(category, id) {
    const op = findOperation(category, id);
    if (!op) return;
    const overlay = document.getElementById("confirmOverlay");
    const text = document.getElementById("confirmText");
    const title = document.getElementById("confirmTitle");
    title.textContent = "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u044F";
    text.textContent = `\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u044E \xAB${op.name}\xBB \u043D\u0430 \u0441\u0443\u043C\u043C\u0443 ${op.amount.toFixed(2)} \u20AA?`;
    overlay.classList.add("active");
    document.getElementById("confirmYesBtn").onclick = () => {
      overlay.classList.remove("active");
      performDelete(category, id, op);
    };
    document.getElementById("confirmNoBtn").onclick = () => {
      overlay.classList.remove("active");
    };
  }
  function performDelete(category, id, op) {
    const removed = deleteOperation(category, id);
    if (removed) {
      undoStack.push({ type: "delete", category, data: removed, timestamp: Date.now() });
      showUndoSnackbar(`\u0423\u0434\u0430\u043B\u0435\u043D\u0430 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u044F \xAB${removed.name}\xBB`);
      if (undoStack.length > 10) undoStack.shift();
    }
  }
  function undoLastDelete() {
    const last = undoStack.pop();
    if (!last || last.type !== "delete") return;
    const cycleData = getCurrentCycleData2();
    cycleData[last.category].push(last.data);
    markDirty();
    renderAll();
    hideUndoSnackbar();
  }
  function showUndoSnackbar(message) {
    const snackbar = document.getElementById("undoSnackbar");
    const text = snackbar.querySelector(".snackbar-text");
    text.textContent = message;
    snackbar.classList.add("active");
    setTimeout(() => {
      if (undoStack.length === 0) hideUndoSnackbar();
    }, 5e3);
  }
  function hideUndoSnackbar() {
    document.getElementById("undoSnackbar").classList.remove("active");
  }
  function updateCycleSelector() {
    const sel = document.getElementById("cycleSelect");
    const options = generateCycleOptions(state.currentCycle);
    let html = "";
    options.forEach((key) => {
      const selected = key === state.currentCycle ? " selected" : "";
      html += `<option value="${key}"${selected}>${cycleLabel(key)}</option>`;
    });
    sel.innerHTML = html;
  }
  function renderBudgetLimits() {
    const container = document.getElementById("budgetLimitsContainer");
    if (!container) return;
    const cycleData = getCurrentCycleData2();
    let html = "";
    ["fixed", "variable"].forEach((catId) => {
      const catName = catId === "fixed" ? "\u041F\u043E\u0441\u0442\u043E\u044F\u043D\u043D\u044B\u0435" : "\u041D\u0435\u043F\u043E\u0441\u0442\u043E\u044F\u043D\u043D\u044B\u0435";
      const progress = calcBudgetProgress(catId, cycleData);
      if (progress) {
        html += renderBudgetBar(catId, catName, progress);
      }
    });
    state.customCategories.forEach((cat) => {
      const progress = calcBudgetProgress(cat.id, cycleData);
      if (progress) {
        html += renderBudgetBar(cat.id, cat.name, progress);
      }
    });
    if (!html) {
      html = '<div class="empty-state" style="padding:10px;"><p>\u041B\u0438\u043C\u0438\u0442\u044B \u043D\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u044B</p></div>';
    }
    container.innerHTML = html;
  }
  function renderBudgetBar(id, name, progress) {
    const barClass = progress.percent > 90 ? "danger" : progress.percent > 70 ? "warning" : "normal";
    return `
    <div class="budget-bar-item">
      <div class="budget-bar-header">
        <span class="budget-bar-label">${name}</span>
        <span class="budget-bar-value">${progress.spent.toFixed(0)} / ${progress.limit.toFixed(0)} \u20AA (${progress.percent.toFixed(0)}%)</span>
      </div>
      <div class="budget-bar-track">
        <div class="budget-bar-fill ${barClass}" style="width:${progress.percent}%"></div>
      </div>
    </div>
  `;
  }
  function renderGoals() {
    const container = document.getElementById("goalsContainer");
    if (!container) return;
    if (state.goals.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding:10px;"><p>\u0426\u0435\u043B\u0438 \u043D\u0435 \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u044B</p></div>';
      return;
    }
    let html = "";
    state.goals.forEach((goal) => {
      const progress = calcGoalProgress(goal);
      const barClass = progress >= 100 ? "normal" : progress > 50 ? "warning" : "danger";
      html += `
      <div class="goal-card">
        <div class="goal-header">
          <span class="goal-name">${escapeHtml(goal.name)}</span>
          <span class="goal-amount">${goal.current.toFixed(0)} / ${goal.target.toFixed(0)} \u20AA</span>
        </div>
        <div class="budget-bar-track">
          <div class="budget-bar-fill ${barClass}" style="width:${Math.min(progress, 100)}%"></div>
        </div>
        <div class="goal-progress-text">${progress.toFixed(0)}% \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043E</div>
      </div>
    `;
    });
    container.innerHTML = html;
  }
  function renderCashFlowForecast() {
    const container = document.getElementById("forecastContainer");
    if (!container) return;
    const forecast = calcCashFlowForecast(3);
    if (!forecast) {
      container.innerHTML = '<div class="empty-state" style="padding:10px;"><p>\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u0434\u0430\u043D\u043D\u044B\u0445 \u0434\u043B\u044F \u043F\u0440\u043E\u0433\u043D\u043E\u0437\u0430</p></div>';
      return;
    }
    const balanceChange = forecast.avgMonthlySavings >= 0 ? "+" : "";
    const changeColor = forecast.avgMonthlySavings >= 0 ? "var(--success)" : "var(--danger)";
    container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div>
        <div style="font-size:0.75rem;color:var(--text-muted);">\u0421\u0440\u0435\u0434\u043D\u0438\u0439 \u0434\u043E\u0445\u043E\u0434/\u043C\u0435\u0441</div>
        <div style="font-weight:600;">${forecast.avgMonthlyIncome.toFixed(0)} \u20AA</div>
      </div>
      <div>
        <div style="font-size:0.75rem;color:var(--text-muted);">\u0421\u0440\u0435\u0434\u043D\u0438\u0439 \u0440\u0430\u0441\u0445\u043E\u0434/\u043C\u0435\u0441</div>
        <div style="font-weight:600;">${forecast.avgMonthlyExpenses.toFixed(0)} \u20AA</div>
      </div>
      <div>
        <div style="font-size:0.75rem;color:var(--text-muted);">\u042D\u043A\u043E\u043D\u043E\u043C\u0438\u044F/\u043C\u0435\u0441</div>
        <div style="font-weight:600;color:${changeColor};">${balanceChange}${forecast.avgMonthlySavings.toFixed(0)} \u20AA</div>
      </div>
      <div>
        <div style="font-size:0.75rem;color:var(--text-muted);">\u041F\u0440\u043E\u0433\u043D\u043E\u0437 \u0447\u0435\u0440\u0435\u0437 3 \u043C\u0435\u0441</div>
        <div style="font-weight:600;">${forecast.projectedBalance.toFixed(0)} \u20AA</div>
      </div>
    </div>
  `;
  }
  function setupSearch() {
    const searchInput = document.getElementById("searchInput");
    const filterSelect = document.getElementById("filterSelect");
    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value;
      renderOperations();
    });
    filterSelect.addEventListener("change", () => {
      filterCategory = filterSelect.value;
      renderOperations();
    });
    updateFilterOptions();
  }
  function updateFilterOptions() {
    const sel = document.getElementById("filterSelect");
    let html = '<option value="all">\u0412\u0441\u0435 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438</option>';
    html += '<option value="income">\u0414\u043E\u0445\u043E\u0434\u044B</option>';
    html += '<option value="fixed">\u041F\u043E\u0441\u0442\u043E\u044F\u043D\u043D\u044B\u0435</option>';
    html += '<option value="variable">\u041D\u0435\u043F\u043E\u0441\u0442\u043E\u044F\u043D\u043D\u044B\u0435</option>';
    state.customCategories.forEach((c) => {
      html += `<option value="${c.id}">${escapeHtml(c.name)}</option>`;
    });
    sel.innerHTML = html;
  }
  function openEditModal(category, id) {
    const op = findOperation(category, id);
    if (!op) return;
    editTarget = { category, id };
    document.getElementById("editName").value = op.name;
    document.getElementById("editAmount").value = op.amount;
    document.getElementById("editCategory").value = op.category;
    document.getElementById("editModal").classList.add("active");
    const catSelect = document.getElementById("editCategory");
    let html = '<option value="income">\u0414\u043E\u0445\u043E\u0434</option>';
    html += '<option value="fixed">\u041F\u043E\u0441\u0442\u043E\u044F\u043D\u043D\u0430\u044F \u0442\u0440\u0430\u0442\u0430</option>';
    html += '<option value="variable">\u041D\u0435\u043F\u043E\u0441\u0442\u043E\u044F\u043D\u043D\u0430\u044F \u0442\u0440\u0430\u0442\u0430</option>';
    state.customCategories.forEach((c) => {
      html += `<option value="${c.id}">${escapeHtml(c.name)}</option>`;
    });
    catSelect.innerHTML = html;
    catSelect.value = op.category;
  }
  function closeEditModal() {
    document.getElementById("editModal").classList.remove("active");
    editTarget = null;
  }
  function saveEdit() {
    if (!editTarget) return;
    const name = document.getElementById("editName").value.trim();
    const amount = parseFloat(document.getElementById("editAmount").value);
    const category = document.getElementById("editCategory").value;
    if (!name || isNaN(amount) || amount <= 0) {
      alert("\u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0437\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u0432\u0441\u0435 \u043F\u043E\u043B\u044F \u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E.");
      return;
    }
    updateOperation(editTarget.category, editTarget.id, name, amount, category);
    closeEditModal();
  }
  function showSetup() {
    const overlay = document.getElementById("setupOverlay");
    overlay.classList.add("active");
    const sel = document.getElementById("setupCycleSelect");
    const options = generateCycleOptions(currentCycleKey());
    sel.innerHTML = options.map(
      (key) => `<option value="${key}">${cycleLabel(key)} (${cycleRange(key)})</option>`
    ).join("");
    sel.value = currentCycleKey();
  }
  function completeSetup() {
    const sel = document.getElementById("setupCycleSelect");
    state.currentCycle = sel.value;
    document.getElementById("setupOverlay").classList.remove("active");
    localStorage.setItem("financy_setup_done", "true");
    processRecurringTransactions();
    renderAll();
    markDirty();
  }
  function openCategoriesModal() {
    const overlay = document.getElementById("categoriesModal");
    const container = document.getElementById("categoriesList");
    overlay.classList.add("active");
    let html = "";
    state.customCategories.forEach((cat) => {
      html += `
      <div class="category-list-item">
        <div class="category-color-dot" style="background:${cat.color};"></div>
        <span class="category-list-name">${escapeHtml(cat.name)}</span>
        <button class="btn btn-danger btn-xs del-cat-btn" data-id="${cat.id}">\xD7</button>
      </div>
    `;
    });
    if (!html) {
      html = '<div class="empty-state" style="padding:10px;"><p>\u041D\u0435\u0442 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0445 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0439</p></div>';
    }
    container.innerHTML = html;
    container.querySelectorAll(".del-cat-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (confirm(`\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044E? \u041E\u043F\u0435\u0440\u0430\u0446\u0438\u0438 \u043F\u0435\u0440\u0435\u0439\u0434\u0443\u0442 \u0432 \xAB\u041D\u0435\u043F\u043E\u0441\u0442\u043E\u044F\u043D\u043D\u044B\u0435\xBB.`)) {
          deleteCustomCategory(btn.dataset.id);
          openCategoriesModal();
          updateFilterOptions();
        }
      });
    });
  }
  function closeCategoriesModal() {
    document.getElementById("categoriesModal").classList.remove("active");
  }
  function openGoalsModal() {
    const overlay = document.getElementById("goalsModal");
    overlay.classList.add("active");
  }
  function closeGoalsModal() {
    document.getElementById("goalsModal").classList.remove("active");
  }
  function addGoalFromModal() {
    const name = document.getElementById("goalNameInput").value.trim();
    const target = parseFloat(document.getElementById("goalTargetInput").value);
    const current = parseFloat(document.getElementById("goalCurrentInput").value) || 0;
    if (!name || isNaN(target) || target <= 0) {
      alert("\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0438 \u0446\u0435\u043B\u0435\u0432\u0443\u044E \u0441\u0443\u043C\u043C\u0443.");
      return;
    }
    addGoal(name, target, current);
    document.getElementById("goalNameInput").value = "";
    document.getElementById("goalTargetInput").value = "";
    document.getElementById("goalCurrentInput").value = "";
    closeGoalsModal();
  }
  function openBudgetModal() {
    const overlay = document.getElementById("budgetModal");
    const container = document.getElementById("budgetEditContainer");
    overlay.classList.add("active");
    let html = "";
    ["fixed", "variable"].forEach((catId) => {
      const name = catId === "fixed" ? "\u041F\u043E\u0441\u0442\u043E\u044F\u043D\u043D\u044B\u0435" : "\u041D\u0435\u043F\u043E\u0441\u0442\u043E\u044F\u043D\u043D\u044B\u0435";
      const val = state.budgetLimits[catId] || "";
      html += `
      <div class="form-row" style="margin-bottom:10px;">
        <span style="min-width:120px;font-size:0.85rem;">${name}</span>
        <input type="number" class="budget-limit-input" data-cat="${catId}" value="${val}" placeholder="\u041B\u0438\u043C\u0438\u0442 \u20AA" style="flex:1;min-width:80px;">
      </div>
    `;
    });
    state.customCategories.forEach((cat) => {
      const val = state.budgetLimits[cat.id] || "";
      html += `
      <div class="form-row" style="margin-bottom:10px;">
        <span style="min-width:120px;font-size:0.85rem;">${escapeHtml(cat.name)}</span>
        <input type="number" class="budget-limit-input" data-cat="${cat.id}" value="${val}" placeholder="\u041B\u0438\u043C\u0438\u0442 \u20AA" style="flex:1;min-width:80px;">
      </div>
    `;
    });
    container.innerHTML = html;
  }
  function closeBudgetModal() {
    document.getElementById("budgetModal").classList.remove("active");
  }
  function saveBudgetLimits() {
    document.querySelectorAll(".budget-limit-input").forEach((input) => {
      const cat = input.dataset.cat;
      const val = parseFloat(input.value);
      setBudgetLimit(cat, isNaN(val) ? 0 : val);
    });
    closeBudgetModal();
  }
  function openRecurringModal() {
    const overlay = document.getElementById("recurringModal");
    const container = document.getElementById("recurringList");
    overlay.classList.add("active");
    if (state.recurringTransactions.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding:10px;"><p>\u041D\u0435\u0442 \u0440\u0435\u0433\u0443\u043B\u044F\u0440\u043D\u044B\u0445 \u0442\u0440\u0430\u043D\u0437\u0430\u043A\u0446\u0438\u0439</p></div>';
      return;
    }
    const catNames = { income: "\u0414\u043E\u0445\u043E\u0434", fixed: "\u041F\u043E\u0441\u0442\u043E\u044F\u043D\u043D\u0430\u044F", variable: "\u041D\u0435\u043F\u043E\u0441\u0442\u043E\u044F\u043D\u043D\u0430\u044F" };
    state.customCategories.forEach((c) => {
      catNames[c.id] = c.name;
    });
    let html = "";
    state.recurringTransactions.forEach((rt) => {
      html += `
      <div class="category-list-item">
        <span class="category-list-name">
          ${escapeHtml(rt.name)} \u2014 ${rt.amount.toFixed(0)} \u20AA (${catNames[rt.category] || rt.category}, ${rt.day}-\u0433\u043E \u0447\u0438\u0441\u043B\u0430)
        </span>
        <button class="btn btn-danger btn-xs del-rec-btn" data-id="${rt.id}">\xD7</button>
      </div>
    `;
    });
    container.innerHTML = html;
    container.querySelectorAll(".del-rec-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        deleteRecurringTransaction(btn.dataset.id);
        openRecurringModal();
      });
    });
  }
  function closeRecurringModal() {
    document.getElementById("recurringModal").classList.remove("active");
  }
  function addRecurringFromModal() {
    const name = document.getElementById("recNameInput").value.trim();
    const amount = parseFloat(document.getElementById("recAmountInput").value);
    const day = parseInt(document.getElementById("recDayInput").value);
    const category = document.getElementById("recCategoryInput").value;
    if (!name || isNaN(amount) || amount <= 0 || isNaN(day) || day < 1 || day > 28) {
      alert("\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u0432\u0441\u0435 \u043F\u043E\u043B\u044F \u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E. \u0414\u0435\u043D\u044C: 1-28.");
      return;
    }
    addRecurringTransaction(name, amount, day, category);
    document.getElementById("recNameInput").value = "";
    document.getElementById("recAmountInput").value = "";
    document.getElementById("recDayInput").value = "";
    closeRecurringModal();
  }
  function closeHotkeysModal() {
    document.getElementById("hotkeysModal").classList.remove("active");
  }
  function generateAnnualReport() {
    const yearSelect = document.getElementById("reportYearSelect");
    const year = parseInt(yearSelect.value);
    const container = document.getElementById("reportContent");
    let totalIncome = 0, totalExpenses = 0;
    let monthlyData = [];
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, "0")}`;
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
    const monthNames = ["\u042F\u043D\u0432", "\u0424\u0435\u0432", "\u041C\u0430\u0440", "\u0410\u043F\u0440", "\u041C\u0430\u0439", "\u0418\u044E\u043D", "\u0418\u044E\u043B", "\u0410\u0432\u0433", "\u0421\u0435\u043D", "\u041E\u043A\u0442", "\u041D\u043E\u044F", "\u0414\u0435\u043A"];
    let tableRows = monthlyData.map((d) => `
    <tr>
      <td>${monthNames[d.month - 1]}</td>
      <td class="amount positive">${d.income.toFixed(0)} \u20AA</td>
      <td class="amount negative">${d.expenses.toFixed(0)} \u20AA</td>
      <td class="amount ${d.income - d.expenses >= 0 ? "positive" : "danger"}">${(d.income - d.expenses).toFixed(0)} \u20AA</td>
    </tr>
  `).join("");
    container.innerHTML = `
    <div style="margin-bottom:16px;">
      <div style="font-size:0.9rem;font-weight:600;">${year}</div>
    </div>
    <table>
      <thead>
        <tr>
          <th>\u041C\u0435\u0441\u044F\u0446</th>
          <th>\u0414\u043E\u0445\u043E\u0434\u044B</th>
          <th>\u0420\u0430\u0441\u0445\u043E\u0434\u044B</th>
          <th>\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
        <tr style="font-weight:700;">
          <td>\u0418\u0442\u043E\u0433\u043E</td>
          <td class="amount positive">${totalIncome.toFixed(0)} \u20AA</td>
          <td class="amount negative">${totalExpenses.toFixed(0)} \u20AA</td>
          <td class="amount ${balance >= 0 ? "positive" : "danger"}">${balance.toFixed(0)} \u20AA</td>
        </tr>
      </tbody>
    </table>
    <div style="margin-top:12px;font-size:0.85rem;color:var(--text-secondary);">
      \u0421\u0440\u0435\u0434\u043D\u0435\u043C\u0435\u0441\u044F\u0447\u043D\u044B\u0439 \u0434\u043E\u0445\u043E\u0434: ${(totalIncome / 12).toFixed(0)} \u20AA |
      \u0421\u0440\u0435\u0434\u043D\u0435\u043C\u0435\u0441\u044F\u0447\u043D\u044B\u0439 \u0440\u0430\u0441\u0445\u043E\u0434: ${(totalExpenses / 12).toFixed(0)} \u20AA
    </div>
  `;
  }
  function openReportModal() {
    const overlay = document.getElementById("reportModal");
    const yearSelect = document.getElementById("reportYearSelect");
    overlay.classList.add("active");
    const years = /* @__PURE__ */ new Set();
    for (const ck in state.cycles) {
      const [y] = ck.split("-").map(Number);
      years.add(y);
    }
    const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
    years.add(currentYear);
    const sorted = Array.from(years).sort((a, b) => b - a);
    yearSelect.innerHTML = sorted.map(
      (y) => `<option value="${y}"${y === currentYear ? " selected" : ""}>${y}</option>`
    ).join("");
    generateAnnualReport();
  }
  function closeReportModal() {
    document.getElementById("reportModal").classList.remove("active");
  }
  function setupEventListeners() {
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    document.getElementById("cycleSelect").addEventListener("change", (e) => {
      changeCycle(e.target.value);
    });
    document.getElementById("themeToggle").addEventListener("click", toggleTheme);
    document.getElementById("attachFileBtn").addEventListener("click", () => {
      attachFile().then((success) => {
        if (success) {
          processRecurringTransactions();
          renderAll();
        }
      }).catch((err) => {
        alert("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u0438\u0432\u044F\u0437\u0430\u0442\u044C \u0444\u0430\u0439\u043B. " + err.message);
      });
    });

    document.getElementById("importJsonBtn").addEventListener("click", async () => {
      try {
        const data = await importFromJSON();
        if (!data) return;
        const overlay = document.getElementById("confirmOverlay");
        const title = document.getElementById("confirmTitle");
        const text = document.getElementById("confirmText");
        title.textContent = "Импорт из JSON";
        text.textContent = "Восстановить данные из выбранного JSON-файла? Все текущие данные будут заменены.";
        overlay.classList.add("active");
        document.getElementById("confirmYesBtn").onclick = () => {
          overlay.classList.remove("active");
          Object.assign(state, data);
          localStorage.setItem("financy_pro_backup", JSON.stringify(state));
          markDirty();
          renderAll();
          alert("Данные успешно импортированы из файла.");
        };
        document.getElementById("confirmNoBtn").onclick = () => {
          overlay.classList.remove("active");
        };
      } catch (err) {
        alert("\u041E\u0448\u0438\u0431\u043A\u0430 \u0438\u043C\u043F\u043E\u0440\u0442\u0430 JSON: " + err.message);
      }
    });

    document.getElementById("restoreBackupBtn").addEventListener("click", () => {
      const backup = localStorage.getItem("financy_pro_backup");
      if (!backup) {
        alert("Автобекап не найден.");
        return;
      }

      const overlay = document.getElementById("confirmOverlay");
      const title = document.getElementById("confirmTitle");
      const text = document.getElementById("confirmText");
      
      title.textContent = "Восстановление из автобекапа";
      text.textContent = "Восстановить данные из последнего автоматического бекапа? Все текущие данные будут заменены.";
      overlay.classList.add("active");

      document.getElementById("confirmYesBtn").onclick = () => {
        overlay.classList.remove("active");
        try {
          const data = JSON.parse(backup);
          Object.assign(state, data);
          markDirty();
          renderAll();
          alert("Данные успешно восстановлены из автобекапа.");
        } catch (e) {
          alert("Ошибка при восстановлении бекапа: " + e.message);
        }
      };
      document.getElementById("confirmNoBtn").onclick = () => {
        overlay.classList.remove("active");
      };
    });
    setupSearch();
    document.getElementById("setCapitalBtn").addEventListener("click", () => {
      const val = parseFloat(document.getElementById("startCapitalInput").value);
      if (!isNaN(val)) {
        setStartCapital(val);
      }
    });
    document.getElementById("addIncomeBtn").addEventListener("click", () => {
      const name = document.getElementById("incomeName").value;
      const date = document.getElementById("incomeDate").value;
      const amount = parseFloat(document.getElementById("incomeAmount").value);
      if (!name || isNaN(amount) || amount <= 0) {
        alert("\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0438 \u0441\u0443\u043C\u043C\u0443.");
        return;
      }
      addOperation("income", name, date, amount);
      document.getElementById("incomeName").value = "";
      document.getElementById("incomeAmount").value = "";
      document.getElementById("incomeDate").value = today;
    });
    document.getElementById("addFixedBtn").addEventListener("click", () => {
      const name = document.getElementById("fixedName").value;
      const date = document.getElementById("fixedDate").value;
      const amount = parseFloat(document.getElementById("fixedAmount").value);
      if (!name || isNaN(amount) || amount <= 0) {
        alert("\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0438 \u0441\u0443\u043C\u043C\u0443.");
        return;
      }
      addOperation("fixed", name, date, amount);
      document.getElementById("fixedName").value = "";
      document.getElementById("fixedAmount").value = "";
      document.getElementById("fixedDate").value = today;
    });
    document.getElementById("addVariableBtn").addEventListener("click", () => {
      const name = document.getElementById("variableName").value;
      const date = document.getElementById("variableDate").value;
      const amount = parseFloat(document.getElementById("variableAmount").value);
      if (!name || isNaN(amount) || amount <= 0) {
        alert("\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0438 \u0441\u0443\u043C\u043C\u0443.");
        return;
      }
      addOperation("variable", name, date, amount);
      document.getElementById("variableName").value = "";
      document.getElementById("variableAmount").value = "";
      document.getElementById("variableDate").value = today;
    });
    document.getElementById("templateBtn").addEventListener("click", () => {
      const result = applyTemplate();
      if (result.error === "templateNoFixed") {
        alert("\u0412 \u043F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0435\u043C \u0446\u0438\u043A\u043B\u0435 \u043D\u0435\u0442 \u043F\u043E\u0441\u0442\u043E\u044F\u043D\u043D\u044B\u0445 \u0442\u0440\u0430\u0442 \u0434\u043B\u044F \u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F.");
      } else if (result.error === "templateNoPrev") {
        alert("\u041D\u0435\u0442 \u043F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0435\u0433\u043E \u0446\u0438\u043A\u043B\u0430 \u0434\u043B\u044F \u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F \u0448\u0430\u0431\u043B\u043E\u043D\u0430.");
      }
    });
    document.querySelectorAll("th.sortable").forEach((th) => {
      th.addEventListener("click", () => {
        const column = th.dataset.sort;
        if (currentSort.column === column) {
          currentSort.direction = currentSort.direction === "asc" ? "desc" : "asc";
        } else {
          currentSort.column = column;
          currentSort.direction = "desc";
        }
        renderOperations();
      });
    });
    document.getElementById("editCancelBtn").addEventListener("click", closeEditModal);
    document.getElementById("editSaveBtn").addEventListener("click", saveEdit);
    document.getElementById("editModal").addEventListener("click", (e) => {
      if (e.target === document.getElementById("editModal")) closeEditModal();
    });
    document.getElementById("confirmOverlay").addEventListener("click", (e) => {
      if (e.target === document.getElementById("confirmOverlay")) {
        document.getElementById("confirmOverlay").classList.remove("active");
      }
    });
    document.getElementById("undoBtn").addEventListener("click", undoLastDelete);
    document.getElementById("addCategoryBtn").addEventListener("click", () => {
      const name = document.getElementById("newCategoryName").value.trim();
      const color = document.getElementById("newCategoryColor").value;
      if (!name) {
        alert("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438.");
        return;
      }
      addCustomCategory(name, color);
      document.getElementById("newCategoryName").value = "";
      openCategoriesModal();
      updateFilterOptions();
    });
    document.getElementById("closeCategoriesBtn").addEventListener("click", closeCategoriesModal);
    document.getElementById("categoriesModal").addEventListener("click", (e) => {
      if (e.target === document.getElementById("categoriesModal")) closeCategoriesModal();
    });
    document.getElementById("addGoalBtn").addEventListener("click", openGoalsModal);
    document.getElementById("saveGoalBtn").addEventListener("click", addGoalFromModal);
    document.getElementById("closeGoalsBtn").addEventListener("click", closeGoalsModal);
    document.getElementById("goalsModal").addEventListener("click", (e) => {
      if (e.target === document.getElementById("goalsModal")) closeGoalsModal();
    });
    document.getElementById("editBudgetBtn").addEventListener("click", openBudgetModal);
    document.getElementById("saveBudgetBtn").addEventListener("click", saveBudgetLimits);
    document.getElementById("closeBudgetBtn").addEventListener("click", closeBudgetModal);
    document.getElementById("budgetModal").addEventListener("click", (e) => {
      if (e.target === document.getElementById("budgetModal")) closeBudgetModal();
    });
    document.getElementById("addRecurringBtn").addEventListener("click", openRecurringModal);
    document.getElementById("saveRecurringBtn").addEventListener("click", addRecurringFromModal);
    document.getElementById("closeRecurringBtn").addEventListener("click", closeRecurringModal);
    document.getElementById("recurringModal").addEventListener("click", (e) => {
      if (e.target === document.getElementById("recurringModal")) closeRecurringModal();
    });
    document.getElementById("exportBtn").addEventListener("click", exportToCSV);
    document.getElementById("importBtn").addEventListener("click", async () => {
      try {
        const count = await importFromCSV();
        if (count > 0) {
          renderAll();
          alert(`\u0418\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u043E ${count} \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u0439.`);
        }
      } catch (err) {
        alert("\u041E\u0448\u0438\u0431\u043A\u0430 \u0438\u043C\u043F\u043E\u0440\u0442\u0430: " + err.message);
      }
    });
    document.getElementById("openReportBtn").addEventListener("click", openReportModal);
    document.getElementById("generateReportBtn").addEventListener("click", generateAnnualReport);
    document.getElementById("closeReportBtn").addEventListener("click", closeReportModal);
    document.getElementById("reportModal").addEventListener("click", (e) => {
      if (e.target === document.getElementById("reportModal")) closeReportModal();
    });
    document.getElementById("closeHotkeysBtn").addEventListener("click", closeHotkeysModal);
    document.getElementById("hotkeysModal").addEventListener("click", (e) => {
      if (e.target === document.getElementById("hotkeysModal")) closeHotkeysModal();
    });
    document.getElementById("setupConfirmBtn").addEventListener("click", completeSetup);
    document.querySelectorAll(".form-row input").forEach((input) => {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const btn = input.parentElement.querySelector(".btn-primary");
          if (btn) btn.click();
        }
      });
    });
  }
  function setDefaultDates() {
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    document.getElementById("incomeDate").value = today;
    document.getElementById("fixedDate").value = today;
    document.getElementById("variableDate").value = today;
  }
  function getCurrentCycleData2() {
    if (!state.cycles[state.currentCycle]) {
      state.cycles[state.currentCycle] = { income: [], fixed: [], variable: [] };
    }
    return state.cycles[state.currentCycle];
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
