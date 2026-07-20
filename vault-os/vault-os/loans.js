/* loans.js — debt dashboard: amortization math, prepayment simulator, CRUD */

/* ---------- Core amortization math (reducing-balance EMI loans) ---------- */

function monthlyRate(annualRatePct) {
  return annualRatePct / 1200;
}

// Months remaining to pay off `principal` at `annualRatePct` making `emi` payments.
// Returns Infinity if the EMI doesn't even cover the interest.
function remainingMonths(principal, annualRatePct, emi) {
  const r = monthlyRate(annualRatePct);
  if (!principal || principal <= 0) return 0;
  if (r === 0) return Math.ceil(principal / emi);
  const interestOnly = principal * r;
  if (emi <= interestOnly) return Infinity;
  const n = Math.log(emi / (emi - interestOnly)) / Math.log(1 + r);
  return Math.ceil(n);
}

function totalInterestOverTerm(principal, emi, months) {
  if (!isFinite(months)) return Infinity;
  return Math.max(0, emi * months - principal);
}

function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + Math.min(months, 1200));
  return d;
}

function loanMetrics(loan) {
  if (loan.mode === "detailed" && loan.principal && loan.rate != null) {
    const months = remainingMonths(loan.balance, loan.rate, loan.emi);
    const totalInterest = totalInterestOverTerm(loan.balance, loan.emi, months);
    const minMonths = remainingMonths(loan.balance, loan.rate, loan.requiredEmi || loan.emi);
    const minInterest = totalInterestOverTerm(loan.balance, loan.requiredEmi || loan.emi, minMonths);
    const closureDate = isFinite(months) ? addMonths(new Date().toISOString(), months) : null;
    return { months, totalInterest, closureDate, minMonths, minInterest };
  }
  // Simple mode: no rate/principal known — estimate remaining months from an end date if given
  let months;
  if (loan.endDate) {
    const now = new Date();
    const end = new Date(loan.endDate);
    months = Math.max(0, (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth()));
  } else {
    months = null;
  }
  return { months, totalInterest: null, closureDate: loan.endDate ? new Date(loan.endDate) : null, minMonths: months, minInterest: null };
}

function loanHealthBand(debtRatioPct) {
  if (debtRatioPct <= 20) return { label: "Healthy", color: "#4ADE80" };
  if (debtRatioPct <= 36) return { label: "Manageable", color: "#FBBF24" };
  if (debtRatioPct <= 50) return { label: "Stretched", color: "#FB923C" };
  return { label: "High risk", color: "#FB7185" };
}

function totalMonthlyEMI() {
  return state.loans.reduce((s, l) => s + (l.emi || 0), 0);
}

function debtRatio() {
  const salary = getSettings().salary || 1;
  return (totalMonthlyEMI() / salary) * 100;
}

/* ---------- Rendering: Loans view ---------- */

function renderLoansView() {
  const totalEMI = totalMonthlyEMI();
  const ratio = debtRatio();
  const band = loanHealthBand(ratio);

  document.getElementById("debt-ratio-value").textContent = `${ratio.toFixed(1)}%`;
  document.getElementById("debt-ratio-label").textContent = band.label;
  document.getElementById("debt-ratio-label").style.color = band.color;
  document.getElementById("debt-ratio-fill").style.width = `${Math.min(ratio, 100)}%`;
  document.getElementById("debt-ratio-fill").style.background = band.color;
  document.getElementById("total-emi-value").textContent = formatCurrency(totalEMI);

  const el = document.getElementById("loans-list");
  if (!state.loans.length) {
    el.innerHTML = `<p class="empty-state">No loans added. You're debt-free — tap + to log one if that changes.</p>`;
    return;
  }

  el.innerHTML = state.loans.map((loan) => {
    const m = loanMetrics(loan);
    const closureText = m.closureDate ? m.closureDate.toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "Add details to estimate";
    const monthsText = m.months == null ? "—" : isFinite(m.months) ? `${m.months} months left` : "EMI too low to close this loan";
    return `
      <div class="loan-card glass" data-id="${loan.id}">
        <div class="loan-card-top">
          <div>
            <div class="loan-name">${escapeHTML(loan.name)}</div>
            <div class="loan-sub">${loan.mode === "detailed" ? `${loan.rate}% · ${formatCurrency(loan.balance)} remaining` : "Simplified tracking"}</div>
          </div>
          <div class="loan-emi font-mono">${formatCurrency(loan.emi)}<span>/mo</span></div>
        </div>
        <div class="loan-meta-row">
          <div class="loan-meta"><span class="loan-meta-label">Payoff</span><span class="loan-meta-value">${closureText}</span></div>
          <div class="loan-meta"><span class="loan-meta-label">Remaining</span><span class="loan-meta-value">${monthsText}</span></div>
          ${m.totalInterest != null && isFinite(m.totalInterest) ? `<div class="loan-meta"><span class="loan-meta-label">Interest left</span><span class="loan-meta-value">${formatCurrency(m.totalInterest)}</span></div>` : ""}
        </div>
        <div class="loan-actions">
          <button class="link-btn loan-simulate-btn" data-id="${loan.id}">🎛 Prepayment simulator</button>
          <button class="link-btn loan-edit-btn" data-id="${loan.id}">Edit</button>
        </div>
      </div>`;
  }).join("");

  el.querySelectorAll(".loan-simulate-btn").forEach((b) => b.addEventListener("click", () => openPrepaymentSimulator(b.dataset.id)));
  el.querySelectorAll(".loan-edit-btn").forEach((b) => b.addEventListener("click", () => openLoanModal(b.dataset.id)));
}

/* ---------- Prepayment simulator ---------- */

