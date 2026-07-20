/* goals.js — money goals (with required monthly savings + completion prediction),
   emergency fund tracking, and the qualitative life-goals checklist */

const GOAL_ICONS = ["🏝️", "🚗", "🏠", "💍", "📈", "🩺", "🎓", "💰", "🛡️", "✈️", "🎉"];

function monthsUntil(dateStr) {
  if (!dateStr) return null;
  const now = new Date();
  const target = new Date(dateStr);
  return Math.max(1, (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth()));
}

function goalRequiredMonthly(goal) {
  const remaining = Math.max(0, goal.target - goal.current);
  if (goal.targetDate) {
    const months = monthsUntil(goal.targetDate);
    return months ? remaining / months : remaining;
  }
  // No target date: assume a reasonable default pace based on remaining amount
  return remaining > 0 ? remaining / 6 : 0;
}

function goalCompletionForecast(goal) {
  // Estimate completion based on recent contribution pace (last time it was updated
  // isn't tracked precisely without history, so we conservatively use the required
  // pace off a default savings capacity — this becomes exact once a target date is set).
  if (goal.current >= goal.target) return "Complete";
  const monthly = goalRequiredMonthly(goal);
  if (!monthly) return "Add a target date to forecast";
  const monthsNeeded = Math.ceil((goal.target - goal.current) / monthly);
  const d = new Date();
  d.setMonth(d.getMonth() + monthsNeeded);
  return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

function renderGoalsView() {
  const el = document.getElementById("goals-list");
  const moneyGoals = state.goals.filter((g) => !g.isEmergencyFund);

  if (!moneyGoals.length) {
    el.innerHTML = `<p class="empty-state" style="grid-column:1/-1">No goals yet. Tap "New goal" to start.</p>`;
  } else {
    el.innerHTML = moneyGoals.map((g) => {
      const pct = Math.min(Math.round((g.current / g.target) * 100), 100);
      const r = 30, c = 2 * Math.PI * r;
      const offset = c - (pct / 100) * c;
      const requiredMonthly = goalRequiredMonthly(g);
      return `
        <div class="goal-card" data-id="${g.id}">
          <div class="goal-ring">
            <svg width="74" height="74">
              <circle cx="37" cy="37" r="${r}" stroke="var(--surface-2)" stroke-width="6" fill="none" />
              <circle cx="37" cy="37" r="${r}" stroke="var(--gold)" stroke-width="6" fill="none" stroke-linecap="round"
                stroke-dasharray="${c}" stroke-dashoffset="${offset}" transform="rotate(-90 37 37)"
                style="transition: stroke-dashoffset 0.8s cubic-bezier(.16,1,.3,1)" />
            </svg>
            <div class="goal-ring-icon">${g.icon}</div>
          </div>
          <div class="goal-name">${escapeHTML(g.name)}</div>
          <div class="goal-amounts">${formatCurrency(g.current)} of ${formatCurrency(g.target)}</div>
          <div class="goal-pct">${pct}%</div>
          ${g.current < g.target ? `<div class="goal-required">Need ${formatCompact(requiredMonthly)}/mo · Est. ${goalCompletionForecast(g)}</div>` : `<div class="goal-required">🎉 Goal reached</div>`}
        </div>`;
    }).join("");
    el.querySelectorAll(".goal-card").forEach((card) => card.addEventListener("click", () => promptGoalUpdate(card.dataset.id)));
  }

  renderLifeGoalsChecklist();
}

async function promptGoalUpdate(id) {
  const goal = state.goals.find((g) => g.id === id);
  if (!goal) return;
  const val = prompt(`Update saved amount for "${goal.name}"`, goal.current);
  if (val === null) return;
  const num = parseFloat(val);
  if (isNaN(num) || num < 0) return toast("Enter a valid amount");
  const wasComplete = goal.current >= goal.target;
  goal.current = num;
  await DB.put("goals", goal);
  await refreshData();
  renderAll();
  if (!wasComplete && num >= goal.target) fireConfetti();
  toast(num >= goal.target ? "🎉 Goal reached!" : "Goal updated");
}

function openGoalModal() {
  document.getElementById("goal-form").reset();
  const grid = document.getElementById("goal-icon-grid");
  grid.innerHTML = GOAL_ICONS.map((icon, i) => `<div class="cat-chip ${i === 0 ? "selected" : ""}" data-icon="${icon}"><span class="cat-chip-icon">${icon}</span></div>`).join("");
  grid.dataset.selected = GOAL_ICONS[0];
  grid.querySelectorAll(".cat-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      grid.querySelectorAll(".cat-chip").forEach((c) => c.classList.remove("selected"));
      chip.classList.add("selected");
      grid.dataset.selected = chip.dataset.icon;
    });
  });
  document.getElementById("goal-modal").classList.remove("hidden");
}

