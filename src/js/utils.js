// ============================================
// Financy PRO — Utility Functions
// ============================================

const CATEGORY_COLORS = [
  '#2a7de1', '#f59e0b', '#22c55e', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  '#6366f1', '#84cc16'
];

function uuid() {
  return crypto.randomUUID();
}

function formatDate(d) {
  if (!d) return '';
  const date = new Date(d + 'T00:00:00');
  if (isNaN(date.getTime())) return d;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

function toInputDate(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  return dateStr;
}

function getInitials(name) {
  if (!name || name.trim() === '') return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
}

function cycleLabel(cycleKey) {
  if (!cycleKey) return '';
  const [year, month] = cycleKey.split('-').map(Number);
  const monthNames = [
    'Январь','Февраль','Март','Апрель','Май','Июнь',
    'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'
  ];
  return `${monthNames[month - 1]} ${year}`;
}

function cycleRange(cycleKey) {
  if (!cycleKey) return '';
  const [year, month] = cycleKey.split('-').map(Number);
  const start = new Date(year, month - 1, 10);
  const end = new Date(year, month, 9);
  const fmt = (d) => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
  };
  return `${fmt(start)} — ${fmt(end)}`;
}

function currentCycleKey() {
  const now = new Date();
  const day = now.getDate();
  let y = now.getFullYear();
  let m = now.getMonth() + 1;
  if (day < 10) {
    m -= 1;
    if (m <= 0) { m = 12; y -= 1; }
  }
  return `${y}-${String(m).padStart(2, '0')}`;
}

function nextCycleKey(ck) {
  if (!ck) return currentCycleKey();
  const [y, m] = ck.split('-').map(Number);
  let ny = y, nm = m + 1;
  if (nm > 12) { nm = 1; ny += 1; }
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

function previousCycleKey(ck) {
  if (!ck) return currentCycleKey();
  const [y, m] = ck.split('-').map(Number);
  let ny = y, nm = m - 1;
  if (nm <= 0) { nm = 12; ny -= 1; }
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

function generateCycleOptions(selected) {
  const now = new Date();
  let cy = now.getFullYear();
  let cm = now.getMonth() + 1;
  if (now.getDate() < 10) { cm -= 1; if (cm <= 0) { cm = 12; cy -= 1; } }
  const options = [];
  for (let i = -6; i <= 6; i++) {
    let y = cy, m = cm + i;
    while (m < 1) { m += 12; y -= 1; }
    while (m > 12) { m -= 12; y += 1; }
    const key = `${y}-${String(m).padStart(2, '0')}`;
    options.push(key);
  }
  return options;
}

function getCategoryColor(index) {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function pluralize(count, forms) {
  // forms: ['операция', 'операции', 'операций']
  const n = Math.abs(count) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}

function formatMoney(n) {
  return n.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' ₪';
}

function formatShortMoney(n) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' млн';
  if (abs >= 1_000) return (n / 1_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' тыс.';
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
}

export {
  uuid,
  formatDate,
  toInputDate,
  getInitials,
  cycleLabel,
  cycleRange,
  currentCycleKey,
  nextCycleKey,
  previousCycleKey,
  generateCycleOptions,
  getCategoryColor,
  escapeHtml,
  pluralize,
  formatMoney,
  formatShortMoney,
  CATEGORY_COLORS
};