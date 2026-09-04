// ============================================
// Financy PRO — File I/O & Autosave
// ============================================

import { state, setState, notifyListeners } from './state.js';
import { currentCycleKey } from './utils.js';

let fileHandle = null;
let autoSaveTimerId = null;

// ---- IndexedDB for File Handle Persistence ----
const DB_NAME = 'financy_pro_db';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'active_file_handle';

async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveHandleToDB(handle) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
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
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const handle = await new Promise((resolve) => {
      const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    return handle;
  } catch (err) {
    console.error('Failed to get handle from DB:', err);
    return null;
  }
}
let autoSaveCountdown = 300;
let autoSaveIntervalId = null;
let isDirty = false;
let debouncedSaveTimer = null;

// ---- Status Callbacks ----
let onStatusChange = null;
let onSavingChange = null;
let onTimerUpdate = null;

function setStatusCallbacks(callbacks) {
  if (callbacks.onStatusChange) onStatusChange = callbacks.onStatusChange;
  if (callbacks.onSavingChange) onSavingChange = callbacks.onSavingChange;
  if (callbacks.onTimerUpdate) onTimerUpdate = callbacks.onTimerUpdate;
}

function markDirty() {
  isDirty = true;
  autoSaveCountdown = 300;
  updateAutoSaveTimer();
  // Debounced save
  if (debouncedSaveTimer) clearTimeout(debouncedSaveTimer);
  debouncedSaveTimer = setTimeout(() => {
    saveToFile();
    debouncedSaveTimer = null;
  }, 500);
}

async function attachFile() {
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: 'financy_db.json',
      types: [{ description: 'JSON Database', accept: { 'application/json': ['.json'] } }]
    });
    fileHandle = handle;
    await saveHandleToDB(handle);
    await loadFromFile();
    if (onStatusChange) onStatusChange(true);
    startAutoSave();
    return true;
  } catch (err) {
    if (err.name !== 'AbortError' && err.name !== 'SecurityError') {
      console.error('File attach error:', err);
      throw err;
    }
    return false;
  }
}

async function loadFromFile() {
  if (!fileHandle) return;
  try {
    const file = await fileHandle.getFile();
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
    console.error('Load error:', err);
    const backup = localStorage.getItem('financy_pro_backup');
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
        console.error('Backup recovery failed:', e);
      }
    }
  }
}

async function saveToFile() {
  if (!fileHandle) {
    localStorage.setItem('financy_pro_backup', JSON.stringify(state));
    return;
  }
  try {
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(state, null, 2));
    await writable.close();
    localStorage.setItem('financy_pro_backup', JSON.stringify(state));
    isDirty = false;
  } catch (err) {
    console.error('Save error:', err);
    localStorage.setItem('financy_pro_backup', JSON.stringify(state));
  }
}

function updateFileStatus(connected) {
  if (onStatusChange) onStatusChange(connected);
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
  }, 1000);
}

function stopAutoSave() {
  if (autoSaveIntervalId) {
    clearInterval(autoSaveIntervalId);
    autoSaveIntervalId = null;
  }
}

function updateAutoSaveTimer() {
  if (onTimerUpdate) {
    const min = Math.floor(autoSaveCountdown / 60);
    const sec = autoSaveCountdown % 60;
    onTimerUpdate(min, sec);
  }
}

function getFileHandle() {
  return fileHandle;
}

function setFileHandle(handle) {
  fileHandle = handle;
}

// ---- Export/Import ----
function exportToCSV() {
  const rows = [['Дата', 'Название', 'Категория', 'Сумма', 'Цикл']];
  for (const ck in state.cycles) {
    const cd = state.cycles[ck];
    const categories = ['income', 'fixed', 'variable', ...state.customCategories.map(c => c.id)];
    const catNames = {
      income: 'Доход',
      fixed: 'Постоянная',
      variable: 'Непостоянная'
    };
    state.customCategories.forEach(c => { catNames[c.id] = c.name; });

    categories.forEach(cat => {
      if (cd[cat]) {
        cd[cat].forEach(op => {
          rows.push([op.date, op.name, catNames[cat] || cat, op.amount, ck]);
        });
      }
    });
  }

  const csv = rows.map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `financy_export_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function importFromJSON() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      try {
        const file = e.target.files[0];
        if (!file) { resolve(null); return; }
        const text = await file.text();
        const data = JSON.parse(text);
        
        if (!data.cycles && data.startCapital === undefined) {
          throw new Error('Некорректный формат JSON-бекапа');
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
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async (e) => {
      try {
        const file = e.target.files[0];
        if (!file) { resolve(0); return; }
        const text = await file.text();
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length <= 1) { resolve(0); return; }

        let imported = 0;
        for (let i = 1; i < lines.length; i++) {
          const cols = parseCSVLine(lines[i]);
          if (cols.length < 4) continue;

          const date = cols[0];
          const name = cols[1];
          const category = normalizeCategory(cols[2]);
          const amount = parseFloat(cols[3]);

          if (!date || !name || isNaN(amount)) continue;

          const d = new Date(date + 'T00:00:00');
          if (isNaN(d.getTime())) continue;

          const day = d.getDate();
          let y = d.getFullYear();
          let m = d.getMonth() + 1;
          if (day < 10) { m -= 1; if (m <= 0) { m = 12; y -= 1; } }
          const cycleKey = `${y}-${String(m).padStart(2, '0')}`;

          if (!state.cycles[cycleKey]) {
            state.cycles[cycleKey] = { income: [], fixed: [], variable: [] };
          }

          const op = {
            id: crypto.randomUUID(),
            name: name.trim(),
            date: date,
            amount: Math.abs(amount)
          };

          const cat = category === 'income' ? 'income' :
                      category === 'fixed' ? 'fixed' : 'variable';
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
  let current = '';
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
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function normalizeCategory(cat) {
  const lower = cat.toLowerCase().trim();
  if (lower === 'доход' || lower === 'income') return 'income';
  if (lower === 'постоянная' || lower === 'fixed' || lower === 'постоянные') return 'fixed';
  if (lower === 'непостоянная' || lower === 'variable' || lower === 'непостоянные') return 'variable';
  return 'variable';
}

// ---- Encryption (optional) ----
async function encryptData(data, password) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(data))
  );
  return {
    salt: Array.from(salt),
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encrypted))
  };
}

async function decryptData(encryptedData, password) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new Uint8Array(encryptedData.salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(encryptedData.iv) },
    key,
    new Uint8Array(encryptedData.data)
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}

export {
  fileHandle,
  getHandleFromDB,
  setFileHandle,
  setStatusCallbacks,
  markDirty,
  attachFile,
  loadFromFile,
  saveToFile,
  updateFileStatus,
  startAutoSave,
  stopAutoSave,
  getFileHandle,
  exportToCSV,
  importFromCSV,
  importFromJSON,
  encryptData,
  decryptData
};
