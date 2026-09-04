// ============================================
// Financy PRO — Firebase Realtime Database
// Replaces fileio.js (File System Access API)
// Data path: financy/data (new branch, existing data untouched)
// ============================================

import { initializeApp } from 'firebase/app';
import {
  getDatabase,
  ref,
  get,
  set,
  onValue,
  off,
  serverTimestamp,
} from 'firebase/database';
import { state, setState, notifyListeners } from './state.js';
import { currentCycleKey } from './utils.js';

// ---- Firebase Config ----
const firebaseConfig = {
  apiKey: 'AIzaSyC5aYba4eGsnSRDvmK5pIApjIrbJOrUXNQ',
  authDomain: 'pc-building-b3d74.firebaseapp.com',
  databaseURL: 'https://pc-building-b3d74-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'pc-building-b3d74',
  storageBucket: 'pc-building-b3d74.firebasestorage.app',
  messagingSenderId: '1000168163599',
  appId: '1:1000168163599:web:6c64d4b7782100a27a167a',
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ---- Constants ----
// Stores full state as a JSON string to avoid Firebase array→object conversion
const DATA_PATH = 'financy/data';
const LOCAL_BACKUP_KEY = 'financy_pro_backup';

// ---- Internal State ----
let isDirty = false;
let debouncedSaveTimer = null;
let isWriting = false;          // suppress echo from our own saves
let realtimeUnsubscribe = null;

// ---- Status Callbacks (same interface as old fileio.js) ----
let onStatusChange = null;   // (connected: bool) => void
let onSavingChange = null;   // (isSaving: bool) => void
let onTimerUpdate = null;    // (min, sec) => void  — no-op for Firebase

function setStatusCallbacks(callbacks) {
  if (callbacks.onStatusChange) onStatusChange = callbacks.onStatusChange;
  if (callbacks.onSavingChange) onSavingChange = callbacks.onSavingChange;
  if (callbacks.onTimerUpdate) onTimerUpdate = callbacks.onTimerUpdate;
}

// ---- Load from Firebase (one-time on startup) ----
async function loadFromFirebase() {
  try {
    const snapshot = await get(ref(db, DATA_PATH));
    const val = snapshot.val();

    if (val && val._json) {
      const data = JSON.parse(val._json);
      setState({
        ...state,
        ...data,
        cycles: data.cycles || {},
        startCapital: data.startCapital ?? 0,
        currentCycle: data.currentCycle || currentCycleKey(),
        customCategories: data.customCategories || [],
        budgetLimits: data.budgetLimits || {},
        goals: data.goals || [],
        recurringTransactions: data.recurringTransactions || [],
        tags: data.tags || [],
      });
      // Mirror to localStorage as backup
      localStorage.setItem(LOCAL_BACKUP_KEY, val._json);
      notifyListeners();
      if (onStatusChange) onStatusChange(true);
      return true;
    }

    // Nothing in Firebase — try localStorage backup
    const backup = localStorage.getItem(LOCAL_BACKUP_KEY);
    if (backup) {
      const data = JSON.parse(backup);
      setState({
        ...state,
        ...data,
        cycles: data.cycles || {},
        startCapital: data.startCapital ?? 0,
        currentCycle: data.currentCycle || currentCycleKey(),
        customCategories: data.customCategories || [],
        budgetLimits: data.budgetLimits || {},
        goals: data.goals || [],
        recurringTransactions: data.recurringTransactions || [],
        tags: data.tags || [],
      });
      notifyListeners();
      // Push localStorage data to Firebase
      await saveToFirebase();
      if (onStatusChange) onStatusChange(true);
      return true;
    }

    // Fresh start
    if (onStatusChange) onStatusChange(false);
    return false;
  } catch (err) {
    console.error('Firebase load error:', err);
    // Fallback to localStorage
    const backup = localStorage.getItem(LOCAL_BACKUP_KEY);
    if (backup) {
      try {
        const data = JSON.parse(backup);
        setState({ ...state, ...data });
        notifyListeners();
      } catch (e) {
        console.error('Backup parse failed:', e);
      }
    }
    if (onStatusChange) onStatusChange(false);
    return false;
  }
}

// ---- Save to Firebase (debounced) ----
async function saveToFirebase() {
  isWriting = true;
  if (onSavingChange) onSavingChange(true);
  try {
    const json = JSON.stringify(state);
    await set(ref(db, DATA_PATH), { _json: json, _updated: Date.now() });
    localStorage.setItem(LOCAL_BACKUP_KEY, json);
    isDirty = false;
    if (onSavingChange) onSavingChange(false);
    if (onStatusChange) onStatusChange(true);
  } catch (err) {
    console.error('Firebase save error:', err);
    // Still update localStorage
    localStorage.setItem(LOCAL_BACKUP_KEY, JSON.stringify(state));
    if (onSavingChange) onSavingChange(false);
  } finally {
    // Allow 800ms for Firebase echo before resuming listener
    setTimeout(() => { isWriting = false; }, 800);
  }
}

// ---- Mark dirty → triggers debounced save ----
function markDirty() {
  isDirty = true;
  if (debouncedSaveTimer) clearTimeout(debouncedSaveTimer);
  debouncedSaveTimer = setTimeout(() => {
    saveToFirebase();
    debouncedSaveTimer = null;
  }, 1000);
}

// ---- Real-time listener (sync across devices) ----
function subscribeToRealtime() {
  if (realtimeUnsubscribe) {
    off(ref(db, DATA_PATH));
  }

  realtimeUnsubscribe = onValue(
    ref(db, DATA_PATH),
    (snapshot) => {
      if (isWriting) return; // Ignore our own writes
      const val = snapshot.val();
      if (!val || !val._json) return;

      try {
        const data = JSON.parse(val._json);
        // Only update state if data actually changed
        const localJson = JSON.stringify(state);
        if (val._json === localJson) return;

        setState({
          ...state,
          ...data,
          cycles: data.cycles || {},
          startCapital: data.startCapital ?? 0,
          currentCycle: data.currentCycle || state.currentCycle || currentCycleKey(),
          customCategories: data.customCategories || [],
          budgetLimits: data.budgetLimits || {},
          goals: data.goals || [],
          recurringTransactions: data.recurringTransactions || [],
          tags: data.tags || [],
        });
        localStorage.setItem(LOCAL_BACKUP_KEY, val._json);
        notifyListeners();
        if (onStatusChange) onStatusChange(true);
      } catch (e) {
        console.error('Realtime update parse error:', e);
      }
    },
    (error) => {
      console.error('Firebase listener error:', error);
      if (onStatusChange) onStatusChange(false);
    }
  );
}

// ---- Export to CSV ----
function exportToCSV() {
  const rows = [['Дата', 'Название', 'Категория', 'Сумма', 'Цикл']];
  const catNames = { income: 'Доход', fixed: 'Постоянная', variable: 'Непостоянная' };
  state.customCategories.forEach(c => { catNames[c.id] = c.name; });

  for (const ck in state.cycles) {
    const cd = state.cycles[ck];
    const categories = ['income', 'fixed', 'variable', ...state.customCategories.map(c => c.id)];
    categories.forEach(cat => {
      if (cd[cat]) {
        cd[cat].forEach(op => {
          rows.push([op.date, op.name, catNames[cat] || cat, op.amount, ck]);
        });
      }
    });
  }

  const csv = rows
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `financy_export_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- Export full JSON backup ----
function exportToJSON() {
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `financy_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- Import from JSON file ----
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

// ---- Import from CSV ----
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
            date,
            amount: Math.abs(amount),
          };

          const cat = category === 'income' ? 'income' : category === 'fixed' ? 'fixed' : 'variable';
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
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = '';
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
  return 'variable';
}

export {
  setStatusCallbacks,
  loadFromFirebase,
  saveToFirebase,
  subscribeToRealtime,
  markDirty,
  exportToCSV,
  exportToJSON,
  importFromCSV,
  importFromJSON,
};
