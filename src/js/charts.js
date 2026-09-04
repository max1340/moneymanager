// ============================================
// Financy PRO — Charts & Visualization
// Enhanced UX: Donut with expense total & shares,
// Trend with short Y-axis, tooltips & larger points
// ============================================

import { state } from './state.js';
import { calcCategoryExpenses, calcTotalIncome, calcTotalExpenses } from './calculations.js';
import { cycleLabel, fmt, formatShortMoney, escapeHtml } from './utils.js';

// ---- Donut Chart ----
function renderDonutChart(cycleData) {
  const categories = calcCategoryExpenses(cycleData);
  const total = categories.reduce((sum, c) => sum + c.amount, 0);
  const donutCenter = document.getElementById('donutCenterText');
  const donutCenterSub = document.getElementById('donutCenterSub');
  const donutSegmentsContainer = document.getElementById('donutSegmentsContainer');
  const donutLegend = document.querySelector('.donut-legend');

  if (!donutLegend) return;

  const radius = 60;
  const circumference = 2 * Math.PI * radius;

  if (total === 0 || categories.length === 0) {
    if (donutSegmentsContainer) {
      donutSegmentsContainer.innerHTML = `
        <circle cx="80" cy="80" r="${radius}" fill="none" stroke="var(--border)" stroke-width="18" />
      `;
    }
    if (donutCenter) donutCenter.textContent = '0 ₪';
    if (donutCenterSub) donutCenterSub.textContent = 'Расходов нет';
    donutLegend.innerHTML = `
      <div class="legend-item">
        <div class="color-box" style="background:var(--chart-color-1);"></div>
        <span class="legend-name">Постоянные</span>
        <span class="legend-value">0,00 ₪ (0%)</span>
      </div>
      <div class="legend-item">
        <div class="color-box" style="background:var(--chart-color-2);"></div>
        <span class="legend-name">Непостоянные</span>
        <span class="legend-value">0,00 ₪ (0%)</span>
      </div>
    `;
    return;
  }

  // Generate SVG segments
  let accumulatedPercent = 0;
  let segmentsHtml = `<circle cx="80" cy="80" r="${radius}" fill="none" stroke="var(--border)" stroke-width="18" />`;

  const colorMap = {
    fixed: 'var(--chart-color-1)',
    variable: 'var(--chart-color-2)',
  };
  state.customCategories.forEach(c => { colorMap[c.id] = c.color; });

  categories.forEach(cat => {
    const share = cat.amount / total;
    const strokeDash = share * circumference;
    const strokeOffset = -(accumulatedPercent * circumference);
    const color = colorMap[cat.id] || cat.color || 'var(--chart-color-1)';

    segmentsHtml += `
      <circle cx="80" cy="80" r="${radius}" fill="none" stroke="${color}" stroke-width="18"
        stroke-dasharray="${strokeDash} ${circumference - strokeDash}"
        stroke-dashoffset="${strokeOffset}"
        transform="rotate(-90 80 80)"
        style="transition: stroke-dasharray 0.4s ease, stroke-dashoffset 0.4s ease;" />
    `;
    accumulatedPercent += share;
  });

  if (donutSegmentsContainer) {
    donutSegmentsContainer.innerHTML = segmentsHtml;
  }

  if (donutCenter) {
    donutCenter.textContent = fmt(total);
  }
  if (donutCenterSub) {
    donutCenterSub.textContent = 'Всего расходов';
  }

  // Build legend with amount and share percentage
  let legendHTML = '';
  categories.forEach(cat => {
    const color = colorMap[cat.id] || cat.color || 'var(--chart-color-1)';
    const sharePct = ((cat.amount / total) * 100).toFixed(0);
    const amountStr = fmt(cat.amount);

    legendHTML += `
      <div class="legend-item">
        <div class="color-box" style="background:${color};"></div>
        <span class="legend-name">${escapeHtml(cat.name)}</span>
        <span class="legend-value">${amountStr} <small class="legend-share">(${sharePct}%)</small></span>
      </div>
    `;
  });

  donutLegend.innerHTML = legendHTML;
}

