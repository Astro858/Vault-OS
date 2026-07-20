/* budget.js — budget calculations & rendering */

function buildBudgetItems(monthTxns) {
  return state.categories
    .filter((c) => c.type === "expense" && c.budget > 0)
    .map((c) => {
      const spent = monthTxns
        .filter((t) => (t.category === c.id) || (t.category === "split" && (t.splits || []).some((s) => s.category === c.id)))
        .reduce((s, t) => {
          if (t.category === c.id) return s + t.amount;
          const splitAmt = (t.splits || []).filter((sp) => sp.category === c.id).reduce((a, sp) => a + sp.amount, 0);
          return s + splitAmt;
        }, 0);
      const pct = (spent / c.budget) * 100;
      return { ...c, spent, pct, pctClamped: Math.min(pct, 100) };
    });
}

function predictedOverspend(item) {
  const dayOfMonth = new Date().getDate();
  const totalDays = daysInCurrentMonth();
  if (dayOfMonth < 3) return null;
  const dailyRate = item.spent / dayOfMonth;
  const projected = dailyRate * totalDays;
  if (projected > item.budget * 1.05) return projected;
  return null;
}

function renderBudgetItemHTML(item) {
  const over = item.pct > 100;
  const projected = !over ? predictedOverspend(item) : null;
  return `
    <div class="budget-item">
      <div class="budget-item-top">
        <div class="budget-cat">
          <span class="cat-icon" style="background:${item.color}22;color:${item.color}">${item.icon}</span>
          ${item.name}
        </div>
        <div class="budget-amounts">${formatCurrency(item.spent)} / ${formatCurrency(item.budget)}</div>
      </div>
      <div class="progress-track">
        <div class="progress-fill ${over ? "over" : ""}" style="width:${item.pctClamped}%; background:${item.color}"></div>
      </div>
      ${over ? `<div class="over-warning">⚠ Over budget by ${formatCurrency(item.spent - item.budget)}</div>` : ""}
      ${projected ? `<div class="predict-warning">📉 On pace to hit ${formatCurrency(projected)} by month end</div>` : ""}
    </div>`;
}

function renderBudgetsView() {
  const monthTxns = state.transactions.filter(isThisMonthTxn);
  document.getElementById("budget-month-pill").textContent = new Date().toLocaleDateString("en-IN", { month: "long" });
  const items = buildBudgetItems(monthTxns).sort((a, b) => b.pct - a.pct);
  document.getElementById("budget-full-list").innerHTML = items.length
    ? items.map(renderBudgetItemHTML).join("")
    : `<p class="empty-state">No category budgets set. Go to Settings → Manage categories to add some.</p>`;
}

function isThisMonthTxn(t) {
  return isThisMonth(t.date);
}