function openPrepaymentSimulator(loanId) {
  const loan = state.loans.find((l) => l.id === loanId);
  if (!loan) return;

  if (loan.mode !== "detailed") {
    toast("Add the principal balance and interest rate for this loan to simulate prepayment");
    openLoanModal(loanId);
    return;
  }

  state.simulatingLoan = loan;
  const modal = document.getElementById("prepay-modal");
  const slider = document.getElementById("prepay-slider");
  const maxEmi = Math.max(loan.emi * 2.5, loan.emi + 10000);
  slider.min = loan.requiredEmi || loan.emi;
  slider.max = Math.round(maxEmi);
  slider.value = loan.emi;
  document.getElementById("prepay-loan-name").textContent = loan.name;
  updatePrepaymentSimulation(loan, loan.emi);
  modal.classList.remove("hidden");
}

function updatePrepaymentSimulation(loan, newEmi) {
  const current = loanMetrics({ ...loan, emi: loan.emi });
  const simulated = loanMetrics({ ...loan, emi: newEmi });

  document.getElementById("prepay-emi-value").textContent = formatCurrency(newEmi);
  document.getElementById("prepay-current-months").textContent = isFinite(current.months) ? `${current.months} mo` : "—";
  document.getElementById("prepay-new-months").textContent = isFinite(simulated.months) ? `${simulated.months} mo` : "—";

  const monthsSaved = isFinite(current.months) && isFinite(simulated.months) ? current.months - simulated.months : 0;
  const interestSaved = isFinite(current.totalInterest) && isFinite(simulated.totalInterest) ? current.totalInterest - simulated.totalInterest : 0;

  document.getElementById("prepay-months-saved").textContent = monthsSaved > 0 ? `${monthsSaved} months sooner` : "No change";
  document.getElementById("prepay-interest-saved").textContent = formatCurrency(Math.max(0, interestSaved));

  const extraPerMonth = newEmi - loan.emi;
  const verdict = document.getElementById("prepay-verdict");
  if (extraPerMonth <= 0) {
    verdict.textContent = "Move the slider right to see how prepaying faster changes things.";
  } else if (interestSaved > extraPerMonth * 12) {
    verdict.textContent = `Worth it — paying ${formatCurrency(extraPerMonth)} more each month saves you ${formatCurrency(interestSaved)} in interest and closes the loan ${monthsSaved} months early.`;
  } else {
    verdict.textContent = `Marginal — the interest saved is modest relative to the extra you'd pay. Only do this if you have spare cash with no better use.`;
  }
}

function bindPrepaymentSimulator() {
  const slider = document.getElementById("prepay-slider");
  slider.addEventListener("input", () => {
    if (state.simulatingLoan) updatePrepaymentSimulation(state.simulatingLoan, parseFloat(slider.value));
  });
  document.getElementById("apply-prepay-btn").addEventListener("click", async () => {
    if (!state.simulatingLoan) return;
    const newEmi = parseFloat(slider.value);
    const loan = { ...state.simulatingLoan, emi: newEmi };
    await DB.put("loans", loan);
    await refreshData();
    renderAll();
    closeModals();
    toast("EMI updated for this loan");
  });
}

/* ---------- Loan add/edit modal ---------- */

function openLoanModal(id) {
  const form = document.getElementById("loan-form");
  form.reset();
  state.editingLoanId = id || null;

  document.getElementById("loan-modal-title").textContent = id ? "Edit loan" : "Add loan";
  document.getElementById("loan-delete-btn").classList.toggle("hidden", !id);

  if (id) {
    const l = state.loans.find((l) => l.id === id);
    document.getElementById("loan-name").value = l.name;
    document.getElementById("loan-emi").value = l.emi;
    document.getElementById("loan-required-emi").value = l.requiredEmi || "";
    document.getElementById("loan-principal").value = l.principal || "";
    document.getElementById("loan-balance").value = l.balance || "";
    document.getElementById("loan-rate").value = l.rate || "";
    document.getElementById("loan-end-date").value = l.endDate || "";
  }

  document.getElementById("loan-modal").classList.remove("hidden");
}

async function handleLoanSubmit(e) {
  e.preventDefault();
  const name = document.getElementById("loan-name").value.trim();
  const emi = parseFloat(document.getElementById("loan-emi").value);
  const requiredEmi = parseFloat(document.getElementById("loan-required-emi").value) || emi;
  const principal = parseFloat(document.getElementById("loan-principal").value) || null;
  const balance = parseFloat(document.getElementById("loan-balance").value) || principal || null;
  const rate = parseFloat(document.getElementById("loan-rate").value) || null;
  const endDate = document.getElementById("loan-end-date").value || null;

  if (!name || isNaN(emi) || emi <= 0) return toast("Enter a name and monthly EMI");

  const record = {
    id: state.editingLoanId || uid(),
    name,
    emi,
    requiredEmi,
    principal,
    balance,
    rate,
    endDate,
    mode: principal && rate != null ? "detailed" : "simple",
    startDate: new Date().toISOString().slice(0, 10),
  };

  await DB.put("loans", record);
  await refreshData();
  renderAll();
  closeModals();
  toast(state.editingLoanId ? "Loan updated" : "Loan added");
}

async function handleLoanDelete() {
  if (!state.editingLoanId) return;
  if (!confirm("Remove this loan?")) return;
  await DB.remove("loans", state.editingLoanId);
  await refreshData();
  renderAll();
  closeModals();
  toast("Loan removed");
}

function bindLoanModal() {
  document.getElementById("loan-form").addEventListener("submit", handleLoanSubmit);
  document.getElementById("loan-delete-btn").addEventListener("click", handleLoanDelete);
  document.getElementById("add-loan-btn").addEventListener("click", () => openLoanModal(null));
}
