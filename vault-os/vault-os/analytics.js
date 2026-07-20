/* analytics.js — dashboard stats, financial health score, heatmap, forecasting */

function calcDashboardStats() {
  const monthTxns = state.transactions.filter(isThisMonthTxn);
  const income = monthTxns.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = monthTxns.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const balance = state.transactions.reduce((s, t) => {
    if (t.type === "income") return s + t.amount;
    if (t.type === "expense") return s - t.amount;
    return s;
  }, 0);
  const savings = income - expense;
  const goalsTotal = state.goals.reduce((s, g) => s + g.current, 0);
  const netWorth = balance + goalsTotal;

  const dayOfMonth = new Date().getDate();
  const burnRate = expense / Math.max(dayOfMonth, 1);

  return { monthTxns, income, expense, balance, savings, netWorth, burnRate, dayOfMonth };
}

/* ---------- Financial Health Score (0-100) ---------- */

function calcHealthScore(stats) {
  const { income, expense, balance } = stats;

  // 1) Savings rate (0-40 pts)
  const savingsRate = income > 0 ? (income - expense) / income : 0;
  const savingsPts = Math.max(0, Math.min(40, savingsRate * 100 * 0.4));

  // 2) Budget adherence (0-25 pts)
  const budgetItems = buildBudgetItems(stats.monthTxns);
  const withinBudget = budgetItems.filter((b) => b.pct <= 100).length;
  const adherence = budgetItems.length ? withinBudget / budgetItems.length : 0.7;
  const budgetPts = adherence * 25;

  // 3) Emergency fund coverage — target 3 months of average expense (0-20 pts)
  const avgMonthlyExpense = averageMonthlyExpense();
  const monthsCovered = avgMonthlyExpense > 0 ? balance / avgMonthlyExpense : 1;
  const efPts = Math.max(0, Math.min(20, (monthsCovered / 3) * 20));

  // 4) Debt/EMI load relative to income (0-15 pts, lower load = higher score)
  const emiSpend = stats.monthTxns.filter((t) => t.type === "expense" && (t.category === "emi" || t.category === "insurance")).reduce((s, t) => s + t.amount, 0);
  const debtRatio = income > 0 ? emiSpend / income : 0;
  const debtPts = Math.max(0, 15 - debtRatio * 100 * 0.3);

  const score = Math.round(savingsPts + budgetPts + efPts + debtPts);
  return Math.max(0, Math.min(100, score));
}

function averageMonthlyExpense() {
  const months = monthBuckets(3);
  const totals = months.map(({ y, m }) =>
    state.transactions.filter((t) => t.type === "expense" && new Date(t.date).getFullYear() === y && new Date(t.date).getMonth() === m).reduce((s, t) => s + t.amount, 0)
  ).filter((v) => v > 0);
  if (!totals.length) return 0;
  return totals.reduce((s, v) => s + v, 0) / totals.length;
}

function healthScoreLabel(score) {
  if (score >= 80) return { text: "Excellent", color: "#4ADE80" };
  if (score >= 60) return { text: "Good", color: "#7C5CF6" };
  if (score >= 40) return { text: "Fair", color: "#FBBF24" };
  return { text: "Needs attention", color: "#FB7185" };
}

function renderHealthScore(stats) {
  const score = calcHealthScore(stats);
  const { text, color } = healthScoreLabel(score);
  const r = 42, c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  document.getElementById("health-ring").innerHTML = `
    <svg width="100" height="100">
      <circle cx="50" cy="50" r="${r}" stroke="var(--surface-2)" stroke-width="8" fill="none" />
      <circle cx="50" cy="50" r="${r}" stroke="${color}" stroke-width="8" fill="none" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${offset}" transform="rotate(-90 50 50)"
        style="transition: stroke-dashoffset 1s cubic-bezier(.16,1,.3,1)" />
    </svg>
    <div class="health-ring-value">
      <div class="health-score-num">${score}</div>
      <div class="health-score-label" style="color:${color}">${text}</div>
    </div>`;
  return score;
}

/* ---------- Heatmap calendar ---------- */

function renderHeatmap() {
  const el = document.getElementById("heatmap-grid");
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const daysCount = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();

  const dailyTotals = Array(daysCount + 1).fill(0);
  state.transactions.filter((t) => t.type === "expense" && new Date(t.date).getFullYear() === year && new Date(t.date).getMonth() === month)
    .forEach((t) => { dailyTotals[new Date(t.date).getDate()] += t.amount; });

  const max = Math.max(...dailyTotals, 1);

  let html = "";
  for (let i = 0; i < firstWeekday; i++) html += `<div class="heat-cell heat-empty"></div>`;
  for (let d = 1; d <= daysCount; d++) {
    const val = dailyTotals[d];
    const intensity = val / max;
    const isToday = d === now.getDate();
    html += `<div class="heat-cell ${isToday ? "heat-today" : ""}" style="--intensity:${intensity}" title="${formatCurrency(val)}">
      <span>${d}</span>
    </div>`;
  }
  el.innerHTML = html;
}

/* ---------- Forecast ---------- */

function forecastMonthEnd(stats) {
  const { dayOfMonth, income, expense } = stats;
  const daysTotal = daysInCurrentMonth();
  const remaining = daysTotal - dayOfMonth;
  if (dayOfMonth < 2) return null;
  const dailyExpense = expense / dayOfMonth;
  const dailyIncome = income / dayOfMonth;
  const projectedExpense = expense + dailyExpense * remaining;
  const projectedIncome = income + dailyIncome * remaining;
  return { projectedExpense, projectedIncome, projectedNet: projectedIncome - projectedExpense };
}

/* ---------- Analytics view ---------- */

function renderAnalyticsView() {
  const stats = calcDashboardStats();
  const spendByCategory = {};
  stats.monthTxns.filter((t) => t.type === "expense").forEach((t) => {
    if (t.category === "split" && t.splits) {
      t.splits.forEach((s) => { spendByCategory[s.category] = (spendByCategory[s.category] || 0) + s.amount; });
    } else {
      spendByCategory[t.category] = (spendByCategory[t.category] || 0) + t.amount;
    }
  });
  const totalExpense = Object.values(spendByCategory).reduce((s, v) => s + v, 0) || 1;
  const top = Object.entries(spendByCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, amt], i) => {
      const c = state.categories.find((c) => c.id === id) || { name: id, icon: "✨", color: "#94A3B8" };
      const pct = Math.round((amt / totalExpense) * 100);
      return `
        <div class="top-cat-row">
          <span class="top-cat-rank">${i + 1}</span>
          <span class="cat-icon" style="background:${c.color}22;color:${c.color}">${c.icon}</span>
          <div class="txn-info">
            <div class="txn-title">${c.name}</div>
            <div class="txn-sub">${pct}% of spending</div>
          </div>
          <div class="txn-amount out">${formatCurrency(amt)}</div>
        </div>`;
    }).join("");
  document.getElementById("top-categories").innerHTML = top || `<p class="empty-state">No expenses this month yet.</p>`;

  renderHeatmap();

  const forecast = forecastMonthEnd(stats);
  const forecastEl = document.getElementById("forecast-card");
  if (forecast) {
    forecastEl.classList.remove("hidden");
    document.getElementById("forecast-value").textContent = formatCurrency(stats.balance + forecast.projectedNet - stats.savings);
    document.getElementById("forecast-sub").textContent = `Projected spend by month end: ${formatCurrency(forecast.projectedExpense)}`;
  } else {
    forecastEl.classList.add("hidden");
  }
}