// ---- Trend Chart (Line chart using SVG with tooltips & formatted Y-axis) ----
function renderTrendChart() {
  const wrapper = document.getElementById('trendChartWrapper');
  if (!wrapper) return;

  const cycleKeys = Object.keys(state.cycles).sort();
  if (cycleKeys.length < 2) {
    wrapper.innerHTML = `
      <div class="empty-state" style="padding:24px;">
        <svg class="empty-icon"><use href="#icon-bar-chart-2"></use></svg>
        <p>Для графика динамики нужно минимум 2 цикла данных</p>
      </div>
    `;
    return;
  }

  const data = cycleKeys.map(key => {
    const cd = state.cycles[key];
    return {
      key,
      fullLabel: cycleLabel(key),
      label: cycleLabel(key).split(' ')[0],
      income: calcTotalIncome(cd),
      expenses: calcTotalExpenses(cd)
    };
  });

  const maxVal = Math.max(...data.map(d => Math.max(d.income, d.expenses)), 1000);
  const padding = { top: 25, right: 20, bottom: 35, left: 60 };
  const width = Math.max(340, data.length * 80);
  const height = 220;
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const scaleY = (v) => chartH - (v / maxVal) * chartH + padding.top;
  const scaleX = (i) => padding.left + (i / (data.length - 1)) * chartW;

  let paths = { income: '', expenses: '' };
  data.forEach((d, i) => {
    const x = scaleX(i);
    const yIncome = scaleY(d.income);
    const yExpenses = scaleY(d.expenses);
    paths.income += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + yIncome.toFixed(1);
    paths.expenses += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + yExpenses.toFixed(1);
  });

  // Y-axis labels with formatShortMoney ("12 тыс.")
  let yLabels = '';
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const val = (maxVal / steps) * i;
    const y = scaleY(val);
    yLabels += `
      <text x="${padding.left - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="chart-axis-text">${formatShortMoney(val)}</text>
      <line x1="${padding.left}" y1="${y.toFixed(1)}" x2="${(width - padding.right).toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3"/>
    `;
  }

  // X-axis labels
  let xLabels = '';
  data.forEach((d, i) => {
    xLabels += `<text x="${scaleX(i).toFixed(1)}" y="${height - 10}" text-anchor="middle" class="chart-axis-text">${escapeHtml(d.label)}</text>`;
  });

  // Interactive points with tooltip data
  let pointsHtml = '';
  data.forEach((d, i) => {
    const x = scaleX(i).toFixed(1);
    const yInc = scaleY(d.income).toFixed(1);
    const yExp = scaleY(d.expenses).toFixed(1);

    pointsHtml += `
      <circle cx="${x}" cy="${yInc}" r="6" fill="var(--chart-color-3)" stroke="var(--surface)" stroke-width="2.5" class="chart-point"
        tabindex="0" role="button" aria-label="Доходы ${d.fullLabel}: ${fmt(d.income)}"
        data-title="${escapeHtml(d.fullLabel)}" data-type="Доходы" data-val="${fmt(d.income)}" />
      <circle cx="${x}" cy="${yExp}" r="6" fill="var(--chart-color-4)" stroke="var(--surface)" stroke-width="2.5" class="chart-point"
        tabindex="0" role="button" aria-label="Расходы ${d.fullLabel}: ${fmt(d.expenses)}"
        data-title="${escapeHtml(d.fullLabel)}" data-type="Расходы" data-val="${fmt(d.expenses)}" />
    `;
  });

  wrapper.innerHTML = `
    <div class="trend-chart-container">
      <svg class="trend-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
        ${yLabels}
        ${xLabels}
        <path d="${paths.income}" fill="none" stroke="var(--chart-color-3)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="${paths.expenses}" fill="none" stroke="var(--chart-color-4)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        ${pointsHtml}
      </svg>
      <div id="chartTooltip" class="chart-tooltip" style="display:none;"></div>
    </div>
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

  // Attach tooltips
  setupChartTooltips(wrapper);
}

function setupChartTooltips(wrapper) {
  const tooltip = wrapper.querySelector('#chartTooltip');
  if (!tooltip) return;

  wrapper.querySelectorAll('.chart-point').forEach(pt => {
    const show = (e) => {
      const title = pt.dataset.title;
      const type = pt.dataset.type;
      const val = pt.dataset.val;
      const isIncome = type === 'Доходы';
      const color = isIncome ? 'var(--success)' : 'var(--danger)';

      tooltip.innerHTML = `
        <div class="chart-tooltip-title">${title}</div>
        <div class="chart-tooltip-row">
          <span style="color:${color};font-weight:600;">${type}:</span>
          <strong>${val}</strong>
        </div>
      `;
      tooltip.style.display = 'block';

      const rect = pt.getBoundingClientRect();
      const wrapRect = wrapper.getBoundingClientRect();
      const left = rect.left - wrapRect.left + rect.width / 2;
      const top = rect.top - wrapRect.top - 10;

      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    };

    const hide = () => {
      tooltip.style.display = 'none';
    };

    pt.addEventListener('mouseenter', show);
    pt.addEventListener('mouseleave', hide);
    pt.addEventListener('focus', show);
    pt.addEventListener('blur', hide);
    pt.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      show(e);
    }, { passive: true });
  });

  document.addEventListener('touchstart', () => {
    if (tooltip) tooltip.style.display = 'none';
  }, { passive: true });
}

export { renderDonutChart, renderTrendChart };