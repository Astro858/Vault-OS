/* app.js — Vault OS orchestrator: state, navigation, dashboard, modal wiring */

const state = {
  transactions: [],
  categories: [],
  goals: [],
  loans: [],
  investments: [],
  currentView: "dashboard",
  activeType: "expense",
  editingId: null,
  editingLoanId: null,
  editingInvestmentId: null,
  selectedCategory: null,
  splitMode: false,
  splits: [],
  simulatingLoan: null,
};

async function init() {
  await seedIfEmpty();
  await refreshData();

  const settings = getSettings();
  setTheme(settings.theme, false);
  document.getElementById("currency-select").value = settings.currency;
  document.getElementById("amount-symbol").textContent = CURRENCY_SYMBOLS[settings.currency] || "₹";

  bindNav();
  bindFab();
  bindModals();
  bindSettings();
  bindFilters();
  bindSearch();
  bindTxnNoteSuggestion();
  bindSplitToggle();
  bindLoanModal();
  bindPrepaymentSimulator();
  bindInvestmentModal();
  bindGoalModal();
  bindAIChat();
  bindCalculators();

  renderAll();
  registerServiceWorker();
}

async function refreshData() {
  state.transactions = await DB.getAll("transactions");
  state.categories = await DB.getAll("categories");
  state.goals = await DB.getAll("goals");
  state.loans = await DB.getAll("loans");
  state.investments = await DB.getAll("investments");
}

function renderAll() {
  renderDashboard();
  renderTransactionsView();
  renderBudgetsView();
  renderLoansView();
  renderInvestmentsView();
  renderNetWorthView();
  renderGoalsView();
  renderAnalyticsView();
  renderAIView();
  renderDebtFreedomCard();
  populateCategoryFilter();
}

/* ============ NAVIGATION ============ */

const SECONDARY_VIEWS = ["budgets", "investments", "networth", "analytics", "calculators", "settings"];

function bindNav() {
  document.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.nav));
  });
}

function switchView(view) {
  state.currentView = view;
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  document.getElementById(`view-${view}`)?.classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  const isPrimary = !SECONDARY_VIEWS.includes(view) && view !== "more";
  const navTarget = SECONDARY_VIEWS.includes(view) ? "more" : view;
  document.querySelector(`.nav-btn[data-nav="${navTarget}"]`)?.classList.add("active");

  if (view === "analytics") {
    setTimeout(() => {
      renderCategoryChart("chart-category-full", state.transactions.filter(isThisMonthTxn), state.categories);
      renderTrendChart("chart-trend", state.transactions);
      renderCashflowChart("chart-cashflow", state.transactions);
    }, 50);
  }
  if (view === "investments") setTimeout(renderAllocationChart, 50);
  if (view === "networth") setTimeout(renderNetWorthChart, 50);

  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ============ DASHBOARD ============ */

function renderDashboard() {
  const stats = calcDashboardStats();
  const settings = getSettings();

  const cashToday = stats.balance;
  animateCounter(document.getElementById("balance-amount"), 0, cashToday, 800);
  document.getElementById("stat-income").textContent = formatCurrency(stats.income);
  document.getElementById("stat-expense").textContent = formatCurrency(stats.expense);
  document.getElementById("stat-savings").textContent = formatCurrency(Math.max(stats.savings, 0));
  document.getElementById("month-pill").textContent = new Date().toLocaleDateString("en-IN", { month: "long" });

  // Health score ring
  const score = renderHealthScore(stats);

  // Today's advice + tip
  document.getElementById("today-advice").textContent = generateTodayAdvice();
  document.getElementById("today-tip").textContent = generateTodayTip();

  // Upcoming due
  const upcoming = upcomingDueItems().slice(0, 3);
  document.getElementById("upcoming-list").innerHTML = upcoming.length
    ? upcoming.map((u) => `
        <div class="upcoming-row">
          <span class="upcoming-days ${u.daysAway <= 3 ? "urgent" : ""}">${u.daysAway <= 0 ? "Today" : `${u.daysAway}d`}</span>
          <span class="upcoming-name">${escapeHTML(u.name)}</span>
          <span class="upcoming-amount font-mono">${formatCurrency(u.amount)}</span>
        </div>`).join("")
    : `<p class="empty-state">Nothing due soon.</p>`;

  // Widgets row: net worth, debt, EF
  const nw = calcNetWorth();
  document.getElementById("widget-networth").textContent = formatCurrency(nw.netWorth);
  document.getElementById("widget-debt").textContent = formatCurrency(nw.totalLiabilities);
  document.getElementById("widget-debt-ratio").textContent = `${debtRatio().toFixed(0)}% of salary`;
  const ef = state.goals.find((g) => g.isEmergencyFund);
  const efMonths = ef ? (ef.current / (averageMonthlyExpense() || 1)) : 0;
  document.getElementById("widget-ef").textContent = `${efMonths.toFixed(1)}mo`;

  renderEmergencyFundWidget();

  // Budget preview
  const monthTxns = stats.monthTxns;
  const budgetItems = buildBudgetItems(monthTxns).sort((a, b) => b.pct - a.pct).slice(0, 3);
  document.getElementById("budget-preview").innerHTML = budgetItems.length
    ? budgetItems.map(renderBudgetItemHTML).join("")
    : `<p class="empty-state">Set category budgets in Settings → Manage categories.</p>`;

  renderCategoryChart("chart-category-home", monthTxns, state.categories);

  const recent = [...state.transactions].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);
  document.getElementById("recent-list").innerHTML = recent.length
    ? recent.map(renderTxnRowHTML).join("")
    : `<p class="empty-state">No transactions yet. Tap + to add your first one.</p>`;
  bindTxnRowClicks("recent-list");
}

/* ============ FAB & QUICK ACTIONS ============ */

function bindFab() {
  document.getElementById("fab").addEventListener("click", () => openTxnModal(null, "expense"));
  document.querySelectorAll("[data-quick]").forEach((btn) => {
    btn.addEventListener("click", () => openTxnModal(null, btn.dataset.quick));
  });
}

/* ============ MODALS ============ */

function bindModals() {
  document.querySelectorAll("[data-close-modal]").forEach((btn) => btn.addEventListener("click", closeModals));
  document.querySelectorAll(".modal-overlay").forEach((ov) => {
    ov.addEventListener("click", (e) => { if (e.target === ov) closeModals(); });
  });
  document.querySelectorAll("#txn-type-toggle button").forEach((btn) => {
    btn.addEventListener("click", () => setTxnType(btn.dataset.type));
  });
  document.getElementById("txn-form").addEventListener("submit", handleTxnSubmit);
  document.getElementById("txn-delete-btn").addEventListener("click", handleTxnDelete);
}

function closeModals() {
  document.querySelectorAll(".modal-overlay").forEach((m) => m.classList.add("hidden"));
  state.simulatingLoan = null;
}

/* ============ SERVICE WORKER ============ */

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    });
  }
}

document.addEventListener("DOMContentLoaded", init);
