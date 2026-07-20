/* investments.js — investment portfolio tracking (manual entries: SIP, MF, Gold, FD, PPF, NPS, Stocks) */

const INVESTMENT_TYPES = [
  { id: "sip", name: "SIP / Mutual Fund", icon: "📊", risk: "Moderate" },
  { id: "index", name: "Index Fund", icon: "📈", risk: "Moderate" },
  { id: "stocks", name: "Stocks", icon: "🏦", risk: "High" },
  { id: "gold", name: "Gold", icon: "🥇", risk: "Low" },
  { id: "fd", name: "Fixed Deposit", icon: "🔒", risk: "Low" },
  { id: "ppf", name: "PPF", icon: "🏛️", risk: "Low" },
  { id: "nps", name: "NPS", icon: "🧓", risk: "Moderate" },
];

function investmentTotals() {
  const invested = state.investments.reduce((s, i) => s + i.invested, 0);
  const current = state.investments.reduce((s, i) => s + i.currentValue, 0);
  const gain = current - invested;
  const gainPct = invested > 0 ? (gain / invested) * 100 : 0;
  return { invested, current, gain, gainPct };
}

function recommendedMonthlyInvestment() {
  const settings = getSettings();
  const salary = settings.salary || 0;
  const emi = totalMonthlyEMI();
  const baseline = settings.monthlyExpenseBaseline || 0;
  const freeCash = salary - emi - baseline;
  // Suggest investing ~50% of what's left after EMIs and typical expenses, floor at 0
  return Math.max(0, Math.round(freeCash * 0.5));
}

function renderInvestmentsView() {
  const { invested, current, gain, gainPct } = investmentTotals();
  document.getElementById("invest-current-value").textContent = formatCurrency(current);
  document.getElementById("invest-invested-value").textContent = formatCurrency(invested);
  const gainEl = document.getElementById("invest-gain-value");
  gainEl.textContent = `${gain >= 0 ? "+" : ""}${formatCurrency(gain)} (${gainPct >= 0 ? "+" : ""}${gainPct.toFixed(1)}%)`;
  gainEl.className = `invest-gain ${gain >= 0 ? "in" : "out"}`;

  document.getElementById("invest-recommendation").textContent =
    `Based on your salary, EMIs, and typical expenses, you have roughly ${formatCurrency(recommendedMonthlyInvestment())}/month free to invest.`;

  const list = document.getElementById("investments-list");
  if (!state.investments.length) {
    list.innerHTML = `<p class="empty-state">No holdings logged yet. Tap + to add your first SIP, FD, or fund.</p>`;
  } else {
    list.innerHTML = state.investments.map((inv) => {
      const type = INVESTMENT_TYPES.find((t) => t.id === inv.type) || { icon: "💰", name: inv.type };
      const g = inv.currentValue - inv.invested;
      const gp = inv.invested > 0 ? (g / inv.invested) * 100 : 0;
      return `
        <div class="invest-row" data-id="${inv.id}">
          <span class="cat-icon" style="background:#7C5CF622;color:#7C5CF6">${type.icon}</span>
          <div class="txn-info">
            <div class="txn-title">${escapeHTML(inv.name)}</div>
            <div class="txn-sub">${type.name} · ${formatCurrency(inv.invested)} invested</div>
          </div>
          <div class="txn-amount ${g >= 0 ? "in" : "out"}">${formatCurrency(inv.currentValue)}<div class="invest-row-pct">${gp >= 0 ? "+" : ""}${gp.toFixed(1)}%</div></div>
        </div>`;
    }).join("");
    list.querySelectorAll(".invest-row").forEach((row) => row.addEventListener("click", () => openInvestmentModal(row.dataset.id)));
  }

  renderAllocationChart();
}

let allocationChart = null;
function renderAllocationChart() {
  const ctx = document.getElementById("chart-allocation");
  if (!ctx) return;
  const byType = {};
  state.investments.forEach((i) => { byType[i.type] = (byType[i.type] || 0) + i.currentValue; });
  const entries = Object.entries(byType);
  const empty = ctx.parentElement.querySelector(".chart-empty");
  if (!entries.length) {
    if (allocationChart) allocationChart.destroy();
    empty?.classList.remove("hidden");
    return;
  }
  empty?.classList.add("hidden");
  const palette = ["#7C5CF6", "#38BDF8", "#4ADE80", "#FBBF24", "#FB7185", "#F472B6", "#2DD4BF"];
  if (allocationChart) allocationChart.destroy();
  allocationChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: entries.map(([id]) => INVESTMENT_TYPES.find((t) => t.id === id)?.name || id),
      datasets: [{ data: entries.map(([, v]) => v), backgroundColor: palette, borderWidth: 0, hoverOffset: 8 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "70%",
      plugins: {
        legend: { position: "right", labels: { color: chartTextColor(), font: { family: "Inter", size: 12 }, boxWidth: 10, usePointStyle: true } },
        tooltip: { callbacks: { label: (c) => ` ${c.label}: ${formatCurrency(c.parsed)}` } },
      },
    },
  });
}

function openInvestmentModal(id) {
  const form = document.getElementById("invest-form");
  form.reset();
  state.editingInvestmentId = id || null;
  document.getElementById("invest-modal-title").textContent = id ? "Edit holding" : "Add holding";
  document.getElementById("invest-delete-btn").classList.toggle("hidden", !id);

  const typeSel = document.getElementById("invest-type");
  typeSel.innerHTML = INVESTMENT_TYPES.map((t) => `<option value="${t.id}">${t.icon} ${t.name}</option>`).join("");

  if (id) {
    const inv = state.investments.find((i) => i.id === id);
    document.getElementById("invest-name").value = inv.name;
    typeSel.value = inv.type;
    document.getElementById("invest-invested").value = inv.invested;
    document.getElementById("invest-current").value = inv.currentValue;
  }
  document.getElementById("invest-modal").classList.remove("hidden");
}

async function handleInvestmentSubmit(e) {
  e.preventDefault();
  const name = document.getElementById("invest-name").value.trim();
  const type = document.getElementById("invest-type").value;
  const invested = parseFloat(document.getElementById("invest-invested").value);
  const currentValue = parseFloat(document.getElementById("invest-current").value);
  if (!name || isNaN(invested) || isNaN(currentValue)) return toast("Fill in all fields");

  await DB.put("investments", { id: state.editingInvestmentId || uid(), name, type, invested, currentValue, createdAt: new Date().toISOString() });
  await refreshData();
  renderAll();
  closeModals();
  toast(state.editingInvestmentId ? "Holding updated" : "Holding added");
}

async function handleInvestmentDelete() {
  if (!state.editingInvestmentId) return;
  if (!confirm("Remove this holding?")) return;
  await DB.remove("investments", state.editingInvestmentId);
  await refreshData();
  renderAll();
  closeModals();
  toast("Holding removed");
}

function bindInvestmentModal() {
  document.getElementById("invest-form").addEventListener("submit", handleInvestmentSubmit);
  document.getElementById("invest-delete-btn").addEventListener("click", handleInvestmentDelete);
  document.getElementById("add-investment-btn").addEventListener("click", () => openInvestmentModal(null));
}
