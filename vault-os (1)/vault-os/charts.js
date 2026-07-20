/* charts.js — Chart.js configuration and rendering for FinanceOS AI */

let categoryChart = null;
let trendChart = null;
let cashflowChart = null;

function chartTextColor() {
  return getComputedStyle(document.documentElement).getPropertyValue("--text-muted").trim() || "#8B93A7";
}
function chartGridColor() {
  return getComputedStyle(document.documentElement).getPropertyValue("--chart-grid").trim() || "rgba(139,147,167,0.12)";
}

function renderCategoryChart(canvasId, transactions, categories) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const spendByCategory = {};
  transactions.filter((t) => t.type === "expense").forEach((t) => {
    spendByCategory[t.category] = (spendByCategory[t.category] || 0) + t.amount;
  });

  const entries = Object.entries(spendByCategory).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const emptyMsg = ctx.parentElement.querySelector(".chart-empty");

  if (!entries.length) {
    if (categoryChart) categoryChart.destroy();
    emptyMsg?.classList.remove("hidden");
    return;
  }
  emptyMsg?.classList.add("hidden");

  const labels = entries.map(([id]) => categories.find((c) => c.id === id)?.name || id);
  const colors = entries.map(([id]) => categories.find((c) => c.id === id)?.color || "#94A3B8");
  const values = entries.map(([, v]) => v);

  if (categoryChart) categoryChart.destroy();
  categoryChart = new Chart(ctx, {
    type: "doughnut",
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0, hoverOffset: 8 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "72%",
      plugins: {
        legend: {
          position: "right",
          labels: { color: chartTextColor(), font: { family: "Inter", size: 12 }, boxWidth: 10, padding: 14, usePointStyle: true, pointStyle: "circle" },
        },
        tooltip: { callbacks: { label: (c) => ` ${c.label}: ${formatCurrency(c.parsed)}` } },
      },
    },
  });
}

function monthBuckets(n) {
  const months = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ y: d.getFullYear(), m: d.getMonth(), label: d.toLocaleDateString("en-IN", { month: "short" }) });
  }
  return months;
}

function renderTrendChart(canvasId, transactions) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  const months = monthBuckets(6);

  const income = months.map(({ y, m }) => transactions.filter((t) => t.type === "income" && new Date(t.date).getFullYear() === y && new Date(t.date).getMonth() === m).reduce((s, t) => s + t.amount, 0));
  const expense = months.map(({ y, m }) => transactions.filter((t) => t.type === "expense" && new Date(t.date).getFullYear() === y && new Date(t.date).getMonth() === m).reduce((s, t) => s + t.amount, 0));

  if (trendChart) trendChart.destroy();
  trendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: months.map((m) => m.label),
      datasets: [
        { label: "Income", data: income, borderColor: "#4ADE80", backgroundColor: "rgba(74,222,128,0.12)", tension: 0.4, fill: true, pointRadius: 3, pointBackgroundColor: "#4ADE80" },
        { label: "Expense", data: expense, borderColor: "#FB7185", backgroundColor: "rgba(251,113,133,0.12)", tension: 0.4, fill: true, pointRadius: 3, pointBackgroundColor: "#FB7185" },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "top", align: "end", labels: { color: chartTextColor(), font: { family: "Inter", size: 12 }, boxWidth: 10, usePointStyle: true } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: chartTextColor(), font: { family: "Inter", size: 11 } } },
        y: { grid: { color: chartGridColor() }, ticks: { color: chartTextColor(), font: { family: "JetBrains Mono", size: 10 }, callback: (v) => formatCompact(v) } },
      },
    },
  });
}

function renderCashflowChart(canvasId, transactions) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  const months = monthBuckets(6);
  const net = months.map(({ y, m }) => {
    const inc = transactions.filter((t) => t.type === "income" && new Date(t.date).getFullYear() === y && new Date(t.date).getMonth() === m).reduce((s, t) => s + t.amount, 0);
    const exp = transactions.filter((t) => t.type === "expense" && new Date(t.date).getFullYear() === y && new Date(t.date).getMonth() === m).reduce((s, t) => s + t.amount, 0);
    return inc - exp;
  });

  if (cashflowChart) cashflowChart.destroy();
  cashflowChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: months.map((m) => m.label),
      datasets: [{ data: net, backgroundColor: net.map((v) => (v >= 0 ? "#7C5CF6" : "#FB7185")), borderRadius: 8, maxBarThickness: 28 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${formatCurrency(c.parsed.y)}` } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: chartTextColor(), font: { family: "Inter", size: 11 } } },
        y: { grid: { color: chartGridColor() }, ticks: { color: chartTextColor(), font: { family: "JetBrains Mono", size: 10 }, callback: (v) => formatCompact(v) } },
      },
    },
  });
}
