/* networth.js — assets minus liabilities, growth history, forecast */

function loanLiability(loan) {
  if (loan.mode === "detailed" && loan.balance) return loan.balance;
  const m = loanMetrics(loan);
  if (isFinite(m.months) && m.months != null) return loan.emi * m.months; // rough estimate for simple-mode loans
  return null; // unknown — excluded from the total, flagged in the UI
}

function calcNetWorth() {
  const stats = calcDashboardStats();
  const investCurrent = state.investments.reduce((s, i) => s + i.currentValue, 0);
  const goalsSaved = state.goals.reduce((s, g) => s + g.current, 0);

  let totalLiabilities = 0;
  let unknownLiabilities = 0;
  state.loans.forEach((l) => {
    const liab = loanLiability(l);
    if (liab == null) unknownLiabilities++;
    else totalLiabilities += liab;
  });

  const totalAssets = stats.balance + investCurrent + goalsSaved;
  const netWorth = totalAssets - totalLiabilities;

  return { totalAssets, cashBalance: stats.balance, investCurrent, goalsSaved, totalLiabilities, unknownLiabilities, netWorth };
}

function renderNetWorthView() {
  const nw = calcNetWorth();
  recordNetWorthSnapshot(nw.netWorth);

  document.getElementById("nw-total").textContent = formatCurrency(nw.netWorth);

  document.getElementById("nw-breakdown").innerHTML = `
    <div class="nw-row nw-asset"><span>Cash balance</span><span>${formatCurrency(nw.cashBalance)}</span></div>
    <div class="nw-row nw-asset"><span>Investments</span><span>${formatCurrency(nw.investCurrent)}</span></div>
    <div class="nw-row nw-asset"><span>Goal savings</span><span>${formatCurrency(nw.goalsSaved)}</span></div>
    <div class="nw-row nw-liability"><span>Loans outstanding</span><span>-${formatCurrency(nw.totalLiabilities)}</span></div>
    ${nw.unknownLiabilities ? `<p class="nw-note">${nw.unknownLiabilities} loan(s) don't have a balance or end date yet, so they're not subtracted above. Add those details on the Loans screen for an accurate net worth.</p>` : ""}
  `;

  renderNetWorthChart();

  // Simple forward projection off the current monthly savings + investment growth rate
  const stats = calcDashboardStats();
  const monthlyDelta = stats.savings; // this month's net saved, used as a proxy pace
  const projection12mo = nw.netWorth + monthlyDelta * 12;
  document.getElementById("nw-forecast").textContent = monthlyDelta !== 0
    ? `At this month's saving pace (${formatCurrency(monthlyDelta)}/mo), you're on track for roughly ${formatCurrency(projection12mo)} net worth in 12 months.`
    : `Log a full month of transactions and I'll project where your net worth is headed.`;
}

let netWorthChart = null;
function renderNetWorthChart() {
  const ctx = document.getElementById("chart-networth");
  if (!ctx) return;
  const history = getNetWorthHistory();
  if (history.length < 2) {
    ctx.parentElement.querySelector(".chart-empty")?.classList.remove("hidden");
    if (netWorthChart) netWorthChart.destroy();
    return;
  }
  ctx.parentElement.querySelector(".chart-empty")?.classList.add("hidden");

  if (netWorthChart) netWorthChart.destroy();
  netWorthChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: history.map((h) => new Date(h.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })),
      datasets: [{ data: history.map((h) => h.value), borderColor: "#7C5CF6", backgroundColor: "rgba(124,92,246,0.14)", fill: true, tension: 0.35, pointRadius: 2 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${formatCurrency(c.parsed.y)}` } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: chartTextColor(), font: { family: "Inter", size: 10 }, maxTicksLimit: 6 } },
        y: { grid: { color: chartGridColor() }, ticks: { color: chartTextColor(), font: { family: "JetBrains Mono", size: 10 }, callback: (v) => formatCompact(v) } },
      },
    },
  });
}
