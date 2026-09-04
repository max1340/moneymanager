// ============================================
// Financy PRO — Charts & Visualization
// ============================================

import { state } from './state.js';
import { calcCategoryExpenses, calcTotalIncome, calcTotalExpenses } from './calculations.js';
import { cycleLabel } from './utils.js';

// ---- Donut Chart ----
function renderDonutChart(cycleData) {
  const categories = calcCategoryExpenses(cycleData);
  const total = categories.reduce((sum, c) => sum + c.amount, 0);
  const donutCenter = document.getElementById('donutCenterText');
  const seg1 = document.getElementById('donutSegment1');
  const seg2 = document.getElementById('donutSegment2');
  const donutLegend = document.querySelector('.donut-legend');

  const circumference = 2 * Math.PI * 60;

  if (total === 0 || categories.length === 0) {
    seg1.setAttribute('stroke-dasharray', '0 ' + circumference);
    seg2.setAttribute('stroke-dasharray', '0 ' + circumference);
    donutCenter.textContent = '0%';
    donutLegend.innerHTML = `
      <div class="legend-item">
        <div class="color-box" style="background:var(--chart-color-1);"></div>
        <span>Постоянные траты</span>
        <span style="font-weight:600;">0</span>
      </div>
      <div class="legend-item">
        <div class="color-box" style="background:var(--chart-color-2);"></div>
        <span>Непостоянные траты</span>
        <span style="font-weight:600;">0</span>
      </div>
    `;
    return;
  }

  // We'll show up to 2 segments on the donut, with the rest combined
  const mainCategories = categories.slice(0, 2);
  const others = categories.slice(2);
  const otherTotal = others.reduce((sum, c) => sum + c.amount, 0);

  if (otherTotal > 0) {
    mainCategories.push({ id: 'other', name: 'Прочее', amount: otherTotal, color: '#94a3b8' });
  }

  const ratio1 = mainCategories[0] ? mainCategories[0].amount / total : 0;
  const ratio2 = mainCategories[1] ? mainCategories[1].amount / total : 0;

  const len1 = ratio1 * circumference;
  const len2 = ratio2 * circumference;

  seg1.setAttribute('stroke-dasharray', len1 + ' ' + (circumference - len1));
  seg2.setAttribute('stroke-dasharray', len2 + ' ' + (circumference - len2));

  const income = calcTotalIncome(cycleData);
  const expenses = calcTotalExpenses(cycleData);
  const pct = income > 0 ? (expenses / income * 100) : 0;
  donutCenter.textContent = pct.toFixed(0) + '%';

  // Build legend
  let legendHTML = '';
  const colorMap = {
    fixed: 'var(--chart-color-1)',
    variable: 'var(--chart-color-2)',
    other: '#94a3b8'
  };
  state.customCategories.forEach(c => { colorMap[c.id] = c.color; });

  categories.forEach(cat => {
    const color = colorMap[cat.id] || cat.color;
    const amountText = cat.amount.toFixed(0) + ' ₪';
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

// ---- Trend Chart (Line chart using SVG) ----
function renderTrendChart() {
  const wrapper = document.getElementById('trendChartWrapper');
  if (!wrapper) return;

  const cycleKeys = Object.keys(state.cycles).sort();
  if (cycleKeys.length < 2) {
    wrapper.innerHTML = '<div class="empty-state" style="padding:20px;"><p>Для графика трендов нужно минимум 2 цикла данных</p></div>';
    return;
  }

  const data = cycleKeys.map(key => {
    const cd = state.cycles[key];
    return {
      key,
      label: cycleLabel(key).split(' ')[0],
      income: calcTotalIncome(cd),
      expenses: calcTotalExpenses(cd)
    };
  });

  const maxVal = Math.max(...data.map(d => Math.max(d.income, d.expenses)), 1);
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const width = Math.max(300, data.length * 80);
  const height = 200;
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const scaleY = (v) => chartH - (v / maxVal) * chartH + padding.top;
  const scaleX = (i) => padding.left + (i / (data.length - 1)) * chartW;

  let paths = { income: '', expenses: '' };
  data.forEach((d, i) => {
    const x = scaleX(i);
    const yIncome = scaleY(d.income);
    const yExpenses = scaleY(d.expenses);
    paths.income += (i === 0 ? 'M' : 'L') + x + ',' + yIncome;
    paths.expenses += (i === 0 ? 'M' : 'L') + x + ',' + yExpenses;
  });

  // Y-axis labels
  let yLabels = '';
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const val = (maxVal / steps) * i;
    const y = scaleY(val);
    yLabels += `
      <text x="${padding.left - 8}" y="${y + 3}" text-anchor="end">${Math.round(val).toLocaleString()}</text>
      <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3"/>
    `;
  }

  // X-axis labels
  let xLabels = '';
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
      `).join('')}
    </svg>
    <div class="trend-legend">
      <div class="trend-legend-item">
        <div class="trend-legend-dot" style="background:var(--chart-color-3);"></div>
        <span>Доходы</span>
      </div>
      <div class="trend-legend-item">
        <div class="trend-legend-dot" style="background:var(--chart-color-4);"></div>
        <span>Расходы</span>
      </div>
    </div>
  `;
}

export { renderDonutChart, renderTrendChart };