async function handleGoalSubmit(e) {
  e.preventDefault();
  const name = document.getElementById("goal-name").value.trim();
  const target = parseFloat(document.getElementById("goal-target").value);
  const current = parseFloat(document.getElementById("goal-current").value) || 0;
  const targetDate = document.getElementById("goal-target-date").value || null;
  if (!name || isNaN(target) || target <= 0) return toast("Fill in the goal details");

  const icon = document.getElementById("goal-icon-grid").dataset.selected || "💰";
  await DB.add("goals", { id: uid(), name, target, current, targetDate, icon, createdAt: new Date().toISOString() });
  await refreshData();
  renderGoalsView();
  closeModals();
  toast("Goal created");
}

/* ---------- Emergency fund ---------- */

function renderEmergencyFundWidget() {
  const goal = state.goals.find((g) => g.isEmergencyFund) || { current: 0, target: 100000 };
  const avgExpense = averageMonthlyExpense() || getSettings().monthlyExpenseBaseline || 1;
  const monthsCovered = goal.current / avgExpense;
  const recommendedTarget = Math.max(goal.target, avgExpense * 6);
  const pct = Math.min(100, Math.round((goal.current / recommendedTarget) * 100));

  const el = document.getElementById("ef-widget");
  if (!el) return;
  el.innerHTML = `
    <div class="ef-top">
      <span class="eyebrow">Emergency fund</span>
      <span class="pill">${monthsCovered.toFixed(1)} months covered</span>
    </div>
    <div class="progress-track" style="height:10px;margin:10px 0"><div class="progress-fill" style="width:${pct}%;background:var(--savings)"></div></div>
    <div class="ef-row">
      <span>${formatCurrency(goal.current)} saved</span>
      <span>Target ${formatCurrency(recommendedTarget)} (6 months)</span>
    </div>
    <p class="ef-tip">${monthsCovered < 3 ? "Aim for at least 3 months of expenses covered before increasing investments." : monthsCovered < 6 ? "Good progress — a full 6-month cushion gives you real flexibility." : "Fully funded. You can direct more toward investing and debt payoff."}</p>
  `;
}

/* ---------- Life goals checklist ---------- */

function renderLifeGoalsChecklist() {
  const el = document.getElementById("life-goals-list");
  if (!el) return;
  const goals = getLifeGoals();
  el.innerHTML = goals.map((g) => `
    <label class="check-row life-goal-row">
      <input type="checkbox" data-id="${g.id}" ${g.done ? "checked" : ""} />
      <span class="${g.done ? "life-goal-done" : ""}">${escapeHTML(g.text)}</span>
    </label>`).join("");
  el.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const goals = getLifeGoals();
      const g = goals.find((x) => x.id === cb.dataset.id);
      g.done = cb.checked;
      saveLifeGoals(goals);
      renderLifeGoalsChecklist();
    });
  });
}

function bindGoalModal() {
  document.getElementById("goal-form").addEventListener("submit", handleGoalSubmit);
  document.getElementById("add-goal-btn").addEventListener("click", openGoalModal);
}